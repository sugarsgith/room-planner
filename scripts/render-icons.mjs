import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const svg = readFileSync(new URL("../public/icon.svg", import.meta.url), "utf8");
const maskable = svg.replace(
  '<g id="mark">',
  '<g id="mark" transform="translate(256 256) scale(0.68) translate(-256 -256)">',
);

const targets = [
  { svg, size: 512, file: "public/icon-512.png" },
  { svg, size: 192, file: "public/icon-192.png" },
  { svg: maskable, size: 512, file: "public/icon-maskable-512.png" },
  { svg, size: 180, file: "public/apple-touch-icon.png" },
  { svg, size: 32, file: "public/favicon-32.png" },
];

const browser = await chromium.launch();
const page = await browser.newPage();

async function raster(markup, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><head><style>html,body{margin:0;background:#f4f0e8}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${markup}</body></html>`,
  );
  await page.locator("svg").screenshot({ path: file });
}

for (const target of targets) {
  await raster(target.svg, target.size, target.file);
}

mkdirSync("/opt/cursor/artifacts", { recursive: true });
await raster(svg, 512, "/opt/cursor/artifacts/icon-512.png");

const sheet = `<!doctype html><html><head><style>
  body { margin: 0; font-family: sans-serif; }
  section { display: flex; gap: 28px; align-items: end; padding: 28px 32px; }
  figure { margin: 0; text-align: center; }
  figcaption { margin-top: 8px; font-size: 13px; }
  img { display: block; image-rendering: auto; }
  .light { background: #f4f0e8; color: #1e1b16; }
  .dark { background: #1c1b19; color: #f4f0e8; }
</style></head><body>
  <section class="light">
    <figure><img width="180" height="180" src="data:image/svg+xml,${encodeURIComponent(svg)}"><figcaption>180</figcaption></figure>
    <figure><img width="64" height="64" src="data:image/svg+xml,${encodeURIComponent(svg)}"><figcaption>64</figcaption></figure>
    <figure><img width="32" height="32" src="data:image/svg+xml,${encodeURIComponent(svg)}"><figcaption>32</figcaption></figure>
  </section>
  <section class="dark">
    <figure><img width="180" height="180" src="data:image/svg+xml,${encodeURIComponent(svg)}"><figcaption>180</figcaption></figure>
    <figure><img width="64" height="64" src="data:image/svg+xml,${encodeURIComponent(svg)}"><figcaption>64</figcaption></figure>
    <figure><img width="32" height="32" src="data:image/svg+xml,${encodeURIComponent(svg)}"><figcaption>32</figcaption></figure>
  </section>
</body></html>`;

await page.setViewportSize({ width: 720, height: 520 });
await page.setContent(sheet);
await page.screenshot({ path: "/opt/cursor/artifacts/icon-contact-sheet.png" });
await browser.close();
