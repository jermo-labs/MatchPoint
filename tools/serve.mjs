/* Petit serveur statique de développement, sans dépendance.

     node tools/serve.mjs          → http://localhost:5173 (cette machine seulement)
     node tools/serve.mjs --lan    → écoute aussi sur le réseau local, pour
                                     ouvrir le jeu depuis un iPhone en Wi-Fi

   Le port se règle avec la variable d'environnement PORT. */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT) || 5173;
const lan = process.argv.includes("--lan");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }
  if (path.endsWith("/")) path += "index.html";
  const file = resolve(join(root, normalize(path)));
  if (!file.startsWith(root + sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      "content-type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

server.listen(port, lan ? "0.0.0.0" : "127.0.0.1", () => {
  console.log(`MatchPoint : http://localhost:${port}`);
  if (!lan) return;
  for (const addresses of Object.values(networkInterfaces())) {
    for (const a of addresses ?? []) {
      if (a.family === "IPv4" && !a.internal) console.log(`Sur le réseau local : http://${a.address}:${port}`);
    }
  }
});
