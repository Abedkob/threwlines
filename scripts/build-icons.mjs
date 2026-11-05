// Builds the icon set from the brand artwork in public/branding/.
//
// Why this exists rather than hand-placed files: the supplied artwork is dark
// ink on transparency, which is right for the in-app lockup (it sits on a brass
// tile) but wrong for a favicon. A favicon lands on browser chrome we do not
// control, and near-black on transparent is close to invisible on a dark tab
// strip. iOS is worse: it ignores alpha on home-screen icons and composites
// onto black, so a 75%-transparent apple-touch-icon disappears entirely.
//
// So everything that leaves the app carries the brass tile the app already uses
// for .brand-logo-frame: same lockup, legible on any chrome, and a distinctive
// colour at 16px where the drawing itself cannot survive.
//
// Usage: node scripts/build-icons.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const SOURCE = "public/branding/nosterys-vault-mark.png";
const BRASS = { r: 0xc8, g: 0xa2, b: 0x4a, alpha: 1 }; // --accent-line

// A third of the source canvas is empty margin. Left in, the mark renders at
// about 56% of each tile and reads as a small glyph floating in brass, so trim
// to the artwork's own bounding box and let `fill` below mean what it says.
const ART = await sharp(SOURCE).trim({ threshold: 1 }).toBuffer();

// Rounded-rect alpha mask, so the tile matches the 8-10px radius the sidebar
// lockup uses. Apple rounds its own corners, so apple-touch opts out.
const roundedMask = (size, radiusRatio) =>
  Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(
      size * radiusRatio,
    )}" fill="#fff"/></svg>`,
  );

// One tile: brass ground, artwork centred at `fill` of the canvas.
async function tile(size, { fill = 0.84, radius = 0.2, rounded = true } = {}) {
  const inner = Math.round(size * fill);
  const art = await sharp(ART)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const offset = Math.round((size - inner) / 2);
  let image = sharp({ create: { width: size, height: size, channels: 4, background: BRASS } })
    .composite([{ input: art, top: offset, left: offset }]);
  if (rounded) {
    const flat = await image.png().toBuffer();
    image = sharp(flat).composite([{ input: roundedMask(size, radius), blend: "dest-in" }]);
  }
  return image.png({ compressionLevel: 9 }).toBuffer();
}

// Minimal ICO writer. The format is a 6-byte header, one 16-byte directory
// entry per image, then the payloads; PNG payloads are allowed and understood
// by every browser and by Windows Vista onwards, which saves decoding BMP.
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = [];
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

mkdirSync("public", { recursive: true });

const out = [];

// Favicons. Rounded tile, artwork pushed a little larger at 16px because the
// compass ring and the star stop resolving below about 24px and the shape has
// to carry it.
const sizes = [
  [16, { fill: 0.92, radius: 0.16 }],
  [32, { fill: 0.86, radius: 0.18 }],
  [48, { fill: 0.84, radius: 0.2 }],
];
const favicons = [];
for (const [size, opts] of sizes) {
  const data = await tile(size, opts);
  favicons.push({ size, data });
  writeFileSync(`public/favicon-${size}x${size}.png`, data);
  out.push(`favicon-${size}x${size}.png  ${String(data.length).padStart(6)} bytes`);
}

writeFileSync("public/favicon.ico", ico(favicons));
out.push(`favicon.ico              ${String(ico(favicons).length).padStart(6)} bytes  (16, 32, 48)`);

// Apple touch icon: square and full-bleed. iOS applies its own mask, so a
// rounded source would show the ground through the corners it rounds away.
const apple = await tile(180, { fill: 0.78, rounded: false });
writeFileSync("public/apple-touch-icon.png", apple);
out.push(`apple-touch-icon.png     ${String(apple.length).padStart(6)} bytes  (180, opaque)`);

// PWA icons. 192 is the install prompt, 512 the splash. Both opaque for the
// same reason as apple-touch.
for (const size of [192, 512]) {
  const data = await tile(size, { fill: 0.8, radius: 0.2 });
  writeFileSync(`public/icon-${size}.png`, data);
  out.push(`icon-${size}.png${" ".repeat(size === 192 ? 13 : 13)}${String(data.length).padStart(6)} bytes`);
}

// In-app lockup glyph. Transparent on purpose: it sits inside
// .brand-logo-frame, which already paints the brass. 1024px would be 332 KB
// for a 38px slot.
const glyph = await sharp(ART).resize(96, 96, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toBuffer();
writeFileSync("public/nosterys-mark.png", glyph);
out.push(`nosterys-mark.png        ${String(glyph.length).padStart(6)} bytes  (96, transparent)`);

console.log(out.join("\n"));
