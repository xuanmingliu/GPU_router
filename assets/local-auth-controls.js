(function () {
  if (window.__cxLocalAuthControlsLoaded) return;
  window.__cxLocalAuthControlsLoaded = true;

  const accountMenuMarkers = [
    "主账号手机号",
    "余额",
    "信用额度",
    "算力券",
    "综合可用",
    "我的租用",
    "我的卡包",
    "账号信息",
    "充值记录",
    "兑换中心",
  ];

  let accountMenuObserver = null;

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
    const original = button ? button.textContent : "";
    if (button) {
      button.disabled = true;
      button.textContent = "退出中";
    }
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
    window.location.href = "/store?logged_out=1";
    if (button) button.textContent = original;
  }

  function ensureStyle() {
    if (document.getElementById("cx-local-auth-controls-style")) return;
    const style = document.createElement("style");
    style.id = "cx-local-auth-controls-style";
    style.textContent = `
      .cx-local-auth-menu {
        min-width: 180px;
        padding: 4px 0;
        background: #ffffff;
      }
      .cx-local-auth-menu-button {
        width: 100%;
        min-height: 40px;
        border: 0;
        border-radius: 0;
        padding: 0 16px;
        background: transparent;
        color: #333333;
        font: inherit;
        font-size: 14px;
        font-weight: 400;
        line-height: 40px;
        text-align: left;
        cursor: pointer;
      }
      .cx-local-auth-menu-button:hover {
        background: rgba(74, 113, 255, 0.08);
        color: #4a71ff;
      }
      .cx-local-auth-menu-button:disabled {
        color: #94a3b8;
        cursor: default;
      }
    `;
    document.head.appendChild(style);
  }

  function normalizedText(element) {
    return (element.textContent || "").replace(/\s+/g, "");
  }

  function markerHits(text) {
    return accountMenuMarkers.reduce((count, marker) => count + (text.includes(marker) ? 1 : 0), 0);
  }

  function isReasonableMenuBox(element) {
    if (!element || element === document.body || element === document.documentElement) return false;
    if (element.id === "app") return false;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return true;
    return rect.width <= 560 && rect.height <= 760;
  }

  function findAccountMenuRoot() {
    const selectors = [
      ".v-overlay__content",
      ".v-menu .v-overlay__content",
      ".v-card",
      ".v-list",
      "[role='menu']",
      "[class*='menu']",
      "[class*='overlay']",
    ];
    const candidates = Array.from(document.body.querySelectorAll(selectors.join(",")));
    return candidates
      .filter((element) => {
        const text = normalizedText(element);
        return markerHits(text) >= 2 && isReasonableMenuBox(element);
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return aRect.width * aRect.height - bRect.width * bRect.height;
      })[0] || null;
  }

  function replaceAccountMenu() {
    const menu = findAccountMenuRoot();
    if (!menu || menu.dataset.cxLocalAuthMenu === "1") return;
    menu.dataset.cxLocalAuthMenu = "1";
    menu.classList.add("cx-local-auth-menu");
    menu.innerHTML = "";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "cx-local-auth-menu-button";
    button.textContent = "退出登录";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      logout(button);
    });
    menu.appendChild(button);
  }

  function startAccountMenuObserver() {
    if (accountMenuObserver) return;
    ensureStyle();
    replaceAccountMenu();
    accountMenuObserver = new MutationObserver(() => {
      replaceAccountMenu();
    });
    accountMenuObserver.observe(document.body, { childList: true, subtree: true });
    document.addEventListener(
      "click",
      () => {
        window.setTimeout(replaceAccountMenu, 0);
        window.setTimeout(replaceAccountMenu, 120);
      },
      true
    );
  }

  async function render() {
    if (location.pathname === "/login") return;
    const legacyControls = document.getElementById("cx-local-auth-controls");
    if (legacyControls) legacyControls.remove();

    const loggedOutView = new URLSearchParams(location.search).get("logged_out") === "1";
    if (loggedOutView) {
      clearLocalAuth();
      return;
    }
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
    startAccountMenuObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
