# Market Data Engine API (Sprint 3)

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/exchanges` | List active exchanges |
| GET | `/api/v1/symbols` | List symbols (filter by exchange, search) |
| POST | `/api/v1/symbols/sync` | Sync symbols from exchange adapter |
| POST | `/api/v1/candles/download` | Download and store historical candles |
| GET | `/api/v1/candles/{symbol_id}` | Retrieve stored candles |
| GET | `/api/v1/candles/{symbol_id}/latest` | Retrieve latest N candles |

## Sample Requests

### 1. List exchanges

```bash
curl http://localhost:8000/api/v1/exchanges
```

### 2. Sync Binance symbols

```bash
curl -X POST http://localhost:8000/api/v1/symbols/sync \
  -H "Content-Type: application/json" \
  -d '{"exchange_code": "binance"}'
```

### 3. List symbols

```bash
curl "http://localhost:8000/api/v1/symbols?exchange_code=binance&search=BTC&page=1&page_size=20"
```

### 4. Download historical candles (incremental)

```bash
curl -X POST http://localhost:8000/api/v1/candles/download \
  -H "Content-Type: application/json" \
  -d '{
    "exchange_code": "binance",
    "symbol_code": "BTCUSDT",
    "timeframe": "1h",
    "incremental": true
  }'
```

### 5. Download with explicit date range

```bash
curl -X POST http://localhost:8000/api/v1/candles/download \
  -H "Content-Type: application/json" \
  -d '{
    "exchange_code": "binance",
    "symbol_code": "ETHUSDT",
    "timeframe": "1d",
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-06-01T00:00:00Z",
    "incremental": false
  }'
```

### 6. Retrieve stored candles

```bash
# Replace SYMBOL_UUID with id from /symbols response
curl "http://localhost:8000/api/v1/candles/SYMBOL_UUID?timeframe=1h&limit=100"
```

### 7. Latest candles

```bash
curl "http://localhost:8000/api/v1/candles/SYMBOL_UUID/latest?timeframe=1h&limit=50"
```

## Supported Timeframes (Binance)

`1m`, `5m`, `15m`, `1h`, `4h`, `1d`, `1w`

## Download Response

```json
{
  "symbol_id": "uuid",
  "symbol_code": "BTCUSDT",
  "exchange_code": "binance",
  "timeframe": "1h",
  "downloaded": 720,
  "inserted": 720,
  "rejected": 0,
  "start": "2024-01-01T00:00:00Z",
  "end": "2024-01-31T00:00:00Z",
  "incremental": true
}
```

## Architecture

```
BinanceAdapter → CandleValidator → CandleWriter → PostgreSQL
                      ↑
              MarketDataService ← REST API
```

WebSocket streaming (`subscribe_ticks`, `subscribe_candles`) is defined on the adapter interface but returns `501 Not Implemented` until a future sprint.
