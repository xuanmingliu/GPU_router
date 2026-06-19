(function () {
  if (window.__cxLocalAuthControlsLoaded) return;
  window.__cxLocalAuthControlsLoaded = true;

  function clearLocalAuth() {
    const exactKeys = [
      "token",
      "Token",
      "session",
      "sessionId",
      "user",
      "userInfo",
      "userinfo",
      "cx_demo_user",
      "cx-last-starlight-job",
    ];
    exactKeys.forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
    for (const storage of [localStorage, sessionStorage]) {
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index) || "";
        const normalized = key.toLowerCase();
        if (normalized.includes("token") || normalized.includes("session") || normalized.includes("user")) {
          storage.removeItem(key);
        }
      }
    }
    document.cookie = "cx_demo_token=; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
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
    location.replace("/login?logout=1");
    button.textContent = original;
  }

  function ensureStyle() {
    if (document.getElementById("cx-local-auth-controls-style")) return;
    const style = document.createElement("style");
    style.id = "cx-local-auth-controls-style";
    style.textContent = `
      .cx-local-auth-controls {
        position: fixed;
        top: 48px;
        right: 24px;
        z-index: 2100;
        display: none;
        align-items: center;
        height: 36px;
        padding: 0 12px;
        border: 1px solid rgba(15, 23, 42, 0.10);
        border-radius: 6px;
        background: #fff;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
        color: #2563eb;
        font-size: 13px;
        font-weight: 500;
        line-height: 1;
      }
      .cx-local-auth-controls.cx-open {
        display: inline-flex;
      }
      .cx-local-auth-account {
        display: none;
      }
      .cx-local-auth-logout {
        border: 0;
        min-width: 64px;
        height: 30px;
        padding: 0;
        border-radius: 4px;
        background: transparent;
        color: #2563eb;
        font: inherit;
        cursor: pointer;
      }
      .cx-local-auth-logout:hover {
        background: rgba(37, 99, 235, 0.08);
      }
      .cx-local-auth-logout:disabled {
        color: #94a3b8;
        cursor: default;
      }
      .cx-hide-account-menu {
        display: none !important;
      }
      .cx-hide-account-entry {
        cursor: pointer;
      }
      @media (max-width: 768px) {
        .cx-local-auth-controls {
          top: 44px;
          right: 14px;
          max-width: calc(100vw - 24px);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function closeLogoutMenu() {
    const controls = document.getElementById("cx-local-auth-controls");
    if (controls) controls.classList.remove("cx-open");
  }

  function openLogoutMenuNear(entry) {
    const controls = document.getElementById("cx-local-auth-controls");
    if (!controls) return;
    const rect = entry.getBoundingClientRect();
    controls.style.top = `${Math.max(rect.bottom + 8, 44)}px`;
    controls.style.right = `${Math.max(window.innerWidth - rect.right, 14)}px`;
    controls.classList.add("cx-open");
  }

  function enhanceOriginalAccountEntry(entry, account) {
    if (entry.dataset.cxLogoutBound === "1") return;
    entry.dataset.cxLogoutBound = "1";
    entry.classList.add("cx-hide-account-entry");
    entry.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setTimeout(() => hideOriginalAccountMenus(account), 0);
      openLogoutMenuNear(entry);
    }, true);
  }

  function hideOriginalAccountMenus(account) {
    const markers = ["主账号手机号", "余额", "信用额度", "算力券", "综合可用", "我的租用", "我的卡包", "充值记录", "兑换中心"];
    document.querySelectorAll(".v-overlay-container .v-overlay, .v-overlay-container .v-menu, .v-overlay-container > div, body > .v-overlay-container").forEach((node) => {
      const text = node.innerText || "";
      const hitCount = markers.filter((marker) => text.includes(marker)).length;
      if (hitCount >= 3) node.classList.add("cx-hide-account-menu");
    });
    if (!account) return;
    document.querySelectorAll("body button, body a, body [role='button'], body .v-btn, body .v-list-item, body div, body span").forEach((node) => {
      if (node.closest("#cx-local-auth-controls") || node.closest(".cx-connect-dialog")) return;
      const text = (node.innerText || node.textContent || "").trim();
      if (!text || text.length > 80) return;
      if (!text.includes(account) && !text.includes("13800138000")) return;
      const rect = node.getBoundingClientRect();
      if (rect.width > 280 || rect.height > 80) return;
      if (rect.top > 90 || rect.right < window.innerWidth * 0.45) return;
      const entry = node.closest("button, a, [role='button'], .v-btn, .v-list-item") || node;
      enhanceOriginalAccountEntry(entry, account);
    });
  }

  function watchOriginalAccountMenus(account) {
    hideOriginalAccountMenus(account);
    const observer = new MutationObserver(() => hideOriginalAccountMenus(account));
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
      location.replace("/login");
      return;
    }
    ensureStyle();
    watchOriginalAccountMenus(payload.account || "");
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
      document.addEventListener("click", (event) => {
        if (!event.target.closest("#cx-local-auth-controls") && !event.target.closest(".cx-hide-account-entry")) {
          closeLogoutMenu();
        }
      });
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
