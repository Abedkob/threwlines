import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireSession, handleError, errorResponse } from "@/lib/api/helpers";
import { uploadRoot } from "@/lib/storage/local";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export async function GET(_request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    await requireSession(await cookies());
    const { path: segments } = await context.params;
    const root = uploadRoot();
    const target = path.resolve(root, ...segments);
    if (!target.startsWith(root + path.sep)) return errorResponse("Not found.", 404);
    const contentType = CONTENT_TYPES[path.extname(target).toLowerCase()];
    if (!contentType) return errorResponse("Not found.", 404);
    let data: Buffer;
    try {
      data = await readFile(target);
    } catch {
      return errorResponse("Not found.", 404);
    }
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": contentType,
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
