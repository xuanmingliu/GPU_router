import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const AUTH_DIR = path.join(ROOT, "auth");
const OUTPUT = path.join(AUTH_DIR, "starlight-state.json");
const INPUT = process.argv[2];

if (!INPUT) {
  console.error("Usage: node scripts/import-cookies.js /path/to/cookies.json-or-txt");
  process.exit(1);
}

function parseCookieHeader(text) {
  return text
    .trim()
    .replace(/^Cookie:\s*/i, "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      return {
        name: part.slice(0, eq).trim(),
        value: part.slice(eq + 1).trim(),
      };
    });
}

function normalizeCookie(cookie) {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain || ".starlight.nscc-gz.cn",
    path: cookie.path || "/",
    expires:
      typeof cookie.expires === "number"
        ? cookie.expires
        : typeof cookie.expirationDate === "number"
          ? cookie.expirationDate
          : -1,
    httpOnly: Boolean(cookie.httpOnly),
    secure: cookie.secure !== false,
    sameSite: ["Strict", "Lax", "None"].includes(cookie.sameSite) ? cookie.sameSite : "Lax",
  };
}

const raw = await readFile(INPUT, "utf8");
let cookies;

try {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) cookies = parsed;
  else if (Array.isArray(parsed.cookies)) cookies = parsed.cookies;
  else throw new Error("JSON does not contain a cookie array");
} catch {
  cookies = parseCookieHeader(raw);
}

cookies = cookies.filter((cookie) => cookie.name && cookie.value).map(normalizeCookie);
const bihuToken = cookies.find((cookie) => cookie.name === "Bihu-Token")?.value;

await mkdir(AUTH_DIR, { recursive: true });
await writeFile(
  OUTPUT,
  JSON.stringify(
    {
      cookies,
      origins: bihuToken
        ? [
            {
              origin: "https://starlight.nscc-gz.cn",
              localStorage: [
                { name: ".nscc-gz.cn", value: bihuToken },
                { name: "Bihu-Token", value: bihuToken },
                { name: "bihu-token", value: bihuToken },
                { name: "token", value: bihuToken },
                { name: "Token", value: bihuToken },
              ],
            },
          ]
        : [],
    },
    null,
    2,
  ),
);

console.log(`Imported ${cookies.length} cookies into ${OUTPUT}`);
