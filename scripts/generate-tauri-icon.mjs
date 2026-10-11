import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const png = await sharp(resolve(root, "icons", "miks-logo.svg")).resize(256, 256).png().toBuffer();
const iconDir = resolve(root, "src-tauri", "icons");
const target = resolve(iconDir, "icon.ico");

const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt8(0, 6);
header.writeUInt8(0, 7);
header.writeUInt8(0, 8);
header.writeUInt8(0, 9);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);

await mkdir(iconDir, { recursive: true });
const ico = Buffer.concat([header, png]);
await Promise.all([
	writeFile(target, ico),
	writeFile(resolve(root, "favicon.ico"), ico),
]);
console.log("Generated src-tauri/icons/icon.ico from miks-logo.svg.");
