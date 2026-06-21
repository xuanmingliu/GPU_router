(function () {
  if (window.__cxLocalAuthControlsLoaded) return;
  window.__cxLocalAuthControlsLoaded = true;

  let activeAccount = "";
  let accountClickHandlerAttached = false;
  let nativeMenuObserver = null;
  let notificationCleanupInstalled = false;

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
    window.history.replaceState(null, "", "/store?logged_out=1");
    window.location.replace("/store?logged_out=1");
    if (button) button.textContent = original;
  }

  function startLogout(event, button) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    logout(button);
  }

  function ensureStyle() {
    if (document.getElementById("cx-local-auth-controls-style")) return;
    const style = document.createElement("style");
    style.id = "cx-local-auth-controls-style";
    style.textContent = `
      .cx-local-auth-popover {
        position: fixed;
        z-index: 2147483647;
        min-width: 156px;
        padding: 6px 0;
        border: 1px solid rgba(226, 232, 240, 0.95);
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
      }
      .cx-local-auth-menu-button {
        width: 100%;
        min-height: 38px;
        border: 0;
        border-radius: 0;
        padding: 0 16px;
        background: transparent;
        color: #333333;
        font: inherit;
        font-size: 14px;
        font-weight: 400;
        line-height: 38px;
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
      .v-overlay.v-menu:has(.v-card-text span.text-gray_text),
      .v-overlay.v-menu:has(.v-card-text .grid-cols-5) {
        display: none !important;
        pointer-events: none !important;
      }
      .cx-hide-notification-entry {
        display: none !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeText(element) {
    return (element?.textContent || "").replace(/\s+/g, "");
  }

  function isNotificationElement(element) {
    if (!element || element === document.body || element === document.documentElement) return false;
    const text = normalizeText(element);
    if (text.includes("通知中心") || text.includes("未读消息")) return true;
    if (text === "消息" || text.includes("我的消息")) return true;
    if (text.includes("工单") || text.includes("服务支持")) return true;
    const aria = `${element.getAttribute?.("aria-label") || ""} ${element.getAttribute?.("title") || ""}`;
    if (/通知|未读|消息|工单|服务支持/.test(aria)) return true;
    const href = element.getAttribute?.("href") || "";
    const to = element.getAttribute?.("to") || "";
    const value = element.getAttribute?.("value") || "";
    return /\/inform|\/messages|\/workOrder|work-order|workOrder|myWorkOrder|selectQuestion|(^|-)messages($|-)/i.test(`${href} ${to} ${value}`);
  }

  function removeNotificationUi() {
    const selectors = [
      ".v-overlay.v-menu",
      ".v-overlay__content",
      ".v-list-item",
      "a",
      "button",
      "[role='button']",
      "[role='menuitem']",
      "li",
      "nav .cursor-pointer",
      "aside .cursor-pointer",
    ];
    Array.from(document.body.querySelectorAll(selectors.join(","))).forEach((element) => {
      if (!isNotificationElement(element)) return;
      const overlay = element.closest(".v-overlay.v-menu");
      if (overlay) {
        overlay.remove();
        return;
      }
      const menuItem = element.closest(".v-list-item, li, a, button, [role='button'], [role='menuitem']") || element;
      menuItem.classList.add("cx-hide-notification-entry");
      menuItem.setAttribute("aria-hidden", "true");
    });

    Array.from(document.body.querySelectorAll(".mdi-bell-outline, .mdi-bell, i, .v-icon")).forEach((icon) => {
      const text = normalizeText(icon);
      const className = String(icon.className || "");
      if (!text.includes("mdi-bell") && !className.includes("mdi-bell")) return;
      const button = icon.closest("button, [role='button'], .v-btn, a");
      if (button) {
        button.classList.add("cx-hide-notification-entry");
        button.setAttribute("aria-hidden", "true");
      }
    });
  }

  function redirectAwayFromNotificationRoutes() {
    const target = `${location.pathname}${location.hash || ""}`;
    if (/\/inform(\/|$)|\/messages(\/|$)|\/workOrder|workOrder|myWorkOrder|selectQuestion|#\/inform|#\/messages|#\/workOrder/i.test(target)) {
      history.replaceState(null, "", "/console");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }

  function installNotificationCleanup() {
    if (notificationCleanupInstalled) return;
    notificationCleanupInstalled = true;
    ensureStyle();

    const blockNotificationClick = (event) => {
      const candidate = event.target?.closest?.("a,button,[role='button'],[role='menuitem'],.v-list-item,li");
      if (!candidate || !isNotificationElement(candidate)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      removeNotificationUi();
      redirectAwayFromNotificationRoutes();
    };

    ["pointerdown", "mousedown", "touchstart", "click"].forEach((eventName) => {
      document.addEventListener(eventName, blockNotificationClick, true);
    });

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function (state, title, url) {
      if (url && /\/inform|\/messages|\/workOrder|workOrder|myWorkOrder|selectQuestion/i.test(String(url))) {
        return originalPushState.call(this, state, title, "/console");
      }
      return originalPushState.apply(this, arguments);
    };
    history.replaceState = function (state, title, url) {
      if (url && /\/inform|\/messages|\/workOrder|workOrder|myWorkOrder|selectQuestion/i.test(String(url))) {
        return originalReplaceState.call(this, state, title, "/console");
      }
      return originalReplaceState.apply(this, arguments);
    };

    const observer = new MutationObserver(() => {
      removeNotificationUi();
      redirectAwayFromNotificationRoutes();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("popstate", redirectAwayFromNotificationRoutes, true);
    window.addEventListener("hashchange", redirectAwayFromNotificationRoutes, true);
    removeNotificationUi();
    redirectAwayFromNotificationRoutes();
  }

  function removePopover() {
    document.getElementById("cx-local-auth-popover")?.remove();
  }

  function removeNativeAccountMenu() {
    const markers = ["主账号手机号", "信用额度", "我的租用", "我的卡包", "账号信息", "充值记录", "兑换中心"];
    const candidates = Array.from(document.body.querySelectorAll(".v-overlay.v-menu, .v-overlay__content, .v-card, .v-list, nav, aside"));
    candidates.forEach((element) => {
      if (element.id === "cx-local-auth-popover" || element.closest("#cx-local-auth-popover")) return;
      const text = (element.textContent || "").replace(/\s+/g, "");
      const hits = markers.reduce((count, marker) => count + (text.includes(marker) ? 1 : 0), 0);
      if (hits >= 2) {
        const overlay = element.closest(".v-overlay.v-menu") || element;
        overlay.remove();
      }
    });
  }

  function showPopover(anchor) {
    ensureStyle();
    removePopover();
    removeNativeAccountMenu();
    const rect = anchor.getBoundingClientRect();
    const popover = document.createElement("div");
    popover.id = "cx-local-auth-popover";
    popover.className = "cx-local-auth-popover";
    popover.innerHTML = `<button class="cx-local-auth-menu-button" type="button">退出登录</button>`;
    const button = popover.querySelector("button");
    ["pointerdown", "mousedown", "touchstart", "click"].forEach((eventName) => {
      button.addEventListener(eventName, (event) => startLogout(event, button), true);
    });
    document.body.appendChild(popover);

    const popoverRect = popover.getBoundingClientRect();
    const top = Math.min(rect.bottom + 8, window.innerHeight - popoverRect.height - 8);
    const left = Math.max(8, Math.min(rect.right - popoverRect.width, window.innerWidth - popoverRect.width - 8));
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }

  function isAccountEntry(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (rect.top > 90 || rect.right < window.innerWidth * 0.55) return false;
    const text = (element.textContent || "").replace(/\s+/g, "");
    if (activeAccount && text.includes(activeAccount.replace(/\s+/g, ""))) return true;
    return text.includes("主账号") && /@|1\d{10}/.test(text);
  }

  function attachAccountClickHandler(account) {
    activeAccount = account || activeAccount;
    if (accountClickHandlerAttached) return;
    accountClickHandlerAttached = true;

    const handleAccountEvent = (event) => {
      const popover = document.getElementById("cx-local-auth-popover");
      if (popover && popover.contains(event.target)) return;

      const candidate = event.target?.closest?.("a,button,[role='button'],.cursor-pointer");
      if (!isAccountEntry(candidate)) {
        if (popover) removePopover();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (event.type === "click" || event.type === "pointerdown" || event.type === "mousedown" || event.type === "touchstart") {
        showPopover(candidate);
      } else {
        removeNativeAccountMenu();
      }
      window.setTimeout(removeNativeAccountMenu, 0);
      window.setTimeout(removeNativeAccountMenu, 100);
      window.setTimeout(removeNativeAccountMenu, 300);
    };

    ["pointerover", "mouseover", "mouseenter", "pointerenter", "pointerdown", "mousedown", "touchstart", "click"].forEach((eventName) => {
      document.addEventListener(eventName, handleAccountEvent, true);
    });

    if (!nativeMenuObserver) {
      nativeMenuObserver = new MutationObserver(() => removeNativeAccountMenu());
      nativeMenuObserver.observe(document.body, { childList: true, subtree: true });
    }

    document.addEventListener(
      "keyup",
      (event) => {
        if (event.key === "Escape") removePopover();
      },
      true
    );

    window.addEventListener("resize", removePopover);
    window.addEventListener("scroll", removePopover, true);
  }

  async function render() {
    installNotificationCleanup();
    if (location.pathname === "/login") return;
    const legacyControls = document.getElementById("cx-local-auth-controls");
    if (legacyControls) legacyControls.remove();

    const loggedOutView = new URLSearchParams(location.search).get("logged_out") === "1";
    if (loggedOutView) {
      clearLocalAuth();
      removePopover();
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
      removePopover();
      return;
    }
    attachAccountClickHandler(payload.account);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
