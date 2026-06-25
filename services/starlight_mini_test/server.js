import { createServer } from "node:http";
import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8030);
const TARGET_URL =
  process.env.STARLIGHT_TARGET_URL ||
  "https://starlight.nscc-gz.cn/#/app/spec/pytorch-ngc-job?type=1&id=23761";
const STARLIGHT_ORIGIN = "https://starlight.nscc-gz.cn";
const AUTH_STATE = path.join(__dirname, "auth", "starlight-state.json");
const RUNS_DIR = path.join(__dirname, "runs");
const JOBS_FILE = path.join(RUNS_DIR, "jobs.json");
const STARLIGHT_USERNAME = process.env.STARLIGHT_USERNAME || "";
const STARLIGHT_PASSWORD = process.env.STARLIGHT_PASSWORD || "";
const STARLIGHT_VERIFICATION_CODE = process.env.STARLIGHT_VERIFICATION_CODE || "";
const AUTH_REFRESH_INTERVAL_MS = Number(process.env.STARLIGHT_AUTH_REFRESH_INTERVAL_MS || 30 * 60 * 1000);
const AUTH_REFRESH_MIN_AGE_MS = Number(process.env.STARLIGHT_AUTH_REFRESH_MIN_AGE_MS || 5 * 60 * 1000);
let lastAuthRefreshAt = 0;

const IMAGE_FULL_NAMES = {
  "ngc-pytorch:25.02-py3-sshd-v3": "hub.starlight.nscc-gz.cn/starlight/ngc-pytorch:25.02-py3-sshd-v3",
  "ngc-pytorch:23.12-py3-sshd-v3": "hub.starlight.nscc-gz.cn/starlight/ngc-pytorch:23.12-py3-sshd-v3.2",
  "ngc-pytorch:22.04-py3-sshd-v3": "hub.starlight.nscc-gz.cn/starlight/ngc-pytorch:22.04-py3-sshd-v3.2",
  "ngc-pytorch:21.11-py3-sshd-v3": "hub.starlight.nscc-gz.cn/starlight/ngc-pytorch:21.11-py3-sshd-v3.2",
};

async function readStoredBihuToken() {
  if (!existsSync(AUTH_STATE)) return "";
  try {
    const state = JSON.parse(await readFile(AUTH_STATE, "utf8"));
    return state.cookies?.find((cookie) => cookie.name === "Bihu-Token")?.value || "";
  } catch {
    return "";
  }
}

async function readStoredCookieHeader() {
  if (!existsSync(AUTH_STATE)) return "";
  try {
    const state = JSON.parse(await readFile(AUTH_STATE, "utf8"));
    return (state.cookies || [])
      .filter((cookie) => cookie.domain?.includes("starlight.nscc-gz.cn") || cookie.domain?.includes(".nscc-gz.cn"))
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
  } catch {
    return "";
  }
}

function hasStarlightCredentials() {
  return Boolean(STARLIGHT_USERNAME && STARLIGHT_PASSWORD);
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

async function writeStarlightAuthState(token, meta = {}) {
  if (!token) throw new Error("星光登录接口没有返回 token");
  await mkdir(path.dirname(AUTH_STATE), { recursive: true });
  await writeFile(
    AUTH_STATE,
    JSON.stringify(
      {
        cookies: [
          starlightCookie("Bihu-Token", token),
          starlightCookie("_c_WBKFRo", meta.clientCookie || ""),
        ].filter((cookie) => cookie.value),
        origins: [
          {
            origin: STARLIGHT_ORIGIN,
            localStorage: [
              { name: ".nscc-gz.cn", value: token },
              { name: "Bihu-Token", value: token },
              { name: "bihu-token", value: token },
              { name: "token", value: token },
              { name: "Token", value: token },
            ],
          },
        ],
        refreshedAt: new Date().toISOString(),
        refreshedBy: "direct-login-api",
        userName: STARLIGHT_USERNAME,
      },
      null,
      2,
    ),
  );
}

async function refreshStarlightAuth({ force = false } = {}) {
  if (!hasStarlightCredentials()) {
    throw new Error("未配置 STARLIGHT_USERNAME / STARLIGHT_PASSWORD，无法自动刷新星光登录态");
  }
  const now = Date.now();
  if (!force && now - lastAuthRefreshAt < AUTH_REFRESH_MIN_AGE_MS && existsSync(AUTH_STATE)) {
    return { refreshed: false, skipped: "recently refreshed", authStatePath: AUTH_STATE };
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
      username: STARLIGHT_USERNAME,
      password: STARLIGHT_PASSWORD,
      verification_code: STARLIGHT_VERIFICATION_CODE,
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
  const token = body?.spec;
  if (!response.ok || !token) {
    throw new Error(`星光登录态刷新失败 HTTP ${response.status}: ${body?.info || body?.message || text.slice(0, 240)}`);
  }
  await writeStarlightAuthState(token);
  lastAuthRefreshAt = now;
  return {
    refreshed: true,
    authStatePath: AUTH_STATE,
    userName: STARLIGHT_USERNAME,
    responseCode: body?.code,
    kind: body?.kind,
    refreshedAt: new Date().toISOString(),
  };
}

function isAuthFailure(response) {
  const info = String(response?.body?.info || response?.body?.message || response?.body?.error || "");
  return response?.status === 401 || response?.status === 403 || /登录|登陆|token|认证|未授权|unauthor/i.test(info);
}

function json(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload, null, 2));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,accept",
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveFile(res, filePath, contentType) {
  const body = await readFile(filePath);
  res.writeHead(200, {
    "content-type": contentType,
    "content-length": body.length,
    "cache-control": "no-store",
  });
  res.end(body);
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function readJobRecords() {
  await mkdir(RUNS_DIR, { recursive: true });
  const saved = await readJsonFile(JOBS_FILE, []);
  const records = new Map((Array.isArray(saved) ? saved : []).map((job) => [`${job.cluster}/${job.jobId}`, job]));

  try {
    const files = await readdir(RUNS_DIR);
    for (const file of files.filter((name) => name.endsWith("-direct.json"))) {
      const run = await readJsonFile(path.join(RUNS_DIR, file), null);
      const ref = run?.jobRef;
      if (!run?.submitted || !ref?.cluster || !ref?.jobId) continue;
      const key = `${ref.cluster}/${ref.jobId}`;
      if (!records.has(key)) {
        records.set(key, {
          cluster: ref.cluster,
          jobId: ref.jobId,
          name: ref.name || run.payload?.runtime_params?.jobname || ref.jobId,
          partition: run.payload?.runtime_params?.partition || "",
          image: run.payload?.runtime_params?.image || "",
          resources: {
            cpu: run.payload?.runtime_params?.cpu,
            gpu: run.payload?.runtime_params?.gpu,
            memory: run.payload?.runtime_params?.memory,
          },
          workDir: ref.workDir || "",
          createdAt: run.submitResponse?.body?.spec?.created_at || run.runId || "",
          runId: run.runId,
          source: "direct-api",
        });
      }
    }
  } catch {}

  return Array.from(records.values()).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

async function writeJobRecords(records) {
  await mkdir(RUNS_DIR, { recursive: true });
  await writeFile(JOBS_FILE, JSON.stringify(records, null, 2));
}

async function upsertJobRecord(record) {
  const records = await readJobRecords();
  const key = `${record.cluster}/${record.jobId}`;
  const index = records.findIndex((job) => `${job.cluster}/${job.jobId}` === key);
  if (index >= 0) records[index] = { ...records[index], ...record, updatedAt: new Date().toISOString() };
  else records.unshift({ ...record, updatedAt: new Date().toISOString() });
  await writeJobRecords(records);
}

async function deleteJobRecord(cluster, jobId) {
  if (!cluster || !jobId) throw new Error("cluster 和 jobId 不能为空");
  const records = await readJobRecords();
  const next = records.filter((job) => !(job.cluster === cluster && job.jobId === jobId));
  await writeJobRecords(next);
  return { deleted: next.length !== records.length, total: next.length };
}

async function fillTextByLabel(page, label, value) {
  if (!value) return { label, value, ok: false, reason: "empty value skipped" };
  return page.evaluate(
    ({ label, value }) => {
      const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      };
      const setValue = (input) => {
        input.focus();
        const descriptor = Object.getOwnPropertyDescriptor(input.constructor.prototype, "value");
        if (descriptor?.set) descriptor.set.call(input, value);
        else input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const nodes = Array.from(document.querySelectorAll("label, .el-form-item, div, span, p"));
      const labelNode = nodes.find((node) => isVisible(node) && node.textContent?.includes(label));
      if (!labelNode) return { label, value, ok: false, reason: "label not found" };
      let scope = labelNode;
      for (let i = 0; scope && i < 5; i += 1, scope = scope.parentElement) {
        const input = Array.from(scope.querySelectorAll("input, textarea"))
          .filter(isVisible)
          .find((el) => !el.disabled && !el.readOnly);
        if (input) {
          setValue(input);
          return { label, value, ok: true, method: "input near label" };
        }
      }
      const allInputs = Array.from(document.querySelectorAll("input, textarea")).filter(isVisible);
      const rect = labelNode.getBoundingClientRect();
      const candidate = allInputs
        .map((input) => ({ input, rect: input.getBoundingClientRect() }))
        .filter((item) => item.rect.top >= rect.top - 20)
        .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)[0]?.input;
      if (candidate) {
        setValue(candidate);
        return { label, value, ok: true, method: "nearest input after label" };
      }
      return { label, value, ok: false, reason: "input not found" };
    },
    { label, value },
  );
}

async function fillInputBySelector(page, selector, value, label) {
  if (!value) return { label, value, ok: false, reason: "empty value skipped" };
  try {
    const input = page.locator(selector).first();
    await input.waitFor({ state: "visible", timeout: 5000 });
    const currentValue = await input.inputValue().catch(() => "");
    if (currentValue === value) {
      return { label, value, ok: true, method: `selector ${selector}`, skipped: "already set" };
    }
    await input.evaluate((el, nextValue) => {
      el.focus();
      const descriptor = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value");
      if (descriptor?.set) descriptor.set.call(el, nextValue);
      else el.value = nextValue;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    return { label, value, ok: true, method: `selector ${selector}` };
  } catch (error) {
    return { label, value, ok: false, reason: `selector failed: ${String(error?.message || error).slice(0, 180)}` };
  }
}

async function clickRadioValue(page, value, label) {
  if (!value) return { label, value, ok: false, reason: "empty value skipped" };
  try {
    const radio = page.locator(`input.el-radio__original[value="${value.replaceAll('"', '\\"')}"]`).first();
    await radio.waitFor({ state: "attached", timeout: 5000 });
    await radio.evaluate((el) => {
      const label = el.closest("label");
      if (label) label.click();
      else el.click();
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForTimeout(800);
    return { label, value, ok: true, method: "radio value" };
  } catch (error) {
    return { label, value, ok: false, reason: `radio click failed: ${String(error?.message || error).slice(0, 180)}` };
  }
}

async function chooseByLabel(page, label, value) {
  if (!value) return { label, value, ok: false, reason: "empty value skipped" };
  const clicked = await page.evaluate(
    ({ label }) => {
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      };
      const nodes = Array.from(document.querySelectorAll("label, .el-form-item, div, span"));
      const labelNode = nodes.find((node) => isVisible(node) && node.textContent?.includes(label));
      if (!labelNode) return { ok: false, reason: "label not found" };
      let scope = labelNode;
      for (let i = 0; scope && i < 6; i += 1, scope = scope.parentElement) {
        const input = Array.from(scope.querySelectorAll(".el-select input, input"))
          .filter(isVisible)
          .find((el) => !el.disabled);
        if (input) {
          input.click();
          return { ok: true };
        }
      }
      return { ok: false, reason: "select input not found" };
    },
    { label },
  );
  if (!clicked.ok) return { label, value, ok: false, reason: clicked.reason };

  try {
    const option = page.getByText(value, { exact: true }).last();
    await option.waitFor({ state: "visible", timeout: 2500 });
    await option.click();
    return { label, value, ok: true, method: "visible option text" };
  } catch {
    await fillTextByLabel(page, label, value);
    await page.keyboard.press("Enter").catch(() => {});
    return { label, value, ok: true, method: "typed into select and pressed Enter", warning: "option text was not directly clickable" };
  }
}

async function chooseImageOption(page, value) {
  const label = "镜像选择";
  if (!value) return { label, value, ok: false, reason: "empty value skipped" };
  const selector = 'input[placeholder="缺省：选择应用默认镜像"]';
  try {
    const input = page.locator(selector).first();
    await input.waitFor({ state: "visible", timeout: 5000 });
    const currentValue = await input.inputValue().catch(() => "");
    if (currentValue === value) {
      return { label, value, ok: true, method: "image select", skipped: "already set" };
    }

    await input.click();
    const exactOption = page.getByText(value, { exact: true }).last();
    await exactOption.waitFor({ state: "visible", timeout: 3000 });
    await exactOption.click();
    await page.waitForTimeout(500);
    const nextValue = await input.inputValue().catch(() => "");
    return {
      label,
      value,
      ok: nextValue === value,
      method: "image select option",
      actualValue: nextValue,
      ...(nextValue === value ? {} : { warning: "clicked option but selected value did not match target" }),
    };
  } catch (error) {
    const fallback = await chooseByLabel(page, label, value).catch((fallbackError) => ({
      ok: false,
      reason: String(fallbackError?.message || fallbackError),
    }));
    if (fallback.ok) return fallback;
    return {
      label,
      value,
      ok: false,
      reason: `image select failed: ${String(error?.message || error).slice(0, 180)}`,
      fallbackReason: fallback.reason,
    };
  }
}

async function chooseScriptFile(page, scriptFile, runId) {
  const label = "脚本选择";
  if (!scriptFile?.name || !scriptFile?.contentBase64) {
    return { label, ok: false, reason: "empty file skipped; 星光会按调试模式启动" };
  }

  const safeName = scriptFile.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "script.sh";
  const uploadDir = path.join(RUNS_DIR, `${runId}-files`);
  await mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, safeName);
  await writeFile(filePath, Buffer.from(scriptFile.contentBase64, "base64"));

  try {
    const fileInput = page.locator('input[type="file"]').last();
    if ((await fileInput.count()) > 0) {
      await fileInput.setInputFiles(filePath, { timeout: 5000 });
      await page.waitForTimeout(800);
      return {
        label,
        ok: true,
        method: "set input[type=file]",
        fileName: scriptFile.name,
        size: scriptFile.size,
      };
    }

    const chooseButton = page.getByRole("button", { name: /^选择$/ }).last();
    await chooseButton.click();
    await page.waitForTimeout(1200);

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 8000 }),
      page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const uploadButton = buttons.find((button) =>
          Array.from(button.querySelectorAll("use")).some((use) =>
            [use.getAttribute("href"), use.getAttribute("xlink:href")].some((href) => href?.includes("icon-upload")),
          ),
        );
        if (!uploadButton) throw new Error("upload button not found in file dialog");
        uploadButton.click();
      }),
    ]);
    await fileChooser.setFiles(filePath);
    await page.waitForTimeout(2500);

    const uploadedRow = page.getByText(safeName, { exact: true }).last();
    const rowVisible = await uploadedRow.isVisible({ timeout: 8000 }).catch(() => false);
    if (rowVisible) {
      await uploadedRow.click();
      await page.getByRole("button", { name: /^Confirm$/ }).last().click();
      await page.waitForTimeout(800);
    }

    return {
      label,
      ok: rowVisible,
      method: "remote file dialog upload",
      fileName: scriptFile.name,
      uploadedName: safeName,
      size: scriptFile.size,
      ...(rowVisible ? {} : { warning: "file uploaded through chooser, but uploaded row was not found for final selection" }),
    };
  } catch (error) {
    return {
      label,
      ok: false,
      fileName: scriptFile.name,
      reason: `file upload failed: ${String(error?.message || error).slice(0, 180)}`,
    };
  }
}

function parsePlanResources(plan) {
  const match = String(plan || "").match(/(\d+)核\/(\d+)块\/(\d+)GiB/);
  if (!match) {
    throw new Error(`无法解析套餐资源: ${plan}`);
  }
  return {
    cpu: Number(match[1]),
    gpu: Number(match[2]),
    memory: Number(match[3]),
  };
}

function buildDirectSubmitPayload(form) {
  const resources = parsePlanResources(form.plan);
  const image = IMAGE_FULL_NAMES[form.image];
  if (!image) throw new Error(`未知镜像: ${form.image}`);
  return {
    app: "pytorch-ngc-job",
    params: {},
    runtime_params: {
      endpoints: [
        { control: 3, domain: null, name: "openssh", protocol: 3, target_port: 22, type: 1 },
        { control: 3, domain: null, name: "webssh", protocol: 1, target_port: 7681, type: 1 },
        { control: 3, domain: null, name: "jupyter-lab", protocol: 1, target_port: 8888, type: 1 },
      ],
      userMode: "starlight",
      jobname: form.jobName,
      image,
      cluster: form.cluster,
      partition: form.partition,
      node: 1,
      _resources: JSON.stringify(resources),
      ...resources,
      diff: {},
    },
  };
}

async function starlightApi(pathname, options = {}) {
  let cookie = await readStoredCookieHeader();
  if (!cookie && hasStarlightCredentials()) {
    await refreshStarlightAuth({ force: true });
    cookie = await readStoredCookieHeader();
  }
  if (!cookie) throw new Error("没有可用星光 Cookie，请先导入或刷新登录态");
  const headers = {
    accept: "application/json, text/plain, */*",
    cookie,
    origin: STARLIGHT_ORIGIN,
    referer: `${STARLIGHT_ORIGIN}/`,
    ...(options.headers || {}),
  };
  if (options.body && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(`${STARLIGHT_ORIGIN}${pathname}`, {
    ...options,
    headers,
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  const result = { status: response.status, ok: response.ok, body };
  if (!options.__retriedAfterAuthRefresh && hasStarlightCredentials() && isAuthFailure(result)) {
    await refreshStarlightAuth({ force: true });
    return starlightApi(pathname, { ...options, __retriedAfterAuthRefresh: true });
  }
  return result;
}

async function checkStarlightAuth() {
  if (!existsSync(AUTH_STATE)) {
    return {
      exists: false,
      valid: false,
      message: "未找到上游登录态文件",
      response: null,
    };
  }
  try {
    const response = await starlightApi("/api/user/user/self", { method: "GET" });
    const code = response.body?.code;
    const valid = response.ok && (code === 200 || code === 0 || response.body?.spec || response.body?.data);
    return {
      exists: true,
      valid: Boolean(valid),
      message: valid ? "上游登录态有效" : response.body?.info || `上游登录态校验失败 HTTP ${response.status}`,
      response,
    };
  } catch (error) {
    return {
      exists: true,
      valid: false,
      message: String(error?.message || error),
      response: null,
    };
  }
}

async function findUserQuota(cluster, partition) {
  const self = await starlightApi("/api/user/user/self", { method: "GET" });
  const userName = self.body?.spec?.user_name;
  if (!userName) {
    return { ok: false, reason: "未获取到星光用户名" };
  }
  const quotas = await starlightApi(`/api/kcluster/partitions/userquotas/user/${encodeURIComponent(userName)}`, {
    method: "GET",
  });
  const quota = (quotas.body?.spec || []).find((item) => item.cluster_name === cluster && item.partition_name === partition);
  if (!quota) {
    return {
      ok: false,
      userName,
      reason: `当前账号没有 ${cluster}/${partition} 的 quota，不能提交该资源。`,
    };
  }
  return { ok: true, userName, quota };
}

function summarizeJobStatus(body) {
  const spec = body?.spec;
  if (!spec) {
    return {
      label: body?.info || "未获取到作业状态",
      phase: "unknown",
      done: false,
      status: null,
      reason: body?.info || "",
    };
  }

  const children = Array.isArray(spec.children) ? spec.children : Array.isArray(spec.childrenRunning) ? spec.childrenRunning : [];
  const child = children[0] || {};
  const reason = String(child.reason || spec.reason || "");
  const statusText = reason.match(/Status:\s*\n?\s*([A-Za-z]+)/)?.[1] || "";
  const hasEndTime = Boolean(spec.end_at && !String(spec.end_at).startsWith("0001-01-01"));
  const exitCode = Number(spec.exit_code || child.exit_code || 0);

  if (hasEndTime || spec.status === 7 || child.status === 7) {
    return {
      label: exitCode === 0 ? "已完成" : "异常结束",
      phase: exitCode === 0 ? "succeeded" : "failed",
      done: true,
      status: spec.status,
      childStatus: child.status,
      reason,
    };
  }
  if (/Running/i.test(statusText) || child.status === 4) {
    return {
      label: "运行中",
      phase: "running",
      done: false,
      status: spec.status,
      childStatus: child.status,
      reason,
    };
  }
  if (/Pending|Unschedulable/i.test(statusText) || spec.status === 0 || child.status === 0) {
    return {
      label: "排队中",
      phase: "pending",
      done: false,
      status: spec.status,
      childStatus: child.status,
      reason,
    };
  }
  if (/Failed|Error|ImagePullBackOff|CrashLoopBackOff/i.test(reason)) {
    return {
      label: "异常",
      phase: "failed",
      done: true,
      status: spec.status,
      childStatus: child.status,
      reason,
    };
  }
  return {
    label: statusText || "状态同步中",
    phase: "syncing",
    done: false,
    status: spec.status,
    childStatus: child.status,
    reason,
  };
}

function isSsh22Proxy(proxy) {
  return proxy?.protocol === 3 && Number(proxy?.target_port) === 22;
}

function hasDesiredSshProxy(spec) {
  return (spec?.proxies || []).some((proxy) => isSsh22Proxy(proxy) && proxy.name === "test" && proxy.type === 2 && Number(proxy.source_port) >= 10000);
}

async function updateStarlightJobSpec(spec) {
  return starlightApi("/api/job/update", {
    method: "POST",
    body: JSON.stringify(spec),
  });
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureNonFixedSshAccess(cluster, jobId, spec) {
  if (!spec || hasDesiredSshProxy(spec)) {
    return { spec, changed: false, message: "SSH 非固定端口入口已存在" };
  }

  const existingProxies = spec.proxies || [];
  const hasAnySsh22 = existingProxies.some(isSsh22Proxy);
  let workingSpec = spec;

  if (hasAnySsh22) {
    workingSpec = {
      ...workingSpec,
      proxies: existingProxies.filter((proxy) => !isSsh22Proxy(proxy)),
    };
    const removeResponse = await updateStarlightJobSpec(workingSpec);
    if (!removeResponse.ok || removeResponse.body?.code !== 200) {
      throw new Error(`移除旧 SSH 入口失败：${removeResponse.body?.info || `HTTP ${removeResponse.status}`}`);
    }
    await wait(2500);

    const afterRemove = await getStarlightJobStatus(cluster, jobId);
    const afterRemoveSpec = afterRemove.response?.body?.spec;
    if (!afterRemoveSpec) throw new Error("移除旧 SSH 入口后未获取到作业详情");
    if ((afterRemoveSpec.proxies || []).some(isSsh22Proxy)) {
      throw new Error("移除旧 SSH 入口后复查仍存在 SSH/22 入口");
    }
    workingSpec = afterRemoveSpec;
  }

  const nextSpec = {
    ...workingSpec,
    proxies: [
      ...(workingSpec.proxies || []),
      {
        name: "test",
        target_port: 22,
        type: 2,
        domain: null,
        control: 3,
        protocol: 3,
      },
    ],
  };
  const addResponse = await updateStarlightJobSpec(nextSpec);
  if (!addResponse.ok || addResponse.body?.code !== 200) {
    throw new Error(`新增 SSH 非固定端口入口失败：${addResponse.body?.info || `HTTP ${addResponse.status}`}`);
  }
  await wait(2500);

  const finalStatus = await getStarlightJobStatus(cluster, jobId);
  const finalSpec = finalStatus.response?.body?.spec;
  if (!finalSpec) throw new Error("新增 SSH 非固定端口入口后未获取到作业详情");
  if (!hasDesiredSshProxy(finalSpec)) {
    throw new Error("新增 SSH 非固定端口入口后复查未找到 test/SSH/22 入口");
  }

  return { spec: finalSpec, changed: true, message: "已重建 SSH 非固定端口入口" };
}

async function getStarlightJobStatus(cluster, jobId) {
  if (!cluster || !jobId) throw new Error("cluster 和 jobId 不能为空");
  const response = await starlightApi(`/api/job/running/${encodeURIComponent(cluster)}/${encodeURIComponent(jobId)}`, {
    method: "GET",
  });
  return {
    cluster,
    jobId,
    response,
    summary: summarizeJobStatus(response.body),
    checkedAt: new Date().toISOString(),
  };
}

async function listTrackedJobs() {
  const records = await readJobRecords();
  const jobs = [];
  const nextRecords = [];
  for (const record of records) {
    try {
      const status = await getStarlightJobStatus(record.cluster, record.jobId);
      let spec = status.response?.body?.spec;
      if (!spec && record.upstream) {
        jobs.push({
          ...record,
          summary: record.summary || {
            label: "状态同步中",
            phase: "syncing",
            done: false,
            reason: status.response?.body?.info || "",
          },
          checkedAt: status.checkedAt,
          upstream: record.upstream,
          warning: status.response?.body?.info || "本次状态查询未返回详情，沿用上次连接信息",
        });
        nextRecords.push(record);
        continue;
      }
      let accessMessage = "";
      if (spec && status.summary?.phase === "running" && Number(record.resources?.gpu || 0) > 0) {
        try {
          const ensured = await ensureNonFixedSshAccess(record.cluster, record.jobId, spec);
          spec = ensured.spec || spec;
          accessMessage = ensured.message || "";
        } catch (error) {
          accessMessage = `SSH 入口自动配置失败：${String(error?.message || error)}`;
        }
      }
      const upstream = spec
        ? {
            status: spec.status,
            createdAt: spec.created_at,
            updatedAt: spec.updated_at,
            startedAt: spec.started_at,
            endAt: spec.end_at,
            nodeName: spec.node_name,
            ip: spec.ip,
            jobFee: spec.job_fee,
            proxies: spec.proxies || [],
          }
        : null;
      const nextRecord = upstream
        ? { ...record, summary: status.summary, upstream, lastStatusCheckedAt: status.checkedAt, accessMessage }
        : record;
      nextRecords.push(nextRecord);
      jobs.push({
        ...nextRecord,
        summary: status.summary,
        checkedAt: status.checkedAt,
        upstream,
        accessMessage,
      });
    } catch (error) {
      if (record.upstream) {
        jobs.push({
          ...record,
          summary: record.summary || {
            label: "状态同步中",
            phase: "syncing",
            done: false,
            reason: String(error?.message || error),
          },
          checkedAt: new Date().toISOString(),
          upstream: record.upstream,
          warning: `状态查询失败，沿用上次连接信息：${String(error?.message || error)}`,
        });
        nextRecords.push(record);
        continue;
      }
      jobs.push({
        ...record,
        summary: {
          label: "状态查询失败",
          phase: "unknown",
          done: false,
          reason: String(error?.message || error),
        },
        checkedAt: new Date().toISOString(),
        upstream: null,
      });
      nextRecords.push(record);
    }
  }
  await writeJobRecords(nextRecords);
  return { total: jobs.length, jobs };
}

async function runStarlightDirectSubmit(form) {
  await mkdir(RUNS_DIR, { recursive: true });
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(RUNS_DIR, `${runId}-direct.json`);
  const payload = buildDirectSubmitPayload(form);
  const result = {
    runId,
    mode: "direct-api",
    targetUrl: `${STARLIGHT_ORIGIN}/api/job/submit`,
    usedAuthState: existsSync(AUTH_STATE),
    submitted: false,
    payload,
    warnings: [],
  };

  if (form.scriptFile?.name) {
    result.warnings.push("direct API 当前只实现无脚本调试模式；脚本模式需要继续抓星光文件上传接口和 submit 中的脚本字段。");
  }

  if (form.submitMode !== "real") {
    result.warnings.push("direct dry-run：已构造 /api/job/submit payload，但没有发送提交请求。");
    await writeFile(logPath, JSON.stringify(result, null, 2));
    result.log = `/runs/${path.basename(logPath)}`;
    return result;
  }

  if (process.env.ALLOW_REAL_SUBMIT !== "1") {
    result.warnings.push("前端选择了 real，但后端未设置 ALLOW_REAL_SUBMIT=1，所以没有调用星光 /api/job/submit。");
    await writeFile(logPath, JSON.stringify(result, null, 2));
    result.log = `/runs/${path.basename(logPath)}`;
    return result;
  }

  const quota = await findUserQuota(payload.runtime_params.cluster, payload.runtime_params.partition);
  if (!quota.ok) {
    result.warnings.push(quota.reason);
    result.submitResponse = {
      status: 0,
      ok: false,
      body: {
        code: 1600,
        info: quota.reason,
        spec: null,
      },
    };
    await writeFile(logPath, JSON.stringify(result, null, 2));
    result.log = `/runs/${path.basename(logPath)}`;
    return result;
  }

  const submitResponse = await starlightApi("/api/job/submit", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  result.submitResponse = submitResponse;
  result.submitted = submitResponse.ok && submitResponse.body?.code === 200 && Boolean(submitResponse.body?.spec);

  const jobName = submitResponse.body?.spec?.cluster_job_id || payload.runtime_params.jobname;
  const cluster = payload.runtime_params.cluster;
  if (result.submitted) {
    result.runningResponse = await starlightApi(`/api/job/running/${encodeURIComponent(cluster)}/${encodeURIComponent(jobName)}`, {
      method: "GET",
    });
    result.jobRef = {
      cluster,
      jobId: jobName,
      name: submitResponse.body?.spec?.name || payload.runtime_params.jobname,
      workDir: submitResponse.body?.spec?.work_dir || "",
    };
    result.statusSummary = summarizeJobStatus(result.runningResponse.body);
    await upsertJobRecord({
      cluster,
      jobId: jobName,
      name: submitResponse.body?.spec?.name || payload.runtime_params.jobname,
      partition: payload.runtime_params.partition,
      image: payload.runtime_params.image,
      resources: {
        cpu: payload.runtime_params.cpu,
        gpu: payload.runtime_params.gpu,
        memory: payload.runtime_params.memory,
      },
      workDir: submitResponse.body?.spec?.work_dir || "",
      createdAt: submitResponse.body?.spec?.created_at || new Date().toISOString(),
      runId,
      source: "direct-api",
    });
  } else {
    result.warnings.push(`星光提交失败：${submitResponse.body?.info || `HTTP ${submitResponse.status}`}`);
  }

  await writeFile(logPath, JSON.stringify(result, null, 2));
  result.log = `/runs/${path.basename(logPath)}`;
  return result;
}

async function runStarlightDryRun(form) {
  await mkdir(RUNS_DIR, { recursive: true });
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const screenshot = path.join(RUNS_DIR, `${runId}.png`);
  const logPath = path.join(RUNS_DIR, `${runId}.json`);
  const network = [];

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== "false",
  });
  const contextOptions = existsSync(AUTH_STATE) ? { storageState: AUTH_STATE } : {};
  const context = await browser.newContext({
    ...contextOptions,
    viewport: { width: 1440, height: 1000 },
  });
  const storedToken = await readStoredBihuToken();
  if (storedToken) {
    await context.addInitScript((token) => {
      const keys = [".nscc-gz.cn", "Bihu-Token", "bihu-token", "token", "Token"];
      for (const key of keys) {
        window.localStorage.setItem(key, token);
        window.sessionStorage.setItem(key, token);
      }
      document.cookie = `_c_WBKFRo=${document.cookie.match(/(?:^|; )_c_WBKFRo=([^;]+)/)?.[1] || ""}; path=/; domain=.starlight.nscc-gz.cn`;
      document.cookie = `Bihu-Token=${token}; path=/; domain=.starlight.nscc-gz.cn`;
    }, storedToken);
  }
  const page = await context.newPage();
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/api/")) network.push({ type: "request", method: req.method(), url, postData: req.postData() });
  });
  page.on("response", async (resp) => {
    const url = resp.url();
    if (url.includes("/api/")) network.push({ type: "response", status: resp.status(), url });
  });

  const result = {
    runId,
    targetUrl: TARGET_URL,
    usedAuthState: existsSync(AUTH_STATE),
    submitted: false,
    fillResults: [],
    warnings: [],
  };

  try {
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
    result.finalUrl = page.url();
    result.title = await page.title().catch(() => "");

    const pageText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    result.pageTextSample = pageText.slice(0, 800);
    if (/登录|账号|密码|验证码/.test(pageText) && !/作业名称|镜像选择|集群选择|分区选择/.test(pageText)) {
      result.needsLogin = true;
      result.warnings.push("当前没有可用星光登录态，页面停在登录/认证相关界面。先运行 npm run auth 保存登录态。");
    }

    result.fillResults.push(await fillInputBySelector(page, 'input[name="jobname"]', form.jobName, "作业名称"));
    result.fillResults.push(await chooseImageOption(page, form.image));
    result.fillResults.push(await clickRadioValue(page, form.cluster, "集群选择"));
    result.fillResults.push(await clickRadioValue(page, form.partition, "分区选择"));
    result.fillResults.push(await clickRadioValue(page, form.plan, "套餐选择"));
    result.fillResults.push(await chooseScriptFile(page, form.scriptFile, runId));

    if (form.submitMode === "real" && process.env.ALLOW_REAL_SUBMIT === "1") {
      const submitButton = page.getByRole("button", { name: /提交|确定|创建|启动/ }).last();
      await submitButton.click();
      result.submitted = true;
      await page.waitForTimeout(3000);
    } else if (form.submitMode === "real") {
      result.warnings.push("前端选择了 real，但后端未设置 ALLOW_REAL_SUBMIT=1，所以没有点击星光提交按钮。");
    } else {
      result.warnings.push("dry-run 模式：已尝试填表，但没有点击最终提交按钮。");
    }

    await page.screenshot({ path: screenshot, fullPage: true });
    result.screenshot = `/runs/${path.basename(screenshot)}`;
    result.network = network.slice(-80);
    await writeFile(logPath, JSON.stringify(result, null, 2));
    result.log = `/runs/${path.basename(logPath)}`;
    return result;
  } finally {
    await browser.close();
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type,accept",
        "cache-control": "no-store",
      });
      return res.end();
    }
    if (req.method === "GET" && url.pathname === "/") {
      return serveFile(res, path.join(__dirname, "public", "index.html"), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname.startsWith("/runs/")) {
      const safeName = path.basename(url.pathname);
      const contentType = safeName.endsWith(".png") ? "image/png" : "application/json; charset=utf-8";
      return serveFile(res, path.join(RUNS_DIR, safeName), contentType);
    }
    if (req.method === "POST" && url.pathname === "/api/dry-run") {
      const form = await readBody(req);
      const result = await runStarlightDryRun(form);
      return json(res, 200, result);
    }
    if (req.method === "POST" && url.pathname === "/api/direct-submit") {
      const form = await readBody(req);
      const result = await runStarlightDirectSubmit(form);
      return json(res, 200, result);
    }
    if (req.method === "GET" && url.pathname === "/api/job-status") {
      const result = await getStarlightJobStatus(url.searchParams.get("cluster"), url.searchParams.get("jobId"));
      return json(res, 200, result);
    }
    if (req.method === "GET" && url.pathname === "/api/jobs") {
      const result = await listTrackedJobs();
      return json(res, 200, result);
    }
    if (req.method === "POST" && url.pathname === "/api/jobs/delete") {
      const form = await readBody(req);
      const result = await deleteJobRecord(form.cluster, form.jobId);
      return json(res, 200, result);
    }
    if (req.method === "POST" && url.pathname === "/api/auth/refresh") {
      const result = await refreshStarlightAuth({ force: true });
      const auth = await checkStarlightAuth();
      return json(res, 200, {
        ...result,
        authValid: auth.valid,
        authMessage: auth.message,
      });
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      const auth = await checkStarlightAuth();
      return json(res, 200, {
        targetUrl: TARGET_URL,
        authStateExists: auth.exists,
        authValid: auth.valid,
        authMessage: auth.message,
        authStatePath: AUTH_STATE,
        autoRefreshAvailable: hasStarlightCredentials(),
        autoRefreshIntervalMs: AUTH_REFRESH_INTERVAL_MS,
        dryRunOnly: process.env.ALLOW_REAL_SUBMIT !== "1",
        directApiAvailable: auth.valid,
      });
    }
    json(res, 404, { error: "not found" });
  } catch (error) {
    json(res, 500, { error: String(error?.stack || error) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Starlight mini test on http://0.0.0.0:${PORT}`);
  console.log(`Target: ${TARGET_URL}`);
  console.log(`Auto auth refresh: ${hasStarlightCredentials() ? "enabled" : "disabled (set STARLIGHT_USERNAME/STARLIGHT_PASSWORD)"}`);
  if (hasStarlightCredentials() && AUTH_REFRESH_INTERVAL_MS > 0) {
    setInterval(() => {
      refreshStarlightAuth()
        .then((result) => {
          if (result.refreshed) console.log(`Refreshed Starlight auth at ${result.refreshedAt}`);
        })
        .catch((error) => console.error(`Starlight auth refresh failed: ${String(error?.message || error)}`));
    }, AUTH_REFRESH_INTERVAL_MS).unref();
  }
});
