import { describe, expect, it } from "vitest";
import {
  buildDynamicQrisPayload,
  computeCrc16Ccitt,
  parseEmvTlv,
  serializeEmvTlv,
  validateQrisPayload,
} from "@/lib/qris";

function makeValidStaticQris(): string {
  const bodyWithoutCrc = serializeEmvTlv([
    { tag: "00", value: "01" },
    { tag: "01", value: "11" },
    {
      tag: "26",
      value: "0014ID.CO.QRIS.WWW0118936009150000000000021000000000010303UMI",
    },
    { tag: "52", value: "5499" },
    { tag: "53", value: "360" },
    { tag: "58", value: "ID" },
    { tag: "59", value: "PANITIA VOTE" },
    { tag: "60", value: "JAKARTA" },
  ]);
  const withPrefix = `${bodyWithoutCrc}6304`;
  return `${withPrefix}${computeCrc16Ccitt(withPrefix)}`;
}

describe("QRIS EMVCo TLV & CRC16-CCITT", () => {
  it("computes standard CRC16-CCITT checksum", () => {
    expect(computeCrc16Ccitt("123456789")).toBe("29B1");
  });

  it("validates a well-formed static QRIS payload", () => {
    const raw = makeValidStaticQris();
    const res = validateQrisPayload(raw);
    expect(res.valid).toBe(true);
    expect(res.merchantName).toBe("PANITIA VOTE");
    expect(res.merchantCity).toBe("JAKARTA");
  });

  it("rejects payload with tampered CRC", () => {
    const raw = makeValidStaticQris();
    const tampered = `${raw.slice(0, -4)}FFFF`;
    const res = validateQrisPayload(tampered);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("CRC mismatch");
  });

  it("injects Tag 54 amount, switches Tag 01 to 12, and recalculates valid CRC Tag 63", () => {
    const raw = makeValidStaticQris();
    const dynamic = buildDynamicQrisPayload(raw, 15123);

    const validation = validateQrisPayload(dynamic);
    expect(validation.valid).toBe(true);

    const fields = parseEmvTlv(dynamic);
    expect(fields.find((f) => f.tag === "01")?.value).toBe("12");
    expect(fields.find((f) => f.tag === "54")?.value).toBe("15123");
    expect(fields[fields.length - 1]?.tag).toBe("63");
  });

  it("replaces an existing Tag 54 cleanly if present", () => {
    const raw = buildDynamicQrisPayload(makeValidStaticQris(), 5001);
    const updated = buildDynamicQrisPayload(raw, 12345);
    const fields = parseEmvTlv(updated);
    const tag54s = fields.filter((f) => f.tag === "54");
    expect(tag54s).toHaveLength(1);
    expect(tag54s[0]?.value).toBe("12345");
    expect(validateQrisPayload(updated).valid).toBe(true);
  });
});
