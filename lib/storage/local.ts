import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_BYTES = 2 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export function uploadRoot() {
  return path.resolve(process.env.UPLOAD_DIR || "./data/uploads");
}

function assetsRoot() {
  return path.join(uploadRoot(), "company-assets");
}

export async function uploadFile(kind: "logo" | "stamp", file: File): Promise<string> {
  const extension = EXTENSIONS[file.type];
  if (!extension) throw new Error("Upload a PNG, JPG, WebP, or SVG image.");
  if (file.size > MAX_BYTES) throw new Error("Images must be 2 MB or smaller.");
  const relative = `${kind}/${randomUUID()}.${extension}`;
  const target = path.join(assetsRoot(), relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await file.arrayBuffer()));
  return relative;
}

export function getFileUrl(filePath?: string | null): string | null {
  if (!filePath) return null;
  return `/api/uploads/company-assets/${filePath}`;
}

export async function deleteFile(filePath: string): Promise<void> {
  const root = assetsRoot();
  const target = path.resolve(root, filePath);
  if (!target.startsWith(root + path.sep)) throw new Error("Invalid file path.");
  try {
    await unlink(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
