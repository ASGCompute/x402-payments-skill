# Facilitator Reference — x402 Payments on Stellar

The facilitator is the server-side component that verifies and settles x402 payments on-chain. For Stellar, the primary facilitator is **OZ Channels** (by OpenZeppelin).

## Overview

```
Server (API)                    Facilitator (OZ Channels)
┌──────────────────┐           ┌──────────────────────────┐
│ Parse X-PAYMENT  │           │                          │
│ header           │───────────│  POST /verify            │
│                  │           │  • Validate XDR          │
│                  │           │  • Check auth entries     │
│                  │           │  • Verify amounts         │
│                  │           │                          │
│                  │───────────│  POST /settle            │
│                  │           │  • Assemble transaction   │
│                  │           │  • Add Soroban footprint  │
│                  │           │  • Submit to Stellar     │
│                  │           │  • Return tx hash        │
│                  │           │                          │
│ Return 200       │◀──────────│  GET /supported          │
│                  │           │  • List capabilities     │
└──────────────────┘           └──────────────────────────┘
```

## Facilitator URLs

| Environment | URL |
|-------------|-----|
| **Stellar Testnet** | `https://channels.openzeppelin.com/x402/testnet` |
| **Stellar Mainnet** | `https://channels.openzeppelin.com/x402` |
| **Testnet API Key** | [Generate at channels.openzeppelin.com/testnet/gen](https://channels.openzeppelin.com/testnet/gen) |
| **Mainnet API Key** | [Generate at channels.openzeppelin.com/gen](https://channels.openzeppelin.com/gen) |
| **Base/Solana** (for reference) | `https://x402.org/facilitator` |

## API Endpoints

### POST /verify

Validates a payment payload without submitting it to the network.

**Request:**

```json
{
  "paymentPayload": {
    "x402Version": 2,
    "accepted": {
      "scheme": "exact",
      "network": "stellar:testnet",
      "amount": "10000",
      "payTo": "GXXX...",
      "maxTimeoutSeconds": 300,
      "asset": "CXXX...",
      "extra": { "areFeesSponsored": true }
    },
    "payload": {
      "transaction": "AAAAAgAA..."
    }
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "stellar:testnet",
    "amount": "10000",
    "payTo": "GXXX...",
    "maxTimeoutSeconds": 300,
    "asset": "CXXX...",
    "extra": { "areFeesSponsored": true }
  }
}
```

**Response (success):**

```json
{
  "isValid": true,
  "payer": "GABC...payer_public_key"
}
```

**Response (failure):**

```json
{
  "isValid": false,
  "invalidReason": "Auth entry expired"
}
```

### POST /settle

Assembles, signs, and submits the transaction to Stellar.

**Request:** Same as `/verify`.

**Response (success):**

```json
{
  "success": true,
  "transaction": "abc123...tx_hash",
  "network": "stellar:testnet",
  "payer": "GABC...payer_public_key"
}
```

**Response (failure):**

```json
{
  "success": false,
  "errorReason": "Transaction submission failed: tx_bad_auth"
}
```

### GET /supported

Returns the facilitator's supported networks and capabilities.

**Response:**

```json
{
  "kinds": [
    {
      "x402Version": 2,
      "scheme": "exact",
      "network": "stellar:testnet",
      "extra": {
        "areFeesSponsored": true
      }
    }
  ]
}
```

## Client Implementation

### TypeScript Facilitator Client

```typescript
class FacilitatorClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeoutMs: number;

  constructor(config: {
    baseUrl: string;
    apiKey?: string;
    timeoutMs?: number;
  }) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async verify(paymentPayload: any, paymentRequirements: any) {
    return this.post("/verify", { paymentPayload, paymentRequirements });
  }

  async settle(paymentPayload: any, paymentRequirements: any) {
    return this.post("/settle", { paymentPayload, paymentRequirements });
  }

  async supported() {
    return this.get("/supported");
  }

  private async post(path: string, body: any) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
        headers["x-api-key"] = this.apiKey;
      }

      const res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Facilitator ${path}: ${res.status} ${text}`);
      }

      return res.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async get(path: string) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: this.apiKey ? { "x-api-key": this.apiKey } : {},
    });
    if (!res.ok) throw new Error(`Facilitator ${path}: ${res.status}`);
    return res.json();
  }
}

// Usage
const facilitator = new FacilitatorClient({
  baseUrl: "https://channels.openzeppelin.com/x402/testnet",
  apiKey: process.env.OZ_RELAYER_API_KEY,
});
```

## Verify + Settle Flow

The recommended flow for server-side payment processing:

```typescript
async function verifyAndSettle(paymentPayload: any, paymentRequirements: any) {
  // Step 1: Verify
  const verifyResult = await facilitator.verify(paymentPayload, paymentRequirements);

  if (!verifyResult.isValid) {
    return { valid: false, error: verifyResult.invalidReason };
  }

  // Step 2: Settle
  const settleResult = await facilitator.settle(paymentPayload, paymentRequirements);

  if (!settleResult.success) {
    return { valid: false, error: settleResult.errorReason };
  }

  return {
    valid: true,
    payer: settleResult.payer,
    txHash: settleResult.transaction,
    network: settleResult.network,
  };
}
```

## Fee Sponsorship

On Stellar, the facilitator covers all network fees:

- **Transaction fee**: ~100 stroops (~$0.00001)
- **Soroban resource fees**: Variable, typically < $0.001
- **Client cost**: Zero XLM required

This means AI agents need only **USDC balance** — no native token management.

## Retry Strategy

Facilitator calls should use exponential backoff:

| Endpoint | Max Retries | Backoff |
|----------|-------------|---------|
| `/verify` | 2 | 1s, 3s |
| `/settle` | 5 | 2s, 4s, 8s, 16s, 30s |
| `/supported` | 1 | 1s |

> **IMPORTANT**: Always **fail closed**. If the facilitator is unreachable or returns an error, deny the request. Never grant access without confirmed payment.

## Self-Hosted Facilitator

For production mainnet deployment, you can self-host a facilitator:

1. Use the OpenZeppelin `relayer-plugin-x402-facilitator` package
2. Deploy on Fly.io, AWS, or similar
3. Configure with your Stellar keypair for transaction signing
4. Set `STELLAR_NETWORK=stellar:pubnet` and `STELLAR_RPC_URL=https://mainnet.sorobanrpc.com`

Example Fly.io config:

```toml
app = "my-x402-facilitator"
primary_region = "iad"

[env]
  NODE_ENV = "production"
  PORT = "4022"
  STELLAR_NETWORK = "stellar:pubnet"
  STELLAR_RPC_URL = "https://mainnet.sorobanrpc.com"

[http_service]
  internal_port = 4022
  force_https = true
  auto_stop_machines = "off"
  min_machines_running = 1
```
