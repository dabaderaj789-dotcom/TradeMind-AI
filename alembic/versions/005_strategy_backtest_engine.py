"""Migration: strategy and backtesting engine tables.

Revision ID: 005
Revises: 004
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "strategy_definitions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("strategy_id", sa.String(64), nullable=False, unique=True),
        sa.Column("strategy_name", sa.String(128), nullable=False),
        sa.Column("current_version", sa.String(32), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("supported_markets", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("supported_timeframes", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("required_setup_types", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("parameters_schema", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_strategy_definitions_strategy_id", "strategy_definitions", ["strategy_id"])

    op.create_table(
        "strategy_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("strategy_id", sa.String(64), nullable=False),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("parameters_schema", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_strategy_versions_strategy_id", "strategy_versions", ["strategy_id"])

    op.create_table(
        "trade_plans",
        sa.Column("plan_id", sa.String(32), primary_key=True),
        sa.Column("strategy_id", sa.String(64), nullable=False),
        sa.Column("strategy_version", sa.String(32), nullable=False),
        sa.Column("params_hash", sa.String(64), nullable=False),
        sa.Column("setup_id", sa.String(32), nullable=False),
        sa.Column("symbol_id", UUID(as_uuid=True), sa.ForeignKey("symbols.id"), nullable=False),
        sa.Column("timeframe_id", sa.SmallInteger(), sa.ForeignKey("timeframes.id"), nullable=False),
        sa.Column("direction", sa.String(16), nullable=False),
        sa.Column("entry_zone", JSONB(), nullable=False),
        sa.Column("stop_loss", sa.Float(), nullable=False),
        sa.Column("target_1", sa.Float(), nullable=False),
        sa.Column("target_2", sa.Float(), nullable=False),
        sa.Column("target_3", sa.Float(), nullable=True),
        sa.Column("risk_reward", sa.Float(), nullable=False),
        sa.Column("trade_expiration_bars", sa.SmallInteger(), nullable=False),
        sa.Column("position_risk_pct", sa.Float(), nullable=False),
        sa.Column("strategy_confidence", sa.Float(), nullable=False),
        sa.Column("reasoning", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default=sa.text("'approved'")),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_trade_plans_strategy_id", "trade_plans", ["strategy_id"])
    op.create_index("ix_trade_plans_setup_id", "trade_plans", ["setup_id"])
    op.create_index("ix_trade_plans_symbol_tf", "trade_plans", ["symbol_id", "timeframe_id"])

    op.create_table(
        "backtest_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("strategy_id", sa.String(64), nullable=False),
        sa.Column("strategy_version", sa.String(32), nullable=False),
        sa.Column("params_hash", sa.String(64), nullable=False),
        sa.Column("engine_version", sa.String(32), nullable=False),
        sa.Column("symbol_id", UUID(as_uuid=True), sa.ForeignKey("symbols.id"), nullable=False),
        sa.Column("timeframe_id", sa.SmallInteger(), sa.ForeignKey("timeframes.id"), nullable=False),
        sa.Column("symbol_ids", JSONB(), nullable=True),
        sa.Column("timeframes", JSONB(), nullable=True),
        sa.Column("config", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", sa.String(16), nullable=False, server_default=sa.text("'completed'")),
        sa.Column("initial_capital", sa.Float(), nullable=False),
        sa.Column("final_capital", sa.Float(), nullable=True),
        sa.Column("bars_processed", sa.SmallInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_backtest_runs_lookup", "backtest_runs", ["symbol_id", "timeframe_id", "strategy_id"])

    op.create_table(
        "backtest_trades",
        sa.Column("trade_id", sa.String(32), primary_key=True),
        sa.Column("run_id", UUID(as_uuid=True), sa.ForeignKey("backtest_runs.id"), nullable=False),
        sa.Column("plan_id", sa.String(32), nullable=False),
        sa.Column("setup_id", sa.String(32), nullable=False),
        sa.Column("symbol_id", UUID(as_uuid=True), sa.ForeignKey("symbols.id"), nullable=False),
        sa.Column("direction", sa.String(16), nullable=False),
        sa.Column("entry_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("exit_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("entry_price", sa.Float(), nullable=False),
        sa.Column("exit_price", sa.Float(), nullable=True),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("pnl", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("pnl_pct", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("commission", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("exit_reason", sa.String(32), nullable=True),
        sa.Column("bars_held", sa.SmallInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("partial_exits", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.create_index("ix_backtest_trades_run_id", "backtest_trades", ["run_id"])

    op.create_table(
        "performance_reports",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("run_id", UUID(as_uuid=True), sa.ForeignKey("backtest_runs.id"), unique=True, nullable=False),
        sa.Column("metrics", JSONB(), nullable=False),
        sa.Column("equity_curve", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("monthly_returns", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("yearly_returns", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("walk_forward_segments", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("performance_reports")
    op.drop_index("ix_backtest_trades_run_id", table_name="backtest_trades")
    op.drop_table("backtest_trades")
    op.drop_index("ix_backtest_runs_lookup", table_name="backtest_runs")
    op.drop_table("backtest_runs")
    op.drop_index("ix_trade_plans_symbol_tf", table_name="trade_plans")
    op.drop_index("ix_trade_plans_setup_id", table_name="trade_plans")
    op.drop_index("ix_trade_plans_strategy_id", table_name="trade_plans")
    op.drop_table("trade_plans")
    op.drop_index("ix_strategy_versions_strategy_id", table_name="strategy_versions")
    op.drop_table("strategy_versions")
    op.drop_index("ix_strategy_definitions_strategy_id", table_name="strategy_definitions")
    op.drop_table("strategy_definitions")
