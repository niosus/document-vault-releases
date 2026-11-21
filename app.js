(() => {
  "use strict";

  const THEME_STORAGE_KEY = "dv_site_theme";
  const DEFAULT_RELEASES_URL = "https://github.com/niosus/document-vault-releases/releases";
  const DEFAULT_APPCAST_URL = "https://niosus.github.io/document-vault-releases/appcast.xml";

  let currentPayload = null;
  let activeReleaseTab = "latest";

  function $(id) {
    return document.getElementById(id);
  }

  function formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return "";
    const mb = n / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${Math.round(mb)} MB`;
  }

  function formatDate(iso) {
    if (!iso) return "";
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function clearEl(el) {
    if (!el) return;
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  function createEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function renderNotesSafe(container, rawText) {
    clearEl(container);
    const text = String(rawText || "").trim();
    if (!text) {
      container.appendChild(createEl("p", "", "No release notes provided for this build."));
      return;
    }

    const lines = text.split(/\r?\n/);
    let currentList = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        currentList = null;
        continue;
      }
      if (/^[-*]\s+/.test(line)) {
        if (!currentList) {
          currentList = document.createElement("ul");
          container.appendChild(currentList);
        }
        currentList.appendChild(createEl("li", "", line.replace(/^[-*]\s+/, "")));
      } else {
        currentList = null;
        const cleanHeading = line.replace(/^#{1,4}\s+/, "");
        const p = createEl("p", "", cleanHeading);
        if (/^#{1,4}\s+/.test(line)) {
          p.style.fontWeight = "700";
        }
        container.appendChild(p);
      }
    }
  }

  /* ---------- Theme Switcher ---------- */
  function resolveTheme(mode) {
    if (mode === "light" || mode === "dark") return mode;
    const prefersDark = Boolean(
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
    );
    return prefersDark ? "dark" : "light";
  }

  function applyTheme(mode, persist = true) {
    const validMode = mode === "light" || mode === "dark" ? mode : "auto";
    const resolved = resolveTheme(validMode);
    document.documentElement.dataset.themeMode = validMode;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;

    if (persist) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, validMode);
      } catch {
        // ignore storage errors
      }
    }

    const map = {
      light: $("theme-light-btn"),
      dark: $("theme-dark-btn"),
      auto: $("theme-auto-btn"),
    };
    for (const [key, btn] of Object.entries(map)) {
      if (!btn) continue;
      const active = key === validMode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  function initThemeControls() {
    const initialMode = document.documentElement.dataset.themeMode || "auto";
    applyTheme(initialMode, false);

    const lightBtn = $("theme-light-btn");
    const darkBtn = $("theme-dark-btn");
    const autoBtn = $("theme-auto-btn");
    if (lightBtn) lightBtn.addEventListener("click", () => applyTheme("light"));
    if (darkBtn) darkBtn.addEventListener("click", () => applyTheme("dark"));
    if (autoBtn) autoBtn.addEventListener("click", () => applyTheme("auto"));

    if (window.matchMedia) {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => {
        if ((document.documentElement.dataset.themeMode || "auto") === "auto") {
          applyTheme("auto", false);
        }
      };
      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", onChange);
      }
    }
  }

  /* ---------- Interactive Live App Showcase ---------- */
  function getIframeTheme(iframe) {
    try {
      const ctrl = iframe && iframe.contentWindow && iframe.contentWindow.__dvDemoControl;
      if (ctrl && typeof ctrl.getTheme === "function") {
        return ctrl.getTheme();
      }
      const doc = iframe && iframe.contentDocument;
      if (doc && doc.documentElement && doc.documentElement.dataset.theme) {
        return doc.documentElement.dataset.theme;
      }
    } catch {
      // ignore cross-origin restrictions if any
    }
    return document.documentElement.dataset.theme || "light";
  }

  function updateWinThemeBtnLabel(iframe) {
    const winThemeBtn = $("win-theme-btn");
    if (!winThemeBtn) return;
    const current = getIframeTheme(iframe);
    winThemeBtn.textContent = current === "dark" ? "Preview: Dark" : "Preview: Light";
  }

  function initShowcase() {
    const iframe = $("live-demo-iframe");
    if (!iframe) return;

    // Open the embedded preview in the exact same resolved color scheme as the website
    const hostTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    iframe.setAttribute("src", `./demo/index.html?theme=${hostTheme}`);
    updateWinThemeBtnLabel(iframe);

    iframe.addEventListener("load", () => {
      updateWinThemeBtnLabel(iframe);
      // Keep the chrome label synced if the user toggles the app's own topbar theme buttons inside the iframe
      try {
        const doc = iframe.contentDocument;
        if (doc && doc.documentElement && typeof MutationObserver === "function") {
          const observer = new MutationObserver(() => updateWinThemeBtnLabel(iframe));
          observer.observe(doc.documentElement, {
            attributes: true,
            attributeFilter: ["data-theme"],
          });
        }
      } catch {
        // ignore if inaccessible
      }
    });

    const winThemeBtn = $("win-theme-btn");
    if (winThemeBtn) {
      winThemeBtn.addEventListener("click", () => {
        const current = getIframeTheme(iframe);
        const next = current === "dark" ? "light" : "dark";
        try {
          const ctrl = iframe.contentWindow && iframe.contentWindow.__dvDemoControl;
          if (ctrl && typeof ctrl.setTheme === "function") {
            ctrl.setTheme(next);
            updateWinThemeBtnLabel(iframe);
            return;
          }
        } catch {
          // fallback below
        }
        iframe.setAttribute("src", `./demo/index.html?theme=${next}`);
      });
    }

    const winResetBtn = $("win-reset-btn");
    if (winResetBtn) {
      winResetBtn.addEventListener("click", () => {
        const current = getIframeTheme(iframe);
        try {
          const ctrl = iframe.contentWindow && iframe.contentWindow.__dvDemoControl;
          if (ctrl && typeof ctrl.reset === "function") {
            ctrl.reset();
            return;
          }
        } catch {
          // fallback below
        }
        iframe.setAttribute("src", `./demo/index.html?theme=${current}`);
      });
    }
  }

  /* ---------- Gatekeeper Drawer ---------- */
  function initGatekeeperToggle() {
    const toggleBtn = $("gatekeeper-toggle");
    const body = $("gatekeeper-body");
    const chevron = $("gatekeeper-chevron");
    if (!toggleBtn || !body) return;
    toggleBtn.addEventListener("click", () => {
      const opening = body.classList.contains("hidden");
      body.classList.toggle("hidden", !opening);
      toggleBtn.setAttribute("aria-expanded", opening ? "true" : "false");
      if (chevron) chevron.textContent = opening ? "▴" : "▾";
    });
  }

  /* ---------- Releases & latest.json Rendering ---------- */
  function setDisabledButton(btnEl, labelEl, tagEl, text) {
    if (!btnEl) return;
    btnEl.classList.add("is-disabled");
    btnEl.setAttribute("aria-disabled", "true");
    btnEl.setAttribute("href", "#releases");
    btnEl.removeAttribute("download");
    if (labelEl) labelEl.textContent = text;
    if (tagEl) tagEl.classList.add("hidden");
  }

  function setActiveDownloadButton(btnEl, labelEl, tagEl, rel, { labelText, tagText }) {
    if (!btnEl || !rel || !rel.dmg_url) return;
    btnEl.classList.remove("hidden", "is-disabled");
    btnEl.setAttribute("aria-disabled", "false");
    btnEl.setAttribute("href", rel.dmg_url);
    if (labelEl) labelEl.textContent = labelText;
    if (tagEl) {
      if (tagText) {
        tagEl.textContent = tagText;
        tagEl.classList.remove("hidden");
      } else {
        tagEl.classList.add("hidden");
      }
    }
  }

  function preventDisabledClicks() {
    ["btn-primary-download", "btn-bottom-primary"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("click", (ev) => {
        if (el.getAttribute("aria-disabled") === "true") {
          ev.preventDefault();
          const target = $("releases");
          if (target && typeof target.scrollIntoView === "function") {
            target.scrollIntoView({ behavior: "smooth" });
          }
        }
      });
    });
  }

  function buildMetaLine(latest, prerelease) {
    const metaEl = $("download-meta");
    if (!metaEl) return;
    clearEl(metaEl);

    const chips = [];
    if (latest) {
      const parts = [`Latest v${latest.version}`];
      const sz = formatBytes(latest.size_bytes);
      if (sz) parts.push(sz);
      const dt = formatDate(latest.published_at);
      if (dt) parts.push(dt);
      parts.push(latest.signed ? "Signed & Notarized" : "Unsigned");
      chips.push(parts.join(" · "));
    } else {
      chips.push("Signed stable release coming soon");
    }

    if (prerelease) {
      const sz = formatBytes(prerelease.size_bytes);
      const label = sz
        ? `Preview v${prerelease.version} (${sz})`
        : `Preview v${prerelease.version}`;
      chips.push(label);
    }

    chips.forEach((text, idx) => {
      if (idx > 0) metaEl.appendChild(createEl("span", "meta-sep", "·"));
      metaEl.appendChild(createEl("span", "meta-chip", text));
    });
  }

  function renderReleaseDetail(rel, emptyMessage) {
    const body = $("release-tab-body");
    if (!body) return;
    clearEl(body);

    if (!rel) {
      const empty = createEl("div", "release-notes-box");
      empty.appendChild(createEl("p", "", emptyMessage));
      body.appendChild(empty);
      return;
    }

    const top = createEl("div", "release-detail-top");
    const titleWrap = createEl("div", "release-detail-title");
    titleWrap.appendChild(createEl("h3", "", rel.title || `Document Vault v${rel.version}`));

    const badge = createEl(
      "span",
      `status-badge ${rel.signed ? "status-signed" : "status-preview"}`,
      rel.signed ? "Signed & Notarized" : rel.prerelease ? "Unsigned Preview" : "Unsigned"
    );
    titleWrap.appendChild(badge);

    const metaParts = [];
    if (rel.version) metaParts.push(`v${rel.version}`);
    const sz = formatBytes(rel.size_bytes);
    if (sz) metaParts.push(sz);
    const dt = formatDate(rel.published_at);
    if (dt) metaParts.push(`Released ${dt}`);
    if (metaParts.length) {
      titleWrap.appendChild(createEl("span", "history-meta", metaParts.join(" · ")));
    }

    top.appendChild(titleWrap);

    if (rel.dmg_url) {
      const dlBtn = createEl(
        "a",
        `btn btn-sm ${rel.prerelease ? "btn-secondary" : "btn-primary"}`,
        `Download ${rel.dmg_name || `v${rel.version}.dmg`}`
      );
      dlBtn.setAttribute("href", rel.dmg_url);
      top.appendChild(dlBtn);
    }

    body.appendChild(top);

    const notesBox = createEl("div", "release-notes-box");
    renderNotesSafe(notesBox, rel.notes);
    body.appendChild(notesBox);
  }

  function renderReleaseHistory(history) {
    const body = $("release-tab-body");
    if (!body) return;
    clearEl(body);

    if (!Array.isArray(history) || history.length === 0) {
      const empty = createEl("div", "release-notes-box");
      empty.appendChild(createEl("p", "", "No published releases found yet."));
      body.appendChild(empty);
      return;
    }

    const list = createEl("div", "history-list");
    for (const item of history) {
      const row = createEl("div", "history-row");
      const main = createEl("div", "history-main");
      main.appendChild(createEl("strong", "", `v${item.version}`));
      main.appendChild(
        createEl(
          "span",
          `status-badge ${item.signed ? "status-signed" : "status-preview"}`,
          item.prerelease ? "Pre-release" : item.signed ? "Stable" : "Unsigned"
        )
      );
      const info = [formatDate(item.published_at), formatBytes(item.size_bytes)]
        .filter(Boolean)
        .join(" · ");
      if (info) main.appendChild(createEl("span", "history-meta", info));
      row.appendChild(main);

      if (item.dmg_url) {
        const link = createEl("a", "btn btn-ghost btn-sm", "Download .dmg");
        link.setAttribute("href", item.dmg_url);
        row.appendChild(link);
      }
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  function renderReleaseTab(tabKey) {
    activeReleaseTab = tabKey;
    document.querySelectorAll(".release-tab").forEach((btn) => {
      const active = btn.dataset.releaseTab === tabKey;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    const data = currentPayload || {};
    if (tabKey === "latest") {
      renderReleaseDetail(
        data.latest || null,
        "Stable signed & notarized release is coming soon. Switch to the Pre-release tab to try the latest preview build."
      );
    } else if (tabKey === "prerelease") {
      renderReleaseDetail(
        data.prerelease || null,
        "No active pre-release build is currently posted."
      );
    } else {
      renderReleaseHistory(data.history || []);
    }
  }

  function applyReleasePayload(payload) {
    currentPayload = payload || {};
    const latest = currentPayload.latest || null;
    const prerelease = currentPayload.prerelease || null;

    const releasesUrl = currentPayload.releases_url || DEFAULT_RELEASES_URL;
    const appcastUrl = currentPayload.appcast_url || DEFAULT_APPCAST_URL;
    ["all-releases-link", "footer-releases-link"].forEach((id) => {
      const el = $(id);
      if (el) el.setAttribute("href", releasesUrl);
    });
    ["appcast-link", "footer-appcast-link"].forEach((id) => {
      const el = $(id);
      if (el) el.setAttribute("href", appcastUrl);
    });

    // Primary download buttons (hero + bottom CTA)
    if (latest && latest.dmg_url) {
      const sizeStr = formatBytes(latest.size_bytes);
      setActiveDownloadButton(
        $("btn-primary-download"),
        $("btn-primary-label"),
        $("btn-primary-tag"),
        latest,
        {
          labelText: `Download v${latest.version} for macOS`,
          tagText: sizeStr || "macOS",
        }
      );
      setActiveDownloadButton(
        $("btn-bottom-primary"),
        $("btn-bottom-primary-label"),
        null,
        latest,
        {
          labelText: `Download v${latest.version} for macOS`,
          tagText: "",
        }
      );
    } else {
      setDisabledButton(
        $("btn-primary-download"),
        $("btn-primary-label"),
        $("btn-primary-tag"),
        "Stable Release Coming Soon"
      );
      setDisabledButton(
        $("btn-bottom-primary"),
        $("btn-bottom-primary-label"),
        null,
        "Stable Release Coming Soon"
      );
    }

    // Secondary Pre-release buttons
    const preBtn = $("btn-prerelease-download");
    const preBottomBtn = $("btn-bottom-prerelease");
    if (prerelease && prerelease.dmg_url) {
      const sizeStr = formatBytes(prerelease.size_bytes);
      setActiveDownloadButton(
        preBtn,
        $("btn-prerelease-label"),
        $("btn-prerelease-tag"),
        prerelease,
        {
          labelText: `Pre-release v${prerelease.version}`,
          tagText: sizeStr ? `Preview · ${sizeStr}` : "Preview",
        }
      );
      setActiveDownloadButton(
        preBottomBtn,
        $("btn-bottom-prerelease-label"),
        null,
        prerelease,
        {
          labelText: `Try Pre-release v${prerelease.version}`,
          tagText: "",
        }
      );
    } else {
      if (preBtn) preBtn.classList.add("hidden");
      if (preBottomBtn) preBottomBtn.classList.add("hidden");
    }

    buildMetaLine(latest, prerelease);

    // Show Gatekeeper helper whenever an unsigned build is offered
    const hasUnsignedOffer = Boolean(
      (latest && latest.signed === false) || (prerelease && prerelease.signed === false)
    );
    const gatekeeper = $("gatekeeper-banner");
    if (gatekeeper) {
      gatekeeper.classList.toggle("hidden", !hasUnsignedOffer);
    }

    // Default tab: Latest if available, otherwise Pre-release if available
    const defaultTab = !latest && prerelease ? "prerelease" : "latest";
    renderReleaseTab(defaultTab);
  }

  async function fetchReleasesMetadata() {
    const primaryMeta = document.querySelector('meta[name="releases-json"]');
    const fallbackMeta = document.querySelector('meta[name="releases-json-fallback"]');
    const candidates = [
      window.DV_RELEASES_JSON_URL,
      primaryMeta ? primaryMeta.getAttribute("content") : "",
      fallbackMeta ? fallbackMeta.getAttribute("content") : "",
    ].filter((u, idx, arr) => Boolean(u) && arr.indexOf(u) === idx);

    for (const url of candidates) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) continue;
        const json = await res.json();
        if (json && typeof json === "object") {
          applyReleasePayload(json);
          return;
        }
      } catch {
        // try next candidate
      }
    }

    applyReleasePayload({
      latest: null,
      prerelease: null,
      history: [],
      releases_url: DEFAULT_RELEASES_URL,
      appcast_url: DEFAULT_APPCAST_URL,
    });
    const status = $("download-status-text");
    if (status) {
      status.textContent = "Release feed unavailable right now — check All GitHub Releases below.";
    }
  }

  function initReleaseTabs() {
    document.querySelectorAll(".release-tab").forEach((btn) => {
      btn.addEventListener("click", () => renderReleaseTab(btn.dataset.releaseTab || "latest"));
    });
  }

  function boot() {
    initThemeControls();
    initShowcase();
    initGatekeeperToggle();
    initReleaseTabs();
    preventDisabledClicks();
    fetchReleasesMetadata();
  }

  window.__dvSite = {
    applyReleasePayload,
    applyTheme,
    formatBytes,
    renderReleaseTab,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
