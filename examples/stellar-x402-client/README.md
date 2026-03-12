# Stellar x402 Client — Agent Payment Example

AI agent / Node.js script that calls paid x402 endpoints on Stellar.

## Setup

```bash
npm install
```

Create a `.env` file:

```env
STELLAR_SECRET_KEY=SXXX...your_stellar_secret_key
API_URL=http://localhost:3000/weather
STELLAR_NETWORK=stellar:testnet
```

## Run

```bash
npm start
```

## What happens

1. Client calls the paid API endpoint
2. Gets back `402 Payment Required` with pricing + Stellar requirements
3. Builds a Soroban SAC USDC `transfer` invocation
4. Signs auth entries (not the full transaction) — ~100ms
5. Sends `X-PAYMENT` header with signed XDR
6. Receives the paid data

## Output

```
🌟 x402 Stellar Agent Client
════════════════════════════════════════
   Agent:    GABC...
   Target:   http://localhost:3000/weather
   Network:  stellar:testnet

1️⃣  Calling paid endpoint...
   → Got 402 challenge
   Resource: Weather report — $0.001 per request
   Price:    $0.001 USDC on stellar:testnet

2️⃣  Building Soroban payment...
   📝 Building Soroban transfer...
   ✓ Simulation successful
   ✓ Auth entries signed (expires ledger 123456)
   ✓ Enforcing simulation passed

3️⃣  Sending payment...
   ✅ Payment accepted!

4️⃣  Response data:
{
  "city": "London",
  "temperature": 22,
  ...
}
════════════════════════════════════════
```

## Requirements

- Stellar account with USDC balance
- For testnet: fund via Stellar Friendbot + testnet USDC faucet
- No XLM needed — facilitator covers all fees
