import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "icons", "miks-logo.svg");
const icons = resolve(root, "icons");

await mkdir(icons, { recursive: true });
await Promise.all([192, 512].map((size) => sharp(source).resize(size, size).png().toFile(resolve(icons, `icon-${size}.png`))));
console.log("Generated Miks PWA icons (192px and 512px).");
