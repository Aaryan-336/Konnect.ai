/**
 * Renders the Konnect mark into every raster size the PWA manifest, iOS and
 * the browser tab need. Run with `node scripts/generate-icons.mjs` after
 * changing the logo in src/components/ui/Logo.tsx.
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INK = '#141419';
const CREAM = '#f6f5f1';

/** `inset` is the share of the canvas left empty around the mark (maskable safe zone). */
function svg({ size, inset = 0, radius = 0.28, bg = INK }) {
  const markSize = size * (1 - inset * 2);
  const offset = size * inset;
  const r = size * radius;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="${bg}"/>
  <g transform="translate(${offset} ${offset}) scale(${markSize / 32})">
    <path d="M10 8.5c0-.6.5-1.1 1.1-1.1h2.6c.6 0 1.1.5 1.1 1.1v15c0 .6-.5 1.1-1.1 1.1h-2.6c-.6 0-1.1-.5-1.1-1.1v-15Z" fill="${CREAM}"/>
    <path d="M17.6 15.1 21.4 8a1.1 1.1 0 0 1 1-.6h2.7c.9 0 1.4.9 1 1.6l-4 6.9 4 6.9c.4.7-.1 1.6-1 1.6h-2.7c-.4 0-.8-.2-1-.6l-3.8-7.1a1.1 1.1 0 0 1 0-1.6Z" fill="${CREAM}" opacity="0.62"/>
  </g>
</svg>`;
}

const targets = [
  // Standard icons keep the rounded-square silhouette.
  { file: 'public/icons/icon-192.png', size: 192, inset: 0 },
  { file: 'public/icons/icon-512.png', size: 512, inset: 0 },
  // Maskable icons are cropped by the launcher, so the mark is pulled inward
  // and the background runs edge to edge.
  { file: 'public/icons/icon-maskable-192.png', size: 192, inset: 0.19, radius: 0 },
  { file: 'public/icons/icon-maskable-512.png', size: 512, inset: 0.19, radius: 0 },
  // iOS applies its own mask and dislikes transparency.
  { file: 'public/icons/apple-touch-icon.png', size: 180, inset: 0.08, radius: 0 },
  { file: 'public/icons/icon-48.png', size: 48, inset: 0 },
  { file: 'src/app/icon.png', size: 64, inset: 0 },
];

for (const { file, size, inset, radius } of targets) {
  const out = resolve(root, file);
  await mkdir(dirname(out), { recursive: true });
  const png = await sharp(Buffer.from(svg({ size, inset, radius })))
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(out, png);
  console.log(`wrote ${file} (${size}px, ${png.length} bytes)`);
}

// A monochrome mask for the iOS Safari pinned tab / macOS touch bar.
await writeFile(
  resolve(root, 'public/icons/mask-icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M10 8.5c0-.6.5-1.1 1.1-1.1h2.6c.6 0 1.1.5 1.1 1.1v15c0 .6-.5 1.1-1.1 1.1h-2.6c-.6 0-1.1-.5-1.1-1.1v-15Z"/><path d="M17.6 15.1 21.4 8a1.1 1.1 0 0 1 1-.6h2.7c.9 0 1.4.9 1 1.6l-4 6.9 4 6.9c.4.7-.1 1.6-1 1.6h-2.7c-.4 0-.8-.2-1-.6l-3.8-7.1a1.1 1.1 0 0 1 0-1.6Z"/></svg>\n`
);
console.log('wrote public/icons/mask-icon.svg');
