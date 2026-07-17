"""Add 3m and 30m timeframes for full terminal TF support.

Revision ID: 008
Revises: 007
"""

from typing import Sequence, Union

from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Insert missing timeframes and re-order sort_order to match UI:
    # 1m, 3m, 5m, 15m, 30m, 1h, 4h, 1d, 1w
    op.execute(
        """
        INSERT INTO timeframes (id, code, name, seconds, sort_order) VALUES
        (8, '3m', '3 Minutes', 180, 2),
        (9, '30m', '30 Minutes', 1800, 5)
        ON CONFLICT (code) DO NOTHING
        """
    )
    op.execute(
        """
        UPDATE timeframes SET sort_order = CASE code
            WHEN '1m' THEN 1
            WHEN '3m' THEN 2
            WHEN '5m' THEN 3
            WHEN '15m' THEN 4
            WHEN '30m' THEN 5
            WHEN '1h' THEN 6
            WHEN '4h' THEN 7
            WHEN '1d' THEN 8
            WHEN '1w' THEN 9
            ELSE sort_order
        END
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM timeframes WHERE code IN ('3m', '30m')")
    op.execute(
        """
        UPDATE timeframes SET sort_order = CASE code
            WHEN '1m' THEN 1
            WHEN '5m' THEN 2
            WHEN '15m' THEN 3
            WHEN '1h' THEN 4
            WHEN '4h' THEN 5
            WHEN '1d' THEN 6
            WHEN '1w' THEN 7
            ELSE sort_order
        END
        """
    )
