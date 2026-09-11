#!/usr/bin/env node
/**
 * Zero-dependency static server for the exported dashboard (`npm run build`
 * writes ./out). It mirrors how Vercel serves a static export:
 *
 *   /dashboard        -> out/dashboard.html      (clean URLs)
 *   /dashboard/       -> out/dashboard.html
 *   /                 -> out/index.html
 *   anything else     -> out/404.html            (with status 404)
 *
 * Usage: node scripts/serve-static.mjs [port]   (default 3000)
 * Not used on Vercel — the platform serves ./out directly.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "out");
const port = Number(process.argv[2] ?? process.env.PORT ?? 3000);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** Resolve a request path to a file inside ./out, Vercel-style. */
async function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0]));
  const rel = clean.replace(/^\/+/, "");
  if (rel.includes("..")) return null;

  const candidates = rel === ""
    ? ["index.html"]
    : [rel, `${rel}.html`, join(rel, "index.html"), join(rel, "index.htm")];

  for (const c of candidates) {
    const full = join(root, c);
    if (!full.startsWith(root)) return null;
    if (await isFile(full)) return full;
  }
  return null;
}

const server = createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end("Method Not Allowed");
    return;
  }

  try {
    const file = await resolveFile(req.url ?? "/");
    if (file) {
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(req.method === "HEAD" ? undefined : body);
      return;
    }
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Internal error: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  // Static-export 404 page (app/not-found.tsx), served with a real 404 status.
  const notFound = join(root, "404.html");
  const body = (await isFile(notFound)) ? await readFile(notFound) : Buffer.from("Not Found");
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  res.end(req.method === "HEAD" ? undefined : body);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`MAMA CARE dashboard (static export) → http://0.0.0.0:${port}  [root: ${root}]`);
});
