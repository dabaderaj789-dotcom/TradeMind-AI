"""Seed NSE exchange and equity market.

Revision ID: 007
Revises: 006
"""

from typing import Sequence, Union

from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO exchanges (code, name, country, timezone, market_types, api_base_url, ws_url, is_active, config)
        VALUES (
            'nse',
            'National Stock Exchange of India',
            'India',
            'Asia/Kolkata',
            ARRAY['equity','futures','options'],
            'https://query1.finance.yahoo.com',
            NULL,
            true,
            '{"data_provider":"yahoo"}'::jsonb
        )
        ON CONFLICT (code) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO markets (code, name, market_type, currency)
        VALUES ('nse_equity', 'NSE Equity / Indices', 'equity', 'INR')
        ON CONFLICT (code) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM markets WHERE code = 'nse_equity'")
    op.execute("DELETE FROM exchanges WHERE code = 'nse'")
