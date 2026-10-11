import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "desktop-dist");
const files = [
  "index.html",
  "favicon.ico",
  "theme-init.js",
  "404.html",
  "styles.css",
  "manifest.webmanifest",
  "service-worker.js",
  "desktop.css"
];

// Tauri only receives runtime files; source code, build tooling, and prior
// installer output remain outside the desktop bundle.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(files.map((file) => cp(resolve(root, file), resolve(output, file))));
await cp(resolve(root, "icons"), resolve(output, "icons"), { recursive: true });
await cp(resolve(root, "dist"), resolve(output, "dist"), { recursive: true });
const desktopIndex = resolve(output, "index.html");
const html = await readFile(desktopIndex, "utf8");
// Merge the desktop rules into the primary stylesheet. This is deliberately
// one stylesheet so the native WebView always receives the desktop layout.
const desktopStyles = await readFile(resolve(root, "desktop.css"), "utf8");
await writeFile(resolve(output, "styles.css"), `${await readFile(resolve(root, "styles.css"), "utf8")}\n\n/* Packaged Windows layout */\n${desktopStyles}`);
await writeFile(desktopIndex, html);
console.log("Prepared desktop-dist with the Miks runtime files.");
