import QRCode from "qrcode";

export interface TlvField {
  tag: string;
  value: string;
}

export interface QrisValidationResult {
  valid: boolean;
  reason?: string;
  merchantName?: string;
  merchantCity?: string;
}

/**
 * Computes EMVCo CRC16-CCITT (polynomial 0x1021, initial value 0xFFFF)
 * and returns a 4-character uppercase hexadecimal string.
 */
export function computeCrc16Ccitt(input: string): string {
  const bytes = Buffer.from(input, "utf8");
  let crc = 0xffff;

  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Parses an EMVCo QRIS TLV string into ordered tag-value fields.
 */
export function parseEmvTlv(payload: string): TlvField[] {
  const trimmed = payload.trim();
  if (!trimmed) {
    throw new Error("QRIS payload is empty");
  }

  const fields: TlvField[] = [];
  let cursor = 0;

  while (cursor < trimmed.length) {
    if (cursor + 4 > trimmed.length) {
      throw new Error(`Malformed TLV header at offset ${cursor}`);
    }

    const tag = trimmed.slice(cursor, cursor + 2);
    const lenStr = trimmed.slice(cursor + 2, cursor + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lenStr)) {
      throw new Error(`Invalid TLV tag/length at offset ${cursor}`);
    }

    const length = Number.parseInt(lenStr, 10);
    const valueStart = cursor + 4;
    const valueEnd = valueStart + length;
    if (valueEnd > trimmed.length) {
      throw new Error(`Truncated TLV value for tag ${tag} at offset ${cursor}`);
    }

    fields.push({
      tag,
      value: trimmed.slice(valueStart, valueEnd),
    });

    cursor = valueEnd;
  }

  return fields;
}

/**
 * Serializes TLV fields back into an EMVCo string.
 */
export function serializeEmvTlv(fields: TlvField[]): string {
  return fields
    .map(({ tag, value }) => {
      if (value.length > 99) {
        throw new Error(`TLV value too long for tag ${tag}`);
      }
      return `${tag}${String(value.length).padStart(2, "0")}${value}`;
    })
    .join("");
}

/**
 * Validates an EMVCo QRIS payload including structure and Tag 63 CRC16-CCITT.
 */
export function validateQrisPayload(payload: string): QrisValidationResult {
  const trimmed = payload.trim();
  let fields: TlvField[];
  try {
    fields = parseEmvTlv(trimmed);
  } catch (err) {
    return {
      valid: false,
      reason: err instanceof Error ? err.message : "Invalid TLV format",
    };
  }

  const lastField = fields[fields.length - 1];
  if (!lastField || lastField.tag !== "63" || lastField.value.length !== 4) {
    return {
      valid: false,
      reason: "Missing or invalid CRC Tag 63 at end of QRIS payload",
    };
  }

  const payloadWithoutCrcValue = trimmed.slice(0, -4);
  const expectedCrc = computeCrc16Ccitt(payloadWithoutCrcValue);
  if (lastField.value.toUpperCase() !== expectedCrc) {
    return {
      valid: false,
      reason: `CRC mismatch (expected ${expectedCrc}, got ${lastField.value})`,
    };
  }

  const hasFormatIndicator = fields.some((f) => f.tag === "00");
  if (!hasFormatIndicator) {
    return {
      valid: false,
      reason: "Missing Payload Format Indicator (Tag 00)",
    };
  }

  const merchantName = fields.find((f) => f.tag === "59")?.value;
  const merchantCity = fields.find((f) => f.tag === "60")?.value;

  return {
    valid: true,
    merchantName,
    merchantCity,
  };
}

/**
 * Injects Tag 54 (Transaction Amount) into a static QRIS EMVCo payload
 * and recalculates Tag 63 (CRC16-CCITT).
 */
export function buildDynamicQrisPayload(
  rawPayload: string,
  amount: number
): string {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Amount must be a positive integer");
  }

  const validation = validateQrisPayload(rawPayload);
  if (!validation.valid) {
    throw new Error(validation.reason ?? "Invalid QRIS payload");
  }

  const fields = parseEmvTlv(rawPayload);
  const amountValue = String(amount);

  const filtered: TlvField[] = [];
  let insertedAmount = false;

  for (const field of fields) {
    if (field.tag === "63" || field.tag === "54") {
      continue;
    }

    if (!insertedAmount && Number.parseInt(field.tag, 10) > 54) {
      filtered.push({ tag: "54", value: amountValue });
      insertedAmount = true;
    }

    if (field.tag === "01" && field.value === "11") {
      filtered.push({ tag: "01", value: "12" });
    } else {
      filtered.push(field);
    }
  }

  if (!insertedAmount) {
    filtered.push({ tag: "54", value: amountValue });
  }

  const bodyWithCrcPrefix = `${serializeEmvTlv(filtered)}6304`;
  const crc = computeCrc16Ccitt(bodyWithCrcPrefix);
  return `${bodyWithCrcPrefix}${crc}`;
}

/**
 * Renders a QRIS payload string as a PNG data URL for browser display.
 */
export async function generateQrisDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
  });
}
