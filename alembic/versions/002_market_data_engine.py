"""Market data engine tables and seed data.

Revision ID: 002
Revises: 001
Create Date: 2026-06-30

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "exchanges",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("country", sa.String(64), nullable=True),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="UTC"),
        sa.Column("market_types", ARRAY(sa.String(32)), nullable=False),
        sa.Column("api_base_url", sa.String(512), nullable=True),
        sa.Column("ws_url", sa.String(512), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("config", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("code"),
    )
    op.create_index("ix_exchanges_is_active", "exchanges", ["is_active"])

    op.create_table(
        "markets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("market_type", sa.String(32), nullable=False),
        sa.Column("currency", sa.String(8), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("code"),
    )
    op.create_index("ix_markets_market_type", "markets", ["market_type"])

    op.create_table(
        "timeframes",
        sa.Column("id", sa.SmallInteger(), primary_key=True),
        sa.Column("code", sa.String(8), nullable=False),
        sa.Column("name", sa.String(32), nullable=False),
        sa.Column("seconds", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.SmallInteger(), nullable=False),
        sa.UniqueConstraint("code"),
    )

    op.create_table(
        "symbols",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("exchange_id", UUID(as_uuid=True), sa.ForeignKey("exchanges.id"), nullable=False),
        sa.Column("market_id", UUID(as_uuid=True), sa.ForeignKey("markets.id"), nullable=False),
        sa.Column("symbol_code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("base_asset", sa.String(32), nullable=True),
        sa.Column("quote_asset", sa.String(32), nullable=True),
        sa.Column("isin", sa.String(16), nullable=True),
        sa.Column("sector", sa.String(128), nullable=True),
        sa.Column("industry", sa.String(128), nullable=True),
        sa.Column("tick_size", sa.Numeric(18, 8), nullable=False, server_default="0.01"),
        sa.Column("lot_size", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("metadata", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("exchange_id", "symbol_code", name="uq_symbols_exchange_code"),
    )
    op.create_index("ix_symbols_symbol_code", "symbols", ["symbol_code"])
    op.create_index("ix_symbols_is_active", "symbols", ["is_active"])

    op.create_table(
        "candles",
        sa.Column("symbol_id", UUID(as_uuid=True), sa.ForeignKey("symbols.id"), primary_key=True),
        sa.Column("timeframe_id", sa.SmallInteger(), sa.ForeignKey("timeframes.id"), primary_key=True),
        sa.Column("open_time", sa.DateTime(timezone=True), primary_key=True),
        sa.Column("close_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("open", sa.Numeric(18, 8), nullable=False),
        sa.Column("high", sa.Numeric(18, 8), nullable=False),
        sa.Column("low", sa.Numeric(18, 8), nullable=False),
        sa.Column("close", sa.Numeric(18, 8), nullable=False),
        sa.Column("volume", sa.Numeric(24, 8), nullable=False, server_default="0"),
        sa.Column("quote_volume", sa.Numeric(24, 8), nullable=True),
        sa.Column("trades_count", sa.Integer(), nullable=True),
        sa.Column("is_complete", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("source", sa.String(32), nullable=False, server_default="historical"),
    )
    op.create_index(
        "ix_candles_symbol_tf_time",
        "candles",
        ["symbol_id", "timeframe_id", sa.text("open_time DESC")],
    )

    # Seed timeframes
    op.execute(
        """
        INSERT INTO timeframes (id, code, name, seconds, sort_order) VALUES
        (1, '1m', '1 Minute', 60, 1),
        (2, '5m', '5 Minutes', 300, 2),
        (3, '15m', '15 Minutes', 900, 3),
        (4, '1h', '1 Hour', 3600, 4),
        (5, '4h', '4 Hours', 14400, 5),
        (6, '1d', '1 Day', 86400, 6),
        (7, '1w', '1 Week', 604800, 7)
        """
    )

    # Seed Binance exchange and crypto market
    op.execute(
        """
        INSERT INTO exchanges (code, name, country, timezone, market_types, api_base_url, ws_url, is_active, config)
        VALUES (
            'binance',
            'Binance Spot',
            NULL,
            'UTC',
            ARRAY['crypto'],
            'https://api.binance.com',
            'wss://stream.binance.com:9443/ws',
            true,
            '{}'::jsonb
        )
        """
    )
    op.execute(
        """
        INSERT INTO markets (code, name, market_type, currency)
        VALUES ('binance_crypto', 'Binance Crypto Spot', 'crypto', 'USDT')
        """
    )


def downgrade() -> None:
    op.drop_index("ix_candles_symbol_tf_time", table_name="candles")
    op.drop_table("candles")
    op.drop_index("ix_symbols_is_active", table_name="symbols")
    op.drop_index("ix_symbols_symbol_code", table_name="symbols")
    op.drop_table("symbols")
    op.drop_table("timeframes")
    op.drop_index("ix_markets_market_type", table_name="markets")
    op.drop_table("markets")
    op.drop_index("ix_exchanges_is_active", table_name="exchanges")
    op.drop_table("exchanges")
