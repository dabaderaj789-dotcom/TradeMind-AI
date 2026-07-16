"""Migration: analysis engine tables.

Revision ID: 003
Revises: 002
Create Date: 2026-06-30

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "analysis_plugins",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("plugin_id", sa.String(64), nullable=False),
        sa.Column("plugin_name", sa.String(128), nullable=False),
        sa.Column("plugin_version", sa.String(32), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("required_history", sa.Integer(), nullable=False),
        sa.Column("parameters_schema", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("output_schema", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("dependencies", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("plugin_id"),
    )
    op.create_index("ix_analysis_plugins_category", "analysis_plugins", ["category"])
    op.create_index("ix_analysis_plugins_plugin_id", "analysis_plugins", ["plugin_id"])

    op.create_table(
        "analysis_results",
        sa.Column("symbol_id", UUID(as_uuid=True), sa.ForeignKey("symbols.id"), primary_key=True),
        sa.Column("timeframe_id", sa.SmallInteger(), sa.ForeignKey("timeframes.id"), primary_key=True),
        sa.Column("open_time", sa.DateTime(timezone=True), primary_key=True),
        sa.Column("plugin_id", sa.String(64), primary_key=True),
        sa.Column("plugin_version", sa.String(32), primary_key=True),
        sa.Column("params_hash", sa.String(64), primary_key=True),
        sa.Column("values", JSONB(), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(
        "ix_analysis_results_lookup",
        "analysis_results",
        ["symbol_id", "timeframe_id", "plugin_id", sa.text("open_time DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_analysis_results_lookup", table_name="analysis_results")
    op.drop_table("analysis_results")
    op.drop_index("ix_analysis_plugins_plugin_id", table_name="analysis_plugins")
    op.drop_index("ix_analysis_plugins_category", table_name="analysis_plugins")
    op.drop_table("analysis_plugins")
