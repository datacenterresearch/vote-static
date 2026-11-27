import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";

export type UploadSubdir = "qris" | "candidates" | "proofs";

export const ALLOWED_UPLOAD_SUBDIRS: readonly UploadSubdir[] = [
  "qris",
  "candidates",
  "proofs",
];

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export interface DetectedImageFormat {
  ext: "png" | "jpg" | "webp";
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

export function getUploadRootDir(): string {
  return path.resolve(
    process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads")
  );
}

export function getMimeTypeForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/**
 * Validates and detects PNG/JPEG/WEBP image format from file magic bytes.
 * Avoids trusting client-reported MIME types (which mobile browsers may omit or vary).
 */
export function detectImageFormat(
  bytes: Uint8Array,
  _mimeType?: string | null,
  _fileName?: string | null
): DetectedImageFormat | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { ext: "png", mimeType: "image/png" };
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { ext: "jpg", mimeType: "image/jpeg" };
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { ext: "webp", mimeType: "image/webp" };
  }

  return null;
}

export function normalizeRelativeUploadPath(segments: string[]): string | null {
  if (segments.length < 2) return null;
  if (!ALLOWED_UPLOAD_SUBDIRS.includes(segments[0] as UploadSubdir)) {
    return null;
  }

  for (const seg of segments) {
    if (
      !seg ||
      seg === "." ||
      seg === ".." ||
      seg.includes("/") ||
      seg.includes("\\") ||
      seg.includes("\0")
    ) {
      return null;
    }
  }

  return segments.join("/");
}

export function resolveSafeUploadPath(segments: string[]): string | null {
  const normalized = normalizeRelativeUploadPath(segments);
  if (!normalized) return null;

  const root = getUploadRootDir();
  const target = path.resolve(root, ...segments);
  if (!target.startsWith(root + path.sep)) {
    return null;
  }
  return target;
}

export async function saveUploadedImage(
  subdir: UploadSubdir,
  file: File
): Promise<{ relativePath: string; imageHash: string }> {
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Ukuran gambar harus antara 1 byte hingga 5 MB.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const detected = detectImageFormat(bytes, file.type, file.name);
  if (!detected) {
    throw new Error("Format gambar harus PNG, JPG, atau WEBP yang valid.");
  }

  const imageHash = crypto.createHash("sha256").update(bytes).digest("hex");
  const filename = `${crypto.randomUUID()}.${detected.ext}`;
  const relativePath = `${subdir}/${filename}`;

  await prisma.uploadedFile.create({
    data: {
      path: relativePath,
      mimeType: detected.mimeType,
      size: bytes.byteLength,
      sha256: imageHash,
      data: bytes,
    },
  });

  // Best-effort local disk mirror (never fail upload if container FS is ephemeral/read-only)
  try {
    const root = getUploadRootDir();
    const dirPath = path.join(root, subdir);
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(path.join(dirPath, filename), bytes);
  } catch (err) {
    console.warn("Local disk upload mirror skipped:", relativePath, err);
  }

  return {
    relativePath,
    imageHash,
  };
}

export async function readUploadedFile(
  segments: string[]
): Promise<{
  data: Uint8Array<ArrayBuffer>;
  mimeType: string;
  sha256: string;
} | null> {
  const relativePath = normalizeRelativeUploadPath(segments);
  if (!relativePath) return null;

  const record = await prisma.uploadedFile.findUnique({
    where: { path: relativePath },
  });

  if (record) {
    return {
      data: Uint8Array.from(record.data),
      mimeType: record.mimeType,
      sha256: record.sha256,
    };
  }

  // Fallback to disk for legacy files uploaded prior to DB storage
  const diskPath = resolveSafeUploadPath(segments);
  if (!diskPath) return null;

  try {
    const diskBuffer = await fs.readFile(diskPath);
    const bytes = Uint8Array.from(diskBuffer);
    const mimeType =
      detectImageFormat(bytes)?.mimeType ?? getMimeTypeForFile(diskPath);
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");

    // Backfill legacy file into PostgreSQL so it survives future redeploys
    prisma.uploadedFile
      .upsert({
        where: { path: relativePath },
        update: {},
        create: {
          path: relativePath,
          mimeType,
          size: bytes.byteLength,
          sha256,
          data: bytes,
        },
      })
      .catch(() => {});

    return {
      data: bytes,
      mimeType,
      sha256,
    };
  } catch {
    return null;
  }
}

export async function deleteUploadedFile(
  relativePath: string | null | undefined
): Promise<void> {
  if (!relativePath) return;

  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  const normalized = normalizeRelativeUploadPath(segments);
  if (normalized) {
    try {
      await prisma.uploadedFile.deleteMany({
        where: { path: normalized },
      });
    } catch (err) {
      console.error("Failed to delete uploaded file from DB:", normalized, err);
    }
  }

  const fullPath = resolveSafeUploadPath(segments);
  if (!fullPath) return;

  try {
    await fs.unlink(fullPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.error("Failed to delete uploaded file:", fullPath, err);
    }
  }
}
