import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const AUTH_DIR = path.join(ROOT, "auth");
const AUTH_STATE = path.join(AUTH_DIR, "starlight-state.json");
const TARGET_URL =
  process.env.STARLIGHT_TARGET_URL ||
  "https://starlight.nscc-gz.cn/#/app/spec/pytorch-ngc-job?type=1&id=23761";

await mkdir(AUTH_DIR, { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });

console.log("");
console.log("请在打开的浏览器里手动登录星光，并进入目标页面。");
console.log("确认已经能看到作业表单后，回到这个终端按 Enter 保存登录态。");
console.log("");

process.stdin.resume();
await new Promise((resolve) => process.stdin.once("data", resolve));
await context.storageState({ path: AUTH_STATE });
console.log(`已保存登录态到 ${AUTH_STATE}`);
await browser.close();
