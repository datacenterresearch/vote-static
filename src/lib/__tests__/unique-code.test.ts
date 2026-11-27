import { describe, expect, it } from "vitest";
import {
  computeOrderWindow,
  MAX_UNIQUE_CODE,
  MIN_UNIQUE_CODE,
  selectUniqueCodeLru,
  type CodeHistoryEntry,
} from "@/lib/unique-code";

describe("Unique Code LRU & Quarantine", () => {
  const now = new Date("2026-11-21T12:00:00Z");

  it("allocates code 1 first when history is empty", () => {
    const code = selectUniqueCodeLru([], now, 2000);
    expect(code).toBe(1);
  });

  it("skips active PENDING codes", () => {
    const history: CodeHistoryEntry[] = [
      {
        uniqueCode: 1,
        status: "PENDING",
        createdAt: new Date("2026-11-21T11:55:00Z"),
        expiresAt: new Date("2026-11-21T12:10:00Z"),
        totalAmount: 2001,
      },
      {
        uniqueCode: 2,
        status: "PENDING",
        createdAt: new Date("2026-11-21T11:56:00Z"),
        expiresAt: new Date("2026-11-21T12:11:00Z"),
        totalAmount: 2002,
      },
    ];
    expect(selectUniqueCodeLru(history, now, 2000)).toBe(3);
  });

  it("quarantines EXPIRED codes for 45 minutes after expiresAt", () => {
    const history: CodeHistoryEntry[] = [
      // Expired 10 minutes ago -> still inside 45-minute quarantine
      {
        uniqueCode: 1,
        status: "EXPIRED",
        createdAt: new Date("2026-11-21T11:35:00Z"),
        expiresAt: new Date("2026-11-21T11:50:00Z"),
      },
      // Expired 46 minutes ago -> quarantine ended, eligible again
      {
        uniqueCode: 2,
        status: "EXPIRED",
        createdAt: new Date("2026-11-21T10:59:00Z"),
        expiresAt: new Date("2026-11-21T11:14:00Z"),
      },
    ];
    // Code 3 has never been used, so unused comes first
    expect(selectUniqueCodeLru(history, now, 2000)).toBe(3);

    // Fill codes 3..999 as PAID recently so LRU must pick between eligible codes
    const fullHistory: CodeHistoryEntry[] = [...history];
    for (let c = 3; c <= MAX_UNIQUE_CODE; c++) {
      fullHistory.push({
        uniqueCode: c,
        status: "PAID",
        createdAt: new Date("2026-11-21T11:30:00Z"),
        expiresAt: new Date("2026-11-21T11:45:00Z"),
      });
    }
    // Code 1 is quarantined, code 2 was used at 10:59 (oldest) -> must pick 2
    expect(selectUniqueCodeLru(fullHistory, now, 2000)).toBe(2);
  });

  it("picks least recently used code once all 999 codes have been used", () => {
    const history: CodeHistoryEntry[] = [];
    for (let c = MIN_UNIQUE_CODE; c <= MAX_UNIQUE_CODE; c++) {
      history.push({
        uniqueCode: c,
        status: "PAID",
        createdAt: new Date(
          new Date("2026-11-21T10:00:00Z").getTime() + c * 1000
        ),
        expiresAt: new Date(
          new Date("2026-11-21T10:15:00Z").getTime() + c * 1000
        ),
      });
    }
    // Code 42 made oldest by shifting its createdAt earlier
    history[41] = {
      uniqueCode: 42,
      status: "PAID",
      createdAt: new Date("2026-11-21T08:00:00Z"),
      expiresAt: new Date("2026-11-21T08:15:00Z"),
    };
    expect(selectUniqueCodeLru(history, now, 2000)).toBe(42);
  });

  it("returns null when all 999 codes are active or quarantined", () => {
    const history: CodeHistoryEntry[] = [];
    for (let c = MIN_UNIQUE_CODE; c <= MAX_UNIQUE_CODE; c++) {
      history.push({
        uniqueCode: c,
        status: "PENDING",
        createdAt: new Date("2026-11-21T11:55:00Z"),
        expiresAt: new Date("2026-11-21T12:10:00Z"),
        totalAmount: 2000 + c,
      });
    }
    expect(selectUniqueCodeLru(history, now, 2000)).toBeNull();
  });

  it("enforces orderCutoffMinutes and caps expiresAt at event.endsAt", () => {
    const event = {
      isActive: true,
      startsAt: new Date("2026-11-21T10:00:00Z"),
      endsAt: new Date("2026-11-21T12:20:00Z"),
      orderCutoffMinutes: 15,
    };

    // 20 minutes before end -> allowed (before 15m cutoff), expiresAt = 12:15
    const okRes = computeOrderWindow(new Date("2026-11-21T12:00:00Z"), event);
    expect(okRes.ok).toBe(true);
    if (okRes.ok) {
      expect(okRes.expiresAt.toISOString()).toBe("2026-11-21T12:15:00.000Z");
    }

    // 10 minutes before end -> rejected by 15-min cutoff
    const lateRes = computeOrderWindow(
      new Date("2026-11-21T12:10:00Z"),
      event
    );
    expect(lateRes.ok).toBe(false);
    if (!lateRes.ok) {
      expect(lateRes.code).toBe("ORDER_CUTOFF_REACHED");
    }
  });
});
