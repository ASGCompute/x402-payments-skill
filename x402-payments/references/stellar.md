# Stellar Reference — x402 Payments

Complete reference for building x402 payment infrastructure on Stellar using Soroban smart contracts.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        x402 on Stellar                          │
│                                                                 │
│  Client (Agent)         Server (API)          Facilitator       │
│  ┌─────────────┐       ┌──────────────┐      ┌──────────────┐  │
│  │ Build Soroban│       │ x402         │      │ OZ Channels  │  │
│  │ SAC USDC    │──402──│ Middleware   │       │ or custom    │  │
│  │ transfer    │       │              │       │              │  │
│  │ Sign auth   │──XDR──│ Parse header │──────│ POST /verify │  │
│  │ entries     │       │              │       │ POST /settle │  │
│  │             │◀─200──│ Return data  │◀─────│ Submit to    │  │
│  │ Zero XLM    │       │              │       │ Stellar      │  │
│  └─────────────┘       └──────────────┘      └──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Soroban SAC USDC

Stellar USDC uses the **Stellar Asset Contract (SAC)** — a Soroban wrapper for classic Stellar assets. This enables programmable USDC transfers via smart contract invocations.

### Contract Addresses

| Network | USDC Contract ID |
|---------|-----------------|
| **Mainnet** (`stellar:pubnet`) | `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75` |
| **Testnet** (`stellar:testnet`) | Deploy via Stellar Laboratory or use testnet SAC |

### Token Interface (SEP-41)

USDC on Soroban implements the SEP-41 standard:

```
transfer(from: Address, to: Address, amount: i128) → void
balance(id: Address) → i128
allowance(from: Address, spender: Address) → i128
approve(from: Address, spender: Address, amount: i128, expiration_ledger: u32) → void
```

For x402, only `transfer` and `balance` are used.

## Transaction Building

### AssembledTransaction Approach (Recommended)

The canonical approach uses `AssembledTransaction.build()` from `@stellar/stellar-sdk`:

```typescript
import {
  Keypair, Networks, TransactionBuilder, nativeToScVal,
  Address, Contract, rpc as StellarRpc, contract,
} from "@stellar/stellar-sdk";

const RPC_URL = "https://soroban-testnet.stellar.org"; // testnet
// const RPC_URL = "https://mainnet.sorobanrpc.com";   // mainnet

const rpcServer = new StellarRpc.Server(RPC_URL);

// Build + simulate in Recording Mode
const tx = await contract.AssembledTransaction.build({
  contractId: USDC_CONTRACT_ID,
  method: "transfer",
  args: [
    nativeToScVal(senderPublicKey, { type: "address" }),   // from
    nativeToScVal(recipientAddress, { type: "address" }),   // to (payTo)
    nativeToScVal(BigInt(amountAtomic), { type: "i128" }), // amount
  ],
  networkPassphrase: Networks.TESTNET, // or Networks.PUBLIC
  rpcUrl: RPC_URL,
  parseResultXdr: (result: any) => result,
});
```

### Simulation Validation

After building, check the simulation result:

```typescript
if (!tx.simulation || StellarRpc.Api.isSimulationError(tx.simulation)) {
  const errMsg = tx.simulation
    ? (tx.simulation as StellarRpc.Api.SimulateTransactionErrorResponse).error
    : "No simulation result";
  throw new Error(`Transaction simulation failed: ${errMsg}`);
}
```

## Auth Entry Signing

Unlike EVM (EIP-3009) or Solana (full transaction signing), Stellar uses **auth entry signing**. This is lighter — you only sign the authorization for the specific contract invocation, not the entire transaction envelope.

### Signing Flow

```typescript
// 1. Check who needs to sign
const missingSigners = tx.needsNonInvokerSigningBy();
// Should include your publicKey

// 2. Create signer
const signer = contract.basicNodeSigner(keypair, networkPassphrase);

// 3. Get latest ledger for expiration
const latestLedger = (tx.simulation as StellarRpc.Api.SimulateTransactionSuccessResponse).latestLedger;
const expiration = latestLedger + 12; // ~1 minute (12 ledgers × 5s)

// 4. Sign auth entries
await tx.signAuthEntries({
  address: publicKey,
  signAuthEntry: signer.signAuthEntry,
  expiration,
});

// 5. Re-simulate in Enforcing Mode to validate signatures
await tx.simulate();

// 6. Check no more signatures needed
const remaining = tx.needsNonInvokerSigningBy();
if (remaining.length > 0) {
  throw new Error(`Missing signatures from: ${remaining.join(", ")}`);
}
```

### Auth Entry Expiration

- **Offset**: 12 ledgers (~1 minute at ~5s per ledger)
- **Keep it small**: facilitator rejects "too far" expirations
- **Too small**: auth entry expires before facilitator can process
- **Recommended**: 12 ledgers for testnet, 12 for mainnet

### Freighter Wallet (Browser)

For browser-based signing (e.g., Freighter extension):

```typescript
// WalletAdapter interface
interface WalletAdapter {
  publicKey: string;
  signTransaction(xdr: string, networkPassphrase: string): Promise<string>;
}

// With wallet adapter:
const assembled = StellarRpc.assembleTransaction(tx, sim).build();
const signedXDR = await walletAdapter.signTransaction(assembled.toXDR(), Networks.PUBLIC);
```

> **Note**: Freighter must support `signAuthEntry` (SEP-43). Use the browser extension, not mobile.

## Building the X-PAYMENT Header

The payment payload is Base64-encoded JSON:

```typescript
interface PaymentPayload {
  x402Version: 2;
  accepted: {
    scheme: "exact";
    network: string;       // "stellar:pubnet" or "stellar:testnet"
    amount: string;        // atomic units (7 decimals)
    payTo: string;         // G... address
    maxTimeoutSeconds: number;
    asset: string;         // Soroban contract ID
    extra: { areFeesSponsored: boolean };
  };
  payload: {
    transaction: string;   // base64 Stellar transaction XDR
  };
}

// Build header value
const headerValue = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

// Send with request
fetch(url, { headers: { "X-PAYMENT": headerValue } });
```

## Balance Checking

Check USDC balance before attempting payment:

```typescript
const checkBalance = async (
  rpcServer: StellarRpc.Server,
  publicKey: string,
  usdcContractId: string,
  requiredAtomic: bigint
): Promise<void> => {
  const c = new Contract(usdcContractId);
  const account = await rpcServer.getAccount(publicKey);

  const tx = new TransactionBuilder(account, {
    fee: "50000",
    networkPassphrase: Networks.PUBLIC,
  })
    .addOperation(c.call("balance", new Address(publicKey).toScVal()))
    .setTimeout(30)
    .build();

  const sim = await rpcServer.simulateTransaction(tx);
  if (!StellarRpc.Api.isSimulationSuccess(sim)) {
    throw new Error("Balance check failed");
  }

  // Parse i128 return value
  const retVal = (sim as any).result?.retval;
  let balance = 0n;
  if (retVal) {
    const val = retVal.value();
    if (val && typeof val === "object" && typeof val.lo === "function") {
      const lo = BigInt(val.lo()?.value?.() ?? "0");
      const hi = BigInt(val.hi()?.value?.() ?? "0");
      balance = (hi << 64n) + lo;
    }
  }

  if (balance < requiredAtomic) {
    throw new Error(`Insufficient USDC: have ${balance}, need ${requiredAtomic}`);
  }
};
```

## Server-Side: 402 Challenge Response

When a request comes in without payment, return:

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://api.example.com/weather",
    "description": "Weather report",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "stellar:testnet",
      "amount": "10000",
      "payTo": "GXXX...your_address",
      "maxTimeoutSeconds": 300,
      "asset": "CXXX...usdc_contract",
      "extra": { "areFeesSponsored": true }
    }
  ]
}
```

### Amount Format

- **Stellar USDC**: 7 decimal places
- `$0.001` = `10000` atomic units (0.001 × 10^7)
- `$1.00` = `10000000` atomic units
- `$10.00` = `100000000` atomic units

## Network Configuration (CAIP-2)

| Network | CAIP-2 ID | Passphrase |
|---------|-----------|------------|
| Mainnet | `stellar:pubnet` | `Networks.PUBLIC` |
| Testnet | `stellar:testnet` | `Networks.TESTNET` |

## Settlement Timeline

| Step | Duration |
|------|----------|
| Auth entry signing | ~100ms |
| Facilitator verify | ~500ms |
| Facilitator settle (submit tx) | ~5s (1 ledger) |
| Confirmation | ~5s (next ledger) |
| **Total** | **~10-15s** |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "auth entry expired" | Increase ledger offset (default 12) |
| "wallet doesn't support signAuthEntry" | Use Freighter browser extension (not mobile) |
| "unsupported network" | Use CAIP-2 format: `stellar:pubnet` or `stellar:testnet` |
| "simulation failed" | Check USDC balance, contract ID, and RPC URL |
| Need XLM? | No — facilitator covers all fees |
| "facilitator 401" | Check API key (OZ_RELAYER_API_KEY) |
| i128 parsing error | Use the hi/lo pattern shown in balance check |
| "too far expiration" | Reduce AUTH_ENTRY_LEDGER_OFFSET to 12 |
