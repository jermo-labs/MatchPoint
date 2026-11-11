/* Génère les icônes PNG de l'app (aucune dépendance : rasterisation maison
   et encodage PNG via zlib).   →   node tools/make-icons.mjs

   Motif : trois gemmes dorées alignées — un « match » — sur fond nuit. */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../icons/", import.meta.url));
const SS = 4; // suréchantillonnage pour l'anticrénelage

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const BG_TOP = hex("#34266f");
const BG_BOTTOM = hex("#120d29");
const FACETS = { tl: hex("#fff0a8"), tr: hex("#ffd24a"), bl: hex("#f7ab00"), br: hex("#d98600") };
const CORE = hex("#ffe27a");
const GEMS = [
  { cx: 0.255, cy: 0.5, w: 0.108, h: 0.15 },
  { cx: 0.5, cy: 0.5, w: 0.108, h: 0.15 },
  { cx: 0.745, cy: 0.5, w: 0.108, h: 0.15 },
];

/* Couleur [r, g, b, a] au point (u, v) du carré unité. */
function shade(u, v, rounded) {
  if (rounded) {
    // Carré aux coins arrondis (rayon 22 %) ; transparent à l'extérieur.
    const r = 0.22;
    const dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0);
    const dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
    if (dx * dx + dy * dy > r * r) return [0, 0, 0, 0];
  }
  let color = mix(BG_TOP, BG_BOTTOM, v);
  const glow = Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.5) / 0.55);
  color = mix(color, hex("#6a4fd0"), glow * glow * 0.45);

  for (const g of GEMS) {
    const x = (u - g.cx) / g.w;
    const y = (v - g.cy) / g.h;
    const d = Math.abs(x) + Math.abs(y);
    if (d > 1) continue;
    const facet = FACETS[(y < 0 ? "t" : "b") + (x < 0 ? "l" : "r")];
    color = d < 0.42 ? mix(CORE, facet, 0.35) : facet;
  }
  return [...color, 255];
}

function render(size, rounded) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, rounded);
          const alpha = c[3] / 255;
          r += c[0] * alpha; g += c[1] * alpha; b += c[2] * alpha; a += alpha;
        }
      }
      const o = (py * size + px) * 4;
      if (a > 0) {
        rgba[o] = Math.round(r / a);
        rgba[o + 1] = Math.round(g / a);
        rgba[o + 2] = Math.round(b / a);
      }
      rgba[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return rgba;
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // 8 bits par canal
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); // filtre 0 par ligne
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const targets = [
  ["icon-192.png", 192, true],
  ["icon-512.png", 512, true],
  ["maskable-512.png", 512, false],         // plein cadre : Android applique son propre masque
  ["apple-touch-icon-180.png", 180, false], // plein cadre : iOS arrondit lui-même les coins
];
for (const [name, size, rounded] of targets) {
  writeFileSync(OUT + name, png(size, render(size, rounded)));
  console.log(`icons/${name}  ${size}×${size}`);
}
