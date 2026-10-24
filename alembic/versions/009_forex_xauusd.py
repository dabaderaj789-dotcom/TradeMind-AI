"""Seed forex exchange and commodity market for XAUUSD.

Revision ID: 009
Revises: 008
"""

from typing import Sequence, Union

from alembic import op

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO exchanges (code, name, country, timezone, market_types, api_base_url, ws_url, is_active, config)
        VALUES (
            'forex',
            'Forex & Metals (Yahoo)',
            'Global',
            'UTC',
            ARRAY['commodity','forex'],
            'https://query1.finance.yahoo.com',
            NULL,
            true,
            '{"data_provider":"yahoo","symbols":["XAUUSD"]}'::jsonb
        )
        ON CONFLICT (code) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO markets (code, name, market_type, currency)
        VALUES ('forex_commodity', 'Forex Metals / Commodities', 'commodity', 'USD')
        ON CONFLICT (code) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM markets WHERE code = 'forex_commodity'")
    op.execute("DELETE FROM exchanges WHERE code = 'forex'")
