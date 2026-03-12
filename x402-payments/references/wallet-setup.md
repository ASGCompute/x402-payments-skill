# Wallet Setup — Stellar x402 Agent

Before making x402 payments, your AI agent needs a funded Stellar wallet with a USDC trustline. This guide covers the one-time setup. After setup, the x402 facilitator covers all transaction fees — you only need USDC.

## What You Need

| Requirement | Testnet | Mainnet |
|-------------|---------|---------|
| **Stellar Keypair** | Generate locally | Generate locally |
| **XLM (for trustline)** | Free via Friendbot | ~2-3 XLM (base reserve + trustline) |
| **USDC** | Free via testnet faucet | Real USDC (Circle, exchange, or P2P) |
| **x402 tx fees** | **$0 — facilitator covers** | **$0 — facilitator covers** |

> **Key point**: XLM is needed *only once* for the initial trustline setup. All subsequent x402 payments are fee-free — the facilitator covers Stellar network fees.

## Step 1: Generate a Keypair

```typescript
import { Keypair } from "@stellar/stellar-sdk";

const keypair = Keypair.random();

console.log("Public Key:", keypair.publicKey());   // GXXX...
console.log("Secret Key:", keypair.secret());       // SXXX...

// ⚠️ Store the secret key securely (env var, vault, encrypted file)
// Never commit it to source control
```

Set environment variables:

```bash
export STELLAR_PUBLIC_KEY="GXXX..."
export STELLAR_SECRET_KEY="SXXX..."
```

## Step 2: Fund with XLM

XLM is needed only for the base account reserve and trustline setup.

### Testnet (free)

```bash
curl "https://friendbot.stellar.org?addr=$STELLAR_PUBLIC_KEY"
```

Friendbot sends 10,000 testnet XLM — more than enough.

### Mainnet

Fund your account with **≥ 2.5 XLM** from any source:

- Transfer from an exchange (Coinbase, Binance, etc.)
- Receive from another Stellar wallet
- Use a fiat on-ramp

> **Why 2.5 XLM?** Stellar requires a **1 XLM base reserve** per account + **0.5 XLM per trustline**. The extra XLM covers these reserves and minor operations.

## Step 3: Add USDC Trustline

A trustline tells Stellar your account accepts USDC. This is required before you can receive or hold USDC.

```typescript
import {
  Keypair, Networks, TransactionBuilder,
  Operation, Asset, Horizon,
} from "@stellar/stellar-sdk";

// --- Config ---
const NETWORK = "testnet"; // or "mainnet"
const HORIZON_URL = NETWORK === "testnet"
  ? "https://horizon-testnet.stellar.org"
  : "https://horizon.stellar.org";
const NETWORK_PASSPHRASE = NETWORK === "testnet"
  ? Networks.TESTNET
  : Networks.PUBLIC;

// USDC issuer (Circle)
const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const USDC = new Asset("USDC", USDC_ISSUER);

// --- Setup ---
const keypair = Keypair.fromSecret(process.env.STELLAR_SECRET_KEY!);
const horizon = new Horizon.Server(HORIZON_URL);

const account = await horizon.loadAccount(keypair.publicKey());

const tx = new TransactionBuilder(account, {
  fee: "100",
  networkPassphrase: NETWORK_PASSPHRASE,
})
  .addOperation(Operation.changeTrust({ asset: USDC }))
  .setTimeout(30)
  .build();

tx.sign(keypair);
const result = await horizon.submitTransaction(tx);
console.log("Trustline added! Hash:", result.hash);
```

### Verify Trustline

```bash
# Testnet
curl -s "https://horizon-testnet.stellar.org/accounts/$STELLAR_PUBLIC_KEY" | jq '.balances'

# Mainnet
curl -s "https://horizon.stellar.org/accounts/$STELLAR_PUBLIC_KEY" | jq '.balances'
```

You should see an entry with `"asset_code": "USDC"` and `"asset_issuer": "GA5ZSEJYB37..."`.

## Step 4: Get USDC

### Testnet

Use the Stellar Laboratory to issue testnet USDC, or use a known testnet USDC faucet.

**Stellar Laboratory**: [laboratory.stellar.org](https://laboratory.stellar.org)

### Mainnet

Get real USDC into your Stellar wallet:

| Method | How |
|--------|-----|
| **Circle** | Mint directly via Circle APIs |
| **Exchange** | Buy USDC on Coinbase/Binance → Withdraw to Stellar (select Stellar network) |
| **DEX** | Swap XLM → USDC on Stellar DEX (via StellarTerm, StellarX, or Lobstr) |
| **Bridge** | Bridge USDC from Ethereum/Base via Stellar anchor services |
| **P2P** | Receive from another Stellar wallet |

> **Important**: When withdrawing USDC from an exchange, make sure to select **Stellar** as the network, not Ethereum or Solana.

## Step 5: Verify Setup

Run this check to confirm your wallet is ready for x402:

```typescript
import { Keypair, Horizon } from "@stellar/stellar-sdk";

const HORIZON_URL = "https://horizon-testnet.stellar.org"; // or mainnet
const horizon = new Horizon.Server(HORIZON_URL);
const publicKey = process.env.STELLAR_PUBLIC_KEY!;

const account = await horizon.loadAccount(publicKey);

// Check XLM balance
const xlmBalance = account.balances.find(
  (b: any) => b.asset_type === "native"
);
console.log("XLM:", xlmBalance?.balance ?? "0");

// Check USDC trustline + balance
const usdcBalance = account.balances.find(
  (b: any) => b.asset_code === "USDC"
);

if (!usdcBalance) {
  console.error("❌ No USDC trustline found. Run Step 3.");
} else {
  console.log("✅ USDC Balance:", usdcBalance.balance);
}

// Ready check
if (usdcBalance && parseFloat(usdcBalance.balance) > 0) {
  console.log("\n🚀 Wallet is ready for x402 payments!");
} else {
  console.log("\n⚠️  Fund your wallet with USDC (Step 4)");
}
```

## After Setup

Once your wallet has USDC, you're ready to use x402. The facilitator handles everything else:

| What | Who pays |
|------|----------|
| USDC transfer (the payment itself) | **Your wallet** (USDC deducted) |
| Stellar transaction fee | **Facilitator** (fee-free for you) |
| Soroban resource fees | **Facilitator** (fee-free for you) |

Your agent only needs:
1. `STELLAR_SECRET_KEY` — to sign auth entries
2. USDC balance — to pay for API calls
3. No XLM management — ever again after trustline setup

→ Continue to [x402 Buyer Quick Start](../SKILL.md#quick-start-buyer-on-stellar-agent-client)

## Complete One-Liner (Testnet)

For quick testnet setup in a single script:

```bash
npx ts-node -e "
const { Keypair } = require('@stellar/stellar-sdk');
const kp = Keypair.random();
console.log('PUBLIC:', kp.publicKey());
console.log('SECRET:', kp.secret());
console.log('Fund: https://friendbot.stellar.org?addr=' + kp.publicKey());
"
```

Then add trustline and get testnet USDC via Stellar Laboratory.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `"Account not found"` | Fund with XLM first (Step 2) — account must exist on-chain |
| `"op_no_trust"` | Add USDC trustline (Step 3) before receiving USDC |
| `"Insufficient balance"` | Need more XLM for reserve (≥ 2 XLM) or more USDC for payment |
| `"tx_bad_auth"` | Check secret key matches public key |
| USDC shows 0 after exchange withdrawal | Confirm you selected **Stellar** network, not Ethereum |
| Trustline tx fails | Ensure account has ≥ 0.5 XLM available above base reserve |
