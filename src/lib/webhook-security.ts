import crypto from "node:crypto";

export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 60;

export interface WebhookVerifyInput {
  secret: string;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  rawBody: string;
  nowMs?: number;
  toleranceSeconds?: number;
}

export interface WebhookVerifyResult {
  valid: boolean;
  reason?: string;
}

/**
 * Computes HMAC-SHA256 hex signature over `${timestamp}.${rawBody}`.
 */
export function computeHmacSignature(
  secret: string,
  timestamp: string,
  rawBody: string
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
}

/**
 * Verifies X-Signature (HMAC-SHA256) and X-Timestamp within ±60 seconds.
 */
export function verifyWebhookRequest(
  input: WebhookVerifyInput
): WebhookVerifyResult {
  const {
    secret,
    signature,
    timestamp,
    rawBody,
    nowMs = Date.now(),
    toleranceSeconds = DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  } = input;

  if (!secret) {
    return { valid: false, reason: "WEBHOOK_SECRET is not configured" };
  }

  if (!signature || !timestamp) {
    return {
      valid: false,
      reason: "Missing X-Signature or X-Timestamp header",
    };
  }

  if (!/^\d+$/.test(timestamp.trim())) {
    return { valid: false, reason: "Invalid X-Timestamp format" };
  }

  const tsSeconds = Number.parseInt(timestamp.trim(), 10);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (Math.abs(nowSeconds - tsSeconds) > toleranceSeconds) {
    return { valid: false, reason: "Timestamp outside allowed tolerance window" };
  }

  const normalizedSig = signature.trim().replace(/^sha256=/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalizedSig)) {
    return { valid: false, reason: "Malformed X-Signature hex digest" };
  }

  const expectedHex = computeHmacSignature(secret, timestamp.trim(), rawBody);
  const providedBuf = Buffer.from(normalizedSig, "hex");
  const expectedBuf = Buffer.from(expectedHex, "hex");

  if (
    providedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return { valid: false, reason: "Signature mismatch" };
  }

  return { valid: true };
}
