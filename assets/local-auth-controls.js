(function () {
  if (window.__cxLocalAuthControlsLoaded) return;
  window.__cxLocalAuthControlsLoaded = true;

  let activeAccount = "";
  let activeBalance = "";
  let accountClickHandlerAttached = false;
  let nativeMenuObserver = null;
  let notificationCleanupInstalled = false;
  let balanceRefreshTimer = null;

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
      .cx-local-auth-balance {
        padding: 8px 16px 7px;
        border-bottom: 1px solid #edf0f5;
        color: #1f5b3b;
        font-size: 13px;
        font-weight: 700;
        white-space: nowrap;
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
      a[href*="workOrder"],
      a[href*="myWorkOrder"],
      a[href*="selectQuestion"],
      [title*="工单"],
      [aria-label*="工单"],
      [data-cx-remove-support="true"] {
        display: none !important;
        pointer-events: none !important;
      }
      .cx-recharge-dialog {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(15, 23, 42, 0.42);
      }
      .cx-recharge-dialog.cx-open {
        display: flex;
      }
      .cx-recharge-card {
        width: min(420px, calc(100vw - 48px));
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 18px 55px rgba(15, 23, 42, 0.22);
        overflow: hidden;
      }
      .cx-recharge-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 18px;
        border-bottom: 1px solid #edf0f5;
        font-size: 16px;
        font-weight: 700;
        color: #111827;
      }
      .cx-recharge-close {
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: #475569;
        cursor: pointer;
        font-size: 22px;
      }
      .cx-recharge-body {
        padding: 18px;
      }
      .cx-recharge-input {
        width: 100%;
        height: 40px;
        border: 1px solid #dcdfe6;
        border-radius: 4px;
        padding: 0 12px;
        color: #333333;
        font-size: 14px;
        text-transform: uppercase;
      }
      .cx-recharge-input:focus {
        border-color: #1f5b3b;
        outline: none;
      }
      .cx-recharge-message {
        min-height: 20px;
        margin-top: 10px;
        color: #64748b;
        font-size: 13px;
        line-height: 1.5;
      }
      .cx-recharge-message.cx-error {
        color: #dc2626;
      }
      .cx-recharge-message.cx-success {
        color: #1f5b3b;
      }
      .cx-recharge-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 14px 18px 18px;
      }
      .cx-recharge-secondary,
      .cx-recharge-primary {
        height: 36px;
        border-radius: 4px;
        padding: 0 18px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
      }
      .cx-recharge-secondary {
        border: 1px solid #dcdfe6;
        background: #ffffff;
        color: #333333;
      }
      .cx-recharge-primary {
        border: 0;
        background: #1f5b3b;
        color: #ffffff;
      }
      .cx-recharge-primary:disabled {
        background: #9ca3af;
        cursor: default;
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
    const aria = `${element.getAttribute?.("aria-label") || ""} ${element.getAttribute?.("title") || ""}`;
    if (/通知|未读|消息|工单|服务支持/.test(aria)) return true;
    const href = element.getAttribute?.("href") || "";
    const to = element.getAttribute?.("to") || "";
    const value = element.getAttribute?.("value") || "";
    if (/\/inform|\/messages|\/workOrder|work-order|workOrder|myWorkOrder|selectQuestion|(^|-)messages($|-)/i.test(`${href} ${to} ${value}`)) {
      return true;
    }
    return text.length > 0 && text.length <= 40 && (text.includes("工单") || text.includes("服务支持"));
  }

  function removeNotificationUi() {
    const selectors = [
      ".v-overlay.v-menu",
      ".v-overlay__content",
      ".v-list-item",
      ".v-btn",
      ".v-card",
      ".v-navigation-drawer *",
      ".v-app-bar *",
      "a",
      "button",
      "[role='button']",
      "[role='menuitem']",
      "[title]",
      "[aria-label]",
      "li",
      "div",
      "span",
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
      const menuItem =
        element.closest(".v-list-item, .v-list-group, .v-btn, li, a, button, [role='button'], [role='menuitem'], .cursor-pointer") ||
        element;
      menuItem.setAttribute("data-cx-remove-support", "true");
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

  function closeRechargeDialog() {
    document.getElementById("cx-recharge-dialog")?.classList.remove("cx-open");
  }

  function ensureRechargeDialog() {
    ensureStyle();
    let dialog = document.getElementById("cx-recharge-dialog");
    if (dialog) return dialog;
    dialog = document.createElement("div");
    dialog.id = "cx-recharge-dialog";
    dialog.className = "cx-recharge-dialog";
    dialog.innerHTML = `
      <section class="cx-recharge-card" role="dialog" aria-modal="true">
        <div class="cx-recharge-head">
          <span>充值余额</span>
          <button class="cx-recharge-close" type="button" aria-label="关闭">×</button>
        </div>
        <div class="cx-recharge-body">
          <input class="cx-recharge-input" placeholder="请输入充值码" autocomplete="off">
          <div class="cx-recharge-message">充值码兑换后将直接增加到账户余额。</div>
        </div>
        <div class="cx-recharge-actions">
          <button class="cx-recharge-secondary" type="button">取消</button>
          <button class="cx-recharge-primary" type="button">确认充值</button>
        </div>
      </section>
    `;
    const input = dialog.querySelector(".cx-recharge-input");
    const message = dialog.querySelector(".cx-recharge-message");
    const confirm = dialog.querySelector(".cx-recharge-primary");
    const cancel = dialog.querySelector(".cx-recharge-secondary");

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
      confirm.disabled = true;
      confirm.textContent = "充值中";
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
        activeBalance = payload.balance;
        setMessage(`充值成功：+${payload.amount} 元，当前余额 ${payload.balance} 元。`, "success");
        input.value = "";
        setTimeout(() => {
          closeRechargeDialog();
          render();
        }, 900);
      } catch (error) {
        setMessage(String(error.message || error), "error");
      } finally {
        confirm.disabled = false;
        confirm.textContent = "确认充值";
      }
    }

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog || event.target.closest(".cx-recharge-close") || event.target === cancel) {
        closeRechargeDialog();
      }
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submit();
      if (event.key === "Escape") closeRechargeDialog();
    });
    confirm.addEventListener("click", submit);
    document.body.appendChild(dialog);
    return dialog;
  }

  function openRechargeDialog() {
    removePopover();
    const dialog = ensureRechargeDialog();
    const input = dialog.querySelector(".cx-recharge-input");
    const message = dialog.querySelector(".cx-recharge-message");
    input.value = "";
    message.textContent = "充值码兑换后将直接增加到账户余额。";
    message.classList.remove("cx-error", "cx-success");
    dialog.classList.add("cx-open");
    setTimeout(() => input.focus(), 0);
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
    popover.innerHTML = `
      <div class="cx-local-auth-balance">余额：${activeBalance || "0.00"} 元</div>
      <button class="cx-local-auth-menu-button" data-action="recharge" type="button">充值</button>
      <button class="cx-local-auth-menu-button" data-action="logout" type="button">退出登录</button>
    `;
    const rechargeButton = popover.querySelector('[data-action="recharge"]');
    const logoutButton = popover.querySelector('[data-action="logout"]');
    rechargeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      openRechargeDialog();
    }, true);
    logoutButton.addEventListener("click", (event) => startLogout(event, logoutButton), true);
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
      if (popover) return;
      showPopover(candidate);
      window.setTimeout(removeNativeAccountMenu, 0);
      window.setTimeout(removeNativeAccountMenu, 100);
      window.setTimeout(removeNativeAccountMenu, 300);
    };

    document.addEventListener("click", handleAccountEvent, true);

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
    activeBalance = payload.balance || "0.00";
    attachAccountClickHandler(payload.account);
    if (!balanceRefreshTimer) {
      balanceRefreshTimer = window.setInterval(async () => {
        try {
          const response = await fetch("/local-auth/session", { credentials: "same-origin", cache: "no-store" });
          const next = await response.json();
          if (next && next.ok && typeof next.balance !== "undefined") {
            activeBalance = next.balance || "0.00";
            const balanceNode = document.querySelector("#cx-local-auth-popover .cx-local-auth-balance");
            if (balanceNode) balanceNode.textContent = `余额：${activeBalance} 元`;
          }
        } catch {}
      }, 30000);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
