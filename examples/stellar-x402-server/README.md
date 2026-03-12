# Stellar x402 Server — Example

Express API that charges USDC per request on Stellar using the x402 protocol.

## Setup

```bash
npm install
```

Create a `.env` file:

```env
STELLAR_PAY_TO_ADDRESS=GXXX...your_stellar_public_key
STELLAR_NETWORK=stellar:testnet
OZ_RELAYER_API_KEY=your_oz_api_key    # optional
```

## Run

```bash
npm run dev
```

## Endpoints

| Endpoint | Price | Auth |
|----------|-------|------|
| `GET /health` | Free | None |
| `GET /weather` | $0.001 USDC | x402 |
| `GET /premium-data` | $0.01 USDC | x402 |

## Test

```bash
# Free endpoint
curl http://localhost:3000/health

# Paid endpoint — returns 402 challenge
curl http://localhost:3000/weather
```

## How it works

1. Client requests `/weather` without payment → gets `402 Payment Required`
2. Client builds Soroban USDC transfer, signs auth entries
3. Client retries with `X-PAYMENT` header containing signed XDR
4. Server verifies + settles via OZ Channels facilitator
5. Server returns weather data with payment receipt
