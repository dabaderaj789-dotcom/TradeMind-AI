"""Migration: setup validation reviews.

Revision ID: 006
Revises: 005
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "setup_validation_reviews",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("setup_id", sa.String(32), sa.ForeignKey("trade_setups.setup_id"), nullable=False),
        sa.Column("replay_session_id", UUID(as_uuid=True), nullable=True),
        sa.Column("symbol_id", UUID(as_uuid=True), sa.ForeignKey("symbols.id"), nullable=False),
        sa.Column("timeframe_id", sa.SmallInteger(), sa.ForeignKey("timeframes.id"), nullable=False),
        sa.Column("setup_type", sa.String(64), nullable=False),
        sa.Column("strategy_id", sa.String(64), nullable=True),
        sa.Column("direction", sa.String(16), nullable=False),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("verdict", sa.String(16), nullable=False),
        sa.Column("rejection_reason", sa.String(64), nullable=True),
        sa.Column("plugin_issues", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("confidence_score", sa.Float(), nullable=False),
        sa.Column("reviewer", sa.String(128), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("setup_id", name="uq_setup_validation_reviews_setup_id"),
    )
    op.create_index("ix_setup_validation_reviews_setup_id", "setup_validation_reviews", ["setup_id"])
    op.create_index("ix_setup_validation_reviews_symbol_id", "setup_validation_reviews", ["symbol_id"])
    op.create_index("ix_setup_validation_reviews_timeframe_id", "setup_validation_reviews", ["timeframe_id"])
    op.create_index("ix_setup_validation_reviews_setup_type", "setup_validation_reviews", ["setup_type"])
    op.create_index("ix_setup_validation_reviews_strategy_id", "setup_validation_reviews", ["strategy_id"])
    op.create_index("ix_setup_validation_reviews_verdict", "setup_validation_reviews", ["verdict"])
    op.create_index("ix_setup_validation_reviews_rejection_reason", "setup_validation_reviews", ["rejection_reason"])
    op.create_index("ix_setup_validation_reviews_detected_at", "setup_validation_reviews", ["detected_at"])


def downgrade() -> None:
    op.drop_table("setup_validation_reviews")
