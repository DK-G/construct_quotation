/**
 * Cloudflare Pages publish helper.
 *
 * next.config.ts sets `basePath: '/tools/construct-quotation'`, so every asset
 * in the static export references `/tools/construct-quotation/...`. A static host
 * must therefore serve the exported files from that path, not from the root.
 *
 * This script copies `out/` into `dist/tools/construct-quotation/` so that the
 * Cloudflare Pages publish directory (`dist`) serves the app at
 * `<domain>/tools/construct-quotation/` with all asset paths resolving correctly.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'out');
const dist = path.join(root, 'dist');
const target = path.join(dist, 'tools', 'construct-quotation');

if (!fs.existsSync(out)) {
  console.error('[nest-output] out/ not found. Run `next build` first.');
  process.exit(1);
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(out, target, { recursive: true });

console.log(`[nest-output] Copied out/ -> ${path.relative(root, target).replace(/\\/g, '/')}/`);
