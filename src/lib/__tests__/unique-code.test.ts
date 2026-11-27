import { describe, expect, it } from "vitest";
import {
  computeOrderWindow,
  MAX_VOTE_QTY,
  MIN_PRICE_PER_VOTE,
} from "@/lib/unique-code";

describe("Order Window & Voting Limits", () => {
  const baseEvent = {
    isActive: true,
    startsAt: new Date("2026-11-21T10:00:00Z"),
    endsAt: new Date("2026-11-21T12:20:00Z"),
    orderCutoffMinutes: 15,
  };

  it("allows active event checkout and caps expiresAt at event.endsAt", () => {
    // 20 minutes before end -> allowed (before 15m cutoff), expiresAt = 12:15
    const okRes = computeOrderWindow(
      new Date("2026-11-21T12:00:00Z"),
      baseEvent
    );
    expect(okRes.ok).toBe(true);
    if (okRes.ok) {
      expect(okRes.expiresAt.toISOString()).toBe("2026-11-21T12:15:00.000Z");
    }

    // 25 minutes before end with 0 cutoff -> expiresAt capped at endsAt (12:20)
    const cappedRes = computeOrderWindow(new Date("2026-11-21T12:10:00Z"), {
      ...baseEvent,
      orderCutoffMinutes: 0,
    });
    expect(cappedRes.ok).toBe(true);
    if (cappedRes.ok) {
      expect(cappedRes.expiresAt.toISOString()).toBe("2026-11-21T12:20:00.000Z");
    }
  });

  it("rejects checkout inside cutoff window", () => {
    const lateRes = computeOrderWindow(
      new Date("2026-11-21T12:10:00Z"),
      baseEvent
    );
    expect(lateRes.ok).toBe(false);
    if (!lateRes.ok) {
      expect(lateRes.code).toBe("ORDER_CUTOFF_REACHED");
    }
  });

  it("rejects inactive, not-started, and ended events", () => {
    const inactive = computeOrderWindow(new Date("2026-11-21T11:00:00Z"), {
      ...baseEvent,
      isActive: false,
    });
    expect(inactive).toMatchObject({ ok: false, code: "EVENT_INACTIVE" });

    const notStarted = computeOrderWindow(
      new Date("2026-11-21T09:59:00Z"),
      baseEvent
    );
    expect(notStarted).toMatchObject({ ok: false, code: "EVENT_NOT_STARTED" });

    const ended = computeOrderWindow(
      new Date("2026-11-21T12:20:00Z"),
      baseEvent
    );
    expect(ended).toMatchObject({ ok: false, code: "EVENT_ENDED" });
  });

  it("sets expected vote limits without unique-code constraints", () => {
    expect(MIN_PRICE_PER_VOTE).toBe(1);
    expect(MAX_VOTE_QTY).toBe(10_000);
  });
});
