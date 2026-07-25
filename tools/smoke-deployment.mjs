const basis = String(process.env.APP_URL || process.argv[2] || "").replace(/\/+$/, "");
if (!basis.startsWith("https://")) throw new Error("APP_URL muss eine HTTPS-URL sein.");

async function hole(pfad, erwarteterTyp) {
  const url = basis + pfad;
  const res = await fetch(url, { redirect: "follow", headers: { "Cache-Control": "no-cache" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const typ = res.headers.get("content-type") || "";
  if (erwarteterTyp && !typ.includes(erwarteterTyp)) throw new Error(`${url}: unerwarteter Content-Type ${typ}`);
  return res;
}

const start = await hole("/", "text/html");
const csp = start.headers.get("content-security-policy") || "";
for (const direktive of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'"]) {
  if (!csp.includes(direktive)) throw new Error(`CSP fehlt oder ist unvollständig: ${direktive}`);
}
if (start.headers.get("x-content-type-options") !== "nosniff") throw new Error("X-Content-Type-Options fehlt.");
if (start.headers.get("x-frame-options") !== "DENY") throw new Error("X-Frame-Options fehlt.");

await hole("/manifest.webmanifest", "application/manifest+json");
await hole("/sw.js", "javascript");
await hole("/download/", "text/html");

console.log(`HTTPS-Smoke-Test und Sicherheitsheader bestanden: ${basis}`);
