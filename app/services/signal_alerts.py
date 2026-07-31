"""Scan trade setups and email entry / stop / target lifecycle alerts.

Runs without the browser open — personal watchlist via env settings.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.adapters.registry import get_adapter_registry
from app.config.settings import Settings, get_settings
from app.engines.analysis.engine import AnalysisEngine
from app.engines.analysis.registry import get_analysis_registry
from app.models.symbol import Symbol
from app.repositories.candle import CandleRepository
from app.repositories.symbol import SymbolRepository
from app.repositories.timeframe import TimeframeRepository
from app.schemas.analysis import ExecuteAnalysisRequest, PluginExecutionSpec
from app.schemas.trade_setup import TradeSetupExecuteRequest
from app.services.analysis import AnalysisService
from app.services.email_notify import (
    EmailNotConfiguredError,
    email_configured,
    format_signal_email,
    ntfy_configured,
    send_alert,
)
from app.services.market_data import MarketDataService
from app.services.trade_setup import TradeSetupService


def _zone_mid(zone: dict[str, Any] | Any) -> float | None:
    if zone is None:
        return None
    if hasattr(zone, "high"):
        high, low = float(zone.high), float(zone.low)
    elif isinstance(zone, dict):
        high = float(zone.get("high") or 0)
        low = float(zone.get("low") or 0)
    else:
        return None
    if high <= 0 and low <= 0:
        return None
    return round((high + low) / 2.0, 4)


@dataclass
class TrackedAlert:
    setup_id: str
    symbol_id: str
    symbol_code: str
    timeframe: str
    direction: str  # bullish | bearish
    setup_type: str
    confidence: float
    entry: float
    stop_loss: float
    target_1: float
    target_2: float | None = None
    target_3: float | None = None
    risk_reward: float | None = None
    explanation: str = ""
    status: str = "watching"  # watching | entered | stopped | target | expired
    events_sent: list[str] = field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""


class AlertStateStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.tracked: dict[str, TrackedAlert] = {}
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            for row in raw.get("tracked") or []:
                t = TrackedAlert(**row)
                self.tracked[t.setup_id] = t
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not load alert state: {}", exc)

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "updated_at": datetime.now(UTC).isoformat(),
            "tracked": [asdict(t) for t in self.tracked.values()],
        }
        self.path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


class SignalAlertService:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        settings: Settings | None = None,
    ) -> None:
        self._session_factory = session_factory
        self.settings = settings or get_settings()
        state_path = Path(self.settings.alert_state_path)
        self.store = AlertStateStore(state_path)
        self.last_scan_at: datetime | None = None
        self.last_scan_summary: dict[str, Any] = {}
        self._lock = asyncio.Lock()

    def status(self) -> dict[str, Any]:
        s = self.settings
        return {
            "enabled": bool(s.alerts_enabled),
            "email_configured": email_configured(s),
            "ntfy_configured": ntfy_configured(s),
            "ntfy_topic": s.alert_ntfy_topic,
            "ntfy_url": (
                f"{(s.alert_ntfy_server or 'https://ntfy.sh').rstrip('/')}/{s.alert_ntfy_topic}"
                if s.alert_ntfy_topic
                else None
            ),
            "email_to": s.alert_email_to,
            "watchlist": self._watchlist(),
            "interval_sec": s.alert_interval_sec,
            "min_confidence": s.alert_min_confidence,
            "tracked_count": len(self.store.tracked),
            "open_count": sum(
                1
                for t in self.store.tracked.values()
                if t.status in {"watching", "entered"}
            ),
            "last_scan_at": self.last_scan_at.isoformat() if self.last_scan_at else None,
            "last_scan_summary": self.last_scan_summary,
        }

    def _watchlist(self) -> list[dict[str, str]]:
        raw = (self.settings.alert_watchlist or "NIFTY50:5m,BANKNIFTY:5m").strip()
        out: list[dict[str, str]] = []
        for part in raw.split(","):
            part = part.strip()
            if not part:
                continue
            if ":" in part:
                code, tf = part.split(":", 1)
            else:
                code, tf = part, "5m"
            out.append({"symbol_code": code.strip().upper(), "timeframe": tf.strip()})
        return out

    async def send_test_email(self) -> dict[str, str]:
        subject, text, html = format_signal_email(
            {
                "event": "TEST",
                "symbol_code": "NIFTY50",
                "timeframe": "5m",
                "direction": "BUY",
                "setup_type": "test",
                "confidence": 99,
                "entry": 25000,
                "stop_loss": 24900,
                "target_1": 25150,
                "target_2": 25250,
                "target_3": None,
                "risk_reward": 1.5,
                "last_price": 25010,
                "explanation": "Test alert from TradeMind — channels working.",
            }
        )
        channels = await send_alert(
            subject=subject,
            text_body=text,
            html_body=html,
            settings=self.settings,
        )
        return {
            "status": "sent",
            "to": self.settings.alert_email_to or "",
            "ntfy_url": (
                f"{(self.settings.alert_ntfy_server or 'https://ntfy.sh').rstrip('/')}/"
                f"{self.settings.alert_ntfy_topic}"
                if self.settings.alert_ntfy_topic
                else ""
            ),
            **channels,
        }

    async def scan_once(self) -> dict[str, Any]:
        async with self._lock:
            return await self._scan_once_unlocked()

    async def _scan_once_unlocked(self) -> dict[str, Any]:
        summary: dict[str, Any] = {
            "scanned": 0,
            "new_signals": 0,
            "lifecycle_events": 0,
            "errors": [],
        }
        if not self.settings.alerts_enabled:
            summary["skipped"] = "ALERTS_ENABLED=false"
            self.last_scan_at = datetime.now(UTC)
            self.last_scan_summary = summary
            return summary

        for item in self._watchlist():
            summary["scanned"] += 1
            try:
                n_new, n_life = await self._scan_symbol(item["symbol_code"], item["timeframe"])
                summary["new_signals"] += n_new
                summary["lifecycle_events"] += n_life
            except Exception as exc:  # noqa: BLE001
                logger.exception("Alert scan failed for {}", item)
                summary["errors"].append(f"{item['symbol_code']}:{item['timeframe']}: {exc}")

        self.store.save()
        self.last_scan_at = datetime.now(UTC)
        self.last_scan_summary = summary
        return summary

    async def _scan_symbol(self, symbol_code: str, timeframe: str) -> tuple[int, int]:
        async with self._session_factory() as session:
            sym_repo = SymbolRepository(session)
            symbol = await sym_repo.get_by_exchange_code_and_symbol("nse", symbol_code)
            if symbol is None:
                symbol = await sym_repo.get_by_exchange_code_and_symbol("binance", symbol_code)
            if symbol is None:
                result = await session.execute(
                    select(Symbol).where(Symbol.symbol_code == symbol_code.upper()).limit(1)
                )
                symbol = result.scalar_one_or_none()
            if symbol is None:
                raise ValueError(f"Symbol not found: {symbol_code}")

            md = MarketDataService(session, get_adapter_registry())
            await md.download_candles(
                timeframe_code=timeframe,
                symbol_id=symbol.id,
                incremental=True,
            )

            analysis = AnalysisService(
                session,
                AnalysisEngine(get_analysis_registry()),
                get_analysis_registry(),
            )
            setup_svc = TradeSetupService(session, analysis)

            # Soft ensure analysis for SMC sources
            try:
                await analysis.execute(
                    ExecuteAnalysisRequest(
                        symbol_id=symbol.id,
                        timeframe=timeframe,
                        plugins=[
                            PluginExecutionSpec(plugin_id=p)
                            for p in (
                                "market_structure",
                                "order_blocks",
                                "fair_value_gaps",
                                "liquidity_sweeps",
                            )
                        ],
                        candle_limit=800,
                        persist=True,
                    )
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Alert analysis soft-fail {}: {}", symbol_code, exc)

            await setup_svc.execute(
                TradeSetupExecuteRequest(
                    symbol_id=symbol.id,
                    timeframe=timeframe,
                    incremental=True,
                    ensure_analysis=False,
                    candle_limit=800,
                )
            )
            await session.commit()

            listed = await setup_svc.list_active(symbol.id, timeframe, limit=20)
            tf = await TimeframeRepository(session).get_by_code_or_raise(timeframe)
            candles = await CandleRepository(session).get_latest(
                symbol.id, tf.id, limit=1
            )
            last_price = float(candles[0].close) if candles else None

            new_count = 0
            life_count = 0
            min_conf = float(self.settings.alert_min_confidence)

            for rec in listed.items:
                if float(rec.confidence_score) < min_conf:
                    continue
                entry = _zone_mid(rec.entry_zone)
                stop = _zone_mid(rec.stop_loss_zone)
                targets = [_zone_mid(z) for z in (rec.target_zones or [])]
                targets = [t for t in targets if t is not None]
                if entry is None or stop is None or not targets:
                    continue

                direction = "BUY" if rec.direction.lower().startswith("bull") else "SELL"
                if rec.setup_id not in self.store.tracked:
                    alert = TrackedAlert(
                        setup_id=rec.setup_id,
                        symbol_id=str(symbol.id),
                        symbol_code=symbol.symbol_code,
                        timeframe=timeframe,
                        direction=direction,
                        setup_type=rec.setup_type,
                        confidence=float(rec.confidence_score),
                        entry=entry,
                        stop_loss=stop,
                        target_1=float(targets[0]),
                        target_2=float(targets[1]) if len(targets) > 1 else None,
                        target_3=float(targets[2]) if len(targets) > 2 else None,
                        risk_reward=float(rec.risk_reward) if rec.risk_reward is not None else None,
                        explanation=rec.explanation or "",
                        status="watching",
                        events_sent=[],
                        created_at=datetime.now(UTC).isoformat(),
                        updated_at=datetime.now(UTC).isoformat(),
                    )
                    self.store.tracked[rec.setup_id] = alert
                    await self._emit(alert, "NEW_SIGNAL", last_price)
                    new_count += 1

            # Lifecycle vs last price
            for alert in list(self.store.tracked.values()):
                if alert.symbol_code != symbol.symbol_code or alert.timeframe != timeframe:
                    continue
                if alert.status in {"stopped", "target", "expired"}:
                    continue
                if last_price is None:
                    continue
                fired = await self._evaluate_lifecycle(alert, last_price)
                life_count += fired

            return new_count, life_count

    async def _evaluate_lifecycle(self, alert: TrackedAlert, price: float) -> int:
        fired = 0
        buy = alert.direction == "BUY"

        def crossed_entry() -> bool:
            if buy:
                return price <= alert.entry * 1.001 and price >= min(alert.entry, alert.stop_loss)
            return price >= alert.entry * 0.999 and price <= max(alert.entry, alert.stop_loss)

        # Broader: entry zone touch — within 0.15% of entry
        near_entry = abs(price - alert.entry) / max(alert.entry, 1e-9) <= 0.0015

        if alert.status == "watching" and (near_entry or crossed_entry()):
            if "ENTRY" not in alert.events_sent:
                await self._emit(alert, "ENTRY", price)
                alert.status = "entered"
                fired += 1

        if alert.status in {"watching", "entered"}:
            stop_hit = price <= alert.stop_loss if buy else price >= alert.stop_loss
            if stop_hit and "STOP_LOSS" not in alert.events_sent:
                await self._emit(alert, "STOP_LOSS", price)
                alert.status = "stopped"
                fired += 1
                return fired

            for label, level in (
                ("TARGET_1", alert.target_1),
                ("TARGET_2", alert.target_2),
                ("TARGET_3", alert.target_3),
            ):
                if level is None:
                    continue
                hit = price >= level if buy else price <= level
                if hit and label not in alert.events_sent:
                    await self._emit(alert, label, price)
                    alert.status = "target"
                    fired += 1
        alert.updated_at = datetime.now(UTC).isoformat()
        return fired

    async def _emit(self, alert: TrackedAlert, event: str, last_price: float | None) -> None:
        alert.events_sent.append(event)
        alert.updated_at = datetime.now(UTC).isoformat()
        payload = {
            "event": event,
            "symbol_code": alert.symbol_code,
            "timeframe": alert.timeframe,
            "direction": alert.direction,
            "setup_type": alert.setup_type,
            "confidence": alert.confidence,
            "entry": alert.entry,
            "stop_loss": alert.stop_loss,
            "target_1": alert.target_1,
            "target_2": alert.target_2,
            "target_3": alert.target_3,
            "risk_reward": alert.risk_reward,
            "last_price": last_price,
            "explanation": alert.explanation,
            "setup_id": alert.setup_id,
        }
        subject, text, html = format_signal_email(payload)
        try:
            await send_alert(
                subject=subject,
                text_body=text,
                html_body=html,
                settings=self.settings,
            )
        except EmailNotConfiguredError:
            logger.warning("Alert {} not delivered — no channel configured", event)
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to send alert {}: {}", event, exc)


_alert_service: SignalAlertService | None = None
_alert_task: asyncio.Task | None = None


def get_alert_service() -> SignalAlertService | None:
    return _alert_service


def init_alert_service(session_factory: async_sessionmaker[AsyncSession]) -> SignalAlertService:
    global _alert_service
    _alert_service = SignalAlertService(session_factory)
    return _alert_service


async def alert_loop(service: SignalAlertService) -> None:
    interval = max(60, int(service.settings.alert_interval_sec))
    logger.info(
        "Signal alert loop started (interval={}s enabled={})",
        interval,
        service.settings.alerts_enabled,
    )
    while True:
        try:
            if service.settings.alerts_enabled:
                summary = await service.scan_once()
                logger.info("Alert scan: {}", summary)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Alert loop error: {}", exc)
        await asyncio.sleep(interval)


def start_alert_loop(service: SignalAlertService) -> asyncio.Task:
    global _alert_task
    _alert_task = asyncio.create_task(alert_loop(service), name="signal-alerts")
    return _alert_task


async def stop_alert_loop() -> None:
    global _alert_task
    if _alert_task:
        _alert_task.cancel()
        try:
            await _alert_task
        except asyncio.CancelledError:
            pass
        _alert_task = None
