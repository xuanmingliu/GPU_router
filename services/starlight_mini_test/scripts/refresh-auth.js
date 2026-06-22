import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const AUTH_DIR = path.join(ROOT, "auth");
const OUTPUT = path.join(AUTH_DIR, "starlight-state.json");
const STARLIGHT_ORIGIN = "https://starlight.nscc-gz.cn";
const username = process.env.STARLIGHT_USERNAME || "";
const password = process.env.STARLIGHT_PASSWORD || "";
const verificationCode = process.env.STARLIGHT_VERIFICATION_CODE || "";

if (!username || !password) {
  console.error("Missing STARLIGHT_USERNAME or STARLIGHT_PASSWORD.");
  console.error("Example: STARLIGHT_USERNAME='xxx' STARLIGHT_PASSWORD='xxx' npm run refresh-auth");
  process.exit(1);
}

function starlightCookie(name, value) {
  return {
    name,
    value,
    domain: ".starlight.nscc-gz.cn",
    path: "/",
    expires: -1,
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
  };
}

const response = await fetch(`${STARLIGHT_ORIGIN}/api/keystone/short_term_token/name`, {
  method: "POST",
  headers: {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json",
    origin: STARLIGHT_ORIGIN,
    referer: `${STARLIGHT_ORIGIN}/`,
  },
  body: JSON.stringify({
    username,
    password,
    verification_code: verificationCode,
    token_type: null,
    cookie_exp: null,
    redirect_url: null,
  }),
});

const text = await response.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = { raw: text };
}

if (!response.ok || !body?.spec) {
  console.error(`Refresh failed: HTTP ${response.status}`);
  console.error(body?.info || body?.message || text.slice(0, 500));
  process.exit(1);
}

await mkdir(AUTH_DIR, { recursive: true });
await writeFile(
  OUTPUT,
  JSON.stringify(
    {
      cookies: [starlightCookie("Bihu-Token", body.spec)],
      origins: [
        {
          origin: STARLIGHT_ORIGIN,
          localStorage: [
            { name: ".nscc-gz.cn", value: body.spec },
            { name: "Bihu-Token", value: body.spec },
            { name: "bihu-token", value: body.spec },
            { name: "token", value: body.spec },
            { name: "Token", value: body.spec },
          ],
        },
      ],
      refreshedAt: new Date().toISOString(),
      refreshedBy: "direct-login-api",
      userName: username,
    },
    null,
    2,
  ),
);

console.log(`Refreshed Starlight auth for ${username}`);
console.log(`Wrote ${OUTPUT}`);
