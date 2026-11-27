import { NextRequest, NextResponse } from "next/server";
import { normalizeRelativeUploadPath, readUploadedFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await context.params;
  if (!normalizeRelativeUploadPath(segments)) {
    return NextResponse.json(
      { error: "Invalid file path" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const file = await readUploadedFile(segments);
  if (!file) {
    return NextResponse.json(
      { error: "File not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  const etag = `"${file.sha256}"`;
  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  return new NextResponse(file.data, {
    status: 200,
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.data.byteLength),
      ETag: etag,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
