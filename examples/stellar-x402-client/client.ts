/**
 * Stellar x402 Client — Agent Payment Example
 *
 * Calls a paid x402 endpoint, handles the 402 challenge,
 * builds a Soroban USDC transfer, signs auth entries, and pays.
 *
 * Usage:
 *   STELLAR_SECRET_KEY=SXXX... \
 *   API_URL=http://localhost:3000/weather \
 *   npm start
 *
 * Requirements:
 *   - Stellar account with USDC balance
 *   - @stellar/stellar-sdk
 */

import "dotenv/config";
import {
  Keypair,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  Address,
  Contract,
  rpc as StellarRpc,
  contract,
} from "@stellar/stellar-sdk";

// ── Configuration ────────────────────────────────────────────

const STELLAR_SECRET_KEY = process.env.STELLAR_SECRET_KEY;
const API_URL = process.env.API_URL || "http://localhost:3000/weather";
const NETWORK = process.env.STELLAR_NETWORK || "stellar:testnet";

const RPC_URLS: Record<string, string> = {
  "stellar:testnet": "https://soroban-testnet.stellar.org",
  "stellar:pubnet": "https://mainnet.sorobanrpc.com",
};

const NETWORK_PASSPHRASES: Record<string, string> = {
  "stellar:testnet": Networks.TESTNET,
  "stellar:pubnet": Networks.PUBLIC,
};

if (!STELLAR_SECRET_KEY) {
  console.error("❌ STELLAR_SECRET_KEY is required");
  console.error("   Set it to your Stellar secret key (S...)");
  process.exit(1);
}

// ── Types ────────────────────────────────────────────────────

interface X402Accept {
  scheme: "exact";
  network: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: { areFeesSponsored: boolean };
}

interface X402Challenge {
  x402Version: 2;
  resource: { url: string; description: string; mimeType: string };
  accepts: X402Accept[];
}

interface X402PaymentPayload {
  x402Version: 2;
  accepted: X402Accept;
  payload: { transaction: string };
}

// ── Auth Entry Signing ───────────────────────────────────────

const AUTH_ENTRY_LEDGER_OFFSET = 12; // ~1 minute at ~5s/ledger
const DEFAULT_BASE_FEE_STROOPS = 10_000;

/**
 * Build a Soroban SAC USDC transfer with signed auth entries.
 * Returns the unsigned transaction XDR (facilitator signs at settle).
 */
async function buildPaymentTransaction(
  rpcServer: StellarRpc.Server,
  keypair: Keypair,
  accept: X402Accept
): Promise<string> {
  const publicKey = keypair.publicKey();
  const networkPassphrase = NETWORK_PASSPHRASES[accept.network] || Networks.TESTNET;
  const rpcUrl = RPC_URLS[accept.network] || RPC_URLS["stellar:testnet"];

  console.log(`   📝 Building Soroban transfer...`);
  console.log(`      From:   ${publicKey}`);
  console.log(`      To:     ${accept.payTo}`);
  console.log(`      Amount: ${accept.amount} atomic USDC`);
  console.log(`      Asset:  ${accept.asset.slice(0, 12)}...`);

  // Step 1: Build + simulate (Recording Mode)
  const tx = await contract.AssembledTransaction.build({
    contractId: accept.asset,
    method: "transfer",
    args: [
      nativeToScVal(publicKey, { type: "address" }),
      nativeToScVal(accept.payTo, { type: "address" }),
      nativeToScVal(BigInt(accept.amount), { type: "i128" }),
    ],
    networkPassphrase,
    rpcUrl,
    parseResultXdr: (result: any) => result,
  });

  // Validate simulation
  if (!tx.simulation || StellarRpc.Api.isSimulationError(tx.simulation)) {
    const errMsg = tx.simulation
      ? (tx.simulation as StellarRpc.Api.SimulateTransactionErrorResponse).error
      : "No simulation result";
    throw new Error(`Simulation failed: ${errMsg}`);
  }

  console.log(`   ✓ Simulation successful`);

  // Step 2: Sign auth entries
  const signer = contract.basicNodeSigner(keypair, networkPassphrase);
  const latestLedger = (
    tx.simulation as StellarRpc.Api.SimulateTransactionSuccessResponse
  ).latestLedger;
  const expiration = latestLedger + AUTH_ENTRY_LEDGER_OFFSET;

  await tx.signAuthEntries({
    address: publicKey,
    signAuthEntry: signer.signAuthEntry,
    expiration,
  });

  console.log(`   ✓ Auth entries signed (expires ledger ${expiration})`);

  // Step 3: Re-simulate in Enforcing Mode
  await tx.simulate();

  if (!tx.simulation || StellarRpc.Api.isSimulationError(tx.simulation)) {
    const errMsg = tx.simulation
      ? (tx.simulation as StellarRpc.Api.SimulateTransactionErrorResponse).error
      : "No enforcing simulation result";
    throw new Error(`Enforcing simulation failed: ${errMsg}`);
  }

  console.log(`   ✓ Enforcing simulation passed`);

  // Step 4: Verify all signatures collected
  const remaining = tx.needsNonInvokerSigningBy();
  if (remaining.length > 0) {
    throw new Error(`Missing signatures from: ${remaining.join(", ")}`);
  }

  // Step 5: Build final TX
  const successSim =
    tx.simulation as StellarRpc.Api.SimulateTransactionSuccessResponse;
  const finalTx = TransactionBuilder.cloneFrom(tx.built!, {
    fee: (
      DEFAULT_BASE_FEE_STROOPS + parseInt(successSim.minResourceFee, 10)
    ).toString(),
    sorobanData: tx.simulationData.transactionData,
    networkPassphrase,
  }).build();

  return finalTx.toXDR();
}

// ── Main Flow ────────────────────────────────────────────────

async function main() {
  console.log("");
  console.log("🌟 x402 Stellar Agent Client");
  console.log("════════════════════════════════════════");

  const keypair = Keypair.fromSecret(STELLAR_SECRET_KEY!);
  console.log(`   Agent:    ${keypair.publicKey()}`);
  console.log(`   Target:   ${API_URL}`);
  console.log(`   Network:  ${NETWORK}`);
  console.log("");

  // ── Step 1: Call the paid endpoint ─────────────
  console.log("1️⃣  Calling paid endpoint...");

  const response = await fetch(API_URL);

  if (response.status !== 402) {
    console.log(`   ✓ No payment required (status ${response.status})`);
    console.log("   Response:", await response.json());
    return;
  }

  // ── Step 2: Parse the 402 challenge ────────────
  const challenge: X402Challenge = await response.json();
  console.log(`   → Got 402 challenge`);
  console.log(`   Resource: ${challenge.resource.description}`);

  if (!challenge.accepts || challenge.accepts.length === 0) {
    throw new Error("No payment options in 402 challenge");
  }

  const accept = challenge.accepts[0];
  const amountUsd = parseInt(accept.amount) / 10_000_000;
  console.log(
    `   Price:    $${amountUsd} USDC on ${accept.network}`
  );
  console.log("");

  // ── Step 3: Build + sign payment ───────────────
  console.log("2️⃣  Building Soroban payment...");

  const rpcUrl = RPC_URLS[accept.network] || RPC_URLS["stellar:testnet"];
  const rpcServer = new StellarRpc.Server(rpcUrl);

  const signedXDR = await buildPaymentTransaction(rpcServer, keypair, accept);
  console.log("");

  // ── Step 4: Build X-PAYMENT header ─────────────
  console.log("3️⃣  Sending payment...");

  const paymentPayload: X402PaymentPayload = {
    x402Version: 2,
    accepted: accept,
    payload: { transaction: signedXDR },
  };

  const headerValue = Buffer.from(JSON.stringify(paymentPayload)).toString(
    "base64"
  );

  // ── Step 5: Retry with payment ─────────────────
  const paidResponse = await fetch(API_URL, {
    headers: { "X-PAYMENT": headerValue },
  });

  if (!paidResponse.ok) {
    const error = await paidResponse.json().catch(() => paidResponse.statusText);
    console.error(`   ❌ Payment failed (${paidResponse.status}):`, error);
    process.exit(1);
  }

  const data = await paidResponse.json();
  console.log(`   ✅ Payment accepted!`);
  console.log("");
  console.log("4️⃣  Response data:");
  console.log(JSON.stringify(data, null, 2));
  console.log("");
  console.log("════════════════════════════════════════");
}

main().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});
