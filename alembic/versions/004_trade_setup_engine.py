"""Migration: trade setup engine tables.

Revision ID: 004
Revises: 003
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "trade_setup_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("symbol_id", UUID(as_uuid=True), sa.ForeignKey("symbols.id"), nullable=False),
        sa.Column("timeframe_id", sa.SmallInteger(), sa.ForeignKey("timeframes.id"), nullable=False),
        sa.Column("engine_version", sa.String(32), nullable=False),
        sa.Column("params_hash", sa.String(64), nullable=False),
        sa.Column("config", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("analysis_snapshot", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("setups_detected", sa.SmallInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("bars_scanned", sa.SmallInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(
        "ix_trade_setup_runs_lookup",
        "trade_setup_runs",
        ["symbol_id", "timeframe_id", sa.text("computed_at DESC")],
    )

    op.create_table(
        "trade_setups",
        sa.Column("setup_id", sa.String(32), primary_key=True),
        sa.Column("run_id", UUID(as_uuid=True), sa.ForeignKey("trade_setup_runs.id"), nullable=False),
        sa.Column("symbol_id", UUID(as_uuid=True), sa.ForeignKey("symbols.id"), nullable=False),
        sa.Column("timeframe_id", sa.SmallInteger(), sa.ForeignKey("timeframes.id"), nullable=False),
        sa.Column("engine_version", sa.String(32), nullable=False),
        sa.Column("params_hash", sa.String(64), nullable=False),
        sa.Column("setup_type", sa.String(64), nullable=False),
        sa.Column("direction", sa.String(16), nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=False),
        sa.Column("confidence_level", sa.String(16), nullable=False),
        sa.Column("evidence_scores", JSONB(), nullable=False),
        sa.Column("entry_zone", JSONB(), nullable=False),
        sa.Column("stop_loss_zone", JSONB(), nullable=False),
        sa.Column("target_zones", JSONB(), nullable=False),
        sa.Column("risk_reward", sa.Float(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default=sa.text("'active'")),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("reference_ids", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_index", sa.SmallInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(
        "ix_trade_setups_lookup",
        "trade_setups",
        ["symbol_id", "timeframe_id", "status", sa.text("detected_at DESC")],
    )
    op.create_index("ix_trade_setups_type", "trade_setups", ["setup_type"])
    op.create_index("ix_trade_setups_confidence", "trade_setups", ["confidence_score"])
    op.create_index("ix_trade_setups_run", "trade_setups", ["run_id"])


def downgrade() -> None:
    op.drop_index("ix_trade_setups_run", table_name="trade_setups")
    op.drop_index("ix_trade_setups_confidence", table_name="trade_setups")
    op.drop_index("ix_trade_setups_type", table_name="trade_setups")
    op.drop_index("ix_trade_setups_lookup", table_name="trade_setups")
    op.drop_table("trade_setups")
    op.drop_index("ix_trade_setup_runs_lookup", table_name="trade_setup_runs")
    op.drop_table("trade_setup_runs")
