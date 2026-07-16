# API Overview

REST API at `/api/v1` with WebSocket channels at `/ws/v1`.

See [Endpoints Reference](./endpoints.md) for the complete catalog (~120 endpoints).

## Authentication

JWT Bearer tokens. Access token (15 min) + refresh token (7 days).

## Versioning

URL-based: `/api/v1/`. Breaking changes require `/api/v2/`.

## Response Formats

All responses use JSON. Paginated lists return `{items, total, page, page_size, pages}`.

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not found |
| 409 | Conflict |
| 422 | Validation error |
| 429 | Rate limited |
| 503 | Service unavailable |
