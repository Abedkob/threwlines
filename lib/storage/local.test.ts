import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { deleteFile, getFileUrl, uploadFile } from "./local.ts";

test("storage uploadFile rejects files over 2MB", async () => {
  const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
  await assert.rejects(() => uploadFile("logo", big), /2 MB/);
});

test("storage uploadFile rejects non-image types", async () => {
  const file = new File(["hello"], "a.txt", { type: "text/plain" });
  await assert.rejects(() => uploadFile("logo", file), /PNG, JPG, WebP, or SVG/);
});

test("storage uploadFile writes under the kind directory and deleteFile removes it", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "uploads-"));
  process.env.UPLOAD_DIR = dir;
  try {
    const file = new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" });
    const result = await uploadFile("stamp", file);
    assert.match(result, /^stamp\/[0-9a-f-]+\.png$/);
    const stored = await readFile(path.join(dir, "company-assets", result));
    assert.equal(stored.length, 3);
    await deleteFile(result);
    await assert.rejects(() => readFile(path.join(dir, "company-assets", result)));
  } finally {
    delete process.env.UPLOAD_DIR;
    await rm(dir, { recursive: true, force: true });
  }
});

test("storage getFileUrl returns an /api/uploads path", () => {
  assert.equal(getFileUrl("logo/a.png"), "/api/uploads/company-assets/logo/a.png");
  assert.equal(getFileUrl(null), null);
  assert.equal(getFileUrl(""), null);
});
