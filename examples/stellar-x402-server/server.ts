/**
 * Stellar x402 Server — Example
 *
 * Express API that charges $0.001 per request in USDC on Stellar.
 * Uses OZ Channels facilitator for verify/settle (fee-free for clients).
 *
 * Usage:
 *   STELLAR_PAY_TO_ADDRESS=GXXX... npm run dev
 *
 * Optional env:
 *   OZ_RELAYER_API_KEY   — API key for OZ Channels facilitator
 *   STELLAR_NETWORK      — "stellar:testnet" (default) or "stellar:pubnet"
 *   PORT                 — Server port (default: 3000)
 */

import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";

// ── Configuration ────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "3000", 10);
const STELLAR_NETWORK = process.env.STELLAR_NETWORK || "stellar:testnet";
const STELLAR_PAY_TO = process.env.STELLAR_PAY_TO_ADDRESS;

// Testnet USDC SAC contract — replace with mainnet contract for production
const STELLAR_USDC_ASSET =
  process.env.STELLAR_USDC_ASSET ||
  "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";

const FACILITATOR_URL =
  process.env.FACILITATOR_URL ||
  "https://channels.openzeppelin.com/x402/testnet";

const OZ_API_KEY = process.env.OZ_RELAYER_API_KEY;

if (!STELLAR_PAY_TO) {
  console.error("❌ STELLAR_PAY_TO_ADDRESS is required");
  console.error("   Set it to your Stellar public key (G...)");
  process.exit(1);
}

// ── x402 Types ───────────────────────────────────────────────

interface PaymentRequirements {
  scheme: "exact";
  network: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: { areFeesSponsored: boolean };
}

interface PaymentRequired {
  x402Version: 2;
  resource: { url: string; description: string; mimeType: string };
  accepts: PaymentRequirements[];
}

interface PaymentPayload {
  x402Version: 2;
  accepted: PaymentRequirements;
  payload: { transaction: string };
}

// ── Helpers ──────────────────────────────────────────────────

/** Convert USD to atomic USDC (7 decimals for Stellar) */
const toAtomic = (usd: number): string =>
  Math.round(usd * 10_000_000).toString();

/** Build 402 challenge response */
const buildChallenge = (
  req: Request,
  priceUsd: number,
  description: string
): PaymentRequired => ({
  x402Version: 2,
  resource: {
    url: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
    description,
    mimeType: "application/json",
  },
  accepts: [
    {
      scheme: "exact",
      network: STELLAR_NETWORK,
      amount: toAtomic(priceUsd),
      payTo: STELLAR_PAY_TO!,
      maxTimeoutSeconds: 300,
      asset: STELLAR_USDC_ASSET,
      extra: { areFeesSponsored: true },
    },
  ],
});

/** Parse X-PAYMENT header (Base64 JSON or raw JSON) */
const parsePaymentHeader = (header: string): PaymentPayload | null => {
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(header);
    } catch {
      parsed = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    }

    const pp = parsed as PaymentPayload;
    if (pp.x402Version !== 2 || !pp.accepted || !pp.payload?.transaction)
      return null;
    return pp;
  } catch {
    return null;
  }
};

// ── Middleware ────────────────────────────────────────────────

/**
 * x402 payment middleware for Stellar
 *
 * If no X-PAYMENT header → returns 402 challenge
 * If X-PAYMENT present → verifies + settles via facilitator → calls next()
 */
const requirePayment = (priceUsd: number, description: string) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const paymentHeader = req.header("X-PAYMENT") ?? req.header("X-Payment");

    // No payment → 402 challenge
    if (!paymentHeader) {
      res.status(402).json(buildChallenge(req, priceUsd, description));
      return;
    }

    // Parse payment
    const paymentPayload = parsePaymentHeader(paymentHeader);
    if (!paymentPayload) {
      res.status(401).json({ error: "Invalid X-PAYMENT header" });
      return;
    }

    // Build server-side requirements
    const paymentRequirements: PaymentRequirements = {
      scheme: "exact",
      network: STELLAR_NETWORK,
      amount: toAtomic(priceUsd),
      payTo: STELLAR_PAY_TO!,
      maxTimeoutSeconds: 300,
      asset: STELLAR_USDC_ASSET,
      extra: { areFeesSponsored: true },
    };

    // ── Verify via facilitator ────────────
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (OZ_API_KEY) {
      headers["x-api-key"] = OZ_API_KEY;
      headers["Authorization"] = `Bearer ${OZ_API_KEY}`;
    }

    try {
      const verifyRes = await fetch(`${FACILITATOR_URL}/verify`, {
        method: "POST",
        headers,
        body: JSON.stringify({ paymentPayload, paymentRequirements }),
      });

      const verify = (await verifyRes.json()) as {
        isValid: boolean;
        invalidReason?: string;
        payer?: string;
      };

      if (!verify.isValid) {
        res
          .status(401)
          .json({ error: verify.invalidReason || "Payment rejected" });
        return;
      }

      // ── Settle via facilitator ────────────
      const settleRes = await fetch(`${FACILITATOR_URL}/settle`, {
        method: "POST",
        headers,
        body: JSON.stringify({ paymentPayload, paymentRequirements }),
      });

      const settle = (await settleRes.json()) as {
        success: boolean;
        transaction?: string;
        network?: string;
        payer?: string;
        errorReason?: string;
      };

      if (!settle.success) {
        res
          .status(502)
          .json({ error: settle.errorReason || "Settlement failed" });
        return;
      }

      // ── Payment success ────────────────
      console.log(`💰 Payment settled: ${settle.transaction}`);

      (req as any).paymentContext = {
        payer: settle.payer,
        txHash: settle.transaction,
        network: settle.network,
      };

      next();
    } catch (error) {
      console.error("❌ Facilitator error:", error);
      res.status(503).json({ error: "Payment service unavailable" });
    }
  };
};

// ── App ──────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Public endpoint (free)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", network: STELLAR_NETWORK });
});

// Paid endpoint — $0.001 per request
app.get(
  "/weather",
  requirePayment(0.001, "Weather report — $0.001 per request"),
  (_req: Request, res: Response) => {
    res.json({
      city: "London",
      temperature: 22,
      conditions: "Partly cloudy",
      humidity: 65,
      wind: { speed: 12, direction: "NW" },
      timestamp: Date.now(),
      payment: (_req as any).paymentContext,
    });
  }
);

// Paid endpoint — $0.01 per request
app.get(
  "/premium-data",
  requirePayment(0.01, "Premium analytics — $0.01 per request"),
  (_req: Request, res: Response) => {
    res.json({
      report: "Premium analytics data",
      metrics: {
        users: 1847,
        revenue: 42350,
        growth: 0.12,
      },
      timestamp: Date.now(),
      payment: (_req as any).paymentContext,
    });
  }
);

// ── Start ────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log("");
  console.log("🌟 x402 Stellar Server");
  console.log("═══════════════════════════════════════");
  console.log(`   Network:      ${STELLAR_NETWORK}`);
  console.log(`   Pay to:       ${STELLAR_PAY_TO}`);
  console.log(`   Facilitator:  ${FACILITATOR_URL}`);
  console.log(`   Port:         ${PORT}`);
  console.log("");
  console.log("   Endpoints:");
  console.log("   GET /health        — free");
  console.log("   GET /weather       — $0.001 USDC");
  console.log("   GET /premium-data  — $0.01 USDC");
  console.log("");
  console.log("   Try: curl http://localhost:3000/weather");
  console.log("═══════════════════════════════════════");
});
