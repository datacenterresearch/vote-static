interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

/**
 * Simple in-memory sliding-window rate limiter.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  nowMs: number = Date.now()
): { allowed: boolean; retryAfterSeconds: number } {
  const cutoff = nowMs - windowMs;
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);

  if (bucket.timestamps.length >= maxRequests) {
    const oldest = bucket.timestamps[0] ?? nowMs;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + windowMs - nowMs) / 1000)
    );
    buckets.set(key, bucket);
    return { allowed: false, retryAfterSeconds };
  }

  bucket.timestamps.push(nowMs);
  buckets.set(key, bucket);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip")?.trim();
  return realIp || "unknown";
}
