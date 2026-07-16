"""Initial schema — audit_logs table.

Revision ID: 001
Revises:
Create Date: 2026-06-30

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("message", sa.String(), nullable=False),
        sa.Column("metadata_json", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audit_logs_event_type"), "audit_logs", ["event_type"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_audit_logs_event_type"), table_name="audit_logs")
    op.drop_table("audit_logs")
