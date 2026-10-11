import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "mobile-dist");
const files = [
  "index.html",
  "favicon.ico",
  "theme-init.js",
  "404.html",
  "styles.css",
  "manifest.webmanifest",
  "service-worker.js"
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(files.map((file) => cp(resolve(root, file), resolve(output, file))));
await cp(resolve(root, "icons"), resolve(output, "icons"), { recursive: true });
await cp(resolve(root, "dist"), resolve(output, "dist"), { recursive: true });
console.log("Prepared mobile-dist with the phone layout and runtime files.");
