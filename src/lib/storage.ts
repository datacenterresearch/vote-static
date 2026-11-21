import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type UploadSubdir = "qris" | "candidates" | "proofs";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export function getUploadRootDir(): string {
  return path.resolve(
    process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads")
  );
}

export function getMimeTypeForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export function resolveSafeUploadPath(segments: string[]): string | null {
  if (!segments.length) return null;

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
  const ext = ALLOWED_MIME_EXTENSIONS[file.type.toLowerCase()];
  if (!ext) {
    throw new Error("Format gambar harus PNG, JPG, atau WEBP.");
  }

  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Ukuran gambar harus antara 1 byte hingga 5 MB.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const imageHash = crypto.createHash("sha256").update(buffer).digest("hex");

  const filename = `${crypto.randomUUID()}.${ext}`;
  const root = getUploadRootDir();
  const dirPath = path.join(root, subdir);
  await fs.mkdir(dirPath, { recursive: true });

  const fullPath = path.join(dirPath, filename);
  await fs.writeFile(fullPath, buffer);

  return {
    relativePath: `${subdir}/${filename}`,
    imageHash,
  };
}

export async function deleteUploadedFile(
  relativePath: string | null | undefined
): Promise<void> {
  if (!relativePath) return;

  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
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
