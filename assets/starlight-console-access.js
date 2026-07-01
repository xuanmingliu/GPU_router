(function () {
  if (window.__cxStarlightConsoleAccessLoaded) return;
  window.__cxStarlightConsoleAccessLoaded = true;

  let timer = null;
  let latestJobs = [];
  const SSH_PASSWORD = "Lzq13538255650";

  function isConsolePage() {
    return location.pathname.startsWith("/console");
  }

  function buildAccess(proxy) {
    const id = proxy && proxy.id;
    const port = proxy && proxy.source_port;
    if (!id || !port) return null;
    const name = String(proxy.name || "").toLowerCase();
    if (proxy.protocol === 1) {
      return {
        type: name.includes("jupyter") ? "jupyter" : "webssh",
        label: name.includes("jupyter") ? "Jupyter Lab" : "WebSSH 网页终端",
        url: `http://${id}.proxy.nscc-gz.cn:${port}/`,
      };
    }
    if (proxy.protocol === 3) {
      const host = "proxy.nscc-gz.cn";
      const user = proxy.user_name || "thzskj_wfeng33_1";
      return {
        type: "ssh",
        label: "SSH 连接",
        host,
        port: String(port),
        user,
        command: `ssh ${user}@${host} -p ${port}`,
      };
    }
    return null;
  }

  function accessList(job) {
    const proxies = (job.upstream && job.upstream.proxies) || [];
    const list = proxies.map(buildAccess).filter(Boolean);
    const rank = { webssh: 1, jupyter: 2, ssh: 3 };
    return list.sort((a, b) => (rank[a.type] || 9) - (rank[b.type] || 9));
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
    return Promise.resolve();
  }

  function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    if (hours > 0) return `${hours}小时${String(minutes).padStart(2, "0")}分`;
    if (minutes > 0) return `${minutes}分${String(rest).padStart(2, "0")}秒`;
    return `${rest}秒`;
  }

  function runtimeSeconds(job) {
    const start = job.runtime && job.runtime.startedAt;
    if (!start) return job.runtime && job.runtime.elapsedSeconds;
    const startMs = new Date(start).getTime();
    if (!Number.isFinite(startMs)) return job.runtime && job.runtime.elapsedSeconds;
    const end = job.runtime && job.runtime.endedAt;
    const endMs = end ? new Date(end).getTime() : Date.now();
    return Math.max(0, Math.floor(((Number.isFinite(endMs) ? endMs : Date.now()) - startMs) / 1000));
  }

  async function readJsonResponse(response) {
    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const sample = text.replace(/\s+/g, " ").slice(0, 160);
      throw new Error(`接口返回的不是 JSON：HTTP ${response.status}${sample ? `，内容：${sample}` : ""}`);
    }
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (error) {
      throw new Error(`接口 JSON 解析失败：${error.message}`);
    }
    if (!response.ok) {
      throw new Error(payload.error || payload.reason || payload.message || `HTTP ${response.status}`);
    }
    return payload;
  }

  function clearInlineAccess() {
    document.querySelectorAll(".cx-instance-inline-access").forEach((node) => node.remove());
  }

  function normalizePageSizeText() {
    document.querySelectorAll("body *").forEach((node) => {
      if (node.childNodes.length !== 1 || node.firstChild.nodeType !== Node.TEXT_NODE) return;
      if (node.textContent && node.textContent.includes("5条/页")) {
        node.firstChild.nodeValue = node.firstChild.nodeValue.replaceAll("5条/页", "10条/页");
      }
    });
  }

  function ensureDialog() {
    let dialog = document.getElementById("cx-starlight-connect-dialog");
    if (dialog) return dialog;
    dialog = document.createElement("div");
    dialog.id = "cx-starlight-connect-dialog";
    dialog.className = "cx-connect-dialog";
    dialog.innerHTML = `
      <div class="cx-connect-card" role="dialog" aria-modal="true">
        <div class="cx-connect-head">
          <div>
            <div class="cx-connect-title">连接方式</div>
            <div class="cx-connect-subtitle"></div>
          </div>
          <button class="cx-connect-close" type="button" aria-label="关闭">×</button>
        </div>
        <div class="cx-connect-body"></div>
      </div>
    `;
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog || event.target.closest(".cx-connect-close")) {
        dialog.classList.remove("cx-open");
      }
    });
    document.body.appendChild(dialog);
    return dialog;
  }

  function field(label, value, options = {}) {
    const row = document.createElement("div");
    row.className = "cx-connect-field";
    const text = document.createElement(options.href ? "a" : "span");
    text.className = "cx-connect-value";
    text.textContent = options.displayValue || value || "-";
    if (options.href) {
      text.href = options.href;
      text.target = "_blank";
      text.rel = "noopener";
    }
    row.innerHTML = `<span class="cx-connect-label">${label}</span>`;
    row.appendChild(text);
    const copyValue = options.copyValue || value;
    if (copyValue && options.copy !== false) {
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "cx-connect-copy";
      copy.textContent = "复制";
      copy.addEventListener("click", () => {
        copyText(copyValue).then(() => {
          copy.textContent = "已复制";
          setTimeout(() => {
            copy.textContent = "复制";
          }, 1200);
        });
      });
      row.appendChild(copy);
    }
    return row;
  }

  function section(title, children) {
    const wrap = document.createElement("section");
    wrap.className = "cx-connect-section";
    const head = document.createElement("div");
    head.className = "cx-connect-section-title";
    head.textContent = title;
    wrap.appendChild(head);
    const content = document.createElement("div");
    content.className = "cx-connect-section-content";
    for (const child of children) content.appendChild(child);
    wrap.appendChild(content);
    return wrap;
  }

  function openConnectDialog(job) {
    const dialog = ensureDialog();
    const body = dialog.querySelector(".cx-connect-body");
    const title = job.name || job.jobId || "实例";
    const phaseLabel = (job.summary && job.summary.label) || "状态同步中";
    const spec = [job.partition, job.resources ? `${job.resources.cpu || 0}核/${job.resources.gpu || 0}卡/${job.resources.memory || 0}GiB` : ""]
      .filter(Boolean)
      .join(" · ");
    dialog.querySelector(".cx-connect-subtitle").textContent = `${title} · ${phaseLabel}${spec ? ` · ${spec}` : ""}`;
    body.innerHTML = "";
    const links = accessList(job);
    const ssh = links.find((item) => item.type === "ssh");
    const phase = job.summary && job.summary.phase;

    if (phase !== "running") {
      const notice = document.createElement("div");
      notice.className = "cx-connect-notice";
      notice.textContent = `${title} 当前不是运行中；如果没有入口，说明该实例已停止或入口尚未生成。`;
      body.appendChild(notice);
    }

    if (ssh) {
      body.appendChild(section("SSH 连接信息", [
        field("主机名", ssh.host),
        field("端口", ssh.port),
        field("连接命令", ssh.command),
        field("密码", SSH_PASSWORD, { displayValue: "************", copyValue: SSH_PASSWORD }),
      ]));
    }
    if (!body.childNodes.length) {
      const empty = document.createElement("div");
      empty.className = "cx-connect-notice";
      empty.textContent = `${title} 暂无可用连接信息。`;
      body.appendChild(empty);
    }
    dialog.classList.add("cx-open");
  }

  async function deleteRecord(job, row, button) {
    const name = job.name || job.jobId || "该实例";
    if (!window.confirm(`确认只删除这一条记录：${name}？\n这只会清除控制台展示记录，不会影响实际实例。`)) return;
    const original = button.textContent;
    button.textContent = "删除中";
    button.disabled = true;
    try {
      const response = await fetch("/starlight-api/jobs/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ cluster: job.cluster, jobId: job.jobId }),
      });
      const payload = await readJsonResponse(response);
      if (payload.error) throw new Error(payload.error || "删除失败");
      latestJobs = latestJobs.filter((item) => !(item.cluster === job.cluster && item.jobId === job.jobId));
      row.remove();
      normalizePageSizeText();
    } catch (error) {
      button.textContent = original;
      button.disabled = false;
      window.alert(`删除失败：${String(error && error.message ? error.message : error)}`);
    }
  }

  function findInstanceRows(jobId) {
    return Array.from(document.querySelectorAll("tr.v-data-table__tr")).filter((row) => {
      const firstCell = row.querySelector("td");
      return firstCell && (firstCell.innerText || "").includes(jobId);
    });
  }

  function hideInstanceNote(row) {
    const firstCell = row.querySelector("td");
    if (!firstCell) return;
    const walker = document.createTreeWalker(firstCell, NodeFilter.SHOW_TEXT);
    const targets = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if ((node.nodeValue || "").trim().startsWith("备注：")) {
        targets.push(node);
      }
    }
    for (const node of targets) {
      let el = node.parentElement;
      while (el && el !== firstCell) {
        const text = (el.innerText || el.textContent || "").trim();
        if (text.startsWith("备注：")) break;
        el = el.parentElement;
      }
      if (el && el !== firstCell) {
        el.classList.add("cx-hide-instance-note");
      } else {
        node.nodeValue = "";
      }
    }
  }

  function appendInlineAccess(row, job) {
    if (row.querySelector(".cx-instance-inline-access")) return;
    hideInstanceNote(row);
    const cells = row.querySelectorAll("td");
    const actionsCell = cells[cells.length - 1];
    if (!actionsCell) return;
    const actionsTarget = actionsCell.querySelector("div") || actionsCell;
    const box = document.createElement("div");
    box.className = "cx-instance-inline-access";

    if (job.runtime?.startedAt || job.runtime?.elapsedSeconds != null) {
      const runtime = document.createElement("div");
      runtime.className = "cx-instance-runtime";
      runtime.textContent = `已运行 ${formatDuration(runtimeSeconds(job))}`;
      box.appendChild(runtime);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "cx-instance-inline-link";
    button.textContent = "查看启动指令";
    button.title = job.name || job.jobId || "";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openConnectDialog(job);
    });
    box.appendChild(button);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "cx-instance-inline-link cx-instance-delete-link";
    deleteButton.textContent = "删除此条记录";
    deleteButton.title = job.name || job.jobId || "";
    deleteButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteRecord(job, row, deleteButton);
    });
    box.appendChild(deleteButton);

    actionsTarget.appendChild(box);
  }

  function renderRows() {
    if (!isConsolePage()) {
      clearInlineAccess();
      return;
    }
    clearInlineAccess();
    for (const job of latestJobs) {
      const jobId = job.jobId || job.name;
      if (!jobId) continue;
      for (const row of findInstanceRows(jobId)) {
        appendInlineAccess(row, job);
      }
    }
    normalizePageSizeText();
  }

  async function load() {
    if (!isConsolePage()) {
      clearInlineAccess();
      return;
    }
    try {
      const response = await fetch("/starlight-api/jobs", { cache: "no-store", credentials: "same-origin" });
      const payload = await readJsonResponse(response);
      latestJobs = payload.jobs || [];
      renderRows();
    } catch {
      clearInlineAccess();
    }
  }

  function schedule() {
    clearInterval(timer);
    if (isConsolePage()) {
      load();
      timer = setInterval(() => {
        load();
        renderRows();
      }, 15000);
      setTimeout(renderRows, 3000);
      setTimeout(renderRows, 8000);
      setTimeout(normalizePageSizeText, 12000);
    } else {
      clearInlineAccess();
    }
  }

  const pushState = history.pushState;
  const replaceState = history.replaceState;
  history.pushState = function () {
    const result = pushState.apply(this, arguments);
    setTimeout(schedule, 100);
    return result;
  };
  history.replaceState = function () {
    const result = replaceState.apply(this, arguments);
    setTimeout(schedule, 100);
    return result;
  };
  window.addEventListener("popstate", () => setTimeout(schedule, 100));
  window.addEventListener("load", schedule);
  schedule();
})();
