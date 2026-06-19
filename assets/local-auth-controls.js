(function () {
  if (window.__cxLocalAuthControlsLoaded) return;
  window.__cxLocalAuthControlsLoaded = true;

  function clearLocalAuth() {
    ["token", "sessionId", "cx_demo_user"].forEach((key) => localStorage.removeItem(key));
  }

  async function logout(button) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "退出中";
    try {
      const stored = JSON.parse(localStorage.getItem("cx_demo_user") || "{}");
      await fetch("/local-auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: stored.token || localStorage.getItem("token") || "" }),
      });
    } catch {
      // Even if the network request fails, clear the browser-side session.
    }
    clearLocalAuth();
    location.replace("/login");
    button.textContent = original;
  }

  function ensureStyle() {
    if (document.getElementById("cx-local-auth-controls-style")) return;
    const style = document.createElement("style");
    style.id = "cx-local-auth-controls-style";
    style.textContent = `
      .cx-local-auth-controls {
        position: fixed;
        top: 12px;
        right: 18px;
        z-index: 2100;
        display: inline-flex;
        align-items: center;
        height: 32px;
        padding: 0 12px;
        border: 1px solid rgba(15, 23, 42, 0.10);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
        color: #334155;
        font-size: 13px;
        line-height: 1;
      }
      .cx-local-auth-account {
        display: none;
      }
      .cx-local-auth-logout {
        border: 0;
        padding: 0;
        background: transparent;
        color: #2563eb;
        font: inherit;
        cursor: pointer;
      }
      .cx-local-auth-logout:disabled {
        color: #94a3b8;
        cursor: default;
      }
      .cx-hide-account-menu {
        display: none !important;
      }
      @media (max-width: 768px) {
        .cx-local-auth-controls {
          top: 10px;
          right: 12px;
          max-width: calc(100vw - 24px);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function hideOriginalAccountMenus() {
    const markers = ["主账号手机号", "余额", "信用额度", "算力券", "综合可用", "我的租用", "我的卡包", "充值记录", "兑换中心"];
    document.querySelectorAll(".v-overlay-container .v-overlay, .v-overlay-container .v-menu, .v-overlay-container > div, body > .v-overlay-container").forEach((node) => {
      const text = node.innerText || "";
      const hitCount = markers.filter((marker) => text.includes(marker)).length;
      if (hitCount >= 3) node.classList.add("cx-hide-account-menu");
    });
  }

  function watchOriginalAccountMenus() {
    hideOriginalAccountMenus();
    const observer = new MutationObserver(hideOriginalAccountMenus);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function render() {
    if (location.pathname === "/login") return;
    let payload = null;
    try {
      const response = await fetch("/local-auth/session", { credentials: "same-origin" });
      payload = await response.json();
    } catch {
      return;
    }
    if (!payload || !payload.ok) {
      clearLocalAuth();
      return;
    }
    ensureStyle();
    watchOriginalAccountMenus();
    let controls = document.getElementById("cx-local-auth-controls");
    if (!controls) {
      controls = document.createElement("div");
      controls.id = "cx-local-auth-controls";
      controls.className = "cx-local-auth-controls";
      controls.innerHTML = `
        <span class="cx-local-auth-account"></span>
        <button class="cx-local-auth-logout" type="button">退出登录</button>
      `;
      controls.querySelector(".cx-local-auth-logout").addEventListener("click", (event) => logout(event.currentTarget));
      document.body.appendChild(controls);
    }
    controls.querySelector(".cx-local-auth-account").textContent = "";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
