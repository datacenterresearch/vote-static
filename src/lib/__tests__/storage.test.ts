import { describe, expect, it } from "vitest";
import {
  detectImageFormat,
  normalizeRelativeUploadPath,
} from "@/lib/storage";

describe("Storage image detection and path validation", () => {
  it("detects PNG, JPEG, and WEBP via magic bytes even without MIME type", () => {
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
    ]);
    expect(detectImageFormat(pngBytes, "", "photo.bin")).toEqual({
      ext: "png",
      mimeType: "image/png",
    });

    const jpgBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(
      detectImageFormat(jpgBytes, "application/octet-stream", null)
    ).toEqual({
      ext: "jpg",
      mimeType: "image/jpeg",
    });

    const webpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(detectImageFormat(webpBytes, "", null)).toEqual({
      ext: "webp",
      mimeType: "image/webp",
    });
  });

  it("rejects non-image payloads even if MIME type claims image/png", () => {
    const htmlBytes = new TextEncoder().encode("<html>not an image</html>");
    expect(detectImageFormat(htmlBytes, "image/png", "fake.png")).toBeNull();
  });

  it("normalizes valid upload paths across allowed subdirs", () => {
    expect(normalizeRelativeUploadPath(["qris", "abc.png"])).toBe(
      "qris/abc.png"
    );
    expect(normalizeRelativeUploadPath(["proofs", "123.jpg"])).toBe(
      "proofs/123.jpg"
    );
    expect(normalizeRelativeUploadPath(["candidates", "pic.webp"])).toBe(
      "candidates/pic.webp"
    );
  });

  it("rejects path traversal and unknown upload subdirectories", () => {
    expect(normalizeRelativeUploadPath(["qris", "../secret.txt"])).toBeNull();
    expect(normalizeRelativeUploadPath(["..", "etc", "passwd"])).toBeNull();
    expect(normalizeRelativeUploadPath(["unknown", "a.png"])).toBeNull();
    expect(normalizeRelativeUploadPath(["qris"])).toBeNull();
    expect(normalizeRelativeUploadPath(["qris", "sub/file.png"])).toBeNull();
    expect(normalizeRelativeUploadPath(["qris", ""])).toBeNull();
  });
});
