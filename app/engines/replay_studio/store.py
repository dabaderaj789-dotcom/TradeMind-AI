"""In-memory replay session store."""

from __future__ import annotations

from uuid import UUID

from app.core.exceptions import NotFoundError
from app.engines.replay_studio.types import ReplaySession


class ReplaySessionStore:
    """Process-local session cache for engineering replay studio."""

    _sessions: dict[UUID, ReplaySession] = {}

    @classmethod
    def put(cls, session: ReplaySession) -> None:
        cls._sessions[session.session_id] = session

    @classmethod
    def get(cls, session_id: UUID) -> ReplaySession:
        session = cls._sessions.get(session_id)
        if session is None:
            raise NotFoundError("Replay session not found", detail=str(session_id))
        return session

    @classmethod
    def delete(cls, session_id: UUID) -> None:
        cls._sessions.pop(session_id, None)

    @classmethod
    def clear(cls) -> None:
        cls._sessions.clear()
