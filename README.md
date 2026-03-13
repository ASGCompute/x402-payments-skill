# x402 Payments Skill — Stellar Edition

<div align="center">

**The first production-ready x402 payments skill for AI agents on Stellar.**

Teaches Claude Code, Codex, Cursor, Windsurf, and Gemini CLI how to build x402 payment infrastructure on Stellar — server middleware, agent payment clients, and facilitator routing via OZ Channels.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Stellar](https://img.shields.io/badge/Stellar-Soroban-blueviolet)](https://stellar.org)
[![x402](https://img.shields.io/badge/x402-v2-green)](https://x402.org)

</div>

---

## What it does

One install. Your AI agent knows how to:

- **Monetize any API** with x402 middleware (Express, Hono, Next.js) on Stellar
- **Call paid endpoints** with automatic 402 payment handling
- **Deploy on Stellar** with USDC (Soroban SAC) — fee-free for clients
- **Route payments** through OZ Channels facilitator — verify, settle, supported
- **Generate a full testnet runbook** for end-to-end testing

## Quick Install

```bash
curl -sSL https://raw.githubusercontent.com/ASGCompute/x402-payments-skill/main/install.sh | bash
```

Auto-detects Claude Code, Codex CLI, and Cursor. Installs the skill to the right location.

## Live Examples

Two ready-to-clone projects in `examples/`:

### Seller: Stellar x402 Server

An Express API charging $0.001/request in USDC on Stellar testnet.

```bash
cd examples/stellar-x402-server && npm install && npm run dev
```

### Buyer: Agent Payment Client

Node.js script that calls paid endpoints — handles 402 challenges, signs Soroban auth entries, pays USDC automatically.

```bash
cd examples/stellar-x402-client && npm install && npm start
```

## What's Inside the Skill

The skill teaches your AI agent a decision tree:

```
User asks about x402 / paid APIs / agent payments on Stellar
│
├─ Are you the SELLER or BUYER?
│  ├─ Seller → Express middleware setup with @x402/express
│  └─ Buyer → Client fetch wrapper with Soroban signing
│
├─ Which NETWORK?
│  ├─ Testnet → stellar:testnet + OZ Channels testnet facilitator
│  └─ Mainnet → stellar:pubnet + production facilitator
│
├─ FACILITATOR setup?
│  ├─ OZ Channels → https://channels.openzeppelin.com/x402/testnet
│  └─ Custom → self-hosted facilitator on Fly.io
│
└─ Need a TESTNET RUNBOOK?
   ├─ No → Basic x402 is enough
   └─ Yes → Full e2e flow: fund → challenge → sign → verify → settle
```

Full reference docs for every path: Stellar Soroban, Facilitator routing, and all relevant npm packages.

## Install

### Claude Code (Manual)

```bash
git clone https://github.com/ASGCompute/x402-payments-skill.git
cp -r x402-payments-skill/x402-payments ~/.claude/skills/
```

### Codex CLI

```bash
git clone https://github.com/ASGCompute/x402-payments-skill.git
cp -r x402-payments-skill/x402-payments ~/.codex/skills/
```

### Cursor / Windsurf

Copy `.cursorrules` into your project root:

```bash
cp x402-payments-skill/.cursorrules ./
```

### Per-project (shared via git)

```bash
cp -r x402-payments-skill/x402-payments .claude/skills/
```

## What's inside

```
x402-payments/
├── SKILL.md                    # Main decision tree + quick starts
└── references/
    ├── stellar.md              # Complete Stellar setup (Soroban, auth-entries, OZ Channels)
    ├── facilitator.md          # Facilitator routing (verify/settle/supported)
    └── packages.md             # All npm packages
examples/
├── stellar-x402-server/        # Express server with x402 middleware
└── stellar-x402-client/        # Agent payment client
```

## x402 Protocol

[x402](https://x402.org) is an open payment protocol by Coinbase using HTTP 402 status codes. Any API can charge per-request in USDC — no API keys, no subscriptions, no accounts. Works for humans and AI agents.

## Stellar Advantage

- **Fee-free settlement** — facilitator covers all Stellar network fees (~$0.00001/tx)
- **Sub-5s finality** — Stellar settles in 1 ledger close (~5 seconds)
- **Soroban smart contracts** — auth-entry signing, no full transaction signing required
- **SEP-41 tokens** — USDC, PYUSD, USDY all supported via standard interface

## Built by

[ASG Card](https://asgcard.dev) — Instant virtual MasterCard cards for AI agents, paid via x402 on Stellar.

[ASG Compute](https://asgcompute.com) — GPU infrastructure and AI agent services.

## License

MIT
