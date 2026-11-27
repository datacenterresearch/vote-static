import { describe, expect, it } from "vitest";
import {
  computeHmacSignature,
  verifyWebhookRequest,
} from "@/lib/webhook-security";

describe("Webhook HMAC-SHA256 Security", () => {
  const secret = "super-secret-webhook-key-123";
  const nowMs = 1_795_000_000_000;
  const nowSec = String(Math.floor(nowMs / 1000));
  const rawBody = JSON.stringify({ amount: 5123, rrn: "RRN-999" });

  it("accepts valid signature and fresh timestamp", () => {
    const sig = computeHmacSignature(secret, nowSec, rawBody);
    const res = verifyWebhookRequest({
      secret,
      signature: sig,
      timestamp: nowSec,
      rawBody,
      nowMs,
    });
    expect(res.valid).toBe(true);
  });

  it("accepts sha256= prefixed signature", () => {
    const sig = `sha256=${computeHmacSignature(secret, nowSec, rawBody)}`;
    const res = verifyWebhookRequest({
      secret,
      signature: sig,
      timestamp: nowSec,
      rawBody,
      nowMs,
    });
    expect(res.valid).toBe(true);
  });

  it("rejects tampered payload", () => {
    const sig = computeHmacSignature(secret, nowSec, rawBody);
    const res = verifyWebhookRequest({
      secret,
      signature: sig,
      timestamp: nowSec,
      rawBody: JSON.stringify({ amount: 9999, rrn: "RRN-999" }),
      nowMs,
    });
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("Signature mismatch");
  });

  it("rejects timestamps older than 60 seconds", () => {
    const expiredTs = String(Math.floor(nowMs / 1000) - 61);
    const sig = computeHmacSignature(secret, expiredTs, rawBody);
    const res = verifyWebhookRequest({
      secret,
      signature: sig,
      timestamp: expiredTs,
      rawBody,
      nowMs,
    });
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("tolerance");
  });

  it("rejects timestamps more than 60 seconds in the future", () => {
    const futureTs = String(Math.floor(nowMs / 1000) + 65);
    const sig = computeHmacSignature(secret, futureTs, rawBody);
    const res = verifyWebhookRequest({
      secret,
      signature: sig,
      timestamp: futureTs,
      rawBody,
      nowMs,
    });
    expect(res.valid).toBe(false);
  });
});
