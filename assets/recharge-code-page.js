(function () {
  if (window.__cxRechargeCodePageLoaded) return;
  window.__cxRechargeCodePageLoaded = true;

  let balanceTimer = null;

  function isRechargeRoute() {
    return location.pathname === "/console/recharge";
  }

  function money(value) {
    return Number(value || 0).toFixed(2);
  }

  function ensureStyle() {
    if (document.getElementById("cx-recharge-page-style")) return;
    const style = document.createElement("style");
    style.id = "cx-recharge-page-style";
    style.textContent = `
      body.cx-recharge-code-page #main-container > :not(.cx-recharge-code-section) {
        display: none !important;
      }
      .cx-recharge-code-section {
        width: min(920px, calc(100% - 32px));
        margin: 24px auto;
      }
      .cx-recharge-code-card {
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 2px 15px rgba(136, 143, 184, 0.2);
        padding: 24px;
      }
      .cx-recharge-code-title {
        margin: 0;
        color: #111827;
        font-size: 20px;
        font-weight: 700;
      }
      .cx-recharge-code-balance {
        margin-top: 14px;
        display: inline-flex;
        align-items: baseline;
        gap: 8px;
        border-radius: 8px;
        background: #e8f2ec;
        padding: 12px 16px;
        color: #1f5b3b;
      }
      .cx-recharge-code-balance strong {
        font-size: 24px;
      }
      .cx-recharge-code-form {
        margin-top: 22px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        max-width: 620px;
      }
      .cx-recharge-code-input {
        height: 42px;
        border: 1px solid #dcdfe6;
        border-radius: 4px;
        padding: 0 13px;
        color: #333333;
        font-size: 14px;
        text-transform: uppercase;
      }
      .cx-recharge-code-input:focus {
        border-color: #1f5b3b;
        outline: none;
      }
      .cx-recharge-code-button {
        height: 42px;
        border: 0;
        border-radius: 4px;
        background: #1f5b3b;
        color: #ffffff;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        padding: 0 22px;
      }
      .cx-recharge-code-button:disabled {
        background: #9ca3af;
        cursor: default;
      }
      .cx-recharge-code-message {
        min-height: 22px;
        margin-top: 12px;
        color: #64748b;
        font-size: 13px;
        line-height: 1.6;
      }
      .cx-recharge-code-message.cx-error {
        color: #dc2626;
      }
      .cx-recharge-code-message.cx-success {
        color: #1f5b3b;
      }
      .cx-recharge-code-note {
        margin-top: 18px;
        color: #64748b;
        font-size: 13px;
        line-height: 1.7;
      }
      @media (max-width: 640px) {
        .cx-recharge-code-form {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  async function fetchSession() {
    const response = await fetch("/local-auth/session", { credentials: "same-origin", cache: "no-store" });
    return response.json();
  }

  async function refreshBalance() {
    try {
      const response = await fetch("/local-auth/session", { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json();
      if (!payload?.ok) return;
      const node = document.getElementById("cx-recharge-balance");
      if (node) node.textContent = payload.balance || "0.00";
    } catch {}
  }

  function mountWithSession(session) {
    const container = document.querySelector("#main-container");
    if (!container) return false;
    ensureStyle();
    document.body.classList.add("cx-recharge-code-page");
    document.querySelector(".cx-recharge-code-section")?.remove();

    const section = document.createElement("section");
    section.className = "cx-recharge-code-section";
    section.innerHTML = `
      <div class="cx-recharge-code-card">
        <h1 class="cx-recharge-code-title">充值余额</h1>
        <div class="cx-recharge-code-balance">
          <span>当前余额</span>
          <strong>￥<span id="cx-recharge-balance">${session.balance || "0.00"}</span></strong>
        </div>
        <div class="cx-recharge-code-form">
          <input id="cx-recharge-code-input" class="cx-recharge-code-input" placeholder="请输入充值码" autocomplete="off">
          <button id="cx-recharge-code-button" class="cx-recharge-code-button" type="button">确认充值</button>
        </div>
        <div id="cx-recharge-code-message" class="cx-recharge-code-message">充值成功后，余额会立即增加到当前账号。</div>
        <div class="cx-recharge-code-note">同一个账号同一个充值码只能使用一次；不同账号可以使用同一个充值码。</div>
      </div>
    `;
    container.prepend(section);

    const input = section.querySelector("#cx-recharge-code-input");
    const button = section.querySelector("#cx-recharge-code-button");
    const message = section.querySelector("#cx-recharge-code-message");
    const balance = section.querySelector("#cx-recharge-balance");

    function setMessage(text, type) {
      message.textContent = text;
      message.classList.toggle("cx-error", type === "error");
      message.classList.toggle("cx-success", type === "success");
    }

    async function submit() {
      const code = input.value.trim();
      if (!code) {
        setMessage("请输入充值码。", "error");
        input.focus();
        return;
      }
      button.disabled = true;
      button.textContent = "充值中";
      setMessage("正在校验充值码...", "");
      try {
        const response = await fetch("/local-auth/redeem-code", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.reason || payload.error || "充值失败");
        balance.textContent = money(payload.balance);
        input.value = "";
        setMessage(`充值成功：+${money(payload.amount)} 元，当前余额 ${money(payload.balance)} 元。`, "success");
      } catch (error) {
        setMessage(String(error.message || error), "error");
      } finally {
        button.disabled = false;
        button.textContent = "确认充值";
      }
    }

    button.addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submit();
    });
    setTimeout(() => input.focus(), 0);
    return true;
  }

  async function mount() {
    if (!isRechargeRoute()) {
      document.body.classList.remove("cx-recharge-code-page");
      document.querySelector(".cx-recharge-code-section")?.remove();
      return;
    }
    let session = {};
    try {
      session = await fetchSession();
    } catch {
      session = {};
    }
    if (!session.ok) {
      location.href = "/login";
      return;
    }
    if (!balanceTimer) {
      balanceTimer = window.setInterval(refreshBalance, 30000);
    }
    if (mountWithSession(session)) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (mountWithSession(session) || attempts >= 20) clearInterval(timer);
    }, 300);
  }

  function watchRouteChanges() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function () {
      const result = originalPushState.apply(this, arguments);
      setTimeout(mount, 0);
      return result;
    };
    history.replaceState = function () {
      const result = originalReplaceState.apply(this, arguments);
      setTimeout(mount, 0);
      return result;
    };
    window.addEventListener("popstate", () => setTimeout(mount, 0));
  }

  watchRouteChanges();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
