import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { getMimeTypeForFile, resolveSafeUploadPath } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await context.params;
  const resolvedPath = resolveSafeUploadPath(segments);

  if (!resolvedPath) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  try {
    const fileBuffer = await fs.readFile(resolvedPath);
    const contentType = getMimeTypeForFile(resolvedPath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
