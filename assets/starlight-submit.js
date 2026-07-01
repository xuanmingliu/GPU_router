(function () {
  if (window.__cxStarlightSubmitLoaded) return;
  window.__cxStarlightSubmitLoaded = true;

  const partitionsByCluster = {
    k8s_xingyiAI_2: [["xy-a100", "xy-a100"], ["xy-a800x", "xy-a800x"], ["xy-h100", "xy-h100"], ["xy-h100x", "xy-h100x"], ["xy-v100x", "xy-v100x"]],
    k8s_xingyiAI: [["xy-a800", "xy-a800"], ["a800-mig-3g.40gb-week", "a800-mig-3g.40gb-week"], ["mig-realtime", "mig-realtime"]],
    k8s_xingyi: [["x86-cpu", "x86-cpu"]],
    k8s_jove: [["gpu-a100", "gpu-a100"]],
    k8s_ss01: [["gpu-a100nv", "gpu-a100nv"]],
    k8s_venus: [["venus-gpu", "venus-gpu"], ["venus-gpu-localdisk", "venus-gpu-localdisk"], ["venus-bigmem", "venus-bigmem"]],
  };

  const plansByClusterPartition = {
    "k8s_xingyi/x86-cpu": [["default:4核/0块/30GiB", "4核/0块/30GiB"], ["default:8核/0块/60GiB", "8核/0块/60GiB"], ["default:16核/0块/120GiB", "16核/0块/120GiB"], ["default:32核/0块/240GiB", "32核/0块/240GiB"], ["default:64核/0块/480GiB", "64核/0块/480GiB"]],
    "k8s_xingyiAI/xy-a800": [["default:6核/1块/120GiB", "6核/1块/120GiB"], ["default:12核/2块/240GiB", "12核/2块/240GiB"], ["default:24核/4块/480GiB", "24核/4块/480GiB"], ["default:48核/8块/960GiB", "48核/8块/960GiB"]],
    "k8s_xingyiAI/a800-mig-3g.40gb-week": [["default:6核/1块/60GiB", "6核/1块/60GiB"], ["default:12核/2块/120GiB", "12核/2块/120GiB"], ["default:24核/4块/240GiB", "24核/4块/240GiB"]],
    "k8s_xingyiAI/mig-realtime": [["default:4核/1块/41GiB", "4核/1块/41GiB"]],
    "k8s_xingyiAI_2/xy-a100": [["default:12核/1块/120GiB", "12核/1块/120GiB"], ["default:24核/2块/240GiB", "24核/2块/240GiB"], ["default:48核/4块/480GiB", "48核/4块/480GiB"], ["default:96核/8块/960GiB", "96核/8块/960GiB"]],
    "k8s_xingyiAI_2/xy-a800x": [["default:6核/1块/120GiB", "6核/1块/120GiB"], ["default:12核/2块/240GiB", "12核/2块/240GiB"], ["default:24核/4块/480GiB", "24核/4块/480GiB"], ["default:48核/8块/960GiB", "48核/8块/960GiB"]],
    "k8s_xingyiAI_2/xy-h100": [["default:14核/1块/240GiB", "14核/1块/240GiB"], ["default:28核/2块/480GiB", "28核/2块/480GiB"], ["default:56核/4块/960GiB", "56核/4块/960GiB"], ["default:112核/8块/1920GiB", "112核/8块/1920GiB"]],
    "k8s_xingyiAI_2/xy-h100x": [["default:14核/1块/240GiB", "14核/1块/240GiB"], ["default:28核/2块/480GiB", "28核/2块/480GiB"], ["default:56核/4块/960GiB", "56核/4块/960GiB"], ["default:112核/8块/1920GiB", "112核/8块/1920GiB"]],
    "k8s_xingyiAI_2/xy-v100x": [["default:12核/1块/60GiB", "12核/1块/60GiB"], ["default:24核/2块/120GiB", "24核/2块/120GiB"], ["default:48核/4块/240GiB", "48核/4块/240GiB"]],
    "k8s_jove/gpu-a100": [["default:6核/1块/120GiB", "6核/1块/120GiB"], ["default:12核/2块/240GiB", "12核/2块/240GiB"], ["default:24核/4块/480GiB", "24核/4块/480GiB"], ["default:48核/8块/960GiB", "48核/8块/960GiB"]],
    "k8s_ss01/gpu-a100nv": [["default:7核/1块/120GiB", "7核/1块/120GiB"], ["default:14核/2块/240GiB", "14核/2块/240GiB"], ["default:28核/4块/480GiB", "28核/4块/480GiB"], ["default:56核/8块/960GiB", "56核/8块/960GiB"]],
    "k8s_venus/venus-gpu": [["default:6核/1块/60GiB", "6核/1块/60GiB"], ["default:12核/2块/120GiB", "12核/2块/120GiB"], ["default:24核/4块/240GiB", "24核/4块/240GiB"]],
    "k8s_venus/venus-gpu-localdisk": [["default:8核/0块/70GiB", "8核/0块/70GiB"], ["default:5核/1块/43GiB", "5核/1块/43GiB"], ["default:14核/2块/120GiB", "14核/2块/120GiB"], ["default:28核/4块/240GiB", "28核/4块/240GiB"], ["default:8核/4块/240GiB", "8核/4块/240GiB"]],
    "k8s_venus/venus-bigmem": [["default:9核/0块/185GiB", "9核/0块/185GiB"], ["default:18核/0块/370GiB", "18核/0块/370GiB"], ["default:36核/0块/740GiB", "36核/0块/740GiB"]],
  };

  let selectedScriptFile = null;
  let highlightedScriptFile = null;
  let backendDryRunOnly = false;
  let jobStatusTimer = null;
  const starlightBackendOrigin = "https://gpu-router-starlight.onrender.com";
  const remoteFiles = [{
    name: "HDD_POOL",
    owner: "-",
    permission: "Lrwxrwxrwx",
    type: "符号链接（文件夹）",
    size: "-",
    modified: "2026-04-07 14:18:10",
    file: null,
  }];

  const resourceCards = [
    {
      title: "CPU云主机（通用计算）",
      chip: "CPU",
      model: "x86 CPU",
      cluster: "k8s_xingyi",
      partition: "x86-cpu",
      plan: "default:4核/0块/30GiB",
      specs: ["4-64 核 CPU", "30-480 GiB 内存", "无 GPU 调试/编译环境"],
      desc: "适合数据预处理、编译、轻量推理和通用计算任务。",
      accent: "#1f5b3b",
    },
    {
      title: "NVIDIA A100 80GB",
      chip: "GPU",
      model: "A100",
      cluster: "k8s_xingyiAI_2",
      partition: "xy-a100",
      plan: "default:12核/1块/120GiB",
      specs: ["1-8 块 GPU", "12-96 核 CPU", "120-960 GiB 内存"],
      desc: "适合大模型训练、精调、科学计算和高吞吐推理。",
      accent: "#16a34a",
    },
    {
      title: "NVIDIA A800",
      chip: "GPU",
      model: "A800",
      cluster: "k8s_xingyiAI_2",
      partition: "xy-a800x",
      plan: "default:6核/1块/120GiB",
      specs: ["1-8 块 GPU", "6-48 核 CPU", "120-960 GiB 内存"],
      desc: "适合训练、批量推理和 CUDA/PyTorch 容器作业。",
      accent: "#0891b2",
    },
    {
      title: "NVIDIA A800 MIG",
      chip: "GPU",
      model: "A800 MIG",
      cluster: "k8s_xingyiAI",
      partition: "a800-mig-3g.40gb-week",
      plan: "default:6核/1块/60GiB",
      specs: ["1-4 块 GPU", "6-24 核 CPU", "60-240 GiB 内存"],
      desc: "适合轻量训练、Notebook 调试和中小规模推理任务。",
      accent: "#0f766e",
    },
    {
      title: "NVIDIA A800 实时实例",
      chip: "GPU",
      model: "A800 RT",
      cluster: "k8s_xingyiAI",
      partition: "mig-realtime",
      plan: "default:4核/1块/41GiB",
      specs: ["1 块 GPU", "4 核 CPU", "41 GiB 内存"],
      desc: "适合低延迟交互式调试、快速验证和小型推理服务。",
      accent: "#0284c7",
    },
    {
      title: "NVIDIA H100",
      chip: "GPU",
      model: "H100",
      cluster: "k8s_xingyiAI_2",
      partition: "xy-h100",
      plan: "default:14核/1块/240GiB",
      specs: ["1-8 块 GPU", "14-112 核 CPU", "240-1920 GiB 内存"],
      desc: "适合高性能训练、Transformer 加速和大规模推理。",
      accent: "#7c3aed",
    },
    {
      title: "NVIDIA H100 高配",
      chip: "GPU",
      model: "H100X",
      cluster: "k8s_xingyiAI_2",
      partition: "xy-h100x",
      plan: "default:14核/1块/240GiB",
      specs: ["1-8 块 GPU", "14-112 核 CPU", "240-1920 GiB 内存"],
      desc: "面向更高吞吐训练和多卡任务的 H100 资源池。",
      accent: "#4f46e5",
    },
    {
      title: "NVIDIA V100",
      chip: "GPU",
      model: "V100",
      cluster: "k8s_xingyiAI_2",
      partition: "xy-v100x",
      plan: "default:12核/1块/60GiB",
      specs: ["1-4 块 GPU", "12-48 核 CPU", "60-240 GiB 内存"],
      desc: "适合中小规模训练、教学实验和兼容性验证。",
      accent: "#dc2626",
    },
    {
      title: "NVIDIA A100 通用池",
      chip: "GPU",
      model: "A100",
      cluster: "k8s_jove",
      partition: "gpu-a100",
      plan: "default:6核/1块/120GiB",
      specs: ["1-8 块 GPU", "6-48 核 CPU", "120-960 GiB 内存"],
      desc: "适合稳定训练、模型精调和通用 GPU 计算任务。",
      accent: "#15803d",
    },
    {
      title: "NVIDIA A100 NVLink",
      chip: "GPU",
      model: "A100NV",
      cluster: "k8s_ss01",
      partition: "gpu-a100nv",
      plan: "default:7核/1块/120GiB",
      specs: ["1-8 块 GPU", "7-56 核 CPU", "120-960 GiB 内存"],
      desc: "适合多卡通信压力更高的分布式训练任务。",
      accent: "#059669",
    },
    {
      title: "NVIDIA GPU 通用型",
      chip: "GPU",
      model: "GPU",
      cluster: "k8s_venus",
      partition: "venus-gpu",
      plan: "default:6核/1块/60GiB",
      specs: ["1-4 块 GPU", "6-24 核 CPU", "60-240 GiB 内存"],
      desc: "适合教学实验、算法验证和轻中量级训练作业。",
      accent: "#9333ea",
    },
    {
      title: "NVIDIA GPU 本地盘",
      chip: "GPU",
      model: "GPU SSD",
      cluster: "k8s_venus",
      partition: "venus-gpu-localdisk",
      plan: "default:5核/1块/43GiB",
      specs: ["0-4 块 GPU", "5-28 核 CPU", "43-240 GiB 内存"],
      desc: "适合需要本地临时盘吞吐的数据处理和训练任务。",
      accent: "#c2410c",
    },
    {
      title: "CPU大内存实例",
      chip: "CPU",
      model: "BigMem",
      cluster: "k8s_venus",
      partition: "venus-bigmem",
      plan: "default:9核/0块/185GiB",
      specs: ["9-36 核 CPU", "185-740 GiB 内存", "无 GPU"],
      desc: "适合内存敏感的数据分析、预处理和 CPU 计算任务。",
      accent: "#475569",
    },
  ];

  function el(id) {
    return document.getElementById(id);
  }

  function setOptions(select, options) {
    select.innerHTML = "";
    for (const [value, label] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    }
  }

  function formatFileSize(size) {
    if (size < 1024) return `${size}.00 B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KiB`;
    return `${(size / 1024 / 1024).toFixed(2)} MiB`;
  }

  function formatDate(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        resolve(result.includes(",") ? result.split(",").pop() : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function renderRemoteFiles() {
    const list = el("cx-remote-file-list");
    list.innerHTML = "";
    for (const item of remoteFiles) {
      const row = document.createElement("tr");
      row.className = `cx-file-row${highlightedScriptFile === item ? " cx-selected" : ""}`;
      row.innerHTML = `
        <td>${item.file ? "▤" : "■"} ${item.name}</td>
        <td>${item.owner}</td>
        <td>${item.permission}</td>
        <td>${item.type}</td>
        <td>${item.size}</td>
        <td>${item.modified}</td>
      `;
      row.addEventListener("click", () => {
        if (!item.file) return;
        highlightedScriptFile = item;
        renderRemoteFiles();
      });
      list.appendChild(row);
    }
    el("cx-remote-total").textContent = `Total ${remoteFiles.length}`;
  }

  function updatePlanOptions() {
    const plans = plansByClusterPartition[`${el("cx-cluster").value}/${el("cx-partition").value}`] || [];
    setOptions(el("cx-plan"), plans);
    el("cx-plan").disabled = plans.length === 0;
  }

  function updateDependentOptions() {
    const partitions = partitionsByCluster[el("cx-cluster").value] || [];
    const previous = el("cx-partition").value;
    setOptions(el("cx-partition"), partitions);
    if (partitions.some(([value]) => value === previous)) el("cx-partition").value = previous;
    updatePlanOptions();
  }

  function updateSubmitButton() {
    const button = el("cx-submit");
    button.textContent = backendDryRunOnly ? "后端未开启提交" : "提交作业";
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

  function shouldTryDirectStarlight(error) {
    const message = String(error?.message || error || "");
    return responseLooksUnavailable(message);
  }

  function responseLooksUnavailable(message) {
    return /502|503|504|fetch failed|Failed to fetch|NetworkError|后端接口不可用|不是 JSON|<!DOCTYPE html>|Render|Name or service not known/i.test(message);
  }

  async function fetchStarlightJson(apiPath, options = {}) {
    const normalized = apiPath.replace(/^\/+/, "");
    const sameOriginUrl = `/starlight-api/${normalized}`;
    const directUrl = `${starlightBackendOrigin}/api/${normalized}`;
    try {
      return await readJsonResponse(await fetch(sameOriginUrl, options));
    } catch (error) {
      if (!shouldTryDirectStarlight(error)) throw error;
      return readJsonResponse(await fetch(directUrl, {
        ...options,
        mode: "cors",
        credentials: "omit",
      }));
    }
  }

  async function refreshStatus() {
    try {
      const data = await fetchStarlightJson("status", { cache: "no-store" });
      backendDryRunOnly = data.dryRunOnly;
      const authText = data.authCheckFailed
        ? `后台凭证状态暂未确认：${data.authMessage || "网络临时失败"}`
        : data.authValid
        ? "后台凭证有效"
        : data.authStateExists
          ? `后台凭证失效：${data.authMessage || "需要刷新"}`
          : "未检测到后台凭证";
      el("cx-status").textContent = [
        authText,
        data.dryRunOnly ? "后端当前禁止真实提交" : "后端允许真实提交",
      ].join(" / ");
      updateSubmitButton();
    } catch (error) {
      el("cx-status").textContent = `后端接口不可用：${String(error.message || error)}`;
      backendDryRunOnly = false;
      updateSubmitButton();
    }
  }

  async function buildPayload() {
    const body = {
      jobName: el("cx-job-name").value.trim(),
      image: el("cx-image").value,
      cluster: el("cx-cluster").value,
      partition: el("cx-partition").value,
      plan: el("cx-plan").value,
      submitMode: "real",
      submitEngine: "direct",
    };
    if (selectedScriptFile?.file) {
      body.scriptFile = {
        name: selectedScriptFile.name,
        type: selectedScriptFile.file.type || "application/octet-stream",
        size: selectedScriptFile.file.size,
        contentBase64: await readFileAsBase64(selectedScriptFile.file),
      };
    }
    return body;
  }

  function renderResult(data) {
    const copied = { ...data };
    if (copied.screenshot) copied.screenshot = copied.screenshot.replace(/^\/runs\//, "/starlight-runs/");
    if (copied.log) copied.log = copied.log.replace(/^\/runs\//, "/starlight-runs/");
    el("cx-output").textContent = JSON.stringify(copied, null, 2);
  }

  function setLiveStatus(summary, meta = {}) {
    const box = el("cx-live-status");
    const dot = el("cx-live-dot");
    const label = el("cx-live-label");
    const detail = el("cx-live-detail");
    box.classList.remove("cx-hidden", "cx-phase-pending", "cx-phase-running", "cx-phase-succeeded", "cx-phase-failed", "cx-phase-syncing", "cx-phase-unknown");
    box.classList.add(`cx-phase-${summary?.phase || "unknown"}`);
    dot.textContent = "";
    label.textContent = summary?.label || "状态同步中";
    const parts = [];
    if (meta.jobId) parts.push(`作业ID：${meta.jobId}`);
    if (meta.cluster) parts.push(`集群：${meta.cluster}`);
    if (meta.runtime?.startedAt) parts.push(`开始时间：${new Date(meta.runtime.startedAt).toLocaleString()}`);
    if (meta.runtime?.elapsedSeconds != null) parts.push(`已运行：${formatDuration(meta.runtime.elapsedSeconds)}`);
    if (meta.checkedAt) parts.push(`更新时间：${new Date(meta.checkedAt).toLocaleString()}`);
    if (summary?.reason) {
      const line = String(summary.reason).split("\n").map((item) => item.trim()).find(Boolean);
      if (line) parts.push(line.slice(0, 120));
    }
    detail.textContent = parts.join(" / ");
  }

  function stopJobPolling() {
    if (jobStatusTimer) window.clearInterval(jobStatusTimer);
    jobStatusTimer = null;
  }

  async function fetchJobStatus(jobRef) {
    const params = new URLSearchParams({ cluster: jobRef.cluster, jobId: jobRef.jobId });
    const res = await fetch(`/starlight-api/job-status?${params.toString()}`, { cache: "no-store" });
    const data = await readJsonResponse(res);
    setLiveStatus(data.summary, {
      cluster: data.cluster,
      jobId: data.jobId,
      runtime: data.runtime,
      checkedAt: data.checkedAt,
    });
    if (data.summary?.done) stopJobPolling();
    return data;
  }

  function startJobPolling(jobRef) {
    if (!jobRef?.cluster || !jobRef?.jobId) return;
    stopJobPolling();
    setLiveStatus({ label: "状态同步中", phase: "syncing" }, jobRef);
    fetchJobStatus(jobRef).catch((error) => {
      setLiveStatus({ label: "状态查询失败", phase: "unknown", reason: String(error.message || error) }, jobRef);
    });
    jobStatusTimer = window.setInterval(() => {
      fetchJobStatus(jobRef).catch((error) => {
        setLiveStatus({ label: "状态查询失败", phase: "unknown", reason: String(error.message || error) }, jobRef);
      });
    }, 5000);
  }

  function makeJobName(prefix) {
    const suffix = String(Date.now()).slice(-8);
    return `${prefix}-${suffix}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 30);
  }

  function applyPreset(preset) {
    if (!preset) return;
    const cluster = el("cx-cluster");
    const partition = el("cx-partition");
    const plan = el("cx-plan");
    if (preset.cluster) {
      cluster.value = preset.cluster;
      updateDependentOptions();
    }
    if (preset.partition) {
      partition.value = preset.partition;
      updatePlanOptions();
    }
    if (preset.plan) plan.value = preset.plan;
    if (preset.jobPrefix) el("cx-job-name").value = makeJobName(preset.jobPrefix);
    updateSubmitButton();
  }

  function openOrderPanel(preset) {
    const shell = document.querySelector(".cx-starlight-shell");
    if (!shell) return;
    applyPreset(preset);
    shell.classList.add("cx-open");
    refreshStatus();
  }

  function renderResourceCard(card) {
    const article = document.createElement("article");
    article.className = "cx-market-card w-full bg-white rounded-lg px-6 py-4 flex items-center gap-4";
    article.style.boxShadow = "0px 2px 15px 0px rgba(136, 143, 184, 0.2)";
    article.innerHTML = `
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-3">
          <div class="text-lg font-semibold text-[#333333] whitespace-nowrap overflow-hidden text-ellipsis">${card.title}</div>
          <span class="!text-xs leading-none px-[10px] py-1 rounded-full whitespace-nowrap text-primary !bg-primary !bg-opacity-40">${card.chip}</span>
        </div>
        <div class="text-sm text-gray_text mt-2 leading-6">${card.desc}</div>
        <div class="flex flex-wrap gap-2 mt-3">
          ${card.specs.map((spec) => `<span class="text-sm text-[#666666] bg-[#F5F6FA] px-3 py-1 rounded">${spec}</span>`).join("")}
        </div>
      </div>
      <div class="flex items-center gap-6 ml-auto">
        <div class="text-right">
          <div class="text-base font-semibold text-primary whitespace-nowrap">${card.model}</div>
          <div class="text-xs text-gray_text mt-1 whitespace-nowrap">云容器 · 按实际使用计费</div>
        </div>
        <button class="cx-market-rent v-btn v-theme--light ${card.disabled ? "bg-gray-300 text-gray_text" : "bg-primary text-white"} rounded-lg text-none tracking-normal px-6" type="button" ${card.disabled ? "disabled" : ""}>
          <span class="v-btn__content">
            ${card.disabledText || "立即租用"}
          </span>
        </button>
      </div>
    `;
    article.querySelector(".cx-market-rent").addEventListener("click", () => {
      if (card.disabled) return;
      openOrderPanel({
        cluster: card.cluster,
        partition: card.partition,
        plan: card.plan,
        jobPrefix: `job-${card.model}`,
      });
    });
    return article;
  }

  function mountResourceCards() {
    const container = document.querySelector("#main-container");
    if (!container) return false;
    const existing = document.querySelector(".cx-market-section");
    if (existing) {
      hideOriginalStoreContent();
      return true;
    }
    const section = document.createElement("section");
    section.className = "cx-market-section w-full max-w-[1200px] mx-auto pt-4 pb-2";
    section.innerHTML = `
      <div class="text-base font-semibold ps-2 cursor-default flex items-center gap-3 mb-3 text-[#333333]">
        可用算力
      </div>
      <div class="cx-market-list type-content flex flex-col gap-3"></div>
    `;
    const list = section.querySelector(".cx-market-list");
    resourceCards.forEach((card) => list.appendChild(renderResourceCard(card)));
    container.prepend(section);
    hideOriginalStoreContent();
    return true;
  }

  function hideOriginalStoreContent() {
    const container = document.querySelector("#main-container");
    if (!container) return;
    document.body.classList.add("cx-store-market-only");
    Array.from(container.children).forEach((node) => {
      if (node.classList?.contains("cx-market-section")) return;
      if (!node.hasAttribute("data-cx-original-store-hidden")) {
        node.setAttribute("data-cx-original-display", node.style.display || "");
        node.setAttribute("data-cx-original-store-hidden", "1");
      }
      node.style.display = "none";
    });
  }

  function restoreOriginalStoreContent() {
    document.body.classList.remove("cx-store-market-only");
    document.querySelectorAll("[data-cx-original-store-hidden]").forEach((node) => {
      node.style.display = node.getAttribute("data-cx-original-display") || "";
      node.removeAttribute("data-cx-original-display");
      node.removeAttribute("data-cx-original-store-hidden");
    });
  }

  function mount() {
    if (!isStoreRoute()) return;
    if (document.querySelector(".cx-starlight-shell")) {
      mountResourceCards();
      return;
    }
    const shell = document.createElement("div");
    shell.className = "cx-starlight-shell";
    shell.innerHTML = `
      <section class="cx-starlight-panel">
        <header class="cx-starlight-header">
          <div>
            <h2 class="cx-starlight-title">附中云算力申请</h2>
          </div>
          <button id="cx-close" class="cx-starlight-close" type="button">×</button>
        </header>
        <main class="cx-starlight-body">
          <section class="cx-starlight-card">
            <div class="cx-starlight-grid">
              <div class="cx-starlight-field">
                <label for="cx-job-name">作业名称</label>
                <input id="cx-job-name" value="pytorch-ng-${String(Date.now()).slice(-8)}">
              </div>
              <div class="cx-starlight-field">
                <label for="cx-image">镜像选择</label>
                <select id="cx-image">
                  <option value="ngc-pytorch:25.02-py3-sshd-v3">ngc-pytorch:25.02-py3-sshd-v3 - python=3.12.3 / pytorch=2.7.0 / cuda=12.8</option>
                  <option value="ngc-pytorch:23.12-py3-sshd-v3">ngc-pytorch:23.12-py3-sshd-v3 - python=3.10.12 / pytorch=2.2.0 / cuda=12.3</option>
                  <option value="ngc-pytorch:22.04-py3-sshd-v3">ngc-pytorch:22.04-py3-sshd-v3 - python=3.8.13 / pytorch=1.12.0 / cuda=11.6</option>
                  <option value="ngc-pytorch:21.11-py3-sshd-v3">ngc-pytorch:21.11-py3-sshd-v3 - python=3.8.12 / pytorch=1.11.0 / cuda=11.5</option>
                </select>
              </div>
              <div class="cx-starlight-field">
                <label for="cx-cluster">集群选择</label>
                <select id="cx-cluster">
                  <option value="k8s_xingyiAI_2">k8s_xingyiAI_2 - 星逸智算集群</option>
                  <option value="k8s_xingyiAI">k8s_xingyiAI - 星逸AI集群</option>
                  <option value="k8s_xingyi">k8s_xingyi - 星逸CPU集群</option>
                  <option value="k8s_jove">k8s_jove - Jove集群</option>
                  <option value="k8s_ss01">k8s_ss01 - SS01集群</option>
                  <option value="k8s_venus">k8s_venus - 启明集群</option>
                </select>
              </div>
              <div class="cx-starlight-field">
                <label for="cx-partition">分区选择</label>
                <select id="cx-partition"></select>
              </div>
              <div class="cx-starlight-field">
                <label for="cx-plan">套餐选择</label>
                <select id="cx-plan"></select>
              </div>
              <div class="cx-starlight-field">
                <label for="cx-script">脚本选择</label>
                <div class="cx-script-picker">
                  <input id="cx-script" value="" placeholder="点击选择文件" readonly>
                  <button id="cx-open-file" class="cx-secondary-btn" type="button">选择</button>
                </div>
              </div>
            </div>
            <div class="cx-danger-note">提交会创建作业并占用资源；不选择脚本时会按调试模式启动。</div>
            <div class="cx-starlight-actions">
              <button id="cx-submit" class="cx-primary-btn" type="button">提交作业</button>
              <span id="cx-status" class="cx-starlight-status">正在检测后端接口...</span>
            </div>
            <div id="cx-live-status" class="cx-live-status cx-hidden">
              <span id="cx-live-dot" class="cx-live-dot"></span>
              <div>
                <div id="cx-live-label" class="cx-live-label">状态同步中</div>
                <div id="cx-live-detail" class="cx-live-detail"></div>
              </div>
            </div>
            <pre id="cx-output" class="cx-starlight-output">等待提交...</pre>
          </section>
        </main>
      </section>
    `;
    document.body.appendChild(shell);

    const fileModal = document.createElement("div");
    fileModal.className = "cx-file-modal";
    fileModal.innerHTML = `
      <section class="cx-file-dialog">
        <div class="cx-file-title">
          <span>选择目标文件/文件夹</span>
          <button id="cx-file-close" class="cx-file-icon-btn" type="button">×</button>
        </div>
        <div class="cx-file-body">
          <div class="cx-remote-box">
            <div class="cx-remote-label">远程服务器</div>
            <div class="cx-path-row">
              <select><option>XYFS01</option></select>
              <input value="/XYFS01/HOME/thzskj_wfeng33/thzskj_wfeng33_1" readonly>
              <button class="cx-file-icon-btn" type="button">⌕</button>
            </div>
            <p class="cx-remote-tip">提示：在上传大文件时，为确保上传效率，请使用 UDT 客户端传输</p>
            <div class="cx-file-toolbar">
              <button class="cx-file-icon-btn" type="button">⌂</button>
              <button class="cx-file-icon-btn" type="button">↑</button>
              <button class="cx-file-icon-btn" type="button">‹</button>
              <button class="cx-file-icon-btn" type="button">›</button>
              <button class="cx-file-icon-btn" type="button">↻</button>
              <span class="cx-spacer"></span>
              <input class="cx-file-search" placeholder="搜索当前目录文件">
              <button class="cx-file-icon-btn" type="button">◎</button>
              <button class="cx-file-icon-btn" type="button">⇩</button>
              <button id="cx-file-upload" class="cx-file-icon-btn" type="button">⇧</button>
              <input id="cx-file-input" class="cx-hidden-file" type="file" accept=".sh,.bash,.txt">
            </div>
            <table class="cx-file-table">
              <thead><tr><th>名称</th><th>属主</th><th>权限</th><th>类型</th><th>大小</th><th>修改日期</th></tr></thead>
              <tbody id="cx-remote-file-list"></tbody>
            </table>
            <p id="cx-remote-total" class="cx-remote-tip">Total 1</p>
          </div>
        </div>
        <div class="cx-file-footer">
          <button id="cx-file-cancel" class="cx-secondary-btn" type="button">Cancel</button>
          <button id="cx-file-confirm" class="cx-primary-btn" type="button">Confirm</button>
        </div>
      </section>
    `;
    document.body.appendChild(fileModal);

    el("cx-close").addEventListener("click", () => {
      shell.classList.remove("cx-open");
    });
    el("cx-cluster").addEventListener("change", updateDependentOptions);
    el("cx-partition").addEventListener("change", updatePlanOptions);
    el("cx-script").addEventListener("click", () => fileModal.classList.add("cx-open"));
    el("cx-open-file").addEventListener("click", () => fileModal.classList.add("cx-open"));
    el("cx-file-close").addEventListener("click", () => fileModal.classList.remove("cx-open"));
    el("cx-file-cancel").addEventListener("click", () => fileModal.classList.remove("cx-open"));
    el("cx-file-upload").addEventListener("click", () => el("cx-file-input").click());
    el("cx-file-input").addEventListener("change", () => {
      const file = el("cx-file-input").files[0];
      if (!file) return;
      const item = {
        name: file.name,
        owner: "20881 13440",
        permission: "-rw-r--r--",
        type: "文件",
        size: formatFileSize(file.size),
        modified: formatDate(new Date()),
        file,
      };
      const existingIndex = remoteFiles.findIndex((entry) => entry.name === item.name);
      if (existingIndex >= 0) remoteFiles.splice(existingIndex, 1, item);
      else remoteFiles.unshift(item);
      highlightedScriptFile = item;
      renderRemoteFiles();
      el("cx-file-input").value = "";
    });
    el("cx-file-confirm").addEventListener("click", () => {
      if (highlightedScriptFile?.file) {
        selectedScriptFile = highlightedScriptFile;
        el("cx-script").value = selectedScriptFile.name;
      }
      fileModal.classList.remove("cx-open");
    });
    el("cx-submit").addEventListener("click", async () => {
      const submitButton = el("cx-submit");
      submitButton.disabled = true;
      el("cx-output").textContent = "正在提交到后端接口...";
      el("cx-live-status").classList.add("cx-hidden");
      try {
        const body = await buildPayload();
        const data = await fetchStarlightJson("direct-submit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(body),
        });
        renderResult(data);
        if (data.submitted && data.jobRef) {
          window.sessionStorage.setItem("cx-last-starlight-job", JSON.stringify({
            ...data.jobRef,
            submittedAt: new Date().toISOString(),
          }));
          location.href = "/console/dashboard";
        } else if (data.statusSummary) {
          setLiveStatus(data.statusSummary, data.jobRef || {});
        }
      } catch (error) {
        el("cx-output").textContent = String(error.stack || error.message || error);
        setLiveStatus({ label: "提交失败", phase: "failed", reason: String(error.message || error) });
      } finally {
        submitButton.disabled = false;
        refreshStatus();
      }
    });

    updateDependentOptions();
    renderRemoteFiles();
    refreshStatus();
    if (!mountResourceCards()) {
      let attempts = 0;
      const timer = window.setInterval(() => {
        attempts += 1;
        if (mountResourceCards() || attempts >= 20) window.clearInterval(timer);
      }, 300);
    }
  }

  function isStoreRoute() {
    return location.pathname === "/store" || location.pathname === "/";
  }

  function unmount() {
    stopJobPolling();
    restoreOriginalStoreContent();
    document.querySelectorAll(".cx-starlight-shell, .cx-file-modal, .cx-market-section").forEach((node) => node.remove());
  }

  function syncRoute() {
    if (isStoreRoute()) mount();
    else unmount();
  }

  function watchRouteChanges() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function () {
      const result = originalPushState.apply(this, arguments);
      window.setTimeout(syncRoute, 0);
      return result;
    };
    history.replaceState = function () {
      const result = originalReplaceState.apply(this, arguments);
      window.setTimeout(syncRoute, 0);
      return result;
    };
    window.addEventListener("popstate", () => window.setTimeout(syncRoute, 0));
  }

  watchRouteChanges();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncRoute);
  } else {
    syncRoute();
  }
})();
