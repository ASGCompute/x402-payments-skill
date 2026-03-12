---
name: x402 Payments — Stellar Edition
description: Build paid APIs and agent payment clients on Stellar using the x402 protocol with USDC
---

# x402 Payments — Stellar Edition

Build paid APIs and agent payment infrastructure on **Stellar** using the x402 protocol. Deploy with USDC on Soroban — fee-free for clients via the OZ Channels facilitator. Sub-5s settlement.

## How x402 Works

x402 is an open payment protocol (by Coinbase) built on the HTTP 402 status code. Any API can charge per-request in USDC — no API keys, no subscriptions, no accounts. Clients (humans or AI agents) pay at the moment of use, and the server verifies payment before granting access.

```
Client → GET /api/data                                          → Server
Client ← 402 Payment Required (pricing + Stellar requirements)  ← Server
Client → GET /api/data + X-PAYMENT header (signed auth entries) → Server
Server → verifies via Facilitator → settles USDC on Stellar
Client ← 200 OK (data)                                         ← Server
```

### Stellar-Specific Flow

On Stellar, the payment flow uses Soroban smart contracts:

1. Client receives 402 with `stellar:testnet` or `stellar:pubnet` network
2. Client builds a Soroban SAC USDC `transfer` invocation
3. Client signs **auth entries** (not the full transaction) — lighter than EVM/Solana signing
4. Client sends signed XDR in `X-PAYMENT` header (Base64-encoded JSON)
5. Server forwards to OZ Channels facilitator for verify + settle
6. Facilitator assembles the transaction, covers all fees, and submits to Stellar
7. Client needs **zero XLM** — all fees sponsored by facilitator (~$0.00001/tx)

## Decision Tree

When a user asks for x402 help on Stellar, determine three things:

### 1. Role: Seller or Buyer?
- **Seller** (API provider) — wants to charge money for their endpoints → Server middleware setup
- **Buyer** (API consumer / AI agent) — wants to call paid endpoints → Client setup
- **Both** — building a system that both serves and consumes paid APIs

### 2. Network: Testnet or Mainnet?
- **Testnet** → `stellar:testnet` + OZ Channels testnet facilitator
- **Mainnet** → `stellar:pubnet` + production facilitator

### 3. Scale: Simple or Complex?
- **Simple** (1-3 endpoints) — basic x402 middleware is enough
- **Complex** (budget caps, multi-endpoint, audit trails) — add orchestration layer

---

## Quick Start: Seller on Stellar

Monetize an Express API with x402 — fee-free for clients (facilitator covers fees):

```bash
npm install @x402/express @x402/core express
```

```typescript
import express from "express";
import { paymentMiddleware } from "@x402/express";

const app = express();

app.use(
  paymentMiddleware(
    {
      "GET /weather": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.001",
            network: "stellar:testnet",
            payTo: process.env.STELLAR_PAY_TO_ADDRESS!, // your G... address
          },
        ],
        description: "Weather report",
      },
    },
    {
      url: "https://channels.openzeppelin.com/x402/testnet",
      headers: process.env.OZ_RELAYER_API_KEY
        ? { "x-api-key": process.env.OZ_RELAYER_API_KEY }
        : undefined,
    }
  )
);

app.get("/weather", (_req, res) => {
  res.json({
    city: "London",
    temperature: 22,
    conditions: "Partly cloudy",
    timestamp: Date.now(),
  });
});

app.listen(3000, () => console.log("x402 server on http://localhost:3000"));
```

Set `STELLAR_PAY_TO_ADDRESS` (your G... address) and optionally `OZ_RELAYER_API_KEY`. Clients sign auth entries (e.g. with Freighter); no XLM needed.

---

## Quick Start: Buyer on Stellar (Agent Client)

> **Prerequisites**: Your agent needs a funded Stellar wallet with a USDC trustline. See [`references/wallet-setup.md`](references/wallet-setup.md) for the one-time setup (keypair → XLM → trustline → USDC).

Call a paid x402 endpoint from an AI agent or Node.js script:

```bash
npm install @stellar/stellar-sdk node-fetch
```

```typescript
import { Keypair, Networks, Contract, Address, nativeToScVal, TransactionBuilder, rpc as StellarRpc, contract } from "@stellar/stellar-sdk";

const RPC_URL = "https://soroban-testnet.stellar.org";
const rpcServer = new StellarRpc.Server(RPC_URL);

// Step 1: Call the paid endpoint — get 402 challenge
const response = await fetch("https://api.example.com/weather");
if (response.status !== 402) {
  console.log("No payment required:", await response.json());
  process.exit(0);
}

const challenge = await response.json();
// challenge = { x402Version: 2, accepts: [{ scheme, network, amount, payTo, asset, ... }] }

const accept = challenge.accepts[0];

// Step 2: Build Soroban USDC transfer
const keypair = Keypair.fromSecret(process.env.STELLAR_SECRET_KEY!);
const publicKey = keypair.publicKey();

const tx = await contract.AssembledTransaction.build({
  contractId: accept.asset,
  method: "transfer",
  args: [
    nativeToScVal(publicKey, { type: "address" }),
    nativeToScVal(accept.payTo, { type: "address" }),
    nativeToScVal(BigInt(accept.amount), { type: "i128" }),
  ],
  networkPassphrase: Networks.TESTNET,
  rpcUrl: RPC_URL,
  parseResultXdr: (r: any) => r,
});

// Step 3: Sign auth entries (not the full transaction)
const signer = contract.basicNodeSigner(keypair, Networks.TESTNET);
const latestLedger = (tx.simulation as any).latestLedger;
await tx.signAuthEntries({
  address: publicKey,
  signAuthEntry: signer.signAuthEntry,
  expiration: latestLedger + 12, // ~1 minute
});

// Step 4: Re-simulate in Enforcing mode
await tx.simulate();
const finalXDR = tx.built!.toXDR();

// Step 5: Build X-PAYMENT header
const payload = Buffer.from(JSON.stringify({
  x402Version: 2,
  accepted: accept,
  payload: { transaction: finalXDR },
})).toString("base64");

// Step 6: Retry with payment
const paidResponse = await fetch("https://api.example.com/weather", {
  headers: { "X-PAYMENT": payload },
});

console.log("Paid response:", await paidResponse.json());
```

---

## Quick Start: Custom Express Middleware (Advanced)

For full control over the x402 flow (custom facilitator, rollout gates, pricing tiers):

```typescript
import type { Request, Response, NextFunction } from "express";

interface PaymentRequirements {
  scheme: "exact";
  network: string;      // "stellar:pubnet" or "stellar:testnet"
  amount: string;       // atomic units (7 decimals for Stellar USDC)
  payTo: string;        // G... address
  maxTimeoutSeconds: number;
  asset: string;        // Soroban SAC USDC contract ID
  extra: { areFeesSponsored: boolean };
}

// Build 402 challenge response
const buildChallenge = (req: Request, amount: string, payTo: string) => ({
  x402Version: 2,
  resource: {
    url: `https://${req.get("host")}${req.originalUrl}`,
    description: "Premium API access",
    mimeType: "application/json",
  },
  accepts: [{
    scheme: "exact",
    network: process.env.STELLAR_NETWORK || "stellar:testnet",
    amount,
    payTo,
    maxTimeoutSeconds: 300,
    asset: process.env.STELLAR_USDC_ASSET!,
    extra: { areFeesSponsored: true },
  }],
});

// Middleware
export const requirePayment = (amountAtomic: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const paymentHeader = req.header("X-PAYMENT");

    // No payment → return 402 challenge
    if (!paymentHeader) {
      res.status(402).json(buildChallenge(req, amountAtomic, process.env.STELLAR_PAY_TO!));
      return;
    }

    // Parse payment payload
    let parsed;
    try {
      const decoded = Buffer.from(paymentHeader, "base64").toString("utf8");
      parsed = JSON.parse(decoded);
    } catch {
      res.status(401).json({ error: "Invalid X-PAYMENT header" });
      return;
    }

    // Verify + settle via facilitator
    const facilitatorUrl = process.env.FACILITATOR_URL || "https://channels.openzeppelin.com/x402/testnet";

    const verifyRes = await fetch(`${facilitatorUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentPayload: parsed,
        paymentRequirements: buildChallenge(req, amountAtomic, process.env.STELLAR_PAY_TO!).accepts[0],
      }),
    });

    const verify = await verifyRes.json() as any;
    if (!verify.isValid) {
      res.status(401).json({ error: verify.invalidReason || "Payment invalid" });
      return;
    }

    const settleRes = await fetch(`${facilitatorUrl}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentPayload: parsed,
        paymentRequirements: buildChallenge(req, amountAtomic, process.env.STELLAR_PAY_TO!).accepts[0],
      }),
    });

    const settle = await settleRes.json() as any;
    if (!settle.success) {
      res.status(502).json({ error: settle.errorReason || "Settlement failed" });
      return;
    }

    // Payment successful — attach context
    (req as any).paymentContext = {
      payer: settle.payer,
      txHash: settle.transaction,
      network: settle.network,
    };

    next();
  };
};
```

---

## Mainnet vs Testnet

| | Testnet | Mainnet |
|---|---------|---------|
| **Network ID** | `stellar:testnet` | `stellar:pubnet` |
| **RPC URL** | `https://soroban-testnet.stellar.org` | `https://mainnet.sorobanrpc.com` |
| **Facilitator** | `https://channels.openzeppelin.com/x402/testnet` | `https://channels.openzeppelin.com/x402` |
| **Facilitator API Key** | [Generate testnet key](https://channels.openzeppelin.com/testnet/gen) | [Generate mainnet key](https://channels.openzeppelin.com/gen) |
| **USDC Contract** | Testnet SAC address | `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75` |
| **Token** | Testnet USDC (free from faucets) | Real USDC |
| **Funding** | Stellar Friendbot | Regular account funding |

Always start on testnet. Switch to mainnet by changing the network string and RPC URL.

---

## Testnet Runbook

### 1. Create a Stellar testnet account

```bash
curl "https://friendbot.stellar.org?addr=YOUR_PUBLIC_KEY"
```

### 2. Fund with testnet USDC

Use the Stellar Laboratory or the testnet faucet to get USDC tokens.

### 3. Start your x402 server

```bash
STELLAR_PAY_TO_ADDRESS=GXXX... \
STELLAR_NETWORK=stellar:testnet \
npm run dev
```

### 4. Test the 402 challenge

```bash
curl -s http://localhost:3000/weather | jq .
# → { x402Version: 2, accepts: [{ scheme: "exact", network: "stellar:testnet", ... }] }
```

### 5. Run the agent client

```bash
STELLAR_SECRET_KEY=SXXX... \
npm start
# → Paid response: { city: "London", ... }
```

---

## Key Concepts

- **Facilitator**: Verifies and settles payments on-chain. OZ Channels for Stellar. Self-hosted option available.
- **Scheme**: Payment structure. `exact` = fixed price per request.
- **CAIP-2**: Chain identifier format. `stellar:pubnet` = Stellar mainnet. `stellar:testnet` = testnet.
- **Soroban Authorization**: Stellar's smart contract auth model. Clients sign auth entries with `max_ledger` expiration bounds instead of full transactions.
- **SEP-41**: Stellar's token interface standard. USDC, PYUSD, USDY all implement SEP-41.
- **Fee-Free Settlement**: Facilitator covers all Stellar network fees. Clients don't need XLM. Tx costs ~$0.00001.
- **Auth Entry Signing**: Lighter than EVM/Solana signing. Only sign the authorization, not the full transaction envelope.
- **SAC (Stellar Asset Contract)**: Soroban wrapper for classic Stellar assets. USDC uses SAC for programmable transfers.

---

## Reference Files

- `references/wallet-setup.md` — **Agent wallet setup** (keypair, trustline, USDC funding)
- `references/stellar.md` — Complete Stellar setup (Soroban, Freighter, OZ Channels, auth entries)
- `references/facilitator.md` — Facilitator routing (verify / settle / supported)
- `references/packages.md` — All npm packages
