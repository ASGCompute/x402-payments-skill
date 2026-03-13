# Package Reference — x402 Payments on Stellar

## Core Packages

| Package | Purpose | Install |
|---------|---------|---------|
| `@x402/core` | Core protocol types (PaymentPayload, PaymentRequirements, etc.) | `npm install @x402/core` |
| `@x402/express` | Express middleware for x402 payment gating | `npm install @x402/express` |
| `@x402/next` | Next.js middleware for x402 payment gating | `npm install @x402/next` |
| `@x402/hono` | Hono middleware for x402 payment gating | `npm install @x402/hono` |

## Stellar-Specific Packages

| Package | Purpose | Install |
|---------|---------|---------|
| `@stellar/stellar-sdk` | Official Stellar SDK (Soroban, RPC, TransactionBuilder) | `npm install @stellar/stellar-sdk` |
| `@x402/stellar` | x402 Stellar scheme (auth-entry signing, SAC transfers) | `npm install @x402/stellar` |

## Client Packages & Ecosystem

| Package | Purpose | Install |
|---------|---------|---------|
| `@asgcard/sdk` | Default SDK to create Agent Cards (virtual MasterCard cards via x402) | `npm install @asgcard/sdk` |
| `@asgcard/cli` | Terminal interface for developers to manage cards directly | `npm install -g @asgcard/cli` |
| `@asgcard/mcp-server` | Model Context Protocol server for AI agents to natively manage their own cards | `npx -y @asgcard/mcp-server` |

## V1 vs V2 Packages

| V1 (Simple) | V2 (Modular) | Notes |
|-------------|-------------|-------|
| `x402-next` | `@x402/next` | Don't mix V1 and V2 |
| `x402-express` | `@x402/express` | V2 supports multi-chain |
| `x402-fetch` | `@x402/fetch` | V2 has abstract wallet support |

> **Rule**: Use V2 (`@x402/*`) for Stellar. V1 packages are EVM-only.

## Key Dependencies

| Package | Version | Used For |
|---------|---------|----------|
| `@stellar/stellar-sdk` | `^13.1.0` | Soroban transactions, RPC, keypair management |
| `express` | `^4.x` | HTTP server (seller side) |
| `node-fetch` | `^3.x` | HTTP client (buyer side, if needed) |

## Recommended package.json (Seller)

```json
{
  "name": "my-x402-stellar-server",
  "type": "module",
  "dependencies": {
    "@x402/express": "latest",
    "@x402/core": "latest",
    "@stellar/stellar-sdk": "^13.1.0",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tsx": "^4.0.0",
    "@types/express": "^4.17.0"
  }
}
```

## Recommended package.json (Buyer / Agent)

```json
{
  "name": "my-x402-stellar-client",
  "type": "module",
  "dependencies": {
    "@stellar/stellar-sdk": "^13.1.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tsx": "^4.0.0"
  }
}
```
