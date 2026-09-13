import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("dist");
const port = Number(process.env.KD_STREAMING_FINAL_PORT || 4399);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

http.createServer(async (request, response) => {
  let pathname = new URL(request.url, "http://127.0.0.1").pathname;
  if (pathname === "/") pathname = "/index.html";
  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403);
    response.end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end();
  }
}).listen(port, "127.0.0.1");
