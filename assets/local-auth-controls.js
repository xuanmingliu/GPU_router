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
        top: 16px;
        right: 24px;
        z-index: 3000;
        display: inline-flex;
        align-items: center;
        height: 30px;
        padding: 0;
        background: transparent;
        box-shadow: none;
      }
      .cx-local-auth-account {
        display: none;
      }
      .cx-local-auth-logout {
        border: 0;
        min-width: 72px;
        height: 30px;
        padding: 0 8px;
        border-radius: 4px;
        background: transparent;
        color: #2563eb;
        font: inherit;
        font-size: 14px;
        font-weight: 500;
        text-align: center;
        cursor: pointer;
      }
      .cx-local-auth-logout:hover {
        background: rgba(37, 99, 235, 0.08);
      }
      .cx-local-auth-logout:disabled {
        color: #94a3b8;
        cursor: default;
      }
      @media (max-width: 768px) {
        .cx-local-auth-controls {
          top: 12px;
          right: 12px;
        }
      }
    `;
    document.head.appendChild(style);
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
