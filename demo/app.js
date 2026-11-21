(() => {
  const VAULT_PAGE_SIZE = 48;
  const VAULT_RECONCILE_THROTTLE_MS = 15000;

  const state = {
    settings: null,
    models: [],
    reviewItems: [],
    reviewLoading: false,
    reviewReloadQueued: false,
    reviewLoadedOnce: false,
    lastPendingReviews: null,
    vaultDocs: [],
    vaultDocsById: new Map(),
    vaultTotal: 0,
    vaultTotalCount: null,
    vaultHasMore: false,
    vaultLoading: false,
    vaultLoadingMore: false,
    vaultRequestSeq: 0,
    vaultAbortController: null,
    vaultLastRenderSig: "",
    vaultLastReconcileAt: 0,
    vaultAnimCleanupTimer: null,
    vaultOpenPendingAnimation: true,
    latestHealth: null,
    vlmPopoverOpen: false,
    vlmBannerDismissed: false,
    lastVlmUiSig: "",
    tabAnimTimer: null,
    tabAnimEndEl: null,
    tabAnimEndHandler: null,
    vaultScrollObserver: null,
    vaultFloatObserver: null,
    settingsFloatObserver: null,
    selectedDocIds: new Set(),
    lastSelectedDocIdx: null,
    vaultCategory: "",
    vaultHighlightDocId: null,
    vaultHighlightRelPath: "",
    activityFilter: "all",
    latestActivity: [],
    lastActivityRenderKey: "",
    queueExpanded: false,
    fastPollTimer: null,
    wasQueueBusy: false,
  };

  function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ── Theme Selection (Auto / Light / Dark) ────────────────────────────────
  const THEME_STORAGE_KEY = "dv_theme_mode";
  const INVERT_DOCS_STORAGE_KEY = "dv_invert_docs_dark";
  const themeMediaQuery = window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

  function getStoredInvertDocsDark() {
    try {
      return localStorage.getItem(INVERT_DOCS_STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  }

  function saveInvertDocsDark(enabled) {
    try {
      if (enabled) {
        localStorage.removeItem(INVERT_DOCS_STORAGE_KEY);
      } else {
        localStorage.setItem(INVERT_DOCS_STORAGE_KEY, "false");
      }
    } catch {
      // ignore storage errors (e.g. private browsing)
    }
  }

  function applyInvertDocsDark(enabled) {
    const active = Boolean(enabled);
    document.documentElement.dataset.invertDocsDark = active ? "true" : "false";
    const settingsToggle = $("#set-invert-docs-dark");
    if (settingsToggle) {
      settingsToggle.checked = active;
    }
    $$(".preview-invert-cb").forEach((cb) => {
      cb.checked = active;
    });
  }

  function setInvertDocsDark(enabled) {
    const active = Boolean(enabled);
    saveInvertDocsDark(active);
    applyInvertDocsDark(active);
  }

  function getSystemTheme() {
    return themeMediaQuery && themeMediaQuery.matches ? "dark" : "light";
  }

  function getStoredThemeMode() {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return saved === "light" || saved === "dark" ? saved : "auto";
    } catch {
      return "auto";
    }
  }

  function saveThemeMode(mode) {
    try {
      if (mode === "auto") {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, mode);
      }
    } catch {
      // ignore storage errors (e.g. private browsing)
    }
  }

  function resolveTheme(mode) {
    return mode === "light" || mode === "dark" ? mode : getSystemTheme();
  }

  function applyTheme(mode) {
    const normalizedMode = mode === "light" || mode === "dark" ? mode : "auto";
    const effective = resolveTheme(normalizedMode);
    const isAuto = normalizedMode === "auto";

    document.documentElement.dataset.themeMode = normalizedMode;
    document.documentElement.dataset.theme = effective;
    document.documentElement.style.colorScheme = effective;

    const controls = $("#theme-controls");
    const lightBtn = $("#theme-light-btn");
    const darkBtn = $("#theme-dark-btn");
    const autoBtn = $("#theme-auto-btn");

    if (controls) {
      controls.classList.toggle("is-auto", isAuto);
      controls.classList.toggle("is-manual", !isAuto);
      controls.dataset.effectiveTheme = effective;
    }

    // In auto mode, show only the opposite icon to the currently shown theme.
    // In manual mode, show sun, moon, and auto buttons with the picked option highlighted.
    if (lightBtn) {
      const showLight = !isAuto || effective === "dark";
      const isPicked = normalizedMode === "light";
      lightBtn.classList.toggle("hidden", !showLight);
      lightBtn.classList.toggle("active", isPicked);
      lightBtn.setAttribute("aria-pressed", String(isPicked));
      lightBtn.setAttribute(
        "title",
        isAuto ? "System theme (Dark) · Switch to Light theme" : "Light theme"
      );
      lightBtn.setAttribute(
        "aria-label",
        isAuto ? "System theme (Dark). Switch to Light theme" : "Light theme"
      );
    }

    if (darkBtn) {
      const showDark = !isAuto || effective === "light";
      const isPicked = normalizedMode === "dark";
      darkBtn.classList.toggle("hidden", !showDark);
      darkBtn.classList.toggle("active", isPicked);
      darkBtn.setAttribute("aria-pressed", String(isPicked));
      darkBtn.setAttribute(
        "title",
        isAuto ? "System theme (Light) · Switch to Dark theme" : "Dark theme"
      );
      darkBtn.setAttribute(
        "aria-label",
        isAuto ? "System theme (Light). Switch to Dark theme" : "Dark theme"
      );
    }

    if (autoBtn) {
      autoBtn.classList.toggle("hidden", isAuto);
      autoBtn.classList.toggle("active", isAuto);
      autoBtn.setAttribute("aria-pressed", String(isAuto));
    }
  }

  function setThemeMode(mode) {
    const normalizedMode = mode === "light" || mode === "dark" ? mode : "auto";
    saveThemeMode(normalizedMode);
    applyTheme(normalizedMode);
  }

  function initTheme() {
    applyTheme(getStoredThemeMode());
    applyInvertDocsDark(getStoredInvertDocsDark());

    const lightBtn = $("#theme-light-btn");
    const darkBtn = $("#theme-dark-btn");
    const autoBtn = $("#theme-auto-btn");
    const invertDocsToggle = $("#set-invert-docs-dark");
    if (lightBtn) {
      lightBtn.addEventListener("click", () => setThemeMode("light"));
    }
    if (darkBtn) {
      darkBtn.addEventListener("click", () => setThemeMode("dark"));
    }
    if (autoBtn) {
      autoBtn.addEventListener("click", () => setThemeMode("auto"));
    }
    if (invertDocsToggle) {
      invertDocsToggle.addEventListener("change", (e) => {
        setInvertDocsDark(e.target.checked);
        setSettingsSaveStatus("saved", "Saved");
      });
    }
    if (themeMediaQuery) {
      const onSystemThemeChange = () => {
        if (getStoredThemeMode() === "auto") {
          applyTheme("auto");
        }
      };
      if (typeof themeMediaQuery.addEventListener === "function") {
        themeMediaQuery.addEventListener("change", onSystemThemeChange);
      } else if (typeof themeMediaQuery.addListener === "function") {
        themeMediaQuery.addListener(onSystemThemeChange);
      }
    }
    window.addEventListener("storage", (e) => {
      if (e.key === THEME_STORAGE_KEY || e.key === null) {
        applyTheme(getStoredThemeMode());
      }
      if (e.key === INVERT_DOCS_STORAGE_KEY || e.key === null) {
        applyInvertDocsDark(getStoredInvertDocsDark());
      }
    });
  }

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getCategoryTone(category) {
    const str = String(category || "");
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return `tone-${hash % 8}`;
  }

  function formatRelativeOrShortTime(isoStr) {
    if (!isoStr) return "";
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return "";
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec >= 0 && diffSec < 60) return "Just now";
    if (diffSec >= 60 && diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
      " · " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function navigateToVaultDocument({ documentId = null, category = "", vaultRelPath = "" } = {}) {
    state.vaultCategory = category || "";
    state.vaultHighlightDocId = documentId ? Number(documentId) : null;
    state.vaultHighlightRelPath = vaultRelPath || "";
    const searchEl = $("#vault-search");
    const yearEl = $("#vault-filter-year");
    const sortEl = $("#vault-sort");
    if (searchEl) searchEl.value = "";
    if (yearEl) yearEl.value = "";
    if (sortEl) sortEl.value = "recent";
    switchTab("vault");
  }

  function toast(message, isError = false) {
    const el = document.createElement("div");
    el.className = `toast ${isError ? "toast-error" : ""}`;
    el.textContent = message;
    $("#toast-container").appendChild(el);
    setTimeout(() => {
      el.classList.add("toast-hide");
      setTimeout(() => el.remove(), 220);
    }, 3600);
  }

  function removeCardSmoothly(cardEl, onDone) {
    cardEl.classList.add("card-exiting");
    setTimeout(() => {
      cardEl.remove();
      if (onDone) onDone();
    }, 200);
  }

  async function api(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || `Request failed (${res.status})`);
    }
    return data;
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const ACTIVE_TAB_STORAGE_KEY = "dv_active_tab";
  const VALID_TABS = new Set(["vault", "review", "settings"]);
  const TAB_SLIDE_CLASSES = [
    "is-entering",
    "is-leaving",
    "is-slide-forward",
    "is-slide-backward",
  ];

  function getStoredActiveTab() {
    try {
      const fromDataset = document.documentElement?.dataset?.savedTab;
      if (VALID_TABS.has(fromDataset)) return fromDataset;
      if (typeof sessionStorage !== "undefined") {
        const saved = sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
        if (VALID_TABS.has(saved)) return saved;
      }
    } catch {
      // ignore storage access errors
    }
    return "vault";
  }

  function saveActiveTab(tabName) {
    if (!VALID_TABS.has(tabName)) return;
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, tabName);
      }
    } catch {
      // ignore storage access errors
    }
  }

  function applyActiveTabButtons(tabName) {
    $$(".tab").forEach((btn) => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  function restoreInitialTab() {
    const candidate = getStoredActiveTab();
    const targetPanel = $(`#tab-${candidate}`);
    const initialTab = targetPanel ? candidate : "vault";
    applyActiveTabButtons(initialTab);
    $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${initialTab}`));
    if (document.documentElement && document.documentElement.dataset) {
      delete document.documentElement.dataset.bootingTab;
      delete document.documentElement.dataset.savedTab;
    }
    updateTabIndicator({ immediate: true });
    return initialTab;
  }

  function updateTabIndicator({ immediate = false } = {}) {
    const tabsNav = $(".tabs");
    const indicator = $("#tab-indicator");
    const activeTab = $(".tab.active");
    if (!tabsNav || !indicator || !activeTab) return;
    if (typeof activeTab.offsetLeft !== "number" || typeof activeTab.offsetWidth !== "number") return;
    const width = activeTab.offsetWidth;
    const left = activeTab.offsetLeft;
    if (width <= 0) return;

    if (immediate || prefersReducedMotion()) {
      indicator.style.transition = "none";
      indicator.style.width = `${width}px`;
      indicator.style.transform = `translate3d(${left}px, 0, 0)`;
      tabsNav.classList.add("has-indicator");
      void indicator.offsetWidth;
      indicator.style.transition = "";
      return;
    }

    tabsNav.classList.add("has-indicator");
    indicator.style.width = `${width}px`;
    indicator.style.transform = `translate3d(${left}px, 0, 0)`;
  }

  function setPageTabTransitioning(active) {
    if (document.documentElement && document.documentElement.classList) {
      document.documentElement.classList.toggle("is-tab-transitioning", active);
    }
    if (document.body && document.body.classList) {
      document.body.classList.toggle("is-tab-transitioning", active);
    }
    const stage = $("#tab-panels-stage");
    if (stage) {
      stage.classList.toggle("is-transitioning", active);
    }
  }

  function cleanupTabTransition() {
    clearTimeout(state.tabAnimTimer);
    state.tabAnimTimer = null;
    if (state.tabAnimEndEl && state.tabAnimEndHandler) {
      if (typeof state.tabAnimEndEl.removeEventListener === "function") {
        state.tabAnimEndEl.removeEventListener("animationend", state.tabAnimEndHandler);
      }
    }
    state.tabAnimEndEl = null;
    state.tabAnimEndHandler = null;

    setPageTabTransitioning(false);
    $$(".tab-panel").forEach((panel) => {
      panel.classList.remove(...TAB_SLIDE_CLASSES);
    });
  }

  function getTabIndex(tabName) {
    const tabs = $$(".tab").map((btn) => btn.dataset.tab);
    const order = tabs.length ? tabs : ["vault", "review", "settings"];
    return order.indexOf(tabName);
  }

  function switchTab(tabName) {
    const nextPanel = $(`#tab-${tabName}`);
    const prevPanel = $(".tab-panel.active");
    const prevTabName = prevPanel && prevPanel.id ? prevPanel.id.replace(/^tab-/, "") : "";
    const isSwitchingPanel = Boolean(prevPanel && nextPanel && prevPanel !== nextPanel);
    const wasVaultActive = $("#tab-vault").classList.contains("active");

    if (isSwitchingPanel) {
      cleanupTabTransition();
    }

    saveActiveTab(tabName);
    applyActiveTabButtons(tabName);
    updateTabIndicator();

    if (isSwitchingPanel && !prefersReducedMotion()) {
      const prevIdx = getTabIndex(prevTabName);
      const nextIdx = getTabIndex(tabName);
      const dirClass = prevIdx !== -1 && nextIdx !== -1 && nextIdx < prevIdx
        ? "is-slide-backward"
        : "is-slide-forward";

      $$(".tab-panel").forEach((p) => p.classList.toggle("active", p === nextPanel));

      void nextPanel.offsetWidth;
      void prevPanel.offsetWidth;

      setPageTabTransitioning(true);
      prevPanel.classList.add("is-leaving", dirClass);
      nextPanel.classList.add("is-entering", dirClass);

      const onAnimEnd = (e) => {
        if (e.target !== nextPanel) return;
        if (e.animationName && !e.animationName.startsWith("tabSlideIn")) return;
        cleanupTabTransition();
      };
      state.tabAnimEndEl = nextPanel;
      state.tabAnimEndHandler = onAnimEnd;
      if (typeof nextPanel.addEventListener === "function") {
        nextPanel.addEventListener("animationend", onAnimEnd);
      }
      state.tabAnimTimer = setTimeout(cleanupTabTransition, 460);
    } else {
      $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tabName}`));
    }

    if (tabName === "review") loadReviewQueue();
    if (tabName === "vault") {
      const hasRenderedDocs = state.vaultDocs.length > 0;
      const hasPendingHighlight = Boolean(state.vaultHighlightDocId || state.vaultHighlightRelPath);
      if (!wasVaultActive && !hasRenderedDocs) {
        state.vaultOpenPendingAnimation = true;
      }
      loadVaultDocuments({
        reason: hasRenderedDocs && !hasPendingHighlight && !state.vaultOpenPendingAnimation ? "sync" : "open",
        reconcile: true,
      });
    }
    if (tabName === "settings") loadSettingsIntoForm();
  }

  $$(".tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  if (typeof window.addEventListener === "function") {
    window.addEventListener("resize", () => updateTabIndicator({ immediate: true }));
  }
  if (typeof ResizeObserver === "function" && $(".tabs")) {
    const tabResizeObserver = new ResizeObserver(() => updateTabIndicator({ immediate: true }));
    tabResizeObserver.observe($(".tabs"));
  }

  function shortModelLabel(modelId) {
    if (!modelId) return "";
    const parts = String(modelId).split("/");
    return parts[parts.length - 1] || String(modelId);
  }

  function formatBytesGiB(bytes) {
    const n = Number(bytes || 0);
    if (n <= 0) return "0 MB";
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
    return `${(n / 1024 ** 2).toFixed(0)} MB`;
  }

  function formatUnloadTooltip(seconds) {
    const s = Math.max(0, Math.round(Number(seconds)));
    const mins = Math.floor(s / 60);
    const rem = s % 60;
    if (mins > 0) return `${mins}m ${rem}s`;
    return `${rem}s`;
  }

  let ramClockTimer = null;
  let ramUnloadDeadlineMs = null;
  let ramKeepAliveSeconds = 600;

  function renderRamBadge({ loaded = false, unloadInSeconds = null, keepAliveSeconds = 600 } = {}) {
    const badge = $("#vlm-ram-badge");
    const label = $("#vlm-ram-label");
    const pill = $("#vlm-pill");
    if (!badge) return;

    if (!loaded) {
      badge.classList.add("hidden");
      ramUnloadDeadlineMs = null;
      if (ramClockTimer) {
        clearInterval(ramClockTimer);
        ramClockTimer = null;
      }
      return;
    }

    badge.classList.remove("hidden");
    let remainingSecs = unloadInSeconds;
    if (remainingSecs === null && ramUnloadDeadlineMs !== null) {
      remainingSecs = Math.max(0, Math.round((ramUnloadDeadlineMs - Date.now()) / 1000));
    }
    const total = Math.max(1, Number(keepAliveSeconds || ramKeepAliveSeconds || 600));
    const pct =
      typeof remainingSecs === "number" && Number.isFinite(remainingSecs)
        ? Math.max(0, Math.min(100, (remainingSecs / total) * 100))
        : 100;

    if (typeof badge.style?.setProperty === "function") {
      badge.style.setProperty("--ram-pct", pct.toFixed(1));
    } else if (badge.style) {
      badge.style["--ram-pct"] = pct.toFixed(1);
    }

    if (label) label.textContent = "in RAM";
    if (typeof remainingSecs === "number" && Number.isFinite(remainingSecs)) {
      const tip = `Unloads from memory in ${formatUnloadTooltip(remainingSecs)} of inactivity`;
      badge.title = tip;
      if (pill) pill.title = `Loaded in unified memory · ${tip}`;
    } else {
      const tip = "Model active in unified memory";
      badge.title = tip;
      if (pill) pill.title = tip;
    }
  }

  function syncRamClock(vlm) {
    const isLoaded = Boolean(vlm?.selected_model && vlm?.loaded_model === vlm?.selected_model);
    if (!isLoaded) {
      renderRamBadge({ loaded: false });
      return;
    }
    if (typeof vlm.keep_alive_seconds === "number" && vlm.keep_alive_seconds > 0) {
      ramKeepAliveSeconds = vlm.keep_alive_seconds;
    }
    const hasEta = typeof vlm.unload_in_seconds === "number" && Number.isFinite(vlm.unload_in_seconds);
    ramUnloadDeadlineMs = hasEta ? Date.now() + vlm.unload_in_seconds * 1000 : null;
    renderRamBadge({
      loaded: true,
      unloadInSeconds: hasEta ? vlm.unload_in_seconds : null,
      keepAliveSeconds: ramKeepAliveSeconds,
    });
    if (hasEta && !ramClockTimer) {
      ramClockTimer = setInterval(() => {
        if (ramUnloadDeadlineMs === null) return;
        const secs = Math.max(0, Math.round((ramUnloadDeadlineMs - Date.now()) / 1000));
        renderRamBadge({
          loaded: true,
          unloadInSeconds: secs,
          keepAliveSeconds: ramKeepAliveSeconds,
        });
      }, 1000);
    }
  }

  // ── Health, MLX VLM & Watcher Topbar ────────────────────────────────────
  async function refreshHealth() {
    try {
      const h = await api("/api/health");
      const versionBadge = $("#app-version-badge");
      if (versionBadge && h.version) {
        versionBadge.textContent = `v${h.version}`;
      }
      const pill = $("#vlm-pill");
      const pillText = $("#vlm-pill-text");
      pill.classList.remove("status-ok", "status-warn", "status-err", "status-neutral");
      pill.title = "Local MLX Vision model status";

      const vlm = h.vlm || {};
      const dl = vlm.download || {};
      if (dl.status === "downloading") {
        pill.classList.add("status-warn");
        const pct = Math.round(Number(dl.percent || 0));
        pillText.textContent = `Downloading ${shortModelLabel(dl.model_id)} (${pct}%)…`;
        syncRamClock(null);
      } else if (vlm.loading) {
        pill.classList.add("status-warn");
        const loadTarget = shortModelLabel(vlm.loading_model || vlm.selected_model);
        const pct = typeof vlm.loading_percent === "number" ? ` (${Math.round(vlm.loading_percent)}%)` : "";
        pillText.textContent = `Loading ${loadTarget}${pct}…`;
        syncRamClock(null);
      } else if (!vlm.selected_model) {
        pill.classList.add("status-warn");
        pillText.textContent = `MLX · Pick or Download Model (${vlm.downloaded_count || 0} cached)`;
        syncRamClock(null);
      } else if (!vlm.selected_downloaded) {
        pill.classList.add("status-warn");
        pillText.textContent = `${shortModelLabel(vlm.selected_model)} · Download Required`;
        syncRamClock(null);
      } else if (vlm.loaded_model === vlm.selected_model) {
        pill.classList.add("status-ok");
        pillText.textContent = `MLX · ${shortModelLabel(vlm.selected_model)}`;
        syncRamClock(vlm);
      } else {
        pill.classList.add("status-ok");
        pillText.textContent = `MLX · ${shortModelLabel(vlm.selected_model)}`;
        syncRamClock(null);
      }

      if (typeof vlm.system_ram_gb === "number") {
        state.systemRamGb = vlm.system_ram_gb;
      }
      state.latestHealth = h;
      updateRuntimeActionButtons(vlm);
      if (dl.status && dl.status !== "idle") {
        renderDownloadProgress(dl);
      }
      renderVlmStatusBanner(h);
      if (state.vlmPopoverOpen) {
        renderVlmPopover(h);
      }

      const vlmUiSig = JSON.stringify([
        Boolean(vlm.ready),
        vlm.selected_model || "",
        dl.status || "idle",
        Math.round(Number(dl.percent || 0)),
        Boolean(h.watcher?.watcher_enabled),
        Boolean(h.watcher?.is_watching),
        Boolean(h.watcher?.waiting_for_model),
      ]);
      if (vlmUiSig !== state.lastVlmUiSig) {
        state.lastVlmUiSig = vlmUiSig;
        if (state.vaultTotalCount === 0 && $("#tab-vault")?.classList.contains("active")) {
          const hasOnboardEmpty = Boolean($("#vault-list")?.querySelector(".vault-onboard-empty"));
          if (hasOnboardEmpty) {
            renderVaultGrid([], { animateMode: "none" });
          }
        }
      }

      const nextPending = Number(h.pending_reviews || 0);
      const prevPending = state.lastPendingReviews;
      state.lastPendingReviews = nextPending;
      updateReviewBadge(nextPending);

      const reviewTabActive = Boolean($("#tab-review")?.classList.contains("active"));
      const reviewCountChanged = prevPending !== null && nextPending !== prevPending;
      const reviewCountMismatch = state.reviewLoadedOnce && nextPending !== state.reviewItems.length;
      const reviewNeedsInitialLoad = !state.reviewLoadedOnce && nextPending > 0;
      const shouldRefreshReview =
        reviewTabActive && (reviewCountChanged || reviewCountMismatch || reviewNeedsInitialLoad);

      renderWatcherTopbar(h.watcher, { skipReviewReload: shouldRefreshReview });
      if (shouldRefreshReview) {
        loadReviewQueue({ skipTopbar: true });
      }
    } catch {
      // ignore transient poll errors
    }
  }

  function updateReviewBadge(count) {
    const badge = $("#review-badge");
    const nextText = String(count);
    const shouldHide = count <= 0;
    const changed = badge.textContent !== nextText || badge.classList.contains("hidden") !== shouldHide;
    badge.textContent = nextText;
    badge.classList.toggle("hidden", shouldHide);
    if (changed) {
      updateTabIndicator({ immediate: true });
    }
  }

  function ensureFastQueuePoll() {
    if (state.fastPollTimer) return;
    state.fastPollTimer = setInterval(refreshHealth, 650);
  }

  function stopFastQueuePoll() {
    if (!state.fastPollTimer) return;
    clearInterval(state.fastPollTimer);
    state.fastPollTimer = null;
  }

  function getRecommendedModelInfo() {
    const models = state.models || [];
    return (
      models.find((m) => m.recommended_for_device) ||
      models.find((m) => m.downloaded) ||
      models[0] ||
      null
    );
  }

  function getSelectedOrRecommendedModelId(vlm = state.latestHealth?.vlm) {
    const selected = String(vlm?.selected_model || state.settings?.vlm_model || "").trim();
    if (selected) return selected;
    const rec = getRecommendedModelInfo();
    return rec ? rec.name : "";
  }

  async function ensureModelsLoaded() {
    if (!state.models || state.models.length === 0) {
      try {
        await fetchVlmModels($("#set-vlm-model"));
      } catch {
        // ignore
      }
    }
  }

  function getModelReadinessState(h = state.latestHealth) {
    const vlm = h?.vlm || {};
    const dl = vlm.download || {};
    if (dl.status === "downloading") return "downloading";
    if (vlm.ready) return "ready";
    return "missing";
  }

  function renderVlmStatusBanner(h) {
    const banner = $("#vlm-status-banner");
    if (!banner || !h) return;
    const vlm = h.vlm || {};
    const dl = vlm.download || {};
    const setupDone = Boolean(h.setup_completed ?? state.settings?.setup_completed);

    if (dl.status === "downloading") {
      const pct = Math.max(0, Math.min(100, Number(dl.percent || 0)));
      const shortName = shortModelLabel(dl.model_id);
      const sizeText =
        dl.total_bytes > 0
          ? `${formatBytesGiB(dl.downloaded_bytes)} / ${formatBytesGiB(dl.total_bytes)}`
          : formatBytesGiB(dl.downloaded_bytes);
      const waitCount = Number(h.watcher?.waiting_for_model_count || 0);
      const waitHint = waitCount > 0 ? ` · ${waitCount} queued file${waitCount === 1 ? "" : "s"} will auto-process when done` : "";
      banner.classList.remove("hidden", "is-warn");
      banner.innerHTML = `
        <div class="vlm-banner-main">
          <div class="vlm-banner-text">
            <div class="vlm-banner-title">Downloading ${esc(shortName)} (${pct.toFixed(0)}% · ${esc(sizeText)})</div>
            <div class="vlm-banner-sub">${esc(dl.current_file || "Downloading weights locally…")}${esc(waitHint)}</div>
            <div class="progress-bar-track" style="margin-top:4px;">
              <div class="progress-bar-fill" style="width:${Math.max(4, pct)}%"></div>
            </div>
          </div>
        </div>
        <div class="vlm-banner-actions">
          <button type="button" class="btn btn-ghost-danger btn-xs" data-banner-action="cancel-dl">Cancel</button>
        </div>
      `;
      const cancelBtn = banner.querySelector('[data-banner-action="cancel-dl"]');
      if (cancelBtn) {
        cancelBtn.addEventListener("click", async () => {
          try {
            const res = await api("/api/models/download/cancel", { method: "POST" });
            renderDownloadProgress(res);
            toast("Cancelling download…");
            refreshHealth();
          } catch (err) {
            toast(err.message, true);
          }
        });
      }
      return;
    }

    if (setupDone && !vlm.ready && !state.vlmBannerDismissed) {
      const targetId = getSelectedOrRecommendedModelId(vlm);
      const info = findCatalogModel(targetId);
      const sizeLabel = info?.size_gb ? ` (${info.size_gb} GB)` : "";
      const dlLabel = targetId ? `Download ${shortModelLabel(targetId)}${sizeLabel}` : "Choose Model";
      banner.classList.remove("hidden");
      banner.classList.add("is-warn");
      banner.innerHTML = `
        <div class="vlm-banner-main">
          <div class="vlm-banner-text">
            <div class="vlm-banner-title">Local Vision Model required to read &amp; file documents</div>
            <div class="vlm-banner-sub">One-time download runs 100% locally on Apple Silicon — your scans never leave this Mac.</div>
          </div>
        </div>
        <div class="vlm-banner-actions">
          <button type="button" class="btn btn-primary btn-xs" data-banner-action="download">${esc(dlLabel)}</button>
          <button type="button" class="btn btn-secondary btn-xs" data-banner-action="settings">Settings</button>
          <button type="button" class="btn btn-secondary btn-xs" data-banner-action="dismiss" title="Dismiss banner">×</button>
        </div>
      `;
      banner.querySelector('[data-banner-action="download"]')?.addEventListener("click", async () => {
        await ensureModelsLoaded();
        const modelToDl = getSelectedOrRecommendedModelId(state.latestHealth?.vlm);
        if (!modelToDl) {
          switchTab("settings");
          return;
        }
        try {
          await api("/api/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vlm_model: modelToDl }),
          });
          await startModelDownload(modelToDl);
          toast(`Downloading ${shortModelLabel(modelToDl)}…`);
        } catch (err) {
          toast(err.message, true);
        }
      });
      banner.querySelector('[data-banner-action="settings"]')?.addEventListener("click", () => switchTab("settings"));
      banner.querySelector('[data-banner-action="dismiss"]')?.addEventListener("click", () => {
        state.vlmBannerDismissed = true;
        banner.classList.add("hidden");
      });
      return;
    }

    banner.classList.add("hidden");
  }

  function closeVlmPopover() {
    state.vlmPopoverOpen = false;
    const pop = $("#vlm-popover");
    const pill = $("#vlm-pill");
    if (pop) pop.classList.add("hidden");
    if (pill && typeof pill.setAttribute === "function") pill.setAttribute("aria-expanded", "false");
  }

  function renderVlmPopover(h = state.latestHealth) {
    const pop = $("#vlm-popover");
    if (!pop) return;
    const vlm = h?.vlm || {};
    const dl = vlm.download || {};
    let html = "";

    if (dl.status === "downloading") {
      const pct = Math.max(0, Math.min(100, Number(dl.percent || 0)));
      const sizeText =
        dl.total_bytes > 0
          ? `${formatBytesGiB(dl.downloaded_bytes)} / ${formatBytesGiB(dl.total_bytes)}`
          : formatBytesGiB(dl.downloaded_bytes);
      html = `
        <div class="vlm-popover-head">
          <div class="vlm-popover-title">Downloading ${esc(shortModelLabel(dl.model_id))}</div>
          <span class="tag tag-warn">${pct.toFixed(0)}%</span>
        </div>
        <div class="vlm-popover-sub">${esc(sizeText)} · ${esc(dl.current_file || "Downloading…")}</div>
        <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${Math.max(4, pct)}%"></div></div>
        <div class="vlm-popover-actions">
          <button type="button" class="btn btn-ghost-danger btn-xs" data-pop-action="cancel-dl">Cancel Download</button>
          <button type="button" class="btn btn-secondary btn-xs" data-pop-action="settings">Model Settings</button>
        </div>
      `;
    } else if (vlm.loading) {
      const loadTarget = shortModelLabel(vlm.loading_model || vlm.selected_model);
      const pct = typeof vlm.loading_percent === "number" ? ` (${Math.round(vlm.loading_percent)}%)` : "";
      html = `
        <div class="vlm-popover-head">
          <div class="vlm-popover-title">Loading ${esc(loadTarget)}${esc(pct)}</div>
          <span class="tag tag-warn">Cold Load</span>
        </div>
        <div class="vlm-popover-sub">First-time load into Apple Silicon unified memory. Subsequent scans reuse cached weights immediately.</div>
      `;
    } else if (vlm.ready) {
      const name = shortModelLabel(vlm.selected_model);
      const isInRam = vlm.loaded_model === vlm.selected_model;
      const ramInfo = isInRam
        ? `Loaded in RAM${typeof vlm.unload_in_seconds === "number" ? ` · auto-unloads in ${formatDurationShort(vlm.unload_in_seconds)}` : ""}`
        : "Cached on disk · loads automatically on next scan";
      html = `
        <div class="vlm-popover-head">
          <div class="vlm-popover-title">${esc(name)}</div>
          <span class="tag tag-ok">Ready</span>
        </div>
        <div class="vlm-popover-sub">${esc(ramInfo)}</div>
        <div class="vlm-popover-actions">
          ${isInRam ? `<button type="button" class="btn btn-secondary btn-xs" data-pop-action="unload">Unload RAM</button>` : ""}
          <button type="button" class="btn btn-secondary btn-xs" data-pop-action="settings">Switch Model…</button>
        </div>
      `;
    } else {
      const targetId = getSelectedOrRecommendedModelId(vlm);
      const info = findCatalogModel(targetId);
      const sizeText = info?.size_gb ? ` (${info.size_gb} GB)` : "";
      html = `
        <div class="vlm-popover-head">
          <div class="vlm-popover-title">Vision Model Not Ready</div>
          <span class="tag tag-warn">Setup Needed</span>
        </div>
        <div class="vlm-popover-sub">Download a local MLX model once to classify and rename your scans offline.</div>
        <div class="vlm-popover-actions">
          ${targetId ? `<button type="button" class="btn btn-primary btn-xs" data-pop-action="download">Download ${esc(shortModelLabel(targetId))}${esc(sizeText)}</button>` : ""}
          <button type="button" class="btn btn-secondary btn-xs" data-pop-action="settings">Choose Model…</button>
        </div>
      `;
    }

    pop.innerHTML = html;
    pop.querySelector('[data-pop-action="settings"]')?.addEventListener("click", () => {
      closeVlmPopover();
      switchTab("settings");
    });
    pop.querySelector('[data-pop-action="unload"]')?.addEventListener("click", async () => {
      try {
        await api("/api/models/unload", { method: "POST" });
        toast("Unloaded model from memory");
        closeVlmPopover();
        refreshHealth();
      } catch (err) {
        toast(err.message, true);
      }
    });
    pop.querySelector('[data-pop-action="cancel-dl"]')?.addEventListener("click", async () => {
      try {
        await api("/api/models/download/cancel", { method: "POST" });
        toast("Cancelling download…");
        closeVlmPopover();
        refreshHealth();
      } catch (err) {
        toast(err.message, true);
      }
    });
    pop.querySelector('[data-pop-action="download"]')?.addEventListener("click", async () => {
      await ensureModelsLoaded();
      const targetId = getSelectedOrRecommendedModelId(state.latestHealth?.vlm);
      if (!targetId) {
        closeVlmPopover();
        switchTab("settings");
        return;
      }
      try {
        await api("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vlm_model: targetId }),
        });
        await startModelDownload(targetId);
        toast(`Downloading ${shortModelLabel(targetId)}…`);
        renderVlmPopover(state.latestHealth);
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  const vlmPillEl = $("#vlm-pill");
  if (vlmPillEl) {
    vlmPillEl.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (state.vlmPopoverOpen) {
        closeVlmPopover();
        return;
      }
      await ensureModelsLoaded();
      state.vlmPopoverOpen = true;
      const pop = $("#vlm-popover");
      if (pop) pop.classList.remove("hidden");
      if (typeof vlmPillEl.setAttribute === "function") vlmPillEl.setAttribute("aria-expanded", "true");
      renderVlmPopover(state.latestHealth);
    });
  }
  if (typeof document.addEventListener === "function") {
    document.addEventListener("click", (e) => {
      if (!state.vlmPopoverOpen) return;
      const wrap = $(".vlm-pill-wrap");
      if (wrap && typeof wrap.contains === "function" && wrap.contains(e.target)) return;
      closeVlmPopover();
    });
  }

  function renderWatcherTopbar(w, { skipReviewReload = false } = {}) {
    if (!w) return;
    $("#watcher-toggle").checked = Boolean(w.watcher_enabled);
    if ($("#set-watcher-enabled") && !settingsSaveInFlight) {
      $("#set-watcher-enabled").checked = Boolean(w.watcher_enabled);
    }
    if (w.is_scanning) {
      $("#watcher-status-text").textContent = "Processing…";
    } else if (w.waiting_for_model && w.watcher_enabled) {
      $("#watcher-status-text").textContent = "Waiting for Model";
    } else if (w.is_watching) {
      $("#watcher-status-text").textContent = "Watching";
    } else {
      $("#watcher-status-text").textContent = "Watcher Off";
    }
    $("#dump-pending-badge").textContent = `${w.pending_dump_files ?? 0} pending`;

    const queue = w.scan_queue || [];
    const hasWaitingForModel = Boolean(w.waiting_for_model_count > 0 || queue.some((i) => i.status === "waiting_for_model"));
    const banner = $("#watcher-live-banner");
    const isBusy = Boolean(w.active_file || w.is_scanning);

    if (isBusy || hasWaitingForModel) {
      ensureFastQueuePoll();
    } else {
      stopFastQueuePoll();
      if (state.wasQueueBusy) {
        loadSettings().catch(() => {});
        if ($("#tab-vault").classList.contains("active")) loadVaultDocuments({ reason: "sync" });
        if (!skipReviewReload && $("#tab-review").classList.contains("active")) {
          loadReviewQueue({ skipTopbar: true });
        }
      }
    }
    state.wasQueueBusy = isBusy;

    if (isBusy || queue.length > 0) {
      banner.classList.remove("hidden", "notif-hiding");
      const doneCount = queue.filter((i) => !["pending", "waiting_for_model", "rendering", "loading", "thinking", "classifying"].includes(i.status)).length;
      const loadProgWrap = $("#live-banner-progress");
      const loadProgBar = $("#live-banner-progress-bar");
      if (isBusy) {
        $("#live-banner-dot").classList.remove("hidden");
        $("#live-banner-file").textContent = w.active_file || "Processing queue…";
        const baseStage = w.active_stage || "Working…";
        const isColdLoad = baseStage.toLowerCase().includes("loading") || Boolean(state.latestHealth?.vlm?.loading);
        const coldNote = isColdLoad ? " · First-time load into Apple Silicon memory" : "";
        $("#live-banner-stage").textContent = queue.length
          ? `${baseStage}${coldNote} · ${Math.min(doneCount + 1, queue.length)} of ${queue.length}`
          : `${baseStage}${coldNote}`;
        const loadPct = w.active_loading_percent;
        const showLoadBar = typeof loadPct === "number" && Number.isFinite(loadPct);
        if (loadProgWrap) loadProgWrap.classList.toggle("hidden", !showLoadBar);
        if (loadProgBar && showLoadBar) loadProgBar.style.width = `${Math.max(4, Math.min(100, loadPct))}%`;
      } else if (hasWaitingForModel) {
        $("#live-banner-dot").classList.remove("hidden");
        const waitingCount = queue.filter((i) => i.status === "waiting_for_model").length || queue.length;
        const dl = state.latestHealth?.vlm?.download || {};
        const dlNote =
          dl.status === "downloading"
            ? `Model downloading (${Math.round(Number(dl.percent || 0))}%) — will process automatically`
            : "Download a Vision Model to process queued files";
        $("#live-banner-file").textContent = `Waiting for Vision Model (${waitingCount} file${waitingCount === 1 ? "" : "s"})`;
        $("#live-banner-stage").textContent = dlNote;
        if (loadProgWrap) loadProgWrap.classList.add("hidden");
      } else {
        $("#live-banner-dot").classList.add("hidden");
        $("#live-banner-file").textContent = `Queue batch (${queue.length} file${queue.length === 1 ? "" : "s"})`;
        $("#live-banner-stage").textContent = `${doneCount} processed`;
        if (loadProgWrap) loadProgWrap.classList.add("hidden");
      }

      $("#stop-scan-btn").classList.toggle("hidden", !isBusy && !hasWaitingForModel);
      $("#clear-queue-btn").classList.toggle("hidden", isBusy || hasWaitingForModel || queue.length === 0);
      const toggleBtn = $("#toggle-queue-btn");
      toggleBtn.classList.toggle("hidden", queue.length === 0);
      toggleBtn.textContent = state.queueExpanded ? `Hide (${queue.length})` : `Queue (${queue.length})`;

      renderScanQueuePanel(queue);
    } else {
      banner.classList.add("hidden");
    }

    renderActivityLog(w.activity || [], w.last_scan_at);
  }

  const QUEUE_STATUS_META = {
    pending: { label: "Waiting", cls: "" },
    waiting_for_model: { label: "Waiting for AI", cls: "tag-warn" },
    rendering: { label: "Rendering", cls: "tag-warn" },
    loading: { label: "Loading AI", cls: "tag-warn" },
    thinking: { label: "Thinking", cls: "tag-warn" },
    classifying: { label: "Classifying", cls: "tag-warn" },
    filed: { label: "Filed", cls: "tag-ok" },
    reclassified: { label: "Reclassified", cls: "tag-ok" },
    unchanged: { label: "Unchanged", cls: "" },
    queued: { label: "Needs Review", cls: "tag-warn" },
    skipped: { label: "Skipped", cls: "" },
    cancelled: { label: "Stopped", cls: "tag-danger" },
    error: { label: "Error", cls: "tag-danger" },
  };

  function renderScanQueuePanel(queue) {
    const panel = $("#scan-queue-panel");
    if (!state.queueExpanded || !queue.length) {
      panel.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");

    const existingByKey = new Map();
    Array.from(panel.children).forEach((el) => {
      if (el.dataset.sourcePath) existingByKey.set(el.dataset.sourcePath, el);
    });

    const desiredKeys = new Set(queue.map((i) => i.source_path));
    existingByKey.forEach((el, key) => {
      if (!desiredKeys.has(key)) el.remove();
    });

    queue.forEach((item, idx) => {
      const meta = QUEUE_STATUS_META[item.status] || { label: item.status, cls: "" };
      let row = existingByKey.get(item.source_path);
      if (!row) {
        row = document.createElement("div");
        row.className = "scan-queue-item is-new";
        row.dataset.sourcePath = item.source_path;
        row.innerHTML = `
          <div class="scan-queue-thumb"><span>PDF</span></div>
          <div style="min-width:0;">
            <div class="sq-name" style="font-weight:600; font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
            <div class="sq-msg muted" style="font-size:11.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
          </div>
          <div class="sq-status-group">
            <span class="sq-conf tag hidden"></span>
            <span class="sq-tag tag"></span>
          </div>
          <pre class="thinking-box scan-queue-thinking hidden"></pre>
        `;
        panel.appendChild(row);
      }

      // Keep order synced without tearing down existing nodes
      if (panel.children[idx] !== row) {
        panel.insertBefore(row, panel.children[idx] || null);
      }

      const nameEl = row.querySelector(".sq-name");
      if (nameEl.textContent !== item.filename) nameEl.textContent = item.filename;

      const msgEl = row.querySelector(".sq-msg");
      const msgText = item.stage_message || "";
      if (msgEl.textContent !== msgText) msgEl.textContent = msgText;

      const confEl = row.querySelector(".sq-conf");
      if (confEl) {
        if (typeof item.confidence === "number" && Number.isFinite(item.confidence)) {
          const pct = Math.round(item.confidence * 100);
          const confCls = pct >= getConfidenceThresholdPct() ? "tag-ok" : "tag-warn";
          const desiredConfClass = `sq-conf tag ${confCls}`;
          const confLabel = `${pct}%`;
          if (confEl.className !== desiredConfClass) confEl.className = desiredConfClass;
          if (confEl.textContent !== confLabel) confEl.textContent = confLabel;
          confEl.title = `AI confidence: ${pct}%`;
        } else {
          confEl.className = "sq-conf tag hidden";
        }
      }

      const tagEl = row.querySelector(".sq-tag");
      const desiredClass = `sq-tag tag ${meta.cls}`;
      if (tagEl.className !== desiredClass) tagEl.className = desiredClass;
      if (tagEl.textContent !== meta.label) tagEl.textContent = meta.label;

      const thumbEl = row.querySelector(".scan-queue-thumb");
      const imgSrc = item.preview_images?.[0] ? `/api/previews/${encodeURIComponent(item.preview_images[0])}` : "";
      if (imgSrc && thumbEl.dataset.src !== imgSrc) {
        thumbEl.dataset.src = imgSrc;
        thumbEl.innerHTML = `<img src="${imgSrc}" alt="" />`;
      }

      let jumpBtn = row.querySelector(".sq-vault-btn");
      if (["filed", "reclassified", "unchanged"].includes(item.status) && (item.document_id || item.result_path)) {
        if (!jumpBtn) {
          jumpBtn = document.createElement("button");
          jumpBtn.type = "button";
          jumpBtn.className = "btn btn-secondary btn-xs sq-vault-btn";
          jumpBtn.textContent = "In Vault →";
          row.insertBefore(jumpBtn, row.querySelector(".scan-queue-thinking"));
        }
        jumpBtn.onclick = () =>
          navigateToVaultDocument({
            documentId: item.document_id || null,
            category: item.category || "",
            vaultRelPath: item.result_path || "",
          });
      } else if (jumpBtn) {
        jumpBtn.remove();
      }

      const tEl = row.querySelector(".scan-queue-thinking");
      const showThinking = Boolean(item.thinking && ["rendering", "loading", "thinking", "classifying"].includes(item.status));
      tEl.classList.toggle("hidden", !showThinking);
      if (showThinking && tEl.textContent !== item.thinking) {
        tEl.textContent = item.thinking;
        tEl.scrollTop = tEl.scrollHeight;
      }
    });
  }

  function getConfidenceThresholdPct() {
    return Math.round((state.settings?.confidence_threshold ?? 0.75) * 100);
  }

  function renderConfidenceTag(confidence) {
    if (typeof confidence !== "number" || !Number.isFinite(confidence)) return "";
    const pct = Math.round(confidence * 100);
    const cls = pct >= getConfidenceThresholdPct() ? "tag-ok" : "tag-warn";
    return `<span class="tag ${cls}">Confidence: ${pct}%</span>`;
  }

  function getPreviewPageNumber(filename, fallbackIdx = 0) {
    const match = String(filename || "").match(/_p(\d+)\.png$/i);
    if (match) {
      const n = Number(match[1]);
      if (Number.isInteger(n) && n >= 1) return n;
    }
    return Number(fallbackIdx) + 1;
  }

  function extractFiledMeta(entry) {
    const relPath =
      entry.vault_rel_path ||
      (entry.message && entry.message.startsWith("Filed -> ") ? entry.message.slice(9).trim() : "");
    const parts = relPath ? relPath.split("/") : [];
    const category = entry.category || (parts.length > 1 ? parts[0] : "");
    const filenameFromPath = parts.length ? parts[parts.length - 1] : "";
    const title = entry.title || filenameFromPath || entry.filename || "Filed document";
    return { relPath, category, title };
  }

  const ACTIVITY_KIND_META = {
    filed: { label: "Filed", cls: "tag-ok" },
    queued: { label: "Needs Review", cls: "tag-warn" },
    error: { label: "Error", cls: "tag-danger" },
    stopped: { label: "Stopped", cls: "tag-danger" },
    watcher: { label: "Watcher", cls: "tag-info" },
  };

  function renderActivityLog(items, lastScanAt) {
    if (lastScanAt !== undefined) {
      $("#last-scan-label").textContent = lastScanAt
        ? `Last scan: ${new Date(lastScanAt).toLocaleString()}`
        : "No manual scan run yet";
    }

    state.latestActivity = items || [];
    const filtered = state.latestActivity.filter((entry) => {
      if (state.activityFilter === "filed") return entry.kind === "filed" || entry.kind === "reclassified";
      if (state.activityFilter === "attention") return entry.kind !== "filed" && entry.kind !== "reclassified";
      return true;
    });

    const countChip = $("#activity-count-chip");
    if (countChip) {
      countChip.textContent =
        state.activityFilter === "all"
          ? `${state.latestActivity.length}`
          : `${filtered.length} of ${state.latestActivity.length}`;
    }

    const renderKey = JSON.stringify({
      filter: state.activityFilter,
      threshold: getConfidenceThresholdPct(),
      items: filtered.map((e) => [e.timestamp, e.kind, e.document_id, e.vault_rel_path, e.confidence, e.message]),
    });
    if (renderKey === state.lastActivityRenderKey) {
      return;
    }
    state.lastActivityRenderKey = renderKey;

    const logEl = $("#activity-log");
    if (!filtered.length) {
      const emptyMsg =
        state.activityFilter === "filed"
          ? "No filed documents recorded yet."
          : state.activityFilter === "attention"
            ? "No review warnings or errors recorded."
            : "No recent watcher or scan activity yet.";
      logEl.innerHTML = `<li class="activity-empty muted">${emptyMsg}</li>`;
      return;
    }

    logEl.innerHTML = "";
    filtered.forEach((entry) => {
      const li = document.createElement("li");
      const timeLabel = formatRelativeOrShortTime(entry.timestamp);

      if (entry.kind === "filed" || entry.kind === "reclassified") {
        const { relPath, category, title } = extractFiledMeta(entry);
        const thumbSrc = entry.preview_images?.[0]
          ? `/api/previews/${encodeURIComponent(entry.preview_images[0])}`
          : "";
        const tone = category ? getCategoryTone(category) : "";
        const dateBadge = entry.doc_date
          ? `<span class="tag tag-subtle">${esc(entry.doc_date)}</span>`
          : "";
        const prevCatHtml =
          entry.kind === "reclassified" && entry.previous_category && entry.previous_category !== category
            ? `<span class="tag tag-subtle">${esc(entry.previous_category)}</span><span class="activity-arrow" aria-hidden="true">→</span>`
            : "";
        const catBtn = category
          ? `<button type="button" class="tag tag-cat-btn ${tone}" title="Browse ${esc(category)} in Vault">${esc(category)}</button>`
          : "";
        const kindBadge =
          entry.kind === "reclassified"
            ? `<span class="tag tag-info">Reclassified</span>`
            : `<span class="tag tag-ok">Filed</span>`;
        const confBadge = renderConfidenceTag(entry.confidence);
        const origHtml = entry.filename
          ? `<span class="activity-orig" title="Original file: ${esc(entry.filename)}">${esc(entry.filename)}</span><span class="activity-arrow" aria-hidden="true">→</span>`
          : "";
        const pathBtn = relPath
          ? `<button type="button" class="activity-vault-path" title="Navigate to document in Vault">${esc(relPath)}</button>`
          : "";

        li.className = "activity-row activity-row-filed";
        li.innerHTML = `
          <button type="button" class="activity-thumb" title="${entry.document_id ? "Preview document" : "View in Vault"}">
            ${thumbSrc ? `<img src="${thumbSrc}" alt="" />` : `<span>PDF</span>`}
          </button>
          <div class="activity-main">
            <div class="activity-top-line">
              <span class="activity-doc-title">${esc(title)}</span>
              ${kindBadge}
              ${confBadge}
              ${prevCatHtml}
              ${catBtn}
              ${dateBadge}
            </div>
            <div class="activity-sub-line">
              ${origHtml}
              ${pathBtn}
            </div>
          </div>
          <div class="activity-right">
            <span class="activity-time" title="${esc(new Date(entry.timestamp).toLocaleString())}">${esc(timeLabel)}</span>
            <button type="button" class="btn btn-secondary btn-xs btn-jump-vault">View in Vault →</button>
          </div>
        `;

        const goVault = () =>
          navigateToVaultDocument({
            documentId: entry.document_id || null,
            category,
            vaultRelPath: relPath,
          });

        li.querySelector(".btn-jump-vault").addEventListener("click", goVault);
        const pathEl = li.querySelector(".activity-vault-path");
        if (pathEl) pathEl.addEventListener("click", goVault);

        const catEl = li.querySelector(".tag-cat-btn");
        if (catEl) {
          catEl.addEventListener("click", () => {
            navigateToVaultDocument({ category });
          });
        }

        li.querySelector(".activity-thumb").addEventListener("click", () => {
          if (entry.document_id) {
            openFullFilePreview(
              `/api/documents/${entry.document_id}/file`,
              title,
              relPath || entry.filename,
              { docId: entry.document_id }
            );
          } else {
            goVault();
          }
        });
      } else {
        const meta = ACTIVITY_KIND_META[entry.kind] || { label: entry.kind, cls: "" };
        const confBadge = renderConfidenceTag(entry.confidence);
        const reasonsHtml = (entry.review_reasons || [])
          .map((r) => `<span class="tag tag-warn">${esc(REASON_LABELS[r] || r)}</span>`)
          .join("");
        li.className = `activity-row activity-row-event activity-kind-${esc(entry.kind)}`;
        li.innerHTML = `
          <span class="activity-status-dot"></span>
          <div class="activity-main">
            <div class="activity-top-line">
              <span class="tag ${meta.cls}">${esc(meta.label)}</span>
              ${entry.filename ? `<span class="activity-event-file">${esc(entry.filename)}</span>` : ""}
              ${confBadge}
              ${reasonsHtml}
            </div>
            <div class="activity-event-msg">${esc(entry.message)}</div>
          </div>
          <div class="activity-right">
            <span class="activity-time" title="${esc(new Date(entry.timestamp).toLocaleString())}">${esc(timeLabel)}</span>
          </div>
        `;
      }

      logEl.appendChild(li);
    });
  }

  $$("#activity-filter-pills .seg-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activityFilter = btn.dataset.filter || "all";
      $$("#activity-filter-pills .seg-pill").forEach((b) =>
        b.classList.toggle("active", b === btn)
      );
      state.lastActivityRenderKey = "";
      renderActivityLog(state.latestActivity, undefined);
    });
  });

  $("#watcher-toggle").addEventListener("change", async (e) => {
    try {
      const w = await api("/api/watcher/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: e.target.checked }),
      });
      renderWatcherTopbar(w);
      if (state.settings) state.settings.watcher_enabled = w.watcher_enabled;
      toast(w.watcher_enabled ? "Background watcher enabled" : "Background watcher paused");
    } catch (err) {
      toast(err.message, true);
      e.target.checked = !e.target.checked;
    }
  });

  $("#toggle-queue-btn").addEventListener("click", () => {
    state.queueExpanded = !state.queueExpanded;
    refreshHealth();
  });

  $("#clear-queue-btn").addEventListener("click", async () => {
    try {
      const banner = $("#watcher-live-banner");
      banner.classList.add("notif-hiding");
      const w = await api("/api/watcher/clear-queue", { method: "POST" });
      setTimeout(() => {
        state.queueExpanded = false;
        renderWatcherTopbar(w);
      }, 200);
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#stop-scan-btn").addEventListener("click", async () => {
    const btn = $("#stop-scan-btn");
    btn.disabled = true;
    try {
      await api("/api/watcher/stop", { method: "POST" });
      toast("Stopping background processing…");
      refreshHealth();
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
    }
  });

  async function openFolderInFinder(target = "dump") {
    try {
      const res = await api("/api/folders/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      if (!res.opened) {
        toast(`Folder path: ${res.path}`);
      }
    } catch (err) {
      toast(err.message, true);
    }
  }

  function openModelRequiredPrompt({
    title = "Download a Vision Model to Process Scans",
    description = "Document Vault reads and files your documents locally using an Apple Silicon MLX Vision model. No files leave your Mac.",
    primaryLabel = "Download & Queue Files",
    onDownloadAndProceed,
  } = {}) {
    ensureModelsLoaded().then(() => {
      const modal = $("#doc-modal");
      if (!modal) return;
      const targetId = getSelectedOrRecommendedModelId(state.latestHealth?.vlm);
      const info = findCatalogModel(targetId);
      const modelLabel = targetId ? shortModelLabel(targetId) : "Recommended Vision Model";
      const sizeText = info?.size_gb ? `${info.size_gb} GB one-time download` : "One-time download";

      setModalCompact(true);
      $("#modal-title").textContent = title;
      $("#modal-body").innerHTML = `
        <div style="display:flex; flex-direction:column; gap:14px;">
          <p style="margin:0; line-height:1.5;">${esc(description)}</p>
          <div class="setup-inspect-box inspect-files">
            <div class="setup-inspect-title">${esc(modelLabel)}</div>
            <div class="setup-inspect-detail muted">${esc(sizeText)} · Runs 100% locally in Apple Silicon memory</div>
          </div>
          <div class="action-buttons" style="justify-content:flex-end; flex-wrap:wrap;">
            <button id="mreq-cancel-btn" type="button" class="btn btn-secondary">Cancel</button>
            <button id="mreq-settings-btn" type="button" class="btn btn-secondary">Choose Model…</button>
            ${targetId ? `<button id="mreq-dl-btn" type="button" class="btn btn-primary">${esc(primaryLabel)}</button>` : ""}
          </div>
        </div>
      `;
      $("#mreq-cancel-btn")?.addEventListener("click", () => closeAnimatedModal(modal));
      $("#mreq-settings-btn")?.addEventListener("click", () => {
        closeAnimatedModal(modal);
        switchTab("settings");
      });
      $("#mreq-dl-btn")?.addEventListener("click", async () => {
        const dlBtn = $("#mreq-dl-btn");
        if (dlBtn) {
          dlBtn.disabled = true;
          dlBtn.textContent = "Starting Download…";
        }
        try {
          await api("/api/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vlm_model: targetId }),
          });
          await startModelDownload(targetId);
          closeAnimatedModal(modal);
          if (typeof onDownloadAndProceed === "function") {
            await onDownloadAndProceed(true);
          }
        } catch (err) {
          toast(err.message, true);
          if (dlBtn) {
            dlBtn.disabled = false;
            dlBtn.textContent = primaryLabel;
          }
        }
      });
      showAnimatedModal(modal);
    });
  }

  async function trySampleDocument(deferOverride = false) {
    const readiness = state.latestHealth ? getModelReadinessState(state.latestHealth) : "ready";
    if (!deferOverride && readiness === "missing") {
      openModelRequiredPrompt({
        title: "Download Vision Model to Try Sample",
        description: "The sample Acme Utility Bill runs through the real local AI pipeline. Download the recommended model once and the sample will auto-process as soon as it finishes.",
        primaryLabel: "Download & Try Sample",
        onDownloadAndProceed: () => trySampleDocument(true),
      });
      return;
    }

    const shouldDefer = Boolean(deferOverride || readiness === "downloading");
    try {
      const res = await api("/api/onboarding/sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defer_for_model: shouldDefer }),
      });
      state.queueExpanded = true;
      ensureFastQueuePoll();
      renderWatcherTopbar(res.watcher);
      if (res.waiting_for_model) {
        toast(`Sample queued (${res.filename}) — will auto-process once model download finishes.`);
      } else {
        toast(`Processing sample document (${res.filename})…`);
      }
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function runManualScan(deferOverride = false) {
    const btn = $("#scan-now-btn");
    const readiness = state.latestHealth ? getModelReadinessState(state.latestHealth) : "ready";
    if (!deferOverride && readiness === "missing") {
      openModelRequiredPrompt({
        title: "Download a Vision Model to Scan Incoming Folder",
        description: "Before scanning your Incoming folder, download a local Vision Model. Your files will be queued and processed automatically once the download completes.",
        primaryLabel: "Download & Scan Folder",
        onDownloadAndProceed: () => runManualScan(true),
      });
      return;
    }

    const shouldDefer = Boolean(deferOverride || readiness === "downloading");
    btn.disabled = true;
    btn.textContent = "Scanning…";
    state.queueExpanded = true;
    ensureFastQueuePoll();
    try {
      const url = shouldDefer ? "/api/watcher/scan?defer_for_model=true" : "/api/watcher/scan";
      const res = await api(url, { method: "POST" });
      updateReviewBadge(res.pending_reviews);
      renderWatcherTopbar(res.watcher);
      if (shouldDefer && res.waiting_for_model > 0) {
        toast(`Queued ${res.waiting_for_model} file(s) — will auto-process when model download finishes.`);
      } else {
        const stoppedNote = res.cancelled ? " (stopped early)" : "";
        toast(`Scan complete${stoppedNote}: ${res.filed} filed, ${res.queued} queued for review, ${res.skipped} skipped.`);
      }
      if ($("#tab-review").classList.contains("active")) loadReviewQueue();
      if ($("#tab-vault").classList.contains("active")) loadVaultDocuments({ reason: "sync" });
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Scan Now";
    }
  }

  $("#scan-now-btn").addEventListener("click", () => runManualScan(false));

  // ── Shared Card Helpers (Drop & Review) ───────────────────────────────────
  function buildCategoryOptions(selected, extraSuggestion) {
    const cats = [...(state.settings?.categories || ["Finance", "Taxes", "Medical", "Other"])];
    if (extraSuggestion && !cats.some((c) => c.toLowerCase() === extraSuggestion.toLowerCase())) {
      cats.push(extraSuggestion);
    }
    if (selected && !cats.some((c) => c.toLowerCase() === selected.toLowerCase())) {
      cats.push(selected);
    }
    return cats
      .map((c) => `<option value="${esc(c)}" ${c.toLowerCase() === String(selected).toLowerCase() ? "selected" : ""}>${esc(c)}</option>`)
      .join("");
  }

  const REASON_LABELS = {
    low_confidence: "Low Confidence",
    missing_date: "Missing Date",
    duplicate_hash: "Exact Duplicate",
    new_category: "New Category Suggested",
    missing_title: "Missing Title",
    model_error: "Model Error",
    ollama_error: "Model Error",
  };

  function bindPreviewSwitcher(cardEl, previewImages) {
    const imgEl = cardEl.querySelector(".preview-img");
    cardEl.querySelectorAll(".page-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.idx);
        imgEl.src = `/api/previews/${encodeURIComponent(previewImages[idx])}`;
        cardEl.querySelectorAll(".page-btn").forEach((b) => b.classList.remove("btn-primary"));
        btn.classList.add("btn-primary");
      });
    });
  }

  async function updateLivePathPreview(cardEl, filename) {
    const dateVal = cardEl.querySelector(".inp-date").value;
    const catVal = cardEl.querySelector(".inp-cat").value;
    const titleVal = cardEl.querySelector(".inp-title").value;
    try {
      const { rel_path } = await api("/api/intake/preview-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateVal,
          category: catVal,
          title: titleVal,
          filename,
        }),
      });
      cardEl.querySelector(".live-path-code").textContent = rel_path;
    } catch {
      // ignore
    }
  }

  const modalCloseTimers = new WeakMap();

  function syncModalScrollLock() {
    const docEl = document.documentElement;
    if (!docEl || !docEl.classList) return;
    const modals = [$("#doc-modal"), $("#setup-modal")].filter(Boolean);
    const anyOpen = modals.some((m) => !m.classList.contains("hidden"));
    if (anyOpen) {
      if (!docEl.classList.contains("modal-open")) {
        const innerW = typeof window.innerWidth === "number" ? window.innerWidth : 0;
        const clientW = typeof docEl.clientWidth === "number" ? docEl.clientWidth : 0;
        const scrollbarW = innerW > clientW ? innerW - clientW : 0;
        if (scrollbarW > 0 && docEl.style) {
          docEl.style.paddingRight = `${scrollbarW}px`;
        }
        docEl.classList.add("modal-open");
      }
      if (document.body && document.body.classList) {
        document.body.classList.add("modal-open");
      }
    } else {
      docEl.classList.remove("modal-open");
      if (docEl.style) {
        docEl.style.paddingRight = "";
      }
      if (document.body && document.body.classList) {
        document.body.classList.remove("modal-open");
      }
    }
  }

  function showAnimatedModal(modal) {
    if (!modal) return;
    const prevTimer = modalCloseTimers.get(modal);
    if (prevTimer) {
      clearTimeout(prevTimer);
      modalCloseTimers.delete(modal);
    }
    modal.classList.remove("modal-closing", "hidden");
    const card = typeof modal.querySelector === "function" ? modal.querySelector(".modal-card") : null;
    if (card) card.scrollTop = 0;
    syncModalScrollLock();
  }

  function closeAnimatedModal(modal) {
    if (!modal || modal.classList.contains("hidden") || modal.classList.contains("modal-closing")) {
      return;
    }
    const prevTimer = modalCloseTimers.get(modal);
    if (prevTimer) {
      clearTimeout(prevTimer);
      modalCloseTimers.delete(modal);
    }
    if (prefersReducedMotion()) {
      modal.classList.remove("modal-closing");
      modal.classList.add("hidden");
      syncModalScrollLock();
      return;
    }
    modal.classList.add("modal-closing");
    const timer = setTimeout(() => {
      modal.classList.remove("modal-closing");
      modal.classList.add("hidden");
      modalCloseTimers.delete(modal);
      syncModalScrollLock();
    }, 255);
    modalCloseTimers.set(modal, timer);
  }

  function setModalCompact(compact) {
    const card = $("#doc-modal .modal-card");
    if (card) card.classList.toggle("modal-card-compact", Boolean(compact));
  }

  function applyUpdatedVaultDoc(updatedDoc) {
    if (!updatedDoc || updatedDoc.id == null) return;
    const docId = Number(updatedDoc.id);
    state.vaultDocsById.set(docId, updatedDoc);
    const idx = state.vaultDocs.findIndex((d) => Number(d.id) === docId);
    if (idx !== -1) {
      state.vaultDocs[idx] = updatedDoc;
    }
    const card = $(`#vault-list .vault-item[data-doc-id="${docId}"]`);
    if (card) {
      syncVaultCardElement(card, updatedDoc);
    }
    if (Array.isArray(state.latestActivity)) {
      let changed = false;
      state.latestActivity.forEach((entry) => {
        if (Number(entry.document_id) === docId) {
          entry.preview_images = [...(updatedDoc.preview_images || [])];
          changed = true;
        }
      });
      if (changed) {
        state.lastActivityRenderKey = "";
        renderActivityLog(state.latestActivity, undefined);
      }
    }
  }

  function buildRotateButtonsHtml({ compact = false } = {}) {
    const btnCls = compact ? "btn btn-secondary btn-xs preview-rotate-btn" : "btn btn-secondary btn-sm preview-rotate-btn";
    const iconSize = compact ? 13 : 15;
    return `
      <button type="button" class="${btnCls}" data-angle="-90" title="Rotate page 90° left (counter-clockwise)" aria-label="Rotate page 90° left">
        <svg viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path>
          <path d="M3 3v5h5"></path>
        </svg>
      </button>
      <button type="button" class="${btnCls}" data-angle="90" title="Rotate page 90° right (clockwise)" aria-label="Rotate page 90° right">
        <svg viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8"></path>
          <path d="M21 3v5h-5"></path>
        </svg>
      </button>
      <button type="button" class="${btnCls}" data-angle="180" title="Rotate page 180°" aria-label="Rotate page 180°">
        <svg viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
          <path d="M3 3v5h5"></path>
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
          <path d="M16 16h5v5"></path>
        </svg>
      </button>
    `;
  }

  async function rotateVaultDocumentPage(docId, page, angle) {
    const res = await api(`/api/documents/${docId}/rotate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page, angle }),
    });
    if (res.document) {
      applyUpdatedVaultDoc(res.document);
    }
    return res;
  }

  function preloadImage(src) {
    return new Promise((resolve) => {
      if (typeof Image === "undefined") {
        resolve();
        return;
      }
      const loader = new Image();
      loader.onload = () => {
        if (typeof loader.decode === "function") {
          loader.decode().then(resolve, resolve);
        } else {
          resolve();
        }
      };
      loader.onerror = resolve;
      loader.src = src;
    });
  }

  async function animatePageRotation({
    imgEl,
    containerEl,
    angle,
    mode = "contain",
    onRequest,
    getNextSrc,
    onAfterSwap,
  }) {
    const canAnimate = Boolean(
      imgEl &&
      !prefersReducedMotion() &&
      typeof imgEl.getBoundingClientRect === "function" &&
      typeof requestAnimationFrame === "function"
    );

    if (!canAnimate) {
      const res = await onRequest();
      const nextSrc = getNextSrc(res);
      await preloadImage(nextSrc);
      if (imgEl && imgEl.isConnected) {
        onAfterSwap?.(res);
        imgEl.src = nextSrc;
      }
      return res;
    }

    const rect = imgEl.getBoundingClientRect();
    const oldW = rect.width;
    const oldH = rect.height;
    if (oldW <= 0 || oldH <= 0) {
      const res = await onRequest();
      const nextSrc = getNextSrc(res);
      await preloadImage(nextSrc);
      if (imgEl.isConnected) {
        onAfterSwap?.(res);
        imgEl.src = nextSrc;
      }
      return res;
    }

    const isQuarterTurn = Math.abs(angle) % 180 === 90;
    const isPreviewFrame = Boolean(containerEl && containerEl.classList.contains("preview-frame"));
    const easing = "cubic-bezier(0.22, 1, 0.36, 1)";
    const durationMs = 280;
    const prevContainerPosition = containerEl ? containerEl.style.position : "";
    const prevAspectRatio = containerEl ? containerEl.style.aspectRatio : "";

    const cleanupInlineStyles = () => {
      if (imgEl.isConnected) {
        imgEl.style.position = "";
        imgEl.style.top = "";
        imgEl.style.left = "";
        imgEl.style.margin = "";
        imgEl.style.transform = "";
        imgEl.style.width = "";
        imgEl.style.height = "";
        imgEl.style.maxWidth = "";
        imgEl.style.maxHeight = "";
      }
      if (containerEl && containerEl.isConnected) {
        containerEl.style.height = "";
        containerEl.style.overflow = "";
        containerEl.style.position = prevContainerPosition;
      }
    };

    if (mode === "slot" && containerEl) {
      const slotW = containerEl.clientWidth || oldW;
      const slotRect = containerEl.getBoundingClientRect();
      const borderY = Math.max(0, slotRect.height - containerEl.clientHeight);
      const targetH = isQuarterTurn ? slotW * (oldW / oldH) : oldH;
      const animScale = isQuarterTurn ? slotW / oldH : 1;

      containerEl.style.aspectRatio = "auto";
      containerEl.style.height = `${oldH + borderY}px`;
      containerEl.style.overflow = "hidden";
      imgEl.style.position = "absolute";
      imgEl.style.top = "50%";
      imgEl.style.left = "50%";
      imgEl.style.margin = "0";
      imgEl.style.width = `${oldW}px`;
      imgEl.style.height = `${oldH}px`;
      imgEl.style.maxWidth = "none";
      imgEl.style.maxHeight = "none";
      imgEl.style.transform = "translate(-50%, -50%) rotate(0deg) scale(1)";
      void containerEl.offsetHeight;

      containerEl.style.transition = `height ${durationMs}ms ${easing}`;
      imgEl.style.transition = `transform ${durationMs}ms ${easing}`;
      containerEl.style.height = `${targetH + borderY}px`;
      imgEl.style.transform = `translate(-50%, -50%) rotate(${angle}deg) scale(${animScale})`;
    } else {
      const boundsW = (containerEl && containerEl.clientWidth) || oldW;
      const boundsH = isPreviewFrame
        ? (containerEl.clientHeight || oldH)
        : Math.round((window.innerHeight || 900) * 0.7);
      const natW = imgEl.naturalWidth || oldW;
      const natH = imgEl.naturalHeight || oldH;
      const fitScale = isQuarterTurn ? Math.min(1, boundsW / natH, boundsH / natW) : 1;
      const finalW = isQuarterTurn ? natH * fitScale : oldW;
      const finalH = isQuarterTurn ? natW * fitScale : oldH;
      const animScale = isQuarterTurn ? finalW / oldH : 1;

      if (containerEl) {
        if (!isPreviewFrame) {
          const contRect = containerEl.getBoundingClientRect();
          const borderY = Math.max(0, contRect.height - containerEl.clientHeight);
          containerEl.style.position = "relative";
          containerEl.style.height = `${oldH + borderY}px`;
          containerEl.style.overflow = "hidden";
        }
        imgEl.style.position = "absolute";
        imgEl.style.top = "50%";
        imgEl.style.left = "50%";
        imgEl.style.margin = "0";
        imgEl.style.width = `${oldW}px`;
        imgEl.style.height = `${oldH}px`;
        imgEl.style.maxWidth = "none";
        imgEl.style.maxHeight = "none";
        imgEl.style.transform = "translate(-50%, -50%) rotate(0deg) scale(1)";
        void containerEl.offsetHeight;

        if (!isPreviewFrame) {
          const contRect = containerEl.getBoundingClientRect();
          const borderY = Math.max(0, contRect.height - containerEl.clientHeight);
          containerEl.style.transition = `height ${durationMs}ms ${easing}`;
          containerEl.style.height = `${finalH + borderY}px`;
        }
      } else {
        void imgEl.offsetHeight;
      }

      imgEl.style.transition = `transform ${durationMs}ms ${easing}`;
      imgEl.style.transform = containerEl
        ? `translate(-50%, -50%) rotate(${angle}deg) scale(${animScale})`
        : `rotate(${angle}deg) scale(${animScale})`;
    }

    let res;
    try {
      [res] = await Promise.all([
        onRequest(),
        new Promise((resolve) => setTimeout(resolve, durationMs + 15)),
      ]);
    } catch (err) {
      if (imgEl.isConnected) {
        imgEl.style.transition = "transform 200ms ease";
        imgEl.style.transform = containerEl
          ? "translate(-50%, -50%) rotate(0deg) scale(1)"
          : "rotate(0deg) scale(1)";
        if (containerEl && (mode === "slot" || !isPreviewFrame)) {
          const contRect = containerEl.getBoundingClientRect();
          const borderY = Math.max(0, contRect.height - containerEl.clientHeight);
          containerEl.style.transition = "height 200ms ease";
          containerEl.style.height = `${oldH + borderY}px`;
        }
        setTimeout(() => {
          if (!imgEl.isConnected) return;
          imgEl.style.transition = "none";
          if (containerEl && containerEl.isConnected) {
            containerEl.style.transition = "none";
            if (mode === "slot") containerEl.style.aspectRatio = prevAspectRatio;
          }
          cleanupInlineStyles();
          requestAnimationFrame(() => {
            if (imgEl.isConnected) imgEl.style.transition = "";
            if (containerEl && containerEl.isConnected) containerEl.style.transition = "";
          });
        }, 210);
      }
      throw err;
    }

    const nextSrc = getNextSrc(res);
    await preloadImage(nextSrc);
    if (!imgEl.isConnected) return res;

    imgEl.style.transition = "none";
    if (containerEl) {
      containerEl.style.transition = "none";
      if (mode === "slot") containerEl.style.aspectRatio = prevAspectRatio;
    }
    onAfterSwap?.(res);
    imgEl.src = nextSrc;
    cleanupInlineStyles();
    void imgEl.offsetHeight;
    requestAnimationFrame(() => {
      if (imgEl.isConnected) imgEl.style.transition = "";
      if (containerEl && containerEl.isConnected) containerEl.style.transition = "";
    });

    return res;
  }

  function openFullFilePreview(fileUrl, title, filename, options = {}) {
    const modal = $("#doc-modal");
    const modalBody = $("#modal-body");
    setModalCompact(false);
    $("#modal-title").textContent = title || filename || "Document Preview";

    const docId = options?.docId ? Number(options.docId) : null;
    const lowerName = String(filename || "").toLowerCase();
    const isPdf = lowerName.endsWith(".pdf");
    const isTiff = lowerName.endsWith(".tif") || lowerName.endsWith(".tiff");
    const useScrollPages = Boolean(docId && (isPdf || isTiff));

    let currentPage = 1;
    let pageCount = 1;
    let pagesMeta = [{ page: 1, width: 612, height: 792 }];
    let fileVersion = Date.now();
    let isRotating = false;
    let pageObserver = null;
    let scrollEl = null;
    let pageSlots = [];
    let scrollRafId = null;
    let suppressScrollUntil = 0;

    const toolbarHtml = docId
      ? `<div class="preview-toolbar">
           <div class="preview-toolbar-group">
             <div id="preview-page-nav" class="preview-page-nav ${isPdf || isTiff ? "" : "hidden"}">
               <button id="preview-prev-page" type="button" class="btn btn-secondary btn-xs" title="Previous page" disabled>‹</button>
               <span class="preview-page-label">
                 Page
                 <input id="preview-page-input" class="preview-page-input" type="number" min="1" max="1" value="1" aria-label="Page number" />
                 of <span id="preview-page-total">1</span>
               </span>
               <button id="preview-next-page" type="button" class="btn btn-secondary btn-xs" title="Next page" disabled>›</button>
             </div>
           </div>
           <div class="preview-toolbar-group preview-rotate-group">
             <span id="preview-rotate-status" class="preview-rotate-status muted">Rotate page</span>
             ${buildRotateButtonsHtml({ compact: false })}
           </div>
         </div>`
      : "";

    modalBody.innerHTML = `
      <div id="full-preview-root" class="full-preview-root" style="display:flex; flex-direction:column; gap:12px;">
        ${toolbarHtml}
        <div id="viewer-frame-wrap" class="viewer-frame-wrap"></div>
        <div class="preview-modal-footer">
          <label class="switch-label preview-invert-toggle" title="Invert white document colors while in dark mode">
            <input type="checkbox" class="preview-invert-cb" ${getStoredInvertDocsDark() ? "checked" : ""} />
            <span class="switch-track"></span>
            <span>Invert in Dark Mode</span>
          </label>
          <div class="action-buttons" style="justify-content:flex-end;">
            <a id="preview-open-tab-link" class="btn btn-secondary btn-sm" href="${esc(fileUrl)}" target="_blank" rel="noopener">Open in New Tab</a>
            <a id="preview-download-link" class="btn btn-secondary btn-sm" href="${esc(fileUrl)}?download=1">Download</a>
          </div>
        </div>
      </div>
    `;

    const rootEl = modalBody.querySelector("#full-preview-root");
    const frameWrap = modalBody.querySelector("#viewer-frame-wrap");
    const openTabLink = modalBody.querySelector("#preview-open-tab-link");
    const invertCb = modalBody.querySelector(".preview-invert-cb");
    if (invertCb) {
      invertCb.addEventListener("change", (e) => setInvertDocsDark(e.target.checked));
    }

    function disconnectScrollResources() {
      if (pageObserver) {
        pageObserver.disconnect();
        pageObserver = null;
      }
      if (scrollRafId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(scrollRafId);
        scrollRafId = null;
      }
      scrollEl = null;
      pageSlots = [];
    }

    function ensureSlotImageLoaded(slot) {
      if (!slot || !docId) return;
      const pNum = Number(slot.dataset.page || 1);
      const img = slot.querySelector(".pdf-page-img");
      if (!img) return;
      const desiredSrc = `/api/documents/${docId}/pages/${pNum}?v=${fileVersion}`;
      if (img.dataset.loadedSrc !== desiredSrc) {
        img.dataset.loadedSrc = desiredSrc;
        img.src = desiredSrc;
      }
    }

    function syncToolbarState() {
      if (!docId) return;
      const pageNav = modalBody.querySelector("#preview-page-nav");
      if (pageNav) {
        pageNav.classList.toggle("hidden", !isPdf && pageCount <= 1);
      }
      const prevBtn = modalBody.querySelector("#preview-prev-page");
      const nextBtn = modalBody.querySelector("#preview-next-page");
      const pageInput = modalBody.querySelector("#preview-page-input");
      const totalEl = modalBody.querySelector("#preview-page-total");
      if (pageInput) {
        pageInput.max = String(pageCount);
        pageInput.value = String(currentPage);
        pageInput.disabled = pageCount <= 1 || isRotating;
      }
      if (totalEl) totalEl.textContent = String(pageCount);
      if (prevBtn) prevBtn.disabled = isRotating || currentPage <= 1;
      if (nextBtn) nextBtn.disabled = isRotating || currentPage >= pageCount;

      modalBody.querySelectorAll(".preview-rotate-btn").forEach((btn) => {
        btn.disabled = isRotating;
      });
      const statusEl = modalBody.querySelector("#preview-rotate-status");
      if (statusEl) {
        statusEl.textContent = isRotating ? "Rotating…" : "Rotate page";
      }
    }

    function detectMostVisiblePage() {
      if (!scrollEl || !pageSlots.length) return currentPage;
      if (scrollEl.scrollTop <= 4) return 1;
      if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 4) {
        return pageSlots.length;
      }
      const viewRect = scrollEl.getBoundingClientRect();
      const viewMid = viewRect.top + viewRect.height * 0.45;
      let bestPage = currentPage;
      let bestVisiblePx = -1;
      let closestDist = Infinity;

      for (let i = 0; i < pageSlots.length; i += 1) {
        const slot = pageSlots[i];
        const r = slot.getBoundingClientRect();
        const visibleTop = Math.max(r.top, viewRect.top);
        const visibleBottom = Math.min(r.bottom, viewRect.bottom);
        const visiblePx = Math.max(0, visibleBottom - visibleTop);
        const mid = (r.top + r.bottom) / 2;
        const dist = Math.abs(mid - viewMid);

        if (visiblePx > bestVisiblePx || (visiblePx === bestVisiblePx && dist < closestDist)) {
          bestVisiblePx = visiblePx;
          closestDist = dist;
          bestPage = i + 1;
        }
      }
      return bestPage;
    }

    function renderScrollViewer() {
      if (!frameWrap || !docId) return;
      disconnectScrollResources();

      const container = document.createElement("div");
      container.id = "pdf-scroll-viewer";
      container.className = "pdf-scroll-viewer";

      const slots = [];
      for (let idx = 0; idx < pageCount; idx += 1) {
        const meta = pagesMeta[idx] || { page: idx + 1, width: 612, height: 792 };
        const pNum = Number(meta.page || idx + 1);
        const w = Math.max(1, Number(meta.width || 612));
        const h = Math.max(1, Number(meta.height || 792));

        const slot = document.createElement("div");
        slot.className = "pdf-page-slot";
        slot.dataset.page = String(pNum);
        slot.style.aspectRatio = `${w} / ${h}`;
        slot.innerHTML = `
          <span class="pdf-page-badge">Page ${pNum}${pageCount > 1 ? ` / ${pageCount}` : ""}</span>
          <img class="pdf-page-img" alt="Page ${pNum}" decoding="async" />
        `;
        container.appendChild(slot);
        slots.push(slot);
      }

      frameWrap.innerHTML = "";
      frameWrap.appendChild(container);
      scrollEl = container;
      pageSlots = slots;

      if (typeof IntersectionObserver !== "undefined") {
        pageObserver = new IntersectionObserver(
          (entries) => {
            if (!rootEl || !rootEl.isConnected) {
              disconnectScrollResources();
              return;
            }
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                ensureSlotImageLoaded(entry.target);
              }
            });
          },
          { root: container, rootMargin: "650px 0px" }
        );
        slots.forEach((slot) => pageObserver.observe(slot));
      }

      // Eagerly load current page and neighbors
      for (let p = Math.max(1, currentPage - 1); p <= Math.min(pageCount, currentPage + 1); p += 1) {
        ensureSlotImageLoaded(slots[p - 1]);
      }

      container.addEventListener("scroll", () => {
        if (!rootEl || !rootEl.isConnected) return;
        if (Date.now() < suppressScrollUntil) return;
        if (scrollRafId !== null) return;
        const schedule = typeof requestAnimationFrame === "function"
          ? requestAnimationFrame
          : (fn) => setTimeout(fn, 16);
        scrollRafId = schedule(() => {
          scrollRafId = null;
          if (!scrollEl || !scrollEl.isConnected) return;
          const visiblePage = detectMostVisiblePage();
          if (visiblePage !== currentPage) {
            currentPage = visiblePage;
            syncToolbarState();
          }
          for (let p = Math.max(1, currentPage - 1); p <= Math.min(pageCount, currentPage + 1); p += 1) {
            ensureSlotImageLoaded(pageSlots[p - 1]);
          }
        });
      }, { passive: true });

      if (currentPage > 1 && slots[currentPage - 1] && typeof slots[currentPage - 1].scrollIntoView === "function") {
        suppressScrollUntil = Date.now() + 200;
        slots[currentPage - 1].scrollIntoView({ behavior: "auto", block: "start" });
      }
    }

    function renderViewerContent() {
      if (!frameWrap) return;
      if (!docId && isPdf) {
        disconnectScrollResources();
        frameWrap.innerHTML = `<iframe class="pdf-viewer-frame" src="${esc(fileUrl)}" title="PDF Preview"></iframe>`;
      } else if (useScrollPages || (docId && pageCount > 1)) {
        renderScrollViewer();
      } else {
        disconnectScrollResources();
        const imgUrl = docId ? `${fileUrl}?v=${fileVersion}` : fileUrl;
        frameWrap.innerHTML = `<img class="image-viewer-full" src="${esc(imgUrl)}" alt="Document preview" />`;
      }
      if (openTabLink && docId) {
        openTabLink.href = `${fileUrl}?v=${fileVersion}`;
      }
    }

    function goToPage(nextPage) {
      const clamped = Math.max(1, Math.min(pageCount, Number(nextPage) || 1));
      currentPage = clamped;
      syncToolbarState();
      if (pageSlots[clamped - 1]) {
        const targetSlot = pageSlots[clamped - 1];
        for (let p = Math.max(1, clamped - 1); p <= Math.min(pageCount, clamped + 1); p += 1) {
          ensureSlotImageLoaded(pageSlots[p - 1]);
        }
        suppressScrollUntil = Date.now() + 500;
        if (typeof targetSlot.scrollIntoView === "function") {
          targetSlot.scrollIntoView({
            behavior: prefersReducedMotion() ? "auto" : "smooth",
            block: "start",
          });
        }
      } else {
        renderViewerContent();
      }
    }

    if (docId) {
      const prevBtn = modalBody.querySelector("#preview-prev-page");
      const nextBtn = modalBody.querySelector("#preview-next-page");
      const pageInput = modalBody.querySelector("#preview-page-input");
      if (prevBtn) prevBtn.addEventListener("click", () => goToPage(currentPage - 1));
      if (nextBtn) nextBtn.addEventListener("click", () => goToPage(currentPage + 1));
      if (pageInput) {
        pageInput.addEventListener("change", () => goToPage(pageInput.value));
      }

      modalBody.querySelectorAll(".preview-rotate-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (isRotating) return;
          const angle = Number(btn.dataset.angle || 90);
          const targetPage = currentPage;
          isRotating = true;
          syncToolbarState();
          try {
            const targetSlot = pageSlots[targetPage - 1] || null;
            const targetImg = targetSlot
              ? targetSlot.querySelector(".pdf-page-img")
              : frameWrap.querySelector(".image-viewer-full");

            let res;
            if (targetImg) {
              res = await animatePageRotation({
                imgEl: targetImg,
                containerEl: targetSlot || frameWrap,
                angle,
                mode: targetSlot ? "slot" : "contain",
                onRequest: () => rotateVaultDocumentPage(docId, targetPage, angle),
                getNextSrc: () => {
                  fileVersion = Date.now();
                  return (useScrollPages || pageCount > 1)
                    ? `/api/documents/${docId}/pages/${targetPage}?v=${fileVersion}`
                    : `${fileUrl}?v=${fileVersion}`;
                },
                onAfterSwap: (rotateRes) => {
                  if (Array.isArray(rotateRes.pages) && rotateRes.pages.length) {
                    pagesMeta = rotateRes.pages;
                  }
                  if (targetSlot) {
                    const meta = pagesMeta[targetPage - 1];
                    if (meta) {
                      targetSlot.style.aspectRatio = `${Math.max(1, meta.width)} / ${Math.max(1, meta.height)}`;
                    }
                    targetImg.dataset.loadedSrc = `/api/documents/${docId}/pages/${targetPage}?v=${fileVersion}`;
                  }
                  if (openTabLink) {
                    openTabLink.href = `${fileUrl}?v=${fileVersion}`;
                  }
                },
              });
            } else {
              res = await rotateVaultDocumentPage(docId, targetPage, angle);
              if (!rootEl || !rootEl.isConnected) return;
              fileVersion = Date.now();
              if (Array.isArray(res.pages) && res.pages.length) {
                pagesMeta = res.pages;
              }
              renderViewerContent();
            }

            if (!rootEl || !rootEl.isConnected) return;
            pageCount = Math.max(1, Number(res.page_count || pageCount));
            currentPage = Math.min(targetPage, pageCount);
            const dirLabel = angle === -90 ? "90° left" : angle === 180 ? "180°" : "90° right";
            toast(`Rotated page ${currentPage} ${dirLabel} and updated file`);
          } catch (err) {
            toast(err.message, true);
          } finally {
            if (rootEl && rootEl.isConnected) {
              isRotating = false;
              syncToolbarState();
            }
          }
        });
      });

      api(`/api/documents/${docId}/pages`)
        .then((info) => {
          if (!rootEl || !rootEl.isConnected) return;
          pageCount = Math.max(1, Number(info.page_count || 1));
          if (Array.isArray(info.pages) && info.pages.length) {
            pagesMeta = info.pages;
          }
          currentPage = Math.min(currentPage, pageCount);
          syncToolbarState();
          if (useScrollPages || pageCount > 1) {
            renderScrollViewer();
          }
        })
        .catch(() => {
          // Keep default pageCount=1 if metadata lookup fails
        });
    }

    syncToolbarState();
    renderViewerContent();
    showAnimatedModal(modal);
  }

  function renderReviewCard(item) {
    const card = document.createElement("article");
    card.className = "doc-card";
    card.dataset.reviewId = String(item.id);

    const imgs = item.preview_images || [];
    const firstImg = imgs[0] ? `/api/previews/${encodeURIComponent(imgs[0])}` : "";
    const fullFileUrl = `/api/review/${encodeURIComponent(item.id)}/file`;
    const pct = Math.round((item.confidence || 0) * 100);
    const thresholdPct = getConfidenceThresholdPct();
    const reasonBadges = (item.review_reasons || [])
      .map((r) => `<span class="tag ${r === "duplicate_hash" || r === "model_error" || r === "ollama_error" ? "tag-danger" : "tag-warn"}">${esc(REASON_LABELS[r] || r)}</span>`)
      .join("");

    const dupHtml = item.duplicate_document
      ? `<div class="banner-warn banner-warn-row">
           <div>
             <strong>Exact duplicate detected (SHA-256 match):</strong> Already filed at
             <code>${esc(item.duplicate_document.vault_rel_path)}</code>. Saving will keep both copies safely with a suffix; nothing will be deleted.
           </div>
           <button type="button" class="btn btn-secondary btn-xs btn-dup-vault">View in Vault →</button>
         </div>`
      : "";

    const newCatBtn = item.suggested_new_category
      ? `<label class="checkbox-field" style="font-size:12px;">
           <input type="checkbox" class="inp-add-cat" checked />
           <span>Add "${esc(item.suggested_new_category)}" to saved categories if selected</span>
         </label>`
      : `<input type="checkbox" class="inp-add-cat hidden" />`;

    const thinkingHtml = item.thinking
      ? `<details class="thinking-details">
           <summary>Model Thinking</summary>
           <pre class="thinking-box">${esc(item.thinking)}</pre>
         </details>`
      : "";

    const actionHtml = `<button type="button" class="btn btn-primary btn-approve-review">Approve &amp; File</button>
         <button type="button" class="btn btn-ghost-danger btn-dismiss-review">Dismiss (Keep Original)</button>`;

    const datePlaceholder = state.settings?.date_format || "YYYY-MM-DD";

    card.innerHTML = `
      <div class="preview-pane">
        <div class="preview-frame" title="Click to preview full document">
          ${firstImg ? `<img class="preview-img" src="${firstImg}" alt="Document preview" />` : `<span class="muted">No preview</span>`}
        </div>
        <div class="page-switcher">
          ${
            imgs.length > 1
              ? imgs.map((imgName, i) => `<button type="button" class="btn btn-sm btn-secondary page-btn ${i === 0 ? "btn-primary" : ""}" data-idx="${i}">Page ${getPreviewPageNumber(imgName, i)}</button>`).join("")
              : ""
          }
          <button type="button" class="btn btn-sm btn-secondary btn-preview-full">Preview PDF / Full</button>
        </div>
      </div>

      <div class="doc-meta-pane">
        <div class="doc-card-header">
          <div class="doc-filename">${esc(item.original_filename)}</div>
          <div class="tag-row">
            <span class="tag ${pct >= thresholdPct ? "tag-ok" : "tag-warn"}">Confidence: ${pct}%</span>
            ${reasonBadges}
          </div>
        </div>

        ${item.reason ? `<p class="muted">${esc(item.reason)}</p>` : ""}
        ${thinkingHtml}
        ${dupHtml}

        <div class="form-grid-3">
          <label class="field">
            <span>Document Date</span>
            <input type="text" class="inp-date" value="${esc(item.suggested_date || "")}" placeholder="${esc(datePlaceholder)}" />
          </label>
          <label class="field">
            <span>Category</span>
            <select class="inp-cat">
              ${buildCategoryOptions(item.suggested_category, item.suggested_new_category)}
            </select>
          </label>
          <label class="field">
            <span>Title</span>
            <input type="text" class="inp-title" value="${esc(item.suggested_title || "")}" placeholder="Document title" />
          </label>
        </div>

        ${newCatBtn}

        <div class="path-preview-box">
          <span class="muted">Target Vault Path:</span>
          <code class="live-path-code">${esc(item.preview_rel_path || "")}</code>
        </div>

        <div class="card-actions">
          <span class="save-status muted"></span>
          <div class="action-buttons">${actionHtml}</div>
        </div>
      </div>
    `;

    if (imgs.length > 1) bindPreviewSwitcher(card, imgs);
    card.querySelector(".preview-frame").addEventListener("click", () =>
      openFullFilePreview(fullFileUrl, item.original_filename, item.original_filename)
    );
    card.querySelector(".btn-preview-full").addEventListener("click", () =>
      openFullFilePreview(fullFileUrl, item.original_filename, item.original_filename)
    );

    ["inp-date", "inp-cat", "inp-title"].forEach((cls) => {
      card.querySelector(`.${cls}`).addEventListener("input", () => updateLivePathPreview(card, item.original_filename));
      card.querySelector(`.${cls}`).addEventListener("change", () => updateLivePathPreview(card, item.original_filename));
    });

    const dupBtn = card.querySelector(".btn-dup-vault");
    if (dupBtn && item.duplicate_document) {
      dupBtn.addEventListener("click", () =>
        navigateToVaultDocument({
          documentId: item.duplicate_document.id,
          category: item.duplicate_document.category,
          vaultRelPath: item.duplicate_document.vault_rel_path,
        })
      );
    }

    const approveBtn = card.querySelector(".btn-approve-review");
    const dismissBtn = card.querySelector(".btn-dismiss-review");

    approveBtn.addEventListener("click", async () => {
      approveBtn.disabled = true;
      dismissBtn.disabled = true;
      try {
        const res = await api(`/api/review/${item.id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: card.querySelector(".inp-date").value.trim(),
            category: card.querySelector(".inp-cat").value,
            title: card.querySelector(".inp-title").value.trim(),
            add_category: Boolean(card.querySelector(".inp-add-cat")?.checked),
          }),
        });
        state.reviewItems = state.reviewItems.filter((r) => Number(r.id) !== Number(item.id));
        state.lastPendingReviews = Number(res.pending_count || 0);
        updateReviewBadge(res.pending_count);
        toast(`Filed -> ${res.document.vault_rel_path}`);
        removeCardSmoothly(card, () => {
          if (!$("#review-list").children.length) renderEmptyReview();
        });
        await loadSettings();
        refreshHealth();
      } catch (err) {
        toast(err.message, true);
        approveBtn.disabled = false;
        dismissBtn.disabled = false;
      }
    });

    dismissBtn.addEventListener("click", async () => {
      approveBtn.disabled = true;
      dismissBtn.disabled = true;
      try {
        const res = await api(`/api/review/${item.id}/dismiss`, { method: "POST" });
        state.reviewItems = state.reviewItems.filter((r) => Number(r.id) !== Number(item.id));
        state.lastPendingReviews = Number(res.pending_count || 0);
        updateReviewBadge(res.pending_count);
        toast("Dismissed from queue (original kept untouched)");
        removeCardSmoothly(card, () => {
          if (!$("#review-list").children.length) renderEmptyReview();
        });
      } catch (err) {
        toast(err.message, true);
        approveBtn.disabled = false;
        dismissBtn.disabled = false;
      }
    });

    return card;
  }

  // ── Global Drag & Drop Anywhere on Page ───────────────────────────────────
  const globalOverlay = $("#global-drop-overlay");
  const globalFileInput = $("#global-file-input");
  const globalDropIndicator = $("#global-drop-indicator");
  let dragDepth = 0;

  function isFileDragEvent(e) {
    const types = e.dataTransfer?.types;
    return Boolean(types && Array.from(types).includes("Files"));
  }

  function hideGlobalDropOverlay() {
    dragDepth = 0;
    globalOverlay.classList.add("hidden");
  }

  globalDropIndicator.addEventListener("click", () => globalFileInput.click());
  globalFileInput.addEventListener("change", () => {
    if (globalFileInput.files?.length) enqueueDroppedFiles(globalFileInput.files);
    globalFileInput.value = "";
  });

  window.addEventListener("dragenter", (e) => {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    dragDepth += 1;
    globalOverlay.classList.remove("hidden");
  });

  window.addEventListener("dragover", (e) => {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    globalOverlay.classList.remove("hidden");
  });

  window.addEventListener("dragleave", (e) => {
    if (!isFileDragEvent(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0 || e.relatedTarget === null) {
      hideGlobalDropOverlay();
    }
  });

  window.addEventListener("drop", (e) => {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    hideGlobalDropOverlay();
    if (e.dataTransfer?.files?.length) {
      enqueueDroppedFiles(e.dataTransfer.files);
    }
  });

  window.addEventListener("blur", hideGlobalDropOverlay);

  async function enqueueDroppedFiles(fileList, deferOverride = false) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const readiness = state.latestHealth ? getModelReadinessState(state.latestHealth) : "ready";
    if (!deferOverride && readiness === "missing") {
      openModelRequiredPrompt({
        title: `Download Vision Model to File ${files.length} Document${files.length === 1 ? "" : "s"}`,
        description: "Document Vault needs a one-time local Vision Model download to read and rename your files. Queue them now and they'll auto-process as soon as the download finishes.",
        primaryLabel: "Download & Queue Files",
        onDownloadAndProceed: () => enqueueDroppedFiles(files, true),
      });
      return;
    }

    const shouldDefer = Boolean(deferOverride || readiness === "downloading");
    const form = new FormData();
    files.forEach((file) => form.append("files", file));

    try {
      const url = shouldDefer ? "/api/watcher/upload?defer_for_model=true" : "/api/watcher/upload";
      const res = await api(url, {
        method: "POST",
        body: form,
      });
      state.queueExpanded = true;
      updateReviewBadge(res.pending_reviews ?? 0);
      renderWatcherTopbar(res.watcher);
      if (!res.watcher?.is_scanning && !res.watcher?.active_file && !res.waiting_for_model) {
        if ($("#tab-vault").classList.contains("active")) loadVaultDocuments({ reason: "sync" });
        if ($("#tab-review").classList.contains("active")) loadReviewQueue();
      }
      if (res.waiting_for_model) {
        toast(`Queued ${res.queued_count} document${res.queued_count === 1 ? "" : "s"} — will auto-process once model download finishes.`);
      } else {
        toast(`Queued ${res.queued_count} document${res.queued_count === 1 ? "" : "s"} for processing`);
      }
      if (res.rejected?.length) {
        const names = res.rejected.map((r) => `${r.filename} (${r.reason})`).join(", ");
        toast(`Skipped unsupported/empty file(s): ${names}`, true);
      }
    } catch (err) {
      toast(err.message, true);
    }
  }

  // ── Activity & Review Tab ─────────────────────────────────────────────────
  function renderEmptyReview() {
    $("#review-list").innerHTML = `
      <div class="empty-state empty-state-nice">
        <div class="empty-state-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <div class="empty-state-title">All caught up</div>
        <p class="muted">No documents awaiting review. Confident scans and dropped documents are filed automatically below.</p>
      </div>`;
  }

  function syncReviewListDom(items) {
    const listEl = $("#review-list");
    if (!listEl) return;
    if (!items.length) {
      const hasOnlyEmpty =
        listEl.children.length === 1 && listEl.children[0].classList?.contains("empty-state");
      if (!hasOnlyEmpty) {
        renderEmptyReview();
      }
      return;
    }

    Array.from(listEl.children).forEach((child) => {
      if (!child.dataset?.reviewId) child.remove();
    });

    const existingById = new Map();
    Array.from(listEl.children).forEach((child) => {
      const rid = child.dataset?.reviewId;
      if (rid) existingById.set(rid, child);
    });

    const desiredIds = new Set(items.map((item) => String(item.id)));
    existingById.forEach((el, rid) => {
      if (!desiredIds.has(rid)) el.remove();
    });

    items.forEach((item, idx) => {
      const rid = String(item.id);
      let card = existingById.get(rid);
      if (!card) {
        card = renderReviewCard(item);
      }
      if (listEl.children[idx] !== card) {
        listEl.insertBefore(card, listEl.children[idx] || null);
      }
    });
  }

  async function loadReviewQueue({ skipTopbar = false } = {}) {
    if (state.reviewLoading) {
      state.reviewReloadQueued = true;
      return;
    }
    state.reviewLoading = true;
    try {
      const data = await api("/api/review");
      state.reviewItems = data.items || [];
      state.reviewLoadedOnce = true;
      const pendingCount = Number(data.pending_count || 0);
      state.lastPendingReviews = pendingCount;
      updateReviewBadge(pendingCount);
      syncReviewListDom(state.reviewItems);
      if (!skipTopbar) {
        const w = await api("/api/watcher/status");
        renderWatcherTopbar(w, { skipReviewReload: true });
      }
    } catch (err) {
      toast(err.message, true);
    } finally {
      state.reviewLoading = false;
      if (state.reviewReloadQueued) {
        state.reviewReloadQueued = false;
        loadReviewQueue({ skipTopbar: true });
      }
    }
  }

  $("#refresh-review-btn").addEventListener("click", () => loadReviewQueue());

  // ── Vault Browser Tab ─────────────────────────────────────────────────────
  function getDocCardSig(doc) {
    const thumb = doc.preview_images?.[0] || "";
    const labelsSig = Array.isArray(doc.labels) && doc.labels.length ? doc.labels.join(",") : (doc.category || "");
    return `${doc.title}|${doc.category}|${labelsSig}|${doc.doc_date || ""}|${doc.vault_rel_path || ""}|${thumb}|${doc.created_at || ""}`;
  }

  function buildVaultCardInnerHtml(doc, isSelected) {
    const thumb = doc.preview_images?.[0] ? `/api/previews/${encodeURIComponent(doc.preview_images[0])}` : "";
    const labels = Array.isArray(doc.labels) && doc.labels.length ? doc.labels : [doc.category || "Other"];
    const labelButtonsHtml = labels
      .map((lbl) => {
        const tone = getCategoryTone(lbl);
        return `<button type="button" class="tag tag-cat-btn ${tone}" data-category="${esc(lbl)}" title="Show all ${esc(lbl)} documents">${esc(lbl)}</button>`;
      })
      .join("");
    const addedLabel = doc.created_at ? formatRelativeOrShortTime(doc.created_at) : "";
    return `
      <div class="vault-thumb">
        <label class="vault-select-label" title="Select document (Shift+click for range)">
          <input type="checkbox" class="vault-select-cb" aria-label="Select ${esc(doc.title)}" ${isSelected ? "checked" : ""} />
        </label>
        ${thumb ? `<img src="${thumb}" alt="Preview" loading="lazy" decoding="async" />` : `<span class="muted">No preview</span>`}
      </div>
      <div class="vault-card-meta">
        <div class="tag-row">
          ${labelButtonsHtml}
          <span class="tag">${esc(doc.doc_date || "Undated")}</span>
        </div>
        ${addedLabel ? `<span class="vault-added-time" title="Added ${esc(new Date(doc.created_at).toLocaleString())}">Added ${esc(addedLabel)}</span>` : ""}
      </div>
      <div class="vault-title">${esc(doc.title)}</div>
      <div class="vault-path">${esc(doc.vault_rel_path)}</div>
      <div class="action-buttons" style="margin-top:auto;">
        <button type="button" class="btn btn-secondary btn-sm btn-preview-doc">Preview</button>
        <button type="button" class="btn btn-secondary btn-sm btn-edit-doc">Edit / Move</button>
        <button type="button" class="btn btn-ghost-danger btn-sm btn-delete-doc">Delete</button>
      </div>
    `;
  }

  function createVaultCardElement(doc) {
    const docId = Number(doc.id);
    const isSelected = state.selectedDocIds.has(docId);
    const card = document.createElement("article");
    card.className = `vault-item ${isSelected ? "vault-item-selected" : ""}`.trim();
    card.dataset.docId = String(docId);
    card.dataset.relPath = doc.vault_rel_path || "";
    card.dataset.docSig = getDocCardSig(doc);
    card.innerHTML = buildVaultCardInnerHtml(doc, isSelected);
    return card;
  }

  function syncVaultCardElement(card, doc) {
    const docId = Number(doc.id);
    const isSelected = state.selectedDocIds.has(docId);
    const nextSig = getDocCardSig(doc);
    card.dataset.docId = String(docId);
    card.dataset.relPath = doc.vault_rel_path || "";
    if (card.dataset.docSig !== nextSig) {
      card.dataset.docSig = nextSig;
      card.innerHTML = buildVaultCardInnerHtml(doc, isSelected);
    } else {
      const cb = card.querySelector(".vault-select-cb");
      if (cb) cb.checked = isSelected;
    }
    card.classList.toggle("vault-item-selected", isSelected);
  }

  function updateVaultPaginationUI() {
    const floatEl = $("#vault-grid-float");
    const statusEl = $("#vault-results-status");
    const barEl = $("#vault-load-more-bar");
    const moreStatusEl = $("#vault-load-more-status");
    const moreBtn = $("#vault-load-more-btn");
    const loadedCount = state.vaultDocs.length;
    const total = state.vaultTotal;

    if (floatEl) {
      floatEl.classList.toggle("hidden", loadedCount === 0);
      if (loadedCount === 0) {
        floatEl.classList.remove("is-stuck");
      }
    }

    if (statusEl) {
      if (total === 0) {
        statusEl.textContent = "";
      } else if (loadedCount < total) {
        statusEl.textContent = `${loadedCount} of ${total}`;
      } else {
        statusEl.textContent = `${total} doc${total === 1 ? "" : "s"}`;
      }
    }

    if (barEl) {
      barEl.classList.toggle("hidden", !state.vaultHasMore);
    }
    if (state.vaultHasMore) {
      const remaining = Math.max(0, total - loadedCount);
      if (moreStatusEl) {
        moreStatusEl.textContent = `Showing ${loadedCount} of ${total} documents`;
      }
      if (moreBtn) {
        moreBtn.disabled = state.vaultLoadingMore;
        moreBtn.textContent = state.vaultLoadingMore
          ? "Loading…"
          : `Load More (${remaining} remaining)`;
      }
    }
  }

  function spawnExitGhosts(cardsWithRects, stageRect, animLayer) {
    if (!stageRect || !animLayer) return 0;
    const vh = window.innerHeight || 900;
    let count = 0;
    for (const { el, rect } of cardsWithRects) {
      if (count >= 24) break;
      if (rect.bottom <= -40 || rect.top >= vh + 40) continue;
      const ghost = el.cloneNode(true);
      ghost.removeAttribute("id");
      ghost.classList.remove("vault-item-enter", "vault-item-moving", "vault-item-highlight");
      ghost.classList.add("vault-item-ghost");
      ghost.style.left = `${rect.left - stageRect.left}px`;
      ghost.style.top = `${rect.top - stageRect.top}px`;
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;
      ghost.style.transition = "";
      ghost.style.transform = "";
      animLayer.appendChild(ghost);
      count += 1;
    }
    if (count > 0) {
      requestAnimationFrame(() => {
        Array.from(animLayer.children).forEach((g) => g.classList.add("vault-item-ghost-leave"));
      });
    }
    return count;
  }

  function scheduleVaultAnimCleanup(delayMs = 360) {
    clearTimeout(state.vaultAnimCleanupTimer);
    state.vaultAnimCleanupTimer = setTimeout(() => {
      const animLayer = $("#vault-anim-layer");
      if (animLayer) animLayer.innerHTML = "";
      const grid = $("#vault-list");
      if (grid) {
        Array.from(grid.children).forEach((el) => {
          el.classList.remove("vault-item-enter", "vault-item-moving");
          el.style.transition = "";
          el.style.transform = "";
          el.style.removeProperty("--enter-delay");
        });
      }
      state.vaultAnimCleanupTimer = null;
    }, delayMs);
  }

  async function loadVaultDocuments(opts = {}) {
    const {
      reason = "filter",
      append = false,
      reconcile = false,
      isFallbackRetry = false,
      minLimit = VAULT_PAGE_SIZE,
    } = typeof opts === "boolean" ? { isFallbackRetry: opts } : opts;

    if (append) {
      if (state.vaultLoadingMore || state.vaultLoading || !state.vaultHasMore) return;
    }

    const q = $("#vault-search").value.trim();
    const cat = state.vaultCategory || "";
    const year = $("#vault-filter-year").value;
    const sort = $("#vault-sort")?.value || "recent";

    const hasHighlight = Boolean(state.vaultHighlightDocId || state.vaultHighlightRelPath);
    const limit = append ? VAULT_PAGE_SIZE : Math.max(minLimit, hasHighlight ? 200 : VAULT_PAGE_SIZE);
    const offset = append ? state.vaultDocs.length : 0;

    let shouldReconcile = false;
    if (!append) {
      if (reason === "refresh") {
        shouldReconcile = true;
      } else if (reconcile) {
        shouldReconcile =
          state.vaultLastReconcileAt === 0 ||
          Date.now() - state.vaultLastReconcileAt >= VAULT_RECONCILE_THROTTLE_MS;
      }
    }

    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (cat) params.set("category", cat);
    if (year) params.set("year", year);
    params.set("sort", sort);
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    params.set("reconcile", shouldReconcile ? "true" : "false");
    params.set("include_facets", append ? "false" : "true");

    let controller = null;
    let seq = state.vaultRequestSeq;
    const stage = $("#vault-grid-stage");

    if (append) {
      state.vaultLoadingMore = true;
      updateVaultPaginationUI();
    } else {
      if (state.vaultAbortController) {
        state.vaultAbortController.abort();
      }
      controller = new AbortController();
      state.vaultAbortController = controller;
      seq = ++state.vaultRequestSeq;
      state.vaultLoading = true;
      if (stage && reason !== "sync") {
        stage.classList.add("is-loading");
      }
    }

    try {
      const data = await api(`/api/documents?${params.toString()}`, {
        signal: controller ? controller.signal : undefined,
      });

      if (!append && seq !== state.vaultRequestSeq) return;
      if (shouldReconcile) state.vaultLastReconcileAt = Date.now();

      const docs = data.documents || [];

      if (append) {
        const freshDocs = docs.filter((d) => !state.vaultDocsById.has(Number(d.id)));
        freshDocs.forEach((d) => {
          state.vaultDocs.push(d);
          state.vaultDocsById.set(Number(d.id), d);
        });
        state.vaultTotal = data.total ?? state.vaultDocs.length;
        state.vaultHasMore = Boolean(data.has_more);
        appendVaultCards(freshDocs);
        updateVaultPaginationUI();
        updateBatchActionBar();
        return;
      }

      const facets = data.facets || { categories: [], category_counts: {}, total_count: 0, years: [] };
      const total = data.total ?? docs.length;
      const hasMore = Boolean(data.has_more);
      const renderSig = JSON.stringify({
        q,
        cat,
        year,
        sort,
        total,
        hasMore,
        docs: docs.map((d) => [d.id, d.updated_at, d.category, d.doc_date, d.title, d.vault_rel_path]),
        facets: [facets.total_count, facets.category_counts, facets.years],
      });

      let animateMode = "filter";
      if (state.vaultOpenPendingAnimation) {
        animateMode = "open";
        state.vaultOpenPendingAnimation = false;
      } else if (reason === "sync" && renderSig === state.vaultLastRenderSig) {
        return;
      }

      state.vaultDocs = docs;
      state.vaultDocsById = new Map(docs.map((d) => [Number(d.id), d]));
      state.vaultTotal = total;
      state.vaultTotalCount = Number(facets.total_count ?? total ?? 0);
      state.vaultHasMore = hasMore;
      state.vaultLastRenderSig = renderSig;

      state.selectedDocIds = new Set(
        Array.from(state.selectedDocIds).filter((id) => state.vaultDocsById.has(id))
      );
      state.lastSelectedDocIdx = null;

      populateVaultFacets(facets, cat, year);
      renderVaultTagBar(facets, cat, animateMode === "open");
      renderVaultGrid(state.vaultDocs, { animateMode });
      updateVaultPaginationUI();
      updateBatchActionBar();

      if (state.vaultHighlightDocId || state.vaultHighlightRelPath) {
        const targetId = state.vaultHighlightDocId;
        const targetPath = state.vaultHighlightRelPath;
        const card = Array.from($("#vault-list").children).find((el) => {
          if (targetId && Number(el.dataset.docId) === targetId) return true;
          if (targetPath && el.dataset.relPath === targetPath) return true;
          return false;
        });

        if (!card && hasMore && minLimit < 500) {
          await loadVaultDocuments({ reason, isFallbackRetry, reconcile: false, minLimit: 500 });
          return;
        }

        if (!card && cat && !isFallbackRetry) {
          // Document may have been moved to another category since the link was generated
          state.vaultCategory = "";
          await loadVaultDocuments({ reason, isFallbackRetry: true, reconcile: false });
          return;
        }

        state.vaultHighlightDocId = null;
        state.vaultHighlightRelPath = "";
        if (card) {
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          card.classList.add("vault-item-highlight");
          setTimeout(() => card.classList.remove("vault-item-highlight"), 2600);
        } else {
          toast("Document is no longer in the Vault", true);
        }
      }
    } catch (err) {
      if (err && err.name === "AbortError") return;
      toast(err.message, true);
    } finally {
      if (append) {
        state.vaultLoadingMore = false;
        updateVaultPaginationUI();
      } else if (seq === state.vaultRequestSeq) {
        state.vaultLoading = false;
        if (stage) stage.classList.remove("is-loading");
      }
    }
  }

  function syncVaultTagBarActive(selectedCat) {
    const bar = $("#vault-tag-bar");
    if (!bar) return;
    const targetCat = selectedCat || "";
    bar.querySelectorAll(".vault-tag-pill").forEach((btn) => {
      const isActive = (btn.dataset.category || "") === targetCat;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function renderVaultTagBar(facets, selectedCat, animateOpen = false) {
    const bar = $("#vault-tag-bar");
    if (!bar) return;
    const nav = $(".vault-tag-nav");
    const counts = facets.category_counts || {};
    const totalCount = facets.total_count ?? Object.values(counts).reduce((a, b) => a + b, 0);
    const categories = facets.categories || [];
    const desiredValues = ["", ...categories];
    const existingButtons = Array.from(bar.querySelectorAll(".vault-tag-pill"));
    const sameKeys =
      existingButtons.length === desiredValues.length &&
      existingButtons.every((btn, i) => (btn.dataset.category || "") === desiredValues[i]);

    if (sameKeys) {
      existingButtons.forEach((btn, i) => {
        const catVal = desiredValues[i];
        const count = catVal === "" ? totalCount : (counts[catVal] ?? 0);
        const isActive = catVal === selectedCat;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
        const countEl = btn.querySelector(".vtp-count");
        if (countEl && countEl.textContent !== String(count)) {
          countEl.textContent = String(count);
        }
      });
    } else {
      const canAnimateResize = Boolean(
        nav && existingButtons.length > 0 && !animateOpen && !prefersReducedMotion()
      );
      const oldHeight = canAnimateResize ? nav.getBoundingClientRect().height : 0;

      bar.innerHTML = "";
      const makePill = (label, catValue, count, toneCls = "") => {
        const btn = document.createElement("button");
        const isActive = catValue === selectedCat;
        btn.type = "button";
        btn.dataset.category = catValue;
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
        btn.className = `vault-tag-pill ${toneCls} ${isActive ? "active" : ""}`.trim();
        btn.innerHTML = `<span class="vtp-label">${esc(label)}</span><span class="vtp-count">${count}</span>`;
        return btn;
      };

      const frag = document.createDocumentFragment();
      frag.appendChild(makePill("All", "", totalCount));
      categories.forEach((c) => {
        frag.appendChild(makePill(c, c, counts[c] ?? 0, getCategoryTone(c)));
      });
      bar.appendChild(frag);

      if (canAnimateResize) {
        nav.style.height = "auto";
        const newHeight = nav.getBoundingClientRect().height;
        if (Math.abs(oldHeight - newHeight) > 1) {
          nav.style.height = `${oldHeight}px`;
          nav.style.overflow = "hidden";
          void nav.offsetHeight;
          requestAnimationFrame(() => {
            nav.style.height = `${newHeight}px`;
          });
          setTimeout(() => {
            nav.style.height = "";
            nav.style.overflow = "";
          }, 260);
        } else {
          nav.style.height = "";
        }
      }
    }

    if (animateOpen && nav && !prefersReducedMotion()) {
      nav.classList.remove("vault-nav-enter");
      void nav.offsetWidth;
      nav.classList.add("vault-nav-enter");
    }
  }

  function populateVaultFacets(facets, _selectedCat, selectedYear) {
    const yearSel = $("#vault-filter-year");
    yearSel.innerHTML = `<option value="">All Years</option>` +
      (facets.years || []).map((y) => `<option value="${esc(y)}" ${y === selectedYear ? "selected" : ""}>${esc(y)}</option>`).join("");
  }

  function getSelectedVaultDocs() {
    return state.vaultDocs.filter((d) => state.selectedDocIds.has(Number(d.id)));
  }

  function updateBatchActionBar() {
    const selectedCount = state.selectedDocIds.size;
    const totalVisible = state.vaultDocs.length;
    const bar = $("#vault-batch-bar");
    const countEl = $("#batch-selection-count");
    const selectAllTopBtn = $("#vault-select-all-btn");
    const batchSelectAllBtn = $("#batch-select-all-btn");
    const clearTopBtn = $("#vault-clear-sel-btn");

    const allSelected = totalVisible > 0 && selectedCount === totalVisible;
    if (selectAllTopBtn) {
      selectAllTopBtn.disabled = totalVisible === 0;
      selectAllTopBtn.textContent = allSelected ? "Deselect All" : "Select All";
      selectAllTopBtn.title = totalVisible > 0
        ? (state.vaultTotal > totalVisible
          ? `Select all ${totalVisible} currently shown documents`
          : `Select all ${totalVisible} documents`)
        : "";
    }
    if (batchSelectAllBtn) {
      batchSelectAllBtn.textContent = allSelected ? "Deselect All" : "Select All";
    }
    if (clearTopBtn) {
      clearTopBtn.classList.toggle("hidden", selectedCount === 0);
    }
    if (countEl) {
      countEl.textContent = `${selectedCount} selected`;
    }
    if (bar) {
      bar.classList.toggle("hidden", selectedCount === 0);
    }
  }

  function toggleAllVisibleDocs() {
    const totalVisible = state.vaultDocs.length;
    if (!totalVisible) return;
    const allSelected = state.selectedDocIds.size === totalVisible;
    if (allSelected) {
      state.selectedDocIds.clear();
    } else {
      state.vaultDocs.forEach((d) => state.selectedDocIds.add(Number(d.id)));
    }
    state.lastSelectedDocIdx = null;
    syncGridSelectionStyles();
    updateBatchActionBar();
  }

  function clearDocSelection() {
    state.selectedDocIds.clear();
    state.lastSelectedDocIdx = null;
    syncGridSelectionStyles();
    updateBatchActionBar();
  }

  function syncGridSelectionStyles() {
    $$("#vault-list .vault-item").forEach((card) => {
      const docId = Number(card.dataset.docId);
      const checked = state.selectedDocIds.has(docId);
      card.classList.toggle("vault-item-selected", checked);
      const cb = card.querySelector(".vault-select-cb");
      if (cb) cb.checked = checked;
    });
  }

  function appendVaultCards(newDocs) {
    if (!newDocs.length) return;
    const grid = $("#vault-list");
    if (!grid) return;
    const reducedMotion = prefersReducedMotion();
    const frag = document.createDocumentFragment();
    newDocs.forEach((doc, i) => {
      const card = createVaultCardElement(doc);
      if (!reducedMotion && i < 12) {
        card.classList.add("vault-item-enter");
        card.style.setProperty("--enter-delay", `${Math.min(i, 8) * 18}ms`);
      }
      frag.appendChild(card);
    });
    grid.appendChild(frag);
    if (!reducedMotion) {
      scheduleVaultAnimCleanup(420);
    }
  }

  function renderVaultGrid(docs, { animateMode = "filter" } = {}) {
    const grid = $("#vault-list");
    const stage = $("#vault-grid-stage");
    const animLayer = $("#vault-anim-layer");
    const reducedMotion = prefersReducedMotion();

    clearTimeout(state.vaultAnimCleanupTimer);
    state.vaultAnimCleanupTimer = null;
    if (animLayer) animLayer.innerHTML = "";

    const existingCards = new Map();
    const existingRects = new Map();
    const stageRect = stage ? stage.getBoundingClientRect() : null;

    Array.from(grid.children).forEach((el) => {
      if (!el.classList || !el.classList.contains("vault-item")) return;
      const id = Number(el.dataset.docId);
      if (!id) return;
      const rect = el.getBoundingClientRect();
      existingCards.set(id, el);
      existingRects.set(id, rect);
      el.classList.remove("vault-item-enter", "vault-item-moving");
      el.style.transition = "";
      el.style.transform = "";
      el.style.removeProperty("--enter-delay");
    });

    if (!docs.length) {
      if (!reducedMotion && animateMode === "filter" && existingCards.size > 0) {
        const leaving = Array.from(existingCards.entries()).map(([id, el]) => ({
          el,
          rect: existingRects.get(id),
        }));
        spawnExitGhosts(leaving, stageRect, animLayer);
        scheduleVaultAnimCleanup(240);
      }

      const hasFilters = Boolean(
        $("#vault-search")?.value?.trim() || state.vaultCategory || $("#vault-filter-year")?.value
      );
      if ((state.vaultTotalCount || 0) > 0 && hasFilters) {
        grid.innerHTML = `
          <div class="empty-state empty-state-nice ${!reducedMotion && animateMode !== "none" ? "vault-empty-enter" : ""}" style="grid-column:1/-1;">
            <div class="empty-state-icon empty-state-icon-neutral" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <div class="empty-state-title">No matching documents found</div>
            <p class="muted">Try clearing your search or tag/year filters to see all ${esc(String(state.vaultTotalCount))} document(s).</p>
            <button id="vault-clear-filters-btn" class="btn btn-secondary btn-sm" type="button" style="margin-top:8px;">Clear Filters</button>
          </div>`;
        grid.querySelector("#vault-clear-filters-btn")?.addEventListener("click", () => {
          if ($("#vault-search")) $("#vault-search").value = "";
          if ($("#vault-filter-year")) $("#vault-filter-year").value = "";
          state.vaultCategory = "";
          loadVaultDocuments({ reason: "filter" });
        });
        updateBatchActionBar();
        return;
      }

      const h = state.latestHealth || {};
      const vlm = h.vlm || {};
      const dl = vlm.download || {};
      const watcherInfo = h.watcher || {};
      const vaultDir = state.settings?.vault_dir || h.vault_dir || "";
      const dumpDir = state.settings?.dump_dir || watcherInfo.dump_dir || "";

      const isDownloading = dl.status === "downloading";
      const modelReady = Boolean(vlm.ready);
      const targetModelId = getSelectedOrRecommendedModelId(vlm);
      const targetModelInfo = findCatalogModel(targetModelId);
      const sizeText = targetModelInfo?.size_gb ? ` (${targetModelInfo.size_gb} GB)` : "";

      let modelRowClass = "is-warn";
      let modelDot = "2";
      let modelTitle = "Local Vision AI Model";
      let modelSub = "One-time download required so Document Vault can read scans locally.";
      let modelActions = targetModelId
        ? `<button type="button" class="btn btn-primary btn-xs" data-empty-action="dl-model">Download ${esc(shortModelLabel(targetModelId))}${esc(sizeText)}</button>`
        : `<button type="button" class="btn btn-primary btn-xs" data-empty-action="open-settings">Choose Model…</button>`;

      if (modelReady) {
        modelRowClass = "is-done";
        modelDot = "✓";
        modelTitle = `Vision Model Ready · ${shortModelLabel(vlm.selected_model)}`;
        modelSub = "Cached locally on this Mac and ready for private offline scanning.";
        modelActions = `<button type="button" class="btn btn-secondary btn-xs" data-empty-action="open-settings">Settings</button>`;
      } else if (isDownloading) {
        modelRowClass = "";
        modelDot = "…";
        const pct = Math.round(Number(dl.percent || 0));
        const progText =
          dl.total_bytes > 0
            ? `${formatBytesGiB(dl.downloaded_bytes)} / ${formatBytesGiB(dl.total_bytes)}`
            : formatBytesGiB(dl.downloaded_bytes);
        modelTitle = `Downloading ${shortModelLabel(dl.model_id)} (${pct}%)`;
        modelSub = `${progText} · ${dl.current_file || "Downloading weights…"}`;
        modelActions = `<button type="button" class="btn btn-ghost-danger btn-xs" data-empty-action="cancel-dl">Cancel</button>`;
      }

      const watcherOn = Boolean(watcherInfo.watcher_enabled ?? state.settings?.watcher_enabled);
      const watcherWaiting = Boolean(watcherInfo.waiting_for_model && watcherOn);
      const watcherRowClass = watcherOn ? (watcherWaiting ? "" : "is-done") : "";
      const watcherDot = watcherOn ? (watcherWaiting ? "…" : "✓") : "4";
      const watcherTitle = watcherWaiting
        ? "Incoming Folder Watcher · Waiting for Model"
        : watcherOn
          ? "Incoming Folder Watcher Active"
          : "Incoming Folder Watcher Off";
      const watcherSub = dumpDir ? `Monitored drop box: ${dumpDir}` : "Configure an Incoming folder in Settings.";
      const watcherActions = `
        ${!watcherOn ? `<button type="button" class="btn btn-secondary btn-xs" data-empty-action="enable-watcher">Turn On</button>` : ""}
        <button type="button" class="btn btn-secondary btn-xs" data-empty-action="open-incoming">Open Folder</button>
      `;

      grid.innerHTML = `
        <div class="vault-onboard-empty ${!reducedMotion && animateMode !== "none" ? "vault-empty-enter" : ""}">
          <div class="onboard-dropzone-card">
            <div class="empty-state-icon empty-state-icon-neutral" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
            </div>
            <h3>Your Vault is ready — add your first document</h3>
            <p class="muted">Drop PDFs or scan images anywhere on this window, drop them into your Incoming folder, or test with a built-in sample bill.</p>
            <div class="onboard-dropzone-actions">
              <button id="empty-pick-files-btn" class="btn btn-primary btn-sm" type="button">Choose Files…</button>
              <button id="empty-try-sample-btn" class="btn btn-secondary btn-sm" type="button">Try Sample Document</button>
              <button id="empty-open-incoming-btn" class="btn btn-secondary btn-sm" type="button">Open Incoming Folder</button>
            </div>
          </div>

          <div class="onboard-checklist" aria-label="Getting started checklist">
            <div class="onboard-checklist-head">Getting Started Checklist</div>

            <div class="onboard-check-row is-done">
              <div class="onboard-check-left">
                <span class="onboard-check-dot" aria-hidden="true">✓</span>
                <div>
                  <div class="onboard-check-title">1. Vault Folder Connected</div>
                  <div class="onboard-check-sub">${esc(vaultDir || "Initialized")}</div>
                </div>
              </div>
              <div class="onboard-check-actions">
                <button type="button" class="btn btn-secondary btn-xs" data-empty-action="open-vault">Finder</button>
                <button type="button" class="btn btn-secondary btn-xs" data-empty-action="switch-vault">Change</button>
              </div>
            </div>

            <div class="onboard-check-row ${modelRowClass}">
              <div class="onboard-check-left">
                <span class="onboard-check-dot" aria-hidden="true">${modelDot}</span>
                <div>
                  <div class="onboard-check-title">2. ${esc(modelTitle)}</div>
                  <div class="onboard-check-sub">${esc(modelSub)}</div>
                </div>
              </div>
              <div class="onboard-check-actions">${modelActions}</div>
            </div>

            <div class="onboard-check-row">
              <div class="onboard-check-left">
                <span class="onboard-check-dot" aria-hidden="true">3</span>
                <div>
                  <div class="onboard-check-title">3. File Your First Scan</div>
                  <div class="onboard-check-sub">Drop a PDF/image or click Try Sample Document to see auto-naming &amp; filing.</div>
                </div>
              </div>
              <div class="onboard-check-actions">
                <button type="button" class="btn btn-secondary btn-xs" data-empty-action="try-sample">Try Sample</button>
              </div>
            </div>

            <div class="onboard-check-row ${watcherRowClass}">
              <div class="onboard-check-left">
                <span class="onboard-check-dot" aria-hidden="true">${watcherDot}</span>
                <div>
                  <div class="onboard-check-title">4. ${esc(watcherTitle)}</div>
                  <div class="onboard-check-sub">${esc(watcherSub)}</div>
                </div>
              </div>
              <div class="onboard-check-actions">${watcherActions}</div>
            </div>
          </div>
        </div>`;

      grid.querySelector("#empty-pick-files-btn")?.addEventListener("click", () => $("#global-file-input")?.click());
      grid.querySelector("#empty-try-sample-btn")?.addEventListener("click", () => trySampleDocument(false));
      grid.querySelector("#empty-open-incoming-btn")?.addEventListener("click", () => openFolderInFinder("dump"));
      grid.querySelector('[data-empty-action="try-sample"]')?.addEventListener("click", () => trySampleDocument(false));
      grid.querySelector('[data-empty-action="open-incoming"]')?.addEventListener("click", () => openFolderInFinder("dump"));
      grid.querySelector('[data-empty-action="open-vault"]')?.addEventListener("click", () => openFolderInFinder("vault"));
      grid.querySelector('[data-empty-action="switch-vault"]')?.addEventListener("click", () => openSetupModal({ mandatory: false, mode: "switch" }));
      grid.querySelector('[data-empty-action="open-settings"]')?.addEventListener("click", () => switchTab("settings"));
      grid.querySelector('[data-empty-action="cancel-dl"]')?.addEventListener("click", async () => {
        try {
          await api("/api/models/download/cancel", { method: "POST" });
          toast("Cancelling download…");
          refreshHealth();
        } catch (err) {
          toast(err.message, true);
        }
      });
      grid.querySelector('[data-empty-action="dl-model"]')?.addEventListener("click", async () => {
        await ensureModelsLoaded();
        const mId = getSelectedOrRecommendedModelId(state.latestHealth?.vlm);
        if (!mId) {
          switchTab("settings");
          return;
        }
        try {
          await api("/api/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vlm_model: mId }),
          });
          await startModelDownload(mId);
          toast(`Downloading ${shortModelLabel(mId)}…`);
        } catch (err) {
          toast(err.message, true);
        }
      });
      grid.querySelector('[data-empty-action="enable-watcher"]')?.addEventListener("click", async () => {
        try {
          const w = await api("/api/watcher/toggle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: true }),
          });
          renderWatcherTopbar(w);
          refreshHealth();
          toast("Incoming folder watcher enabled");
        } catch (err) {
          toast(err.message, true);
        }
      });
      updateBatchActionBar();
      return;
    }

    const nextIds = new Set(docs.map((d) => Number(d.id)));
    if (!reducedMotion && animateMode === "filter" && existingCards.size > 0) {
      const leaving = [];
      existingCards.forEach((el, id) => {
        if (!nextIds.has(id)) {
          leaving.push({ el, rect: existingRects.get(id) });
        }
      });
      if (leaving.length > 0) {
        spawnExitGhosts(leaving, stageRect, animLayer);
      }
    }

    const frag = document.createDocumentFragment();
    const reusedMoving = [];
    let enterIdx = 0;

    docs.forEach((doc) => {
      const docId = Number(doc.id);
      const existing = existingCards.get(docId);
      let card;
      if (existing) {
        syncVaultCardElement(existing, doc);
        card = existing;
      } else {
        card = createVaultCardElement(doc);
      }

      if (animateMode === "open") {
        if (!reducedMotion && enterIdx < 24) {
          card.classList.add("vault-item-enter");
          card.style.setProperty("--enter-delay", `${Math.min(enterIdx, 12) * 22}ms`);
        }
        enterIdx += 1;
      } else if (existing && animateMode === "filter") {
        reusedMoving.push({ card, oldRect: existingRects.get(docId) });
      } else if (!existing && animateMode === "filter") {
        if (!reducedMotion && enterIdx < 24) {
          card.classList.add("vault-item-enter");
          card.style.setProperty("--enter-delay", `${Math.min(enterIdx, 10) * 18}ms`);
        }
        enterIdx += 1;
      }

      frag.appendChild(card);
    });

    grid.innerHTML = "";
    grid.appendChild(frag);

    if (!reducedMotion && animateMode === "filter" && reusedMoving.length > 0) {
      const vh = window.innerHeight || 900;
      const flipTargets = [];
      const maxFlip = Math.min(reusedMoving.length, 120);
      for (let i = 0; i < maxFlip; i += 1) {
        const { card, oldRect } = reusedMoving[i];
        const newRect = card.getBoundingClientRect();
        const nearViewport =
          (oldRect.bottom >= -220 && oldRect.top <= vh + 360) ||
          (newRect.bottom >= -220 && newRect.top <= vh + 360);
        if (!nearViewport) continue;
        const dx = oldRect.left - newRect.left;
        const dy = oldRect.top - newRect.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          card.style.transition = "none";
          card.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
          flipTargets.push(card);
        }
      }
      if (flipTargets.length > 0) {
        void grid.offsetHeight;
        requestAnimationFrame(() => {
          flipTargets.forEach((card) => {
            card.classList.add("vault-item-moving");
            card.style.transition = "";
            card.style.transform = "translate3d(0, 0, 0)";
          });
        });
      }
    }

    if (!reducedMotion && animateMode !== "none") {
      scheduleVaultAnimCleanup(animateMode === "open" ? 600 : 380);
    }

    updateBatchActionBar();
  }

  function openDeleteConfirmModal(doc) {
    const modal = $("#doc-modal");
    setModalCompact(true);
    $("#modal-title").textContent = "Confirm Permanent Deletion";
    $("#modal-body").innerHTML = `
      <div style="display:flex; flex-direction:column; gap:14px;">
        <p style="margin:0;">
          Are you sure you want to permanently delete <strong>${esc(doc.title)}</strong> (${esc(doc.category)}) from your Vault?
        </p>
        <div class="field">
          <span>Exact File Path to Delete</span>
          <div class="danger-path-box">${esc(doc.vault_abs_path)}</div>
        </div>
        <p class="muted">
          This deletes only the file at the path shown above and removes its index entry. Any original file archived in your dump folder's <code>_processed/</code> directory will not be deleted.
        </p>
        <div class="action-buttons" style="justify-content:flex-end;">
          <button id="cancel-delete-btn" type="button" class="btn btn-secondary">Cancel</button>
          <button id="confirm-delete-btn" type="button" class="btn btn-danger">Delete Permanently</button>
        </div>
      </div>
    `;
    $("#cancel-delete-btn").addEventListener("click", () => closeAnimatedModal(modal));
    $("#confirm-delete-btn").addEventListener("click", async () => {
      const btn = $("#confirm-delete-btn");
      btn.disabled = true;
      btn.textContent = "Deleting…";
      try {
        await api(`/api/documents/${doc.id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm_path: doc.vault_abs_path }),
        });
        toast(`Deleted ${doc.vault_rel_path}`);
        closeAnimatedModal(modal);
        loadVaultDocuments();
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false;
        btn.textContent = "Delete Permanently";
      }
    });
    showAnimatedModal(modal);
  }

  function openDocModal(doc) {
    const modal = $("#doc-modal");
    setModalCompact(false);
    $("#modal-title").textContent = doc.title;
    let currentImgs = [...(doc.preview_images || [])];
    let activePageIdx = 0;
    let modalRotating = false;
    const firstImg = currentImgs[0] ? `/api/previews/${encodeURIComponent(currentImgs[0])}` : "";
    const datePlaceholder = state.settings?.date_format || "YYYY-MM-DD";

    $("#modal-body").innerHTML = `
      <div class="doc-card" style="box-shadow:none; border:none; padding:0;">
        <div class="preview-pane">
          <div class="preview-frame" title="Click to preview full document">
            ${firstImg ? `<img class="preview-img" src="${firstImg}" alt="Preview" />` : `<span class="muted">No preview</span>`}
          </div>
          <div class="page-switcher preview-pane-controls">
            ${
              currentImgs.length > 1
                ? currentImgs.map((imgName, i) => `<button type="button" class="btn btn-sm btn-secondary page-btn ${i === 0 ? "btn-primary" : ""}" data-idx="${i}">Page ${getPreviewPageNumber(imgName, i)}</button>`).join("")
                : ""
            }
            <div class="preview-rotate-inline">
              ${buildRotateButtonsHtml({ compact: true })}
            </div>
          </div>
        </div>
        <div class="doc-meta-pane">
          <div class="doc-card-header">
            <div class="muted">Original: ${esc(doc.original_filename)} · Source: ${esc(doc.source_mode)}${typeof doc.confidence === "number" && doc.source_mode !== "vault_scan" ? ` · Confidence: ${Math.round(doc.confidence * 100)}%` : ""}</div>
            <button id="modal-reclassify-btn" type="button" class="btn btn-secondary btn-sm">Reclassify with AI</button>
          </div>
          <div id="modal-reclassify-result" class="reclassify-ai-box hidden"></div>
          <div class="form-grid-3">
            <label class="field">
              <span>Date</span>
              <input id="modal-date" type="text" value="${esc(doc.doc_date || "")}" placeholder="${esc(datePlaceholder)}" />
            </label>
            <label class="field">
              <span>Category</span>
              <select id="modal-cat">${buildCategoryOptions(doc.category)}</select>
            </label>
            <label class="field">
              <span>Title</span>
              <input id="modal-title-input" type="text" value="${esc(doc.title)}" />
            </label>
          </div>
          <label id="modal-add-cat-row" class="checkbox-field hidden" style="font-size:12px;">
            <input id="modal-add-cat-cb" type="checkbox" />
            <span id="modal-add-cat-label">Add category to saved Settings</span>
          </label>
          <div class="path-preview-box">
            <span class="muted">Target Path:</span>
            <code id="modal-target-path">${esc(doc.vault_rel_path)}</code>
          </div>
          <div class="action-buttons">
            <button id="modal-save-btn" type="button" class="btn btn-primary">Save &amp; Relocate Copy</button>
            <button id="modal-preview-btn" type="button" class="btn btn-secondary">Preview PDF / Full</button>
            <button id="modal-delete-btn" type="button" class="btn btn-ghost-danger">Delete…</button>
          </div>
        </div>
      </div>
    `;
    const modalBodyEl = $("#modal-body");
    modalBodyEl.querySelectorAll(".page-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        activePageIdx = Number(btn.dataset.idx) || 0;
        const imgEl = modalBodyEl.querySelector(".preview-img");
        if (imgEl && currentImgs[activePageIdx]) {
          imgEl.src = `/api/previews/${encodeURIComponent(currentImgs[activePageIdx])}`;
        }
        modalBodyEl.querySelectorAll(".page-btn").forEach((b) => b.classList.remove("btn-primary"));
        btn.classList.add("btn-primary");
      });
    });

    const previewFrameEl = modalBodyEl.querySelector(".preview-frame");
    if (previewFrameEl) {
      previewFrameEl.addEventListener("click", () =>
        openFullFilePreview(`/api/documents/${doc.id}/file`, doc.title, doc.vault_rel_path, { docId: doc.id })
      );
    }

    modalBodyEl.querySelectorAll(".preview-rotate-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (modalRotating) return;
        const angle = Number(btn.dataset.angle || 90);
        const targetPage = getPreviewPageNumber(currentImgs[activePageIdx], activePageIdx);
        const imgEl = modalBodyEl.querySelector(".preview-img");
        modalRotating = true;
        modalBodyEl.querySelectorAll(".preview-rotate-btn").forEach((b) => { b.disabled = true; });
        try {
          if (imgEl && previewFrameEl) {
            await animatePageRotation({
              imgEl,
              containerEl: previewFrameEl,
              angle,
              mode: "contain",
              onRequest: () => rotateVaultDocumentPage(doc.id, targetPage, angle),
              getNextSrc: (res) => {
                if (res.document) {
                  currentImgs = [...(res.document.preview_images || currentImgs)];
                  doc.preview_images = currentImgs;
                  doc.sha256 = res.document.sha256;
                  doc.updated_at = res.document.updated_at;
                }
                const nextName = currentImgs[activePageIdx];
                return nextName ? `/api/previews/${encodeURIComponent(nextName)}` : imgEl.src;
              },
            });
          } else {
            const res = await rotateVaultDocumentPage(doc.id, targetPage, angle);
            if (!modalBodyEl.isConnected) return;
            if (res.document) {
              currentImgs = [...(res.document.preview_images || currentImgs)];
              doc.preview_images = currentImgs;
              doc.sha256 = res.document.sha256;
              doc.updated_at = res.document.updated_at;
            }
          }
          if (!modalBodyEl.isConnected) return;
          const dirLabel = angle === -90 ? "90° left" : angle === 180 ? "180°" : "90° right";
          toast(`Rotated page ${targetPage} ${dirLabel} and updated file`);
        } catch (err) {
          toast(err.message, true);
        } finally {
          modalRotating = false;
          if (modalBodyEl.isConnected) {
            modalBodyEl.querySelectorAll(".preview-rotate-btn").forEach((b) => { b.disabled = false; });
          }
        }
      });
    });

    async function refreshModalTargetPath() {
      const targetEl = $("#modal-target-path");
      if (!targetEl) return;
      try {
        const { rel_path } = await api("/api/intake/preview-path", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: $("#modal-date").value,
            category: $("#modal-cat").value,
            title: $("#modal-title-input").value,
            filename: doc.vault_rel_path || doc.original_filename || "document.pdf",
          }),
        });
        targetEl.textContent = rel_path;
      } catch {
        // ignore preview errors
      }
    }

    function syncModalAddCatRow() {
      const chosenCat = $("#modal-cat").value;
      const addRow = $("#modal-add-cat-row");
      const addCb = $("#modal-add-cat-cb");
      const isKnownCat = (state.settings?.categories || []).some(
        (c) => c.toLowerCase() === String(chosenCat).toLowerCase()
      );
      if (!isKnownCat && chosenCat) {
        addRow.classList.remove("hidden");
        addCb.checked = true;
        $("#modal-add-cat-label").textContent = `Add "${chosenCat}" to saved categories`;
      } else {
        addRow.classList.add("hidden");
        addCb.checked = false;
      }
    }

    ["#modal-date", "#modal-cat", "#modal-title-input"].forEach((sel) => {
      $(sel).addEventListener("input", refreshModalTargetPath);
      $(sel).addEventListener("change", refreshModalAddCatAndPath);
    });

    function refreshModalAddCatAndPath() {
      syncModalAddCatRow();
      refreshModalTargetPath();
    }

    $("#modal-reclassify-btn").addEventListener("click", async () => {
      const btn = $("#modal-reclassify-btn");
      const prevLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Reclassifying…";
      try {
        const res = await api(`/api/documents/${doc.id}/reclassify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apply: false }),
        });
        const sug = res.suggestion || {};
        const pct = Math.round((sug.confidence || 0) * 100);
        const suggestedNew = sug.suggested_new_category;
        const chosenCat = suggestedNew || sug.category || doc.category;

        $("#modal-cat").innerHTML = buildCategoryOptions(chosenCat, suggestedNew);
        $("#modal-cat").value = chosenCat;
        if (sug.date !== undefined) $("#modal-date").value = sug.date || "";
        if (sug.title) $("#modal-title-input").value = sug.title;

        syncModalAddCatRow();

        const box = $("#modal-reclassify-result");
        box.classList.remove("hidden");
        box.innerHTML = `
          <div class="reclassify-ai-head">
            <strong>AI Classification Suggestion</strong>
            <div class="tag-row">
              <span class="tag ${pct >= getConfidenceThresholdPct() ? "tag-ok" : "tag-warn"}">Confidence: ${pct}%</span>
              ${suggestedNew ? `<span class="tag tag-info">Suggested New Tag: ${esc(suggestedNew)}</span>` : ""}
            </div>
          </div>
          ${sug.reason ? `<div class="muted">${esc(sug.reason)}</div>` : ""}
          ${
            sug.thinking
              ? `<details class="thinking-details">
                   <summary>Model Thinking</summary>
                   <pre class="thinking-box">${esc(sug.thinking)}</pre>
                 </details>`
              : ""
          }
        `;
        await refreshModalTargetPath();
        toast("AI suggestion ready — review and click Save & Relocate Copy");
      } catch (err) {
        toast(err.message, true);
      } finally {
        btn.disabled = false;
        btn.textContent = prevLabel;
      }
    });

    $("#modal-preview-btn").addEventListener("click", () =>
      openFullFilePreview(`/api/documents/${doc.id}/file`, doc.title, doc.vault_rel_path, { docId: doc.id })
    );
    $("#modal-delete-btn").addEventListener("click", () => openDeleteConfirmModal(doc));

    $("#modal-save-btn").addEventListener("click", async () => {
      const btn = $("#modal-save-btn");
      btn.disabled = true;
      const addCategory = Boolean($("#modal-add-cat-cb")?.checked);
      try {
        const updated = await api(`/api/documents/${doc.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: $("#modal-date").value.trim(),
            category: $("#modal-cat").value,
            title: $("#modal-title-input").value.trim(),
            add_category: addCategory,
          }),
        });
        if (addCategory) {
          await loadSettings();
        }
        toast(`Updated -> ${updated.vault_rel_path}`);
        closeAnimatedModal(modal);
        loadVaultDocuments();
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false;
      }
    });

    showAnimatedModal(modal);
  }

  function renderBatchDocRows(docs) {
    return docs.map((d) => `
      <div class="reclass-doc-row">
        <div class="reclass-doc-info">
          <div class="reclass-doc-title">${esc(d.title)}</div>
          <div class="reclass-doc-path">${esc(d.vault_rel_path)}</div>
        </div>
        <span class="tag ${getCategoryTone(d.category)}">${esc(d.category)}</span>
      </div>
    `).join("");
  }

  function openBatchReclassifyModal(selectedDocs) {
    if (!selectedDocs.length) return;
    if (!state.settings?.vlm_model) {
      toast("Select a Vision Model in Settings first.", true);
      return;
    }
    const modal = $("#doc-modal");
    setModalCompact(true);
    const categories = state.settings?.categories || [];
    const thresholdPct = Math.round((state.settings?.confidence_threshold ?? 0.75) * 100);
    const docLabel = `${selectedDocs.length} Document${selectedDocs.length === 1 ? "" : "s"}`;
    const tagPillsHtml = categories
      .map((c) => `<span class="tag ${getCategoryTone(c)}">${esc(c)}</span>`)
      .join("");

    $("#modal-title").textContent = `Reclassify ${docLabel} with AI`;
    $("#modal-body").innerHTML = `
      <div class="reclass-modal-body">
        <div class="reclass-meta-strip">
          <span class="reclass-model-badge">
            <span class="reclass-model-dot" aria-hidden="true"></span>
            <span>Model: ${esc(state.settings.vlm_model)}</span>
          </span>
          <span class="tag tag-info">${selectedDocs.length} selected</span>
        </div>

        <div class="reclass-section">
          <div class="reclass-section-label">
            <span>Available Tags</span>
            <span>${categories.length} active</span>
          </div>
          <div class="reclass-tag-cloud">
            ${tagPillsHtml || `<span class="muted">No tags configured</span>`}
          </div>
        </div>

        <div class="reclass-section">
          <div class="reclass-section-label">
            <span>What should be updated?</span>
          </div>
          <div class="reclass-mode-grid">
            <label class="reclass-mode-card">
              <input type="radio" name="batch-reclass-mode" value="category_only" checked />
              <div class="reclass-mode-top">
                <span class="reclass-mode-title">Category Tag Only</span>
                <span class="reclass-mode-check" aria-hidden="true">✓</span>
              </div>
              <div class="reclass-mode-desc">Keep existing dates &amp; titles; only update tags and relocate files.</div>
            </label>
            <label class="reclass-mode-card">
              <input type="radio" name="batch-reclass-mode" value="full" />
              <div class="reclass-mode-top">
                <span class="reclass-mode-title">Full Metadata</span>
                <span class="reclass-mode-check" aria-hidden="true">✓</span>
              </div>
              <div class="reclass-mode-desc">Re-extract tag, date &amp; title (keeps existing values if blank).</div>
            </label>
          </div>
        </div>

        <div class="reclass-section">
          <div class="reclass-section-label">
            <span>Options</span>
          </div>
          <div class="reclass-toggle-list">
            <label class="reclass-toggle-row">
              <div>
                <div class="reclass-toggle-title">Require confidence ≥ ${thresholdPct}%</div>
                <div class="reclass-toggle-sub">Skip low-confidence results so existing tags aren't overwritten</div>
              </div>
              <span class="switch-label">
                <input id="batch-reclass-threshold" type="checkbox" checked />
                <span class="switch-track"></span>
              </span>
            </label>
            <label class="reclass-toggle-row">
              <div>
                <div class="reclass-toggle-title">Auto-add newly suggested tags</div>
                <div class="reclass-toggle-sub">Save new categories proposed by AI directly into Settings</div>
              </div>
              <span class="switch-label">
                <input id="batch-reclass-add-cat" type="checkbox" />
                <span class="switch-track"></span>
              </span>
            </label>
          </div>
        </div>

        <details class="reclass-docs-details" ${selectedDocs.length <= 3 ? "open" : ""}>
          <summary>Selected documents (${selectedDocs.length})</summary>
          <div class="reclass-docs-list">
            ${renderBatchDocRows(selectedDocs)}
          </div>
        </details>

        <div class="modal-footer-actions">
          <button id="batch-reclass-cancel" type="button" class="btn btn-secondary">Cancel</button>
          <button id="batch-reclass-submit" type="button" class="btn btn-primary">Reclassify ${docLabel}</button>
        </div>
      </div>
    `;

    $("#batch-reclass-cancel").addEventListener("click", () => closeAnimatedModal(modal));
    $("#batch-reclass-submit").addEventListener("click", async () => {
      const btn = $("#batch-reclass-submit");
      btn.disabled = true;
      btn.textContent = "Queuing…";
      const mode = document.querySelector('input[name="batch-reclass-mode"]:checked')?.value || "category_only";
      try {
        const res = await api("/api/documents/batch/reclassify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            doc_ids: selectedDocs.map((d) => Number(d.id)),
            category_only: mode === "category_only",
            respect_threshold: Boolean($("#batch-reclass-threshold").checked),
            add_category: Boolean($("#batch-reclass-add-cat").checked),
          }),
        });
        closeAnimatedModal(modal);
        clearDocSelection();
        state.queueExpanded = true;
        renderWatcherTopbar(res.watcher);
        ensureFastQueuePoll();
        toast(`Queued ${res.queued_count} document${res.queued_count === 1 ? "" : "s"} for AI reclassification`);
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false;
        btn.textContent = `Reclassify ${docLabel}`;
      }
    });

    showAnimatedModal(modal);
  }

  function openBatchMoveModal(selectedDocs) {
    if (!selectedDocs.length) return;
    const modal = $("#doc-modal");
    setModalCompact(true);
    const categories = state.settings?.categories || [];
    const datePlaceholder = state.settings?.date_format || "YYYY-MM-DD";
    const docLabel = `${selectedDocs.length} Document${selectedDocs.length === 1 ? "" : "s"}`;

    $("#modal-title").textContent = `Move / Tag ${docLabel}`;
    $("#modal-body").innerHTML = `
      <div class="reclass-modal-body">
        <div class="reclass-section">
          <div class="reclass-section-label">
            <span>Quick Pick Tag</span>
            <span>${categories.length} saved</span>
          </div>
          <div class="reclass-tag-cloud" id="batch-move-tag-cloud">
            <button type="button" class="tag tag-picker-pill is-active" data-cat="">Keep existing</button>
            ${categories.map((c) => `<button type="button" class="tag tag-picker-pill ${getCategoryTone(c)}" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}
            <button type="button" class="tag tag-info tag-picker-pill" data-cat="__custom__">+ New tag…</button>
          </div>
        </div>

        <div class="field-row" style="align-items:flex-end;">
          <label class="field" style="flex:1;">
            <span>Target Category</span>
            <select id="batch-move-cat">
              <option value="">-- Keep each document's existing category --</option>
              ${buildCategoryOptions("")}
              <option value="__custom__">+ Enter new category…</option>
            </select>
          </label>
          <label id="batch-custom-cat-wrap" class="field hidden" style="flex:1;">
            <span>New Tag Name</span>
            <input id="batch-custom-cat" type="text" placeholder="e.g. Subscriptions" />
          </label>
        </div>

        <div class="reclass-toggle-list">
          <label id="batch-add-cat-row" class="reclass-toggle-row hidden">
            <div>
              <div class="reclass-toggle-title">Save new tag to Settings</div>
              <div class="reclass-toggle-sub">Include this category in future AI classifications</div>
            </div>
            <span class="switch-label">
              <input id="batch-add-cat-cb" type="checkbox" checked />
              <span class="switch-track"></span>
            </span>
          </label>
          <label class="reclass-toggle-row">
            <div>
              <div class="reclass-toggle-title">Re-apply folder template &amp; filename mask</div>
              <div class="reclass-toggle-sub">Relocate selected files using your current naming settings</div>
            </div>
            <span class="switch-label">
              <input id="batch-relocate-only" type="checkbox" />
              <span class="switch-track"></span>
            </span>
          </label>
        </div>

        <label class="field">
          <span>Override Document Date (Optional)</span>
          <input id="batch-move-date" type="text" placeholder="Leave blank to keep existing (${esc(datePlaceholder)})" />
        </label>

        <details class="reclass-docs-details" ${selectedDocs.length <= 3 ? "open" : ""}>
          <summary>Selected documents (${selectedDocs.length})</summary>
          <div class="reclass-docs-list">
            ${renderBatchDocRows(selectedDocs)}
          </div>
        </details>

        <div class="modal-footer-actions">
          <button id="batch-move-cancel" type="button" class="btn btn-secondary">Cancel</button>
          <button id="batch-move-submit" type="button" class="btn btn-primary">Apply to ${docLabel}</button>
        </div>
      </div>
    `;

    const catSel = $("#batch-move-cat");
    const customWrap = $("#batch-custom-cat-wrap");
    const addRow = $("#batch-add-cat-row");
    const tagPills = $$("#batch-move-tag-cloud .tag-picker-pill");

    function syncMoveCatSelection(val) {
      catSel.value = val;
      const isCustom = val === "__custom__";
      customWrap.classList.toggle("hidden", !isCustom);
      addRow.classList.toggle("hidden", !isCustom);
      tagPills.forEach((pill) => pill.classList.toggle("is-active", pill.dataset.cat === val));
    }

    catSel.addEventListener("change", () => syncMoveCatSelection(catSel.value));
    tagPills.forEach((pill) => {
      pill.addEventListener("click", () => {
        syncMoveCatSelection(pill.dataset.cat || "");
        if (pill.dataset.cat === "__custom__") {
          $("#batch-custom-cat").focus();
        }
      });
    });

    $("#batch-move-cancel").addEventListener("click", () => closeAnimatedModal(modal));
    $("#batch-move-submit").addEventListener("click", async () => {
      const btn = $("#batch-move-submit");
      const rawCat = catSel.value;
      const targetCat = rawCat === "__custom__" ? $("#batch-custom-cat").value.trim() : rawCat;
      if (rawCat === "__custom__" && !targetCat) {
        toast("Enter a name for the new category.", true);
        return;
      }
      const dateVal = $("#batch-move-date").value.trim();
      const relocateOnly = Boolean($("#batch-relocate-only").checked);
      if (!targetCat && !dateVal && !relocateOnly) {
        toast("Choose a category, enter a date, or enable re-applying the naming template.", true);
        return;
      }

      btn.disabled = true;
      btn.textContent = "Updating…";
      try {
        const res = await api("/api/documents/batch/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            doc_ids: selectedDocs.map((d) => Number(d.id)),
            category: targetCat || null,
            date: dateVal ? dateVal : null,
            add_category: rawCat === "__custom__" && Boolean($("#batch-add-cat-cb").checked),
            relocate_only: relocateOnly,
          }),
        });
        if (rawCat === "__custom__" && $("#batch-add-cat-cb").checked) {
          await loadSettings();
        }
        closeAnimatedModal(modal);
        clearDocSelection();
        await loadVaultDocuments();
        const errCount = (res.errors || []).length;
        toast(
          errCount
            ? `Updated ${res.updated_count} document(s), ${errCount} error(s)`
            : `Updated ${res.updated_count} document${res.updated_count === 1 ? "" : "s"}`
        );
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false;
        btn.textContent = `Apply to ${docLabel}`;
      }
    });

    showAnimatedModal(modal);
  }

  async function downloadSelectedZip(selectedDocs) {
    if (!selectedDocs.length) return;
    const btn = $("#batch-download-btn");
    const prevText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Preparing ZIP…";
    try {
      const res = await fetch("/api/documents/batch/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_ids: selectedDocs.map((d) => Number(d.id)) }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "document-vault-export.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast(`Downloaded ${selectedDocs.length} document${selectedDocs.length === 1 ? "" : "s"} as ZIP`);
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }

  function openBatchDeleteModal(selectedDocs) {
    if (!selectedDocs.length) return;
    const modal = $("#doc-modal");
    setModalCompact(true);
    $("#modal-title").textContent = `Confirm Permanent Deletion (${selectedDocs.length})`;
    $("#modal-body").innerHTML = `
      <div class="reclass-modal-body">
        <p style="margin:0;">
          Are you sure you want to permanently delete <strong>${selectedDocs.length}</strong> selected document${selectedDocs.length === 1 ? "" : "s"} from your Vault?
        </p>
        <div class="batch-list-preview">
          ${renderBatchDocRows(selectedDocs)}
        </div>
        <p class="muted">
          This deletes only the Vault copies listed above and removes their index entries. Any original files archived in your dump folder's <code>_processed/</code> directory will not be deleted.
        </p>
        <div class="modal-footer-actions">
          <button id="batch-del-cancel" type="button" class="btn btn-secondary">Cancel</button>
          <button id="batch-del-confirm" type="button" class="btn btn-danger">Delete ${selectedDocs.length} Permanently</button>
        </div>
      </div>
    `;
    $("#batch-del-cancel").addEventListener("click", () => closeAnimatedModal(modal));
    $("#batch-del-confirm").addEventListener("click", async () => {
      const btn = $("#batch-del-confirm");
      btn.disabled = true;
      btn.textContent = "Deleting…";
      try {
        const res = await api("/api/documents/batch/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: selectedDocs.map((d) => ({
              id: Number(d.id),
              confirm_path: d.vault_abs_path,
            })),
          }),
        });
        toast(`Deleted ${res.deleted_count} document${res.deleted_count === 1 ? "" : "s"}`);
        closeAnimatedModal(modal);
        clearDocSelection();
        loadVaultDocuments();
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false;
        btn.textContent = `Delete ${selectedDocs.length} Permanently`;
      }
    });
    showAnimatedModal(modal);
  }

  $("#modal-close").addEventListener("click", () => closeAnimatedModal($("#doc-modal")));
  $("#doc-modal .modal-backdrop").addEventListener("click", () => closeAnimatedModal($("#doc-modal")));
  document.addEventListener("keydown", (e) => {
    const modal = $("#doc-modal");
    if (!modal || modal.classList.contains("hidden")) return;
    if (e.key === "Escape") {
      closeAnimatedModal(modal);
      return;
    }
    const tag = (e.target && e.target.tagName ? e.target.tagName : "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (e.key === "ArrowLeft") {
      const prevBtn = $("#preview-prev-page");
      if (prevBtn && !prevBtn.disabled) prevBtn.click();
    } else if (e.key === "ArrowRight") {
      const nextBtn = $("#preview-next-page");
      if (nextBtn && !nextBtn.disabled) nextBtn.click();
    }
  });

  $("#vault-select-all-btn").addEventListener("click", toggleAllVisibleDocs);
  $("#vault-clear-sel-btn").addEventListener("click", clearDocSelection);
  $("#batch-select-all-btn").addEventListener("click", toggleAllVisibleDocs);
  $("#batch-clear-sel-btn").addEventListener("click", clearDocSelection);
  $("#batch-reclassify-btn").addEventListener("click", () => openBatchReclassifyModal(getSelectedVaultDocs()));
  $("#batch-move-btn").addEventListener("click", () => openBatchMoveModal(getSelectedVaultDocs()));
  $("#batch-download-btn").addEventListener("click", () => downloadSelectedZip(getSelectedVaultDocs()));
  $("#batch-delete-btn").addEventListener("click", () => openBatchDeleteModal(getSelectedVaultDocs()));

  let searchTimer = null;
  $("#vault-search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadVaultDocuments({ reason: "filter" }), 220);
  });
  $("#vault-filter-year").addEventListener("change", () => loadVaultDocuments({ reason: "filter" }));
  $("#vault-sort").addEventListener("change", () => loadVaultDocuments({ reason: "filter" }));
  $("#refresh-vault-btn").addEventListener("click", () => loadVaultDocuments({ reason: "refresh", reconcile: true }));
  $("#vault-load-more-btn").addEventListener("click", () => loadVaultDocuments({ reason: "append", append: true }));

  $("#vault-tag-bar").addEventListener("click", (e) => {
    const pill = e.target.closest(".vault-tag-pill");
    if (!pill) return;
    const catValue = pill.dataset.category || "";
    if (state.vaultCategory === catValue) return;
    state.vaultCategory = catValue;
    syncVaultTagBarActive(catValue);
    loadVaultDocuments({ reason: "filter" });
  });

  $("#vault-list").addEventListener("click", (e) => {
    const card = e.target.closest(".vault-item");
    if (!card) return;
    const docId = Number(card.dataset.docId);
    const doc = state.vaultDocsById.get(docId);
    if (!doc) return;

    if (e.target.closest(".vault-select-label")) {
      e.stopPropagation();
      const selectCb = card.querySelector(".vault-select-cb");
      if (!selectCb || e.target !== selectCb) return;
      const idx = state.vaultDocs.findIndex((d) => Number(d.id) === docId);
      const wantSelected = selectCb.checked;
      if (e.shiftKey && state.lastSelectedDocIdx !== null && idx !== -1) {
        const start = Math.min(state.lastSelectedDocIdx, idx);
        const end = Math.max(state.lastSelectedDocIdx, idx);
        for (let i = start; i <= end; i += 1) {
          const targetId = Number(state.vaultDocs[i].id);
          if (wantSelected) state.selectedDocIds.add(targetId);
          else state.selectedDocIds.delete(targetId);
        }
        syncGridSelectionStyles();
      } else {
        if (wantSelected) state.selectedDocIds.add(docId);
        else state.selectedDocIds.delete(docId);
        card.classList.toggle("vault-item-selected", wantSelected);
      }
      if (idx !== -1) state.lastSelectedDocIdx = idx;
      updateBatchActionBar();
      return;
    }

    if (e.target.closest(".vault-thumb") || e.target.closest(".btn-preview-doc")) {
      openFullFilePreview(`/api/documents/${doc.id}/file`, doc.title, doc.vault_rel_path, { docId: doc.id });
      return;
    }
    const catBtn = e.target.closest(".tag-cat-btn");
    if (catBtn) {
      const targetCat = catBtn.dataset.category || doc.category;
      if (state.vaultCategory !== targetCat) {
        state.vaultCategory = targetCat;
        syncVaultTagBarActive(targetCat);
        loadVaultDocuments({ reason: "filter" });
      }
      return;
    }
    if (e.target.closest(".btn-edit-doc")) {
      openDocModal(doc);
      return;
    }
    if (e.target.closest(".btn-delete-doc")) {
      openDeleteConfirmModal(doc);
    }
  });

  if ("IntersectionObserver" in window && $("#vault-scroll-sentinel")) {
    state.vaultScrollObserver = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (!$("#tab-vault").classList.contains("active")) return;
        if (state.vaultHasMore && !state.vaultLoading && !state.vaultLoadingMore) {
          loadVaultDocuments({ reason: "append", append: true });
        }
      },
      { rootMargin: "360px 0px" }
    );
    state.vaultScrollObserver.observe($("#vault-scroll-sentinel"));
  }

  if ("IntersectionObserver" in window && $("#vault-float-sentinel")) {
    state.vaultFloatObserver = new IntersectionObserver(
      (entries) => {
        const floatEl = $("#vault-grid-float");
        if (!floatEl) return;
        const entry = entries[0];
        if (!entry) return;
        const isVaultActive = $("#tab-vault")?.classList.contains("active");
        const isStuck = Boolean(
          isVaultActive &&
          state.vaultDocs.length > 0 &&
          !entry.isIntersecting &&
          entry.boundingClientRect.top < 12
        );
        floatEl.classList.toggle("is-stuck", isStuck);
      },
      { threshold: 0, rootMargin: "-12px 0px 0px 0px" }
    );
    state.vaultFloatObserver.observe($("#vault-float-sentinel"));
  }

  if ("IntersectionObserver" in window && $("#settings-float-sentinel")) {
    state.settingsFloatObserver = new IntersectionObserver(
      (entries) => {
        const floatEl = $("#settings-save-float");
        if (!floatEl) return;
        const entry = entries[0];
        if (!entry) return;
        const isSettingsActive = $("#tab-settings")?.classList.contains("active");
        const isStuck = Boolean(
          isSettingsActive &&
          !entry.isIntersecting &&
          entry.boundingClientRect.top < 12
        );
        floatEl.classList.toggle("is-stuck", isStuck);
      },
      { threshold: 0, rootMargin: "-12px 0px 0px 0px" }
    );
    state.settingsFloatObserver.observe($("#settings-float-sentinel"));
  }

  window.addEventListener("focus", () => {
    if ($("#tab-vault").classList.contains("active")) {
      loadVaultDocuments({ reason: "sync", reconcile: true });
    }
  });

  // ── Settings Tab ──────────────────────────────────────────────────────────
  let settingsSaveInFlight = false;
  let settingsSavePending = false;
  let settingsSaveDebounceTimer = null;
  let settingsStatusResetTimer = null;

  function setSettingsSaveStatus(mode = "idle", text = "Changes save automatically") {
    const el = $("#settings-save-status");
    if (!el) return;
    clearTimeout(settingsStatusResetTimer);
    el.classList.remove("is-saving", "is-saved", "is-error");
    if (mode === "saving") {
      el.classList.add("is-saving");
      el.textContent = text || "Saving…";
    } else if (mode === "saved") {
      el.classList.add("is-saved");
      el.textContent = text || "Saved";
      settingsStatusResetTimer = setTimeout(() => {
        el.classList.remove("is-saved");
        el.textContent = "Changes save automatically";
      }, 2000);
    } else if (mode === "error") {
      el.classList.add("is-error");
      el.textContent = text || "Could not save";
    } else {
      el.textContent = text || "Changes save automatically";
    }
  }

  async function loadSettings() {
    state.settings = await api("/api/settings");
    return state.settings;
  }

  function renderCategoryChips(categories) {
    const container = $("#category-chips");
    if (!container) return;
    container.innerHTML = "";
    categories.forEach((cat) => {
      const chip = document.createElement("span");
      chip.className = `chip ${getCategoryTone(cat)}`;
      const label = document.createElement("span");
      label.textContent = cat;
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.title = "Remove";
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        if (state.settings.categories.length <= 1) {
          toast("Keep at least one category.", true);
          return;
        }
        state.settings.categories = state.settings.categories.filter((c) => c !== cat);
        renderCategoryChips(state.settings.categories);
        updateSettingsPathPreview();
        saveSettingsAuto();
      });
      chip.appendChild(label);
      chip.appendChild(removeBtn);
      container.appendChild(chip);
    });
  }

  const MASK_TOKENS = [
    { key: "category", label: "Category", token: "{category}", cls: "mask-tok-category" },
    { key: "year", label: "Year", token: "{year}", cls: "mask-tok-year" },
    { key: "date", label: "Date", token: "{date}", cls: "mask-tok-date" },
    { key: "title", label: "Title", token: "{title}", cls: "mask-tok-title" },
  ];
  const MASK_TOKEN_MAP = Object.fromEntries(MASK_TOKENS.map((t) => [t.key, t]));
  const MASK_SEP_CYCLES = {
    tree: ["/", " - ", "-", "_", " "],
    filename: [" ", " - ", "-", "_"],
  };

  const maskBuilderConfigs = {
    tree: {
      kind: "tree",
      label: "Folder Tree",
      inputSel: "#set-tree-template",
      builderSel: "#tree-mask-builder",
      canvasSel: "#tree-mask-canvas",
      toggleSel: "#toggle-tree-raw-btn",
      defaultSep: "/",
    },
    filename: {
      kind: "filename",
      label: "Filename Mask",
      inputSel: "#set-filename-mask",
      builderSel: "#filename-mask-builder",
      canvasSel: "#filename-mask-canvas",
      toggleSel: "#toggle-filename-raw-btn",
      defaultSep: " ",
    },
  };

  let activeMaskDrag = null;
  let activeMaskTarget = "tree";

  function parseMaskModel(templateStr) {
    const raw = String(templateStr || "");
    const re = /\{(category|year|date|title)\}/g;
    const matches = [];
    let match;
    while ((match = re.exec(raw)) !== null) {
      matches.push({ key: match[1], start: match.index, end: re.lastIndex });
    }
    if (matches.length === 0) {
      return { prefix: raw, tokens: [], seps: [], suffix: "" };
    }
    const prefix = raw.slice(0, matches[0].start);
    const suffix = raw.slice(matches[matches.length - 1].end);
    const tokens = matches.map((m) => m.key);
    const seps = [];
    for (let i = 0; i < matches.length - 1; i += 1) {
      seps.push(raw.slice(matches[i].end, matches[i + 1].start));
    }
    return { prefix, tokens, seps, suffix };
  }

  function serializeMaskModel(model) {
    if (!model.tokens.length) {
      return `${model.prefix || ""}${model.suffix || ""}`;
    }
    const middle = model.tokens
      .map((key, i) => (i === 0 ? "" : model.seps[i - 1] ?? "") + `{${key}}`)
      .join("");
    return `${model.prefix || ""}${middle}${model.suffix || ""}`;
  }

  function formatMaskSepLabel(value) {
    if (value === "") return "∅";
    if (value === " ") return "Space";
    if (value === " - ") return "␣ - ␣";
    return value;
  }

  function insertMaskToken(model, key, insertIdx, defaultSep) {
    const tokens = [...model.tokens];
    const seps = [...model.seps];
    const clampedIdx = Math.max(0, Math.min(tokens.length, insertIdx));
    if (tokens.length === 0) {
      tokens.push(key);
    } else if (clampedIdx === 0) {
      tokens.unshift(key);
      seps.unshift(defaultSep);
    } else if (clampedIdx >= tokens.length) {
      tokens.push(key);
      seps.push(defaultSep);
    } else {
      tokens.splice(clampedIdx, 0, key);
      seps.splice(clampedIdx - 1, 0, defaultSep);
    }
    return { ...model, tokens, seps };
  }

  function removeMaskToken(model, index) {
    const tokens = [...model.tokens];
    const seps = [...model.seps];
    if (index < 0 || index >= tokens.length) return model;
    tokens.splice(index, 1);
    if (seps.length > 0) {
      seps.splice(index === 0 ? 0 : index - 1, 1);
    }
    return { ...model, tokens, seps };
  }

  function moveMaskToken(model, fromIdx, toIdx) {
    const tokens = [...model.tokens];
    if (fromIdx < 0 || fromIdx >= tokens.length) return model;
    const [moved] = tokens.splice(fromIdx, 1);
    const clampedTarget = Math.max(0, Math.min(tokens.length, toIdx));
    tokens.splice(clampedTarget, 0, moved);
    return { ...model, tokens };
  }

  function commitMaskModel(kind, model) {
    const cfg = maskBuilderConfigs[kind];
    const input = $(cfg.inputSel);
    if (input) {
      input.value = serializeMaskModel(model);
    }
    renderMaskCanvas(kind, model);
    updateSettingsPathPreview();
    scheduleDebouncedSettingsSave();
  }

  function setActiveMaskTarget(kind) {
    if (!maskBuilderConfigs[kind]) return;
    activeMaskTarget = kind;
    Object.values(maskBuilderConfigs).forEach((cfg) => {
      const canvas = $(cfg.canvasSel);
      if (canvas) canvas.classList.toggle("is-active-target", cfg.kind === kind);
    });
    const hint = $("#mask-pool-hint");
    if (hint) {
      hint.textContent = `Drag blocks into either template below, or click to add to ${maskBuilderConfigs[kind].label}`;
    }
  }

  function hideMaskDropCaret(canvas) {
    if (!canvas) return;
    canvas.classList.remove("is-drag-over");
    if (canvas._dropCaret) {
      canvas._dropCaret.classList.add("hidden");
    }
  }

  function getMaskDropIndex(canvas, clientX, clientY) {
    const children = Array.from(canvas.children).filter(
      (el) => el.classList && el.classList.contains("mask-token-block") && !el.classList.contains("is-dragging")
    );
    if (children.length === 0) return { index: 0, caretRect: null };

    const rects = children.map((el, idx) => ({ idx, rect: el.getBoundingClientRect() }));
    const target = rects.find(
      ({ rect }) => clientY >= rect.top - 6 && clientY <= rect.bottom + 6 && clientX <= rect.left + rect.width / 2
    );
    if (!target) {
      const sameRow = rects.filter(({ rect }) => clientY >= rect.top - 6 && clientY <= rect.bottom + 6);
      if (sameRow.length > 0) {
        const lastInRow = sameRow[sameRow.length - 1];
        if (clientX > lastInRow.rect.left + lastInRow.rect.width / 2) {
          return { index: lastInRow.idx + 1, caretRect: lastInRow.rect, after: true };
        }
      }
      const below = rects.find(({ rect }) => clientY < rect.top);
      if (below) {
        return { index: below.idx, caretRect: below.rect, after: false };
      }
      const last = rects[rects.length - 1];
      return { index: last.idx + 1, caretRect: last.rect, after: true };
    }
    return { index: target.idx, caretRect: target.rect, after: false };
  }

  function showMaskDropCaret(canvas, clientX, clientY) {
    if (!canvas || typeof canvas.getBoundingClientRect !== "function") return 0;
    const { index, caretRect, after } = getMaskDropIndex(canvas, clientX, clientY);
    if (!canvas._dropCaret) {
      const caret = document.createElement("div");
      caret.className = "mask-drop-caret hidden";
      canvas._dropCaret = caret;
      canvas.appendChild(caret);
    }
    const caret = canvas._dropCaret;
    if (!caret.parentNode) canvas.appendChild(caret);
    const canvasRect = canvas.getBoundingClientRect();
    if (!caretRect) {
      caret.style.left = "10px";
      caret.style.top = "10px";
      caret.style.height = "26px";
    } else {
      const x = (after ? caretRect.right + 3 : caretRect.left - 4) - canvasRect.left;
      const y = caretRect.top - canvasRect.top;
      caret.style.left = `${Math.max(4, x)}px`;
      caret.style.top = `${Math.max(6, y)}px`;
      caret.style.height = `${Math.max(22, caretRect.height)}px`;
    }
    caret.classList.remove("hidden");
    return index;
  }

  function renderMaskCanvas(kind, explicitModel = null) {
    const cfg = maskBuilderConfigs[kind];
    const canvas = $(cfg.canvasSel);
    const input = $(cfg.inputSel);
    if (!canvas || !input) return;

    const model = explicitModel ?? parseMaskModel(input.value);
    canvas.innerHTML = "";
    canvas._dropCaret = null;

    if (model.tokens.length === 0 && !model.prefix && !model.suffix) {
      const empty = document.createElement("span");
      empty.className = "mask-canvas-empty";
      empty.textContent = "Drop blocks here or click a block above to add…";
      canvas.appendChild(empty);
      return;
    }

    if (model.prefix) {
      const prefixEl = document.createElement("span");
      prefixEl.className = "mask-literal-chip";
      prefixEl.textContent = model.prefix;
      canvas.appendChild(prefixEl);
    }

    model.tokens.forEach((key, index) => {
      if (index > 0) {
        const sepIdx = index - 1;
        const sepVal = model.seps[sepIdx] ?? cfg.defaultSep;
        const sepBtn = document.createElement("button");
        sepBtn.type = "button";
        sepBtn.className = "mask-sep-btn";
        sepBtn.textContent = formatMaskSepLabel(sepVal);
        sepBtn.title = "Click to cycle separator";
        sepBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          setActiveMaskTarget(kind);
          const curModel = parseMaskModel(input.value);
          const cycle = MASK_SEP_CYCLES[kind] || [" "];
          const curPos = cycle.indexOf(curModel.seps[sepIdx]);
          curModel.seps[sepIdx] = cycle[(curPos + 1) % cycle.length];
          commitMaskModel(kind, curModel);
        });
        canvas.appendChild(sepBtn);
      }

      const meta = MASK_TOKEN_MAP[key];
      const block = document.createElement("span");
      block.draggable = true;
      block.dataset.index = String(index);
      block.className = `mask-block mask-token-block ${meta ? meta.cls : "mask-tok-category"}`;

      const grip = document.createElement("span");
      grip.className = "mask-block-grip";
      grip.textContent = "⋮⋮";
      block.appendChild(grip);

      const label = document.createElement("span");
      label.textContent = meta ? meta.label : key;
      block.appendChild(label);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "mask-block-remove";
      removeBtn.title = "Remove block";
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        setActiveMaskTarget(kind);
        const curModel = parseMaskModel(input.value);
        commitMaskModel(kind, removeMaskToken(curModel, index));
      });
      block.appendChild(removeBtn);

      block.addEventListener("dragstart", (e) => {
        activeMaskDrag = { source: "canvas", fromKind: kind, fromIndex: index, key };
        block.classList.add("is-dragging");
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "copyMove";
          e.dataTransfer.setData("text/plain", JSON.stringify(activeMaskDrag));
        }
      });

      block.addEventListener("dragend", () => {
        block.classList.remove("is-dragging");
        activeMaskDrag = null;
        hideMaskDropCaret(canvas);
      });

      canvas.appendChild(block);
    });

    if (model.suffix) {
      const suffixEl = document.createElement("span");
      suffixEl.className = "mask-literal-chip";
      suffixEl.textContent = model.suffix;
      canvas.appendChild(suffixEl);
    }
  }

  function renderMaskPool() {
    const pool = $("#mask-block-pool");
    if (!pool) return;
    pool.innerHTML = "";

    MASK_TOKENS.forEach((tok) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.draggable = true;
      btn.dataset.tokenKey = tok.key;
      btn.className = `mask-block mask-palette-btn ${tok.cls}`;

      const grip = document.createElement("span");
      grip.className = "mask-block-grip";
      grip.textContent = "⋮⋮";
      btn.appendChild(grip);

      const text = document.createElement("span");
      text.textContent = tok.label;
      btn.appendChild(text);

      btn.title = `Drag into a template, or click to add ${tok.label}`;

      btn.addEventListener("click", () => {
        const cfg = maskBuilderConfigs[activeMaskTarget] || maskBuilderConfigs.tree;
        const input = $(cfg.inputSel);
        if (!input) return;
        const model = parseMaskModel(input.value);
        commitMaskModel(cfg.kind, insertMaskToken(model, tok.key, model.tokens.length, cfg.defaultSep));
      });

      btn.addEventListener("dragstart", (e) => {
        activeMaskDrag = { source: "pool", key: tok.key };
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "copy";
          e.dataTransfer.setData("text/plain", JSON.stringify(activeMaskDrag));
        }
      });

      btn.addEventListener("dragend", () => {
        activeMaskDrag = null;
        Object.values(maskBuilderConfigs).forEach((cfg) => hideMaskDropCaret($(cfg.canvasSel)));
      });

      pool.appendChild(btn);
    });
  }

  function renderMaskBuilders() {
    renderMaskCanvas("tree");
    renderMaskCanvas("filename");
  }

  function initMaskBuilders() {
    renderMaskPool();
    setActiveMaskTarget(activeMaskTarget);

    Object.values(maskBuilderConfigs).forEach((cfg) => {
      const { kind } = cfg;
      const canvas = $(cfg.canvasSel);
      const builder = $(cfg.builderSel);
      const input = $(cfg.inputSel);
      const toggleBtn = $(cfg.toggleSel);

      if (canvas && input) {
        canvas.addEventListener("click", () => setActiveMaskTarget(kind));
        canvas.addEventListener("focus", () => setActiveMaskTarget(kind));

        canvas.addEventListener("dragover", (e) => {
          if (!activeMaskDrag) return;
          e.preventDefault();
          canvas.classList.add("is-drag-over");
          showMaskDropCaret(canvas, e.clientX, e.clientY);
        });

        canvas.addEventListener("dragleave", (e) => {
          if (!e.relatedTarget || (typeof canvas.contains === "function" && !canvas.contains(e.relatedTarget))) {
            hideMaskDropCaret(canvas);
          }
        });

        canvas.addEventListener("drop", (e) => {
          e.preventDefault();
          let drag = activeMaskDrag;
          if (!drag && e.dataTransfer) {
            try {
              drag = JSON.parse(e.dataTransfer.getData("text/plain") || "null");
            } catch {
              drag = null;
            }
          }
          const insertIdx = showMaskDropCaret(canvas, e.clientX, e.clientY);
          hideMaskDropCaret(canvas);
          activeMaskDrag = null;
          if (!drag || !drag.key) return;

          setActiveMaskTarget(kind);
          const model = parseMaskModel(input.value);
          if (drag.source === "canvas" && drag.fromKind === kind && Number.isInteger(drag.fromIndex)) {
            commitMaskModel(kind, moveMaskToken(model, drag.fromIndex, insertIdx));
          } else {
            commitMaskModel(kind, insertMaskToken(model, drag.key, insertIdx, cfg.defaultSep));
          }
        });
      }

      if (toggleBtn && builder && input) {
        toggleBtn.addEventListener("click", () => {
          const showingRaw = !input.classList.contains("hidden");
          if (showingRaw) {
            input.classList.add("hidden");
            builder.classList.remove("hidden");
            toggleBtn.textContent = "Edit as text";
            renderMaskCanvas(kind);
          } else {
            builder.classList.add("hidden");
            input.classList.remove("hidden");
            toggleBtn.textContent = "Use blocks";
            if (typeof input.focus === "function") input.focus();
          }
        });
      }
    });
  }

  let modelDownloadPollTimer = null;
  let lastDownloadNotifiedId = "";

  function findCatalogModel(modelId) {
    return (state.models || []).find((m) => m.name === modelId) || null;
  }

  function updateModelSelectButtons() {
    const setSel = $("#set-vlm-model");
    const dlBtn = $("#download-model-btn");
    const delBtn = $("#delete-model-btn");
    const ramWarn = $("#model-ram-warning");
    if (setSel) {
      const val = setSel.value;
      const info = findCatalogModel(val);
      const isDownloaded = Boolean(info && info.downloaded);
      const needsDl = Boolean(val && !isDownloaded);
      if (dlBtn) dlBtn.classList.toggle("hidden", !needsDl);
      if (delBtn) delBtn.classList.toggle("hidden", !isDownloaded);
      if (ramWarn) {
        if (info && info.ram_fit === "tight" && typeof state.systemRamGb === "number") {
          const recModel = (state.models || []).find((m) => m.recommended_for_device);
          const recHint = recModel ? ` Consider ${shortModelLabel(recModel.name)} instead.` : "";
          ramWarn.textContent = `Heads up: ${shortModelLabel(info.name)} recommends ${info.min_ram_gb} GB+ unified memory (this Mac has ${state.systemRamGb} GB).${recHint}`;
          ramWarn.classList.remove("hidden");
        } else {
          ramWarn.classList.add("hidden");
          ramWarn.textContent = "";
        }
      }
    }
    const setupSel = $("#setup-vlm-model");
    const setupDlBtn = $("#setup-download-model-btn");
    if (setupSel && setupDlBtn) {
      const val = setupSel.value;
      const info = findCatalogModel(val);
      const isDownloading = state.latestDownload?.status === "downloading";
      const needsDl = Boolean(val && (!info || !info.downloaded) && !isDownloading);
      setupDlBtn.classList.toggle("hidden", !needsDl);
      if (needsDl && info?.size_gb) {
        setupDlBtn.textContent = `Download (${info.size_gb} GB)`;
      } else {
        setupDlBtn.textContent = "Download";
      }
    }
    if (typeof updateSetupStep3Buttons === "function") {
      updateSetupStep3Buttons();
    }
  }

  function updateRuntimeActionButtons(vlm) {
    const unloadBtn = $("#unload-model-btn");
    if (unloadBtn) {
      unloadBtn.classList.toggle("hidden", !vlm?.loaded_model);
    }
    updateModelSelectButtons();
  }

  function renderDownloadProgress(dl) {
    state.latestDownload = dl || null;
    const box = $("#model-download-box");
    const label = $("#model-download-label");
    const pctEl = $("#model-download-pct");
    const bar = $("#model-download-bar");
    const fileEl = $("#model-download-file");
    const cancelBtn = $("#cancel-download-btn");
    const setupStatus = $("#setup-download-status");

    const sBox = $("#setup-download-box");
    const sLabel = $("#setup-download-label");
    const sPctEl = $("#setup-download-pct");
    const sBar = $("#setup-download-bar");
    const sFileEl = $("#setup-download-file");
    const sCancelBtn = $("#setup-cancel-download-btn");

    if (!dl || dl.status === "idle") {
      if (box) box.classList.add("hidden");
      if (cancelBtn) cancelBtn.classList.add("hidden");
      if (sBox) sBox.classList.add("hidden");
      if (sCancelBtn) sCancelBtn.classList.add("hidden");
      if (setupStatus) setupStatus.textContent = "";
      if (typeof updateSetupStep3Buttons === "function") updateSetupStep3Buttons();
      return;
    }

    const pct = Math.max(0, Math.min(100, Number(dl.percent || 0)));
    const shortName = shortModelLabel(dl.model_id);
    if (dl.status === "downloading") {
      if (box) box.classList.remove("hidden");
      if (cancelBtn) cancelBtn.classList.remove("hidden");
      if (sBox) sBox.classList.remove("hidden");
      if (sCancelBtn) sCancelBtn.classList.remove("hidden");
      const sizeText =
        dl.total_bytes > 0
          ? `${formatBytesGiB(dl.downloaded_bytes)} / ${formatBytesGiB(dl.total_bytes)}`
          : formatBytesGiB(dl.downloaded_bytes);
      if (label) label.textContent = `Downloading ${shortName}…`;
      if (pctEl) pctEl.textContent = `${pct.toFixed(0)}% · ${sizeText}`;
      if (bar) bar.style.width = `${Math.max(4, pct)}%`;
      if (fileEl) fileEl.textContent = dl.current_file || "";
      if (sLabel) sLabel.textContent = `Downloading ${shortName}…`;
      if (sPctEl) sPctEl.textContent = `${pct.toFixed(0)}% · ${sizeText}`;
      if (sBar) sBar.style.width = `${Math.max(4, pct)}%`;
      if (sFileEl) sFileEl.textContent = dl.current_file || "";
      if (setupStatus) setupStatus.textContent = "";
    } else if (dl.status === "completed") {
      if (box) box.classList.remove("hidden");
      if (cancelBtn) cancelBtn.classList.add("hidden");
      if (sBox) sBox.classList.remove("hidden");
      if (sCancelBtn) sCancelBtn.classList.add("hidden");
      if (label) label.textContent = `${shortName} downloaded`;
      if (pctEl) pctEl.textContent = "100%";
      if (bar) bar.style.width = "100%";
      if (fileEl) fileEl.textContent = "Ready for local inference";
      if (sLabel) sLabel.textContent = `${shortName} downloaded`;
      if (sPctEl) sPctEl.textContent = "100%";
      if (sBar) sBar.style.width = "100%";
      if (sFileEl) sFileEl.textContent = "Ready for local inference";
      if (setupStatus) setupStatus.textContent = "";
    } else if (dl.status === "cancelled") {
      if (box) box.classList.add("hidden");
      if (cancelBtn) cancelBtn.classList.add("hidden");
      if (sBox) sBox.classList.add("hidden");
      if (sCancelBtn) sCancelBtn.classList.add("hidden");
      if (setupStatus) setupStatus.textContent = `Download cancelled for ${shortName}.`;
    } else if (dl.status === "error") {
      if (box) box.classList.remove("hidden");
      if (cancelBtn) cancelBtn.classList.add("hidden");
      if (sBox) sBox.classList.remove("hidden");
      if (sCancelBtn) sCancelBtn.classList.add("hidden");
      if (label) label.textContent = `Download failed for ${shortName}`;
      if (pctEl) pctEl.textContent = "Error";
      if (fileEl) fileEl.textContent = dl.error || "Download failed";
      if (sLabel) sLabel.textContent = `Download failed for ${shortName}`;
      if (sPctEl) sPctEl.textContent = "Error";
      if (sFileEl) sFileEl.textContent = dl.error || "Download failed";
      if (setupStatus) setupStatus.textContent = dl.error || "Download failed";
    }
    if (typeof updateSetupStep3Buttons === "function") updateSetupStep3Buttons();
  }

  function stopModelDownloadPolling() {
    if (modelDownloadPollTimer) {
      clearInterval(modelDownloadPollTimer);
      modelDownloadPollTimer = null;
    }
  }

  async function pollModelDownloadStatus() {
    try {
      const dl = await api("/api/models/download/status");
      renderDownloadProgress(dl);
      if (dl.status === "completed") {
        stopModelDownloadPolling();
        await fetchVlmModels($("#set-vlm-model"));
        await fetchVlmModels($("#setup-vlm-model"));
        if (dl.model_id && lastDownloadNotifiedId !== dl.model_id) {
          lastDownloadNotifiedId = dl.model_id;
          if ($("#set-vlm-model")) {
            $("#set-vlm-model").value = dl.model_id;
            saveSettingsAuto();
          }
          if ($("#setup-vlm-model")) {
            $("#setup-vlm-model").value = dl.model_id;
          }
          toast(`Downloaded ${shortModelLabel(dl.model_id)}`);
        }
        refreshHealth();
      } else if (dl.status === "cancelled") {
        stopModelDownloadPolling();
        toast("Model download cancelled");
        refreshHealth();
      } else if (dl.status === "error") {
        stopModelDownloadPolling();
        toast(dl.error || "Model download failed", true);
        refreshHealth();
      }
    } catch {
      // ignore transient poll errors
    }
  }

  async function startModelDownload(modelId) {
    const trimmed = String(modelId || "").trim();
    if (!trimmed) {
      toast("Select or enter a Hugging Face model ID first.", true);
      return;
    }
    lastDownloadNotifiedId = "";
    const dl = await api("/api/models/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_id: trimmed }),
    });
    renderDownloadProgress(dl);
    stopModelDownloadPolling();
    modelDownloadPollTimer = setInterval(pollModelDownloadStatus, 750);
    refreshHealth();
  }

  async function fetchVlmModels(targetSelect = $("#set-vlm-model")) {
    const res = await api("/api/models");
    state.models = res.models || [];
    if (typeof res.system_ram_gb === "number") {
      state.systemRamGb = res.system_ram_gb;
    }
    if (res.download && res.download.status !== "idle") {
      renderDownloadProgress(res.download);
      if (res.download.status === "downloading" && !modelDownloadPollTimer) {
        modelDownloadPollTimer = setInterval(pollModelDownloadStatus, 750);
      }
    }
    const setupRamNote = $("#setup-ram-note");
    if (setupRamNote && typeof state.systemRamGb === "number") {
      const rec = state.models.find((m) => m.recommended_for_device);
      setupRamNote.textContent = rec
        ? `Detected ${state.systemRamGb} GB unified memory · Recommended: ${shortModelLabel(rec.name)}`
        : `Detected ${state.systemRamGb} GB unified memory`;
    }
    const sel = targetSelect;
    if (!sel) return res;
    let current = state.settings?.vlm_model || sel.value;
    if (!current && sel === $("#setup-vlm-model") && setupMode !== "switch") {
      const rec = getRecommendedModelInfo();
      if (rec) current = rec.name;
    }
    sel.innerHTML = `<option value="">-- Select a model --</option>`;
    state.models.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.name;
      const baseLabel = m.label || m.name;
      const recTag = m.recommended_for_device ? " · Recommended for your Mac" : "";
      const tightTag = m.ram_fit === "tight" ? ` · Needs ${m.min_ram_gb} GB+ RAM` : "";
      const statusSuffix = m.downloaded
        ? `Downloaded · ${m.size_gb ?? "?"} GB`
        : `${m.size_gb ?? "?"} GB · Download required`;
      opt.textContent = `${baseLabel}${recTag}${tightTag} [${statusSuffix}]`;
      if (m.name === current) opt.selected = true;
      sel.appendChild(opt);
    });
    if (current && !state.models.some((m) => m.name === current)) {
      const opt = document.createElement("option");
      opt.value = current;
      opt.textContent = `${current} (saved)`;
      opt.selected = true;
      sel.appendChild(opt);
    }
    if (current) {
      sel.value = current;
    }
    if (sel === $("#setup-vlm-model") && typeof renderSetupModelCards === "function") {
      renderSetupModelCards();
    }
    updateRuntimeActionButtons(res.runtime || {});
    return res;
  }

  function openDeleteModelConfirmModal(modelInfo) {
    if (!modelInfo) return;
    const modal = $("#doc-modal");
    setModalCompact(true);
    $("#modal-title").textContent = "Delete Cached Model";
    $("#modal-body").innerHTML = `
      <div style="display:flex; flex-direction:column; gap:14px;">
        <p style="margin:0;">
          Remove cached weights for <strong>${esc(shortModelLabel(modelInfo.name))}</strong> from disk?
          This will free approximately <strong>${esc(String(modelInfo.size_gb ?? "?"))} GB</strong>.
        </p>
        <p class="muted" style="margin:0;">
          Your documents and Vault database will not be affected. You can re-download the model anytime in Settings.
        </p>
        <div class="action-buttons" style="justify-content:flex-end;">
          <button id="cancel-model-delete-btn" type="button" class="btn btn-secondary">Cancel</button>
          <button id="confirm-model-delete-btn" type="button" class="btn btn-danger">Delete Model</button>
        </div>
      </div>
    `;
    $("#cancel-model-delete-btn").addEventListener("click", () => closeAnimatedModal(modal));
    $("#confirm-model-delete-btn").addEventListener("click", async () => {
      const btn = $("#confirm-model-delete-btn");
      btn.disabled = true;
      btn.textContent = "Deleting…";
      try {
        const res = await api("/api/models/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model_id: modelInfo.name }),
        });
        closeAnimatedModal(modal);
        await fetchVlmModels($("#set-vlm-model"));
        await fetchVlmModels($("#setup-vlm-model"));
        refreshHealth();
        toast(
          res.deleted
            ? `Deleted ${shortModelLabel(modelInfo.name)} (${formatBytesGiB(res.freed_bytes)} freed)`
            : "Model was not cached on disk"
        );
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false;
        btn.textContent = "Delete Model";
      }
    });
    showAnimatedModal(modal);
  }

  async function openLicensesModal() {
    const modal = $("#doc-modal");
    setModalCompact(true);
    $("#modal-title").textContent = "Third-Party Licenses";
    $("#modal-body").innerHTML = `<p class="muted" style="margin:0;">Loading license notices…</p>`;
    showAnimatedModal(modal);
    try {
      const data = await api("/api/licenses");
      const components = data.components || [];
      const runtimeDeps = data.runtime_dependencies || [];
      const notices = data.notices || [];
      const renderLicenseName = (name, url) => {
        if (url && /^https?:\/\//i.test(url)) {
          return `<a class="license-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(name)}</a>`;
        }
        return esc(name);
      };
      const runtimeDepsHtml = runtimeDeps.length
        ? `
          <details class="license-all-deps">
            <summary>All Runtime Python Dependencies (${runtimeDeps.length})</summary>
            <div class="license-deps-grid">
              ${runtimeDeps
                .map(
                  (d) => `
                  <div class="license-dep-row">
                    <span class="license-dep-name">${renderLicenseName(d.name, d.url)}${d.version ? ` <span class="muted">v${esc(d.version)}</span>` : ""}</span>
                    <span class="tag">${esc(d.license)}</span>
                  </div>
                `
                )
                .join("")}
            </div>
          </details>
        `
        : "";
      $("#modal-body").innerHTML = `
        <div class="license-list">
          ${components
            .map(
              (c) => `
              <div class="license-item">
                <div class="license-item-head">
                  <strong>${renderLicenseName(c.name, c.url)}${c.version ? ` <span class="muted" style="font-weight:400;">v${esc(c.version)}</span>` : ""}</strong>
                  <span class="tag">${esc(c.license)}</span>
                </div>
                <div class="muted" style="font-size:12px;">${esc(c.description)}</div>
              </div>
            `
            )
            .join("")}
        </div>
        ${runtimeDepsHtml}
        <div class="license-notices muted">
          ${notices.map((n) => `<div>${esc(n)}</div>`).join("")}
        </div>
      `;
    } catch (err) {
      $("#modal-body").innerHTML = `<p class="muted">${esc(err.message)}</p>`;
    }
  }

  async function updateSettingsPathPreview() {
    try {
      const { rel_path } = await api("/api/intake/preview-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: "2026-03-14",
          category: state.settings?.categories?.[0] || "Finance",
          title: "Acme Utility Bill",
          filename: "scan.pdf",
          tree_template: $("#set-tree-template").value,
          filename_mask: $("#set-filename-mask").value,
          date_format: $("#set-date-format").value,
        }),
      });
      $("#settings-path-preview").textContent = rel_path;
    } catch {
      // ignore
    }
  }

  function getDefaultPromptTemplate() {
    return state.settings?.default_system_prompt_template || "";
  }

  function computeOverrideValueFromEditor() {
    const editor = $("#set-system-prompt-override");
    if (!editor) return "";
    const raw = String(editor.value || "").trim();
    const def = getDefaultPromptTemplate().trim();
    if (!raw || (def && raw === def)) {
      return "";
    }
    return raw;
  }

  function updatePromptPreviewAndBadge() {
    const def = getDefaultPromptTemplate();
    const overrideVal = computeOverrideValueFromEditor();
    const isCustom = Boolean(overrideVal);
    const badge = $("#prompt-override-badge");
    if (badge) {
      badge.classList.toggle("hidden", !isCustom);
    }
    const preview = $("#effective-prompt-preview");
    if (preview) {
      const cats = (state.settings?.categories || []).join(", ");
      const lang = ($("#set-title-language")?.value || state.settings?.title_language || "document") === "english"
        ? "Write `title` in English (translating if the document is in another language)."
        : "Write `title` in the primary language of the document.";
      const base = isCustom ? overrideVal : def;
      let rendered = base
        .replaceAll("{categories}", cats)
        .replaceAll("{title_language_instruction}", lang);
      const extra = ($("#set-custom-instructions")?.value || "").trim();
      if (extra) {
        rendered = `${rendered}\n\nAdditional user instructions:\n${extra}`;
      }
      preview.textContent = rendered;
    }
  }

  async function loadSettingsIntoForm() {
    const s = await loadSettings();
    $("#set-dump-dir").value = s.dump_dir;
    $("#set-vault-dir").value = s.vault_dir;
    if ($("#settings-db-path")) {
      $("#settings-db-path").textContent = s.vault_config_path || s.vault_db_path || `${s.vault_dir}/.document_vault/vault.json`;
    }
    $("#set-processed-name").value = s.processed_dir_name;
    $("#set-watcher-enabled").checked = Boolean(s.watcher_enabled);
    $("#set-debounce").value = s.watcher_debounce_seconds;
    $("#set-tree-template").value = s.tree_template;
    $("#set-filename-mask").value = s.filename_mask;
    $("#set-date-format").value = s.date_format || "YYYY-MM-DD";
    $("#set-thinking-mode").value = s.thinking_mode || "off";
    $("#set-threshold").value = s.confidence_threshold;
    $("#threshold-val").textContent = Number(s.confidence_threshold).toFixed(2);
    $("#set-title-language").value = s.title_language;
    if ($("#set-custom-instructions")) {
      $("#set-custom-instructions").value = s.custom_instructions || "";
    }
    if ($("#set-system-prompt-override")) {
      $("#set-system-prompt-override").value = s.system_prompt_override || s.default_system_prompt_template || "";
    }
    applyInvertDocsDark(getStoredInvertDocsDark());

    renderCategoryChips([...s.categories]);
    renderMaskBuilders();
    updatePromptPreviewAndBadge();
    await fetchVlmModels($("#set-vlm-model"));
    await updateSettingsPathPreview();
  }

  async function openFallbackFolderBrowser(targetInput, promptTitle) {
    const modal = $("#doc-modal");
    setModalCompact(true);
    $("#modal-title").textContent = promptTitle;
    let currentPath = targetInput.value.trim();

    async function renderDir(dirPath) {
      const data = await api(`/api/fs/browse?path=${encodeURIComponent(dirPath || "")}`);
      currentPath = data.current;
      $("#modal-body").innerHTML = `
        <div class="path-preview-box">
          <span class="muted">Current Folder:</span>
          <code>${esc(data.current)}</code>
        </div>
        <ul class="folder-browser-list">
          ${data.parent ? `<li data-path="${esc(data.parent)}"><span class="fb-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 11 12 6 7 11"></polyline><line x1="12" y1="6" x2="12" y2="18"></line></svg></span><span>.. (Parent Folder)</span></li>` : ""}
          ${data.directories.map((d) => `<li data-path="${esc(d)}"><span class="fb-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></span><span>${esc(d.split("/").pop() || d)}</span></li>`).join("")}
        </ul>
        <div class="action-buttons" style="justify-content:flex-end;">
          <button id="fb-select-btn" type="button" class="btn btn-primary">Select This Folder</button>
        </div>
      `;
      $("#modal-body").querySelectorAll(".folder-browser-list li").forEach((li) => {
        li.addEventListener("click", () => renderDir(li.dataset.path));
      });
      $("#fb-select-btn").addEventListener("click", () => {
        targetInput.value = currentPath;
        targetInput.dispatchEvent(new Event("input", { bubbles: true }));
        targetInput.dispatchEvent(new Event("change", { bubbles: true }));
        closeAnimatedModal(modal);
      });
    }

    await renderDir(currentPath);
    showAnimatedModal(modal);
  }

  async function pickFolderForInput(targetInput, promptTitle, { triggerBtn = null, onPicked = null } = {}) {
    const prevText = triggerBtn ? triggerBtn.textContent : "";
    if (triggerBtn) {
      triggerBtn.disabled = true;
      if (!triggerBtn.classList.contains("setup-preset-pill")) {
        triggerBtn.textContent = "Opening Finder…";
      }
    }
    try {
      const res = await fetch("/api/fs/pick-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptTitle,
          initial_path: targetInput.value.trim(),
        }),
      });
      if (res.status === 501) {
        await openFallbackFolderBrowser(targetInput, promptTitle);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not open folder picker");
      if (!data.cancelled && data.path) {
        targetInput.value = data.path;
        targetInput.dispatchEvent(new Event("input", { bubbles: true }));
        targetInput.dispatchEvent(new Event("change", { bubbles: true }));
        if (typeof onPicked === "function") onPicked(data.path);
        toast(`Selected: ${data.path}`);
      }
    } catch (err) {
      toast(err.message, true);
    } finally {
      if (triggerBtn) {
        triggerBtn.disabled = false;
        if (!triggerBtn.classList.contains("setup-preset-pill")) {
          triggerBtn.textContent = prevText;
        }
      }
    }
  }

  $("#browse-dump-btn").addEventListener("click", () =>
    pickFolderForInput($("#set-dump-dir"), "Choose Incoming Folder (Unsorted Scans)", {
      triggerBtn: $("#browse-dump-btn"),
    })
  );
  $("#browse-vault-btn").addEventListener("click", () =>
    pickFolderForInput($("#set-vault-dir"), "Choose Vault Root Folder", {
      triggerBtn: $("#browse-vault-btn"),
    })
  );
  $("#settings-open-dump-btn")?.addEventListener("click", () => openFolderInFinder("dump"));
  $("#settings-open-vault-btn")?.addEventListener("click", () => openFolderInFinder("vault"));
  $("#toggle-folder-advanced-btn")?.addEventListener("click", () => {
    const panel = $("#folder-advanced-panel");
    const btn = $("#toggle-folder-advanced-btn");
    if (!panel || !btn) return;
    const opening = panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !opening);
    btn.textContent = opening
      ? "Hide Advanced Folder & Sync Options ▾"
      : "Advanced Folder & Sync Options ▸";
  });

  // ── Initial Setup, 3-Step Welcome Wizard & Connect Vault Modal ───────────
  let setupMandatory = false;
  let setupMode = "wizard"; // "wizard" | "guide" | "switch"
  let setupStep = 1;
  let setupSkipModel = false;
  let setupInspectTimer = null;
  let setupStepAnimTimer = null;
  let setupLastInspectInfo = null;

  function renderSetupVaultPresets(s) {
    const wrap = $("#setup-vault-presets-wrap");
    const container = $("#setup-vault-presets");
    if (!wrap || !container) return;
    const presets = (s?.onboarding_presets || []).filter((p) => p.available !== false);
    if (setupMode === "switch") {
      wrap.classList.add("hidden");
      container.innerHTML = "";
      return;
    }
    wrap.classList.remove("hidden");
    const curVault = ($("#setup-vault-dir")?.value || "").trim();
    const matchesKnown = presets.some((p) => curVault === p.vault_dir);
    const items = [
      ...presets.map((p) => ({
        id: p.id,
        label: p.label,
        badge: p.badge,
        description: p.description,
        vault_dir: p.vault_dir,
        selected: curVault === p.vault_dir,
        isCustom: false,
      })),
      {
        id: "custom_vault",
        label: "Custom Empty or Existing Vault…",
        badge: "Choose Folder",
        description: "Pick any existing Vault or empty folder in Finder.",
        vault_dir: "",
        selected: Boolean(curVault) && !matchesKnown,
        isCustom: true,
      },
    ];

    container.innerHTML = items
      .map(
        (p) => `
          <button type="button" class="setup-preset-pill ${p.selected ? "is-selected" : ""}" data-vault-preset="${esc(p.id)}">
            <span class="setup-preset-title">
              <span>${esc(p.label)}</span>
              ${p.badge ? `<span class="setup-preset-badge">${esc(p.badge)}</span>` : ""}
            </span>
            <span class="setup-preset-desc">${esc(p.description || "")}</span>
          </button>`
      )
      .join("");

    container.querySelectorAll(".setup-preset-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.vaultPreset;
        if (id === "custom_vault") {
          pickFolderForInput($("#setup-vault-dir"), "Choose Existing or New Vault Folder", {
            triggerBtn: btn,
            onPicked: () => {
              renderSetupVaultPresets(s);
              inspectSetupVault($("#setup-vault-dir").value);
            },
          });
          return;
        }
        const preset = presets.find((p) => p.id === id);
        if (!preset) return;
        if ($("#setup-vault-dir")) $("#setup-vault-dir").value = preset.vault_dir;
        renderSetupVaultPresets(s);
        inspectSetupVault(preset.vault_dir);
      });
    });
  }

  function renderSetupDumpPresets(s) {
    const wrap = $("#setup-dump-presets-wrap");
    const container = $("#setup-dump-presets");
    if (!wrap || !container) return;
    const presets = (s?.dump_presets || []).filter((p) => p.available !== false);
    if (setupMode === "switch") {
      wrap.classList.add("hidden");
      container.innerHTML = "";
      return;
    }
    wrap.classList.remove("hidden");
    const curDump = ($("#setup-dump-dir")?.value || "").trim();
    const matchesKnown = presets.some((p) => curDump === p.dump_dir);
    const items = [
      ...presets.map((p) => ({
        id: p.id,
        label: p.label,
        badge: p.badge,
        description: p.description,
        dump_dir: p.dump_dir,
        selected: curDump === p.dump_dir,
        isCustom: false,
      })),
      {
        id: "custom_dump",
        label: "Custom Incoming Folder…",
        badge: "Choose Folder",
        description: "Pick any folder you want Document Vault to watch.",
        dump_dir: "",
        selected: Boolean(curDump) && !matchesKnown,
        isCustom: true,
      },
    ];

    container.innerHTML = items
      .map(
        (p) => `
          <button type="button" class="setup-preset-pill ${p.selected ? "is-selected" : ""}" data-dump-preset="${esc(p.id)}">
            <span class="setup-preset-title">
              <span>${esc(p.label)}</span>
              ${p.badge ? `<span class="setup-preset-badge">${esc(p.badge)}</span>` : ""}
            </span>
            <span class="setup-preset-desc">${esc(p.description || "")}</span>
          </button>`
      )
      .join("");

    container.querySelectorAll(".setup-preset-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.dumpPreset;
        if (id === "custom_dump") {
          pickFolderForInput($("#setup-dump-dir"), "Choose Incoming Folder (Unsorted Scans)", {
            triggerBtn: btn,
            onPicked: () => renderSetupDumpPresets(s),
          });
          return;
        }
        const preset = presets.find((p) => p.id === id);
        if (!preset) return;
        if ($("#setup-dump-dir")) $("#setup-dump-dir").value = preset.dump_dir;
        renderSetupDumpPresets(s);
      });
    });
  }

  function renderSetupPresets(s) {
    renderSetupVaultPresets(s);
    renderSetupDumpPresets(s);
  }

  function renderSetupModelCards() {
    const cardsEl = $("#setup-model-cards");
    const sel = $("#setup-vlm-model");
    if (!cardsEl || !sel) return;
    if (setupMode === "switch") {
      cardsEl.classList.add("hidden");
      return;
    }
    const models = state.models || [];
    if (!models.length) {
      cardsEl.classList.add("hidden");
      cardsEl.innerHTML = "";
      return;
    }
    cardsEl.classList.remove("hidden");
    const selectedId = sel.value;
    cardsEl.innerHTML = models
      .map((m) => {
        const isSelected = m.name === selectedId;
        const isTight = m.ram_fit === "tight";
        let badgeHtml = `<span class="setup-model-badge">${esc(String(m.size_gb ?? "?"))} GB</span>`;
        if (m.downloaded) {
          badgeHtml = `<span class="setup-model-badge is-ready">Cached ✓</span>`;
        } else if (m.recommended_for_device) {
          badgeHtml = `<span class="setup-model-badge is-rec">Recommended</span>`;
        } else if (isTight) {
          badgeHtml = `<span class="setup-model-badge is-tight">${esc(String(m.min_ram_gb || ""))} GB+ RAM</span>`;
        }
        return `
          <button type="button" class="setup-model-card ${isSelected ? "is-selected" : ""} ${isTight ? "is-tight" : ""}" data-model-id="${esc(m.name)}" role="radio" aria-checked="${isSelected ? "true" : "false"}">
            <div class="setup-model-card-top">
              <span class="setup-model-card-name">${esc(shortModelLabel(m.name))}</span>
              ${badgeHtml}
            </div>
            <div class="setup-model-card-meta">
              <span>${esc(m.parameter_size || "")}</span>
              <span>·</span>
              <span>${esc(String(m.size_gb ?? "?"))} GB download</span>
              <span>·</span>
              <span>${m.downloaded ? "Ready on disk" : "Download once"}</span>
            </div>
          </button>`;
      })
      .join("");

    cardsEl.querySelectorAll(".setup-model-card").forEach((card) => {
      card.addEventListener("click", () => {
        sel.value = card.dataset.modelId || "";
        renderSetupModelCards();
        updateModelSelectButtons();
      });
    });
  }

  function updateSetupStep3Buttons() {
    const submitBtn = $("#setup-submit-btn");
    const skipBtn = $("#setup-skip-model-btn");
    if (!submitBtn) return;

    if (setupMode === "switch") {
      if (skipBtn) skipBtn.classList.add("hidden");
      return;
    }

    const sel = $("#setup-vlm-model");
    const val = sel?.value || "";
    const info = findCatalogModel(val);
    const isDownloaded = Boolean(info && info.downloaded);
    const isDownloading = state.latestDownload?.status === "downloading";

    if (isDownloading) {
      submitBtn.textContent = "Finish & Download in Background";
      if (skipBtn) skipBtn.classList.add("hidden");
    } else if (isDownloaded || !val) {
      submitBtn.textContent = setupLastInspectInfo?.has_db || setupLastInspectInfo?.has_vault_config
        ? "Open Existing Vault"
        : "Open Vault";
      if (skipBtn) skipBtn.classList.toggle("hidden", isDownloaded);
    } else {
      const sizeSuffix = info?.size_gb ? ` (${info.size_gb} GB)` : "";
      submitBtn.textContent = `Download${sizeSuffix} & Open Vault`;
      if (skipBtn) skipBtn.classList.remove("hidden");
    }
  }

  function setSetupStep(stepNum, { animate = true } = {}) {
    const prevStep = setupStep;
    setupStep = stepNum;
    const stage = $("#setup-steps-stage");
    const s1 = $("#setup-step-1");
    const s2 = $("#setup-step-2");
    const s3 = $("#setup-step-3");
    const stepper = $("#setup-stepper");
    const switchIntro = $("#setup-switch-intro");
    const card = $(".modal-card-setup");
    const selectWrap = $("#setup-select-fallback-field");
    const back2 = $("#setup-back-2-btn");
    const next2 = $("#setup-next-2-btn");
    const back3 = $("#setup-back-3-btn");
    const watcherRow = $("#setup-watcher-row");
    const modelHead = $(".setup-model-head");
    const step2Footer = $("#setup-step2-footer");
    const browseVaultBtn = $("#setup-browse-vault-btn");
    const browseDumpBtn = $("#setup-browse-dump-btn");
    const vaultLabel = $("#setup-vault-field-label");
    const dumpLabel = $("#setup-dump-field-label");

    if (setupStepAnimTimer) {
      clearTimeout(setupStepAnimTimer);
      setupStepAnimTimer = null;
    }
    if (stage) {
      stage.style.height = "";
    }
    [s1, s2, s3].forEach((panel) => {
      if (panel) panel.classList.remove("setup-step-enter-next", "setup-step-enter-prev");
    });

    if (setupMode === "switch") {
      if (card) card.classList.add("is-switch-mode");
      if (stepper) stepper.classList.add("hidden");
      if (switchIntro) switchIntro.classList.remove("hidden");
      if (s1) s1.classList.add("hidden");
      if (s2) s2.classList.remove("hidden");
      if (s3) s3.classList.remove("hidden");
      if (step2Footer) step2Footer.classList.add("hidden");
      if (back2) back2.classList.add("hidden");
      if (next2) next2.classList.add("hidden");
      if (back3) back3.classList.add("hidden");
      if (watcherRow) watcherRow.classList.add("hidden");
      if (modelHead) modelHead.classList.add("hidden");
      if (selectWrap) selectWrap.classList.remove("hidden");
      if (browseVaultBtn) browseVaultBtn.classList.remove("hidden");
      if (browseDumpBtn) browseDumpBtn.classList.remove("hidden");
      if (vaultLabel) vaultLabel.classList.remove("hidden");
      if (dumpLabel) dumpLabel.classList.remove("hidden");
      renderSetupModelCards();
      updateSetupStep3Buttons();
      return;
    }

    if (card) card.classList.remove("is-switch-mode");
    if (stepper) stepper.classList.remove("hidden");
    if (switchIntro) switchIntro.classList.add("hidden");
    if (step2Footer) step2Footer.classList.remove("hidden");
    if (back2) back2.classList.remove("hidden");
    if (next2) next2.classList.remove("hidden");
    if (back3) back3.classList.remove("hidden");
    if (watcherRow) watcherRow.classList.remove("hidden");
    if (modelHead) modelHead.classList.remove("hidden");
    if (selectWrap) selectWrap.classList.toggle("hidden", (state.models || []).length > 0);
    if (browseVaultBtn) browseVaultBtn.classList.add("hidden");
    if (browseDumpBtn) browseDumpBtn.classList.add("hidden");
    if (vaultLabel) vaultLabel.classList.add("hidden");
    if (dumpLabel) dumpLabel.classList.add("hidden");

    const shouldAnimate =
      animate && !prefersReducedMotion() && stage && prevStep !== stepNum && typeof stage.offsetHeight === "number";
    const prevHeight = shouldAnimate ? stage.offsetHeight : 0;

    if (s1) s1.classList.toggle("hidden", stepNum !== 1);
    if (s2) s2.classList.toggle("hidden", stepNum !== 2);
    if (s3) s3.classList.toggle("hidden", stepNum !== 3);

    $$(".setup-step-pill").forEach((pill) => {
      const n = Number(pill.dataset.step);
      pill.classList.toggle("is-active", n === stepNum);
      pill.classList.toggle("is-done", n < stepNum);
    });

    if (stepNum === 3) {
      renderSetupModelCards();
      updateModelSelectButtons();
    }
    updateSetupStep3Buttons();

    if (shouldAnimate) {
      const targetPanel = stepNum === 1 ? s1 : stepNum === 2 ? s2 : s3;
      if (targetPanel) {
        targetPanel.classList.add(stepNum > prevStep ? "setup-step-enter-next" : "setup-step-enter-prev");
      }
      const nextHeight = stage.offsetHeight;
      if (prevHeight > 0 && nextHeight > 0 && prevHeight !== nextHeight) {
        stage.style.height = `${prevHeight}px`;
        void stage.offsetHeight;
        requestAnimationFrame(() => {
          stage.style.height = `${nextHeight}px`;
        });
      }
      setupStepAnimTimer = setTimeout(() => {
        stage.style.height = "";
        if (targetPanel) {
          targetPanel.classList.remove("setup-step-enter-next", "setup-step-enter-prev");
        }
        setupStepAnimTimer = null;
      }, 250);
    }
  }

  async function inspectSetupVault(rawPath) {
    const box = $("#setup-inspect-box");
    const title = $("#setup-inspect-title");
    const detail = $("#setup-inspect-detail");
    const tagsEl = $("#setup-inspect-tags");
    const submitBtn = $("#setup-submit-btn");
    const next2Btn = $("#setup-next-2-btn");
    const trimmed = String(rawPath || "").trim();
    setupLastInspectInfo = null;
    submitBtn.disabled = false;
    if (next2Btn) next2Btn.disabled = false;

    if (!trimmed) {
      box.className = "setup-inspect-box inspect-new";
      title.textContent = "Enter or browse to a Vault folder";
      detail.textContent = "A new folder will be initialized if it does not exist yet.";
      tagsEl.innerHTML = "";
      if (setupMode === "switch") submitBtn.textContent = "Initialize Vault";
      return;
    }

    try {
      const info = await api(`/api/vault/inspect?path=${encodeURIComponent(trimmed)}`);
      setupLastInspectInfo = info;
      tagsEl.innerHTML = "";
      if (info.exists && !info.is_dir) {
        box.className = "setup-inspect-box inspect-err";
        title.textContent = "Path points to a file, not a folder";
        detail.textContent = "Please choose a directory for your Vault.";
        submitBtn.disabled = true;
        if (next2Btn) next2Btn.disabled = true;
        if (setupMode === "switch") submitBtn.textContent = "Open Vault";
        return;
      }
      if (info.version_blocked) {
        box.className = "setup-inspect-box inspect-err";
        title.textContent = `Vault requires a newer Document Vault (v${info.vault_version})`;
        detail.textContent = info.upgrade_warning || "Please update Document Vault to open this vault.";
        submitBtn.disabled = true;
        if (next2Btn) next2Btn.disabled = true;
        if (setupMode === "switch") submitBtn.textContent = "Update Required";
        return;
      }
      if (info.requires_upgrade_confirmation) {
        box.className = "setup-inspect-box inspect-files";
        const count = info.db_doc_count || info.file_count || 0;
        title.textContent = info.has_legacy_db
          ? `Legacy Vault database detected (${count} document${count === 1 ? "" : "s"})`
          : `Vault upgrade required (v${info.vault_version} → v${info.app_version})`;
        detail.textContent = info.upgrade_warning || "Upgrading will prevent older versions of Document Vault from opening this vault.";
        (info.db_tags?.length ? info.db_tags : info.folder_tags || []).forEach((t) => {
          const span = document.createElement("span");
          span.className = `tag ${getCategoryTone(t)}`;
          span.textContent = t;
          tagsEl.appendChild(span);
        });
        if (setupMode === "switch") submitBtn.textContent = "Upgrade & Open Vault";
      } else if (info.has_db || info.has_vault_config || info.has_root_db) {
        box.className = "setup-inspect-box inspect-db";
        title.textContent = `Existing Vault found (${info.db_doc_count} document${info.db_doc_count === 1 ? "" : "s"})`;
        const extraFiles = Math.max(0, (info.file_count || 0) - (info.db_doc_count || 0));
        detail.textContent = extraFiles > 0
          ? `Will load your Vault config and index ${extraFiles} additional file(s) found on disk.`
          : "All documents, metadata sidecars, and folder labels will load immediately.";
        (info.db_tags || []).forEach((t) => {
          const span = document.createElement("span");
          span.className = `tag ${getCategoryTone(t)}`;
          span.textContent = t;
          tagsEl.appendChild(span);
        });
        if (setupMode === "switch") submitBtn.textContent = "Open Existing Vault";
      } else if (info.file_count > 0) {
        box.className = "setup-inspect-box inspect-files";
        title.textContent = `Found ${info.file_count} document file${info.file_count === 1 ? "" : "s"} on disk`;
        detail.textContent = "Will reconstruct the search index, previews, and folder labels directly from these files.";
        (info.folder_tags || []).forEach((t) => {
          const span = document.createElement("span");
          span.className = `tag ${getCategoryTone(t)}`;
          span.textContent = t;
          tagsEl.appendChild(span);
        });
        if (setupMode === "switch") submitBtn.textContent = "Connect & Reconstruct Vault";
      } else {
        box.className = "setup-inspect-box inspect-new";
        title.textContent = info.exists ? "Empty folder — ready for a new Vault" : "New folder — will be created";
        detail.textContent = "Vault configuration (.document_vault/vault.json) will be initialized inside this folder.";
        if (setupMode === "switch") submitBtn.textContent = "Initialize New Vault";
      }
      updateSetupStep3Buttons();
    } catch (err) {
      box.className = "setup-inspect-box inspect-err";
      title.textContent = "Could not inspect folder";
      detail.textContent = err.message;
      tagsEl.innerHTML = "";
    }
  }

  function closeSetupModal() {
    if (setupMandatory) return;
    closeAnimatedModal($("#setup-modal"));
  }

  async function openSetupModal({ mandatory = false, mode } = {}) {
    setupMandatory = mandatory;
    setupMode = mode || (mandatory ? "wizard" : "switch");
    setupSkipModel = false;

    const s = state.settings || (await loadSettings());
    $("#setup-modal-title").textContent =
      setupMode === "switch" ? "Connect or Switch Vault" : "Welcome to Document Vault";
    $("#setup-close-btn").classList.toggle("hidden", mandatory);
    $("#setup-cancel-btn").classList.toggle("hidden", mandatory);

    let defaultVault = s.vault_dir || "";
    let defaultDump = s.dump_dir || "";
    if (setupMode === "wizard" && !s.setup_completed && s.onboarding_presets?.length) {
      const recPreset = s.onboarding_presets.find((p) => p.id === "documents") || s.onboarding_presets[0];
      const looksUntouched =
        defaultVault.endsWith("/vault") || defaultVault.endsWith("\\vault") || !defaultVault;
      if (recPreset && looksUntouched) {
        defaultVault = recPreset.vault_dir;
        defaultDump = recPreset.dump_dir;
      }
    }

    $("#setup-vault-dir").value = defaultVault;
    $("#setup-dump-dir").value = defaultDump;
    if ($("#setup-watcher-enabled")) {
      $("#setup-watcher-enabled").checked =
        setupMode === "wizard" && !s.setup_completed ? true : Boolean(s.watcher_enabled);
    }

    renderSetupPresets(s);
    setSetupStep(setupMode === "switch" ? 2 : 1, { animate: false });

    await inspectSetupVault($("#setup-vault-dir").value);
    try {
      await fetchVlmModels($("#setup-vlm-model"));
    } catch {
      // ignore
    }
    renderSetupModelCards();
    updateSetupStep3Buttons();
    showAnimatedModal($("#setup-modal"));
  }

  $("#setup-close-btn").addEventListener("click", closeSetupModal);
  $("#setup-cancel-btn").addEventListener("click", closeSetupModal);
  $("#setup-modal-backdrop").addEventListener("click", closeSetupModal);

  $$(".setup-step-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      const targetStep = Number(pill.dataset.step);
      if (targetStep >= 1 && targetStep <= 3 && setupMode !== "switch") {
        setSetupStep(targetStep);
      }
    });
  });

  $("#setup-next-1-btn")?.addEventListener("click", () => setSetupStep(2));
  $("#setup-back-2-btn")?.addEventListener("click", () => setSetupStep(1));
  $("#setup-next-2-btn")?.addEventListener("click", () => setSetupStep(3));
  $("#setup-back-3-btn")?.addEventListener("click", () => setSetupStep(2));

  $("#setup-skip-model-btn")?.addEventListener("click", () => {
    setupSkipModel = true;
    const form = $("#setup-form");
    if (form && typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else if (form) {
      form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    }
  });

  $("#setup-cancel-download-btn")?.addEventListener("click", async () => {
    try {
      const dl = await api("/api/models/download/cancel", { method: "POST" });
      renderDownloadProgress(dl);
      toast("Cancelling download…");
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#setup-vault-dir").addEventListener("input", () => {
    clearTimeout(setupInspectTimer);
    setupInspectTimer = setTimeout(() => {
      renderSetupPresets(state.settings);
      inspectSetupVault($("#setup-vault-dir").value);
    }, 180);
  });

  $("#setup-dump-dir").addEventListener("input", () => {
    renderSetupPresets(state.settings);
  });

  $("#setup-browse-vault-btn").addEventListener("click", () =>
    pickFolderForInput($("#setup-vault-dir"), "Choose Existing or New Vault Folder", {
      triggerBtn: $("#setup-browse-vault-btn"),
    })
  );
  $("#setup-browse-dump-btn").addEventListener("click", () =>
    pickFolderForInput($("#setup-dump-dir"), "Choose Incoming Folder (Unsorted Scans)", {
      triggerBtn: $("#setup-browse-dump-btn"),
    })
  );

  $("#setup-vlm-model").addEventListener("change", () => {
    renderSetupModelCards();
    updateModelSelectButtons();
  });

  $("#setup-download-model-btn").addEventListener("click", async () => {
    try {
      await startModelDownload($("#setup-vlm-model").value);
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#setup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const skipModel = setupSkipModel;
    setupSkipModel = false;

    if (setupLastInspectInfo?.version_blocked) {
      toast(setupLastInspectInfo.upgrade_warning || "This vault requires a newer version of Document Vault.", true);
      return;
    }
    let confirmUpgrade = false;
    if (setupLastInspectInfo?.requires_upgrade_confirmation) {
      const warnMsg =
        (setupLastInspectInfo.upgrade_warning || "This vault was last updated by an older version.") +
        "\n\nProceed with upgrading this Vault?";
      if (typeof window !== "undefined" && typeof window.confirm === "function") {
        if (!window.confirm(warnMsg)) return;
      }
      confirmUpgrade = true;
    }

    const btn = $("#setup-submit-btn");
    const prevLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Connecting…";

    const selectedModel = skipModel ? "" : ($("#setup-vlm-model")?.value || "");
    const selectedInfo = findCatalogModel(selectedModel);
    const isDownloading = state.latestDownload?.status === "downloading";

    try {
      if (setupMode !== "switch" && selectedModel && !selectedInfo?.downloaded && !isDownloading) {
        try {
          await startModelDownload(selectedModel);
        } catch (dlErr) {
          toast(`Vault connected, but model download could not start: ${dlErr.message}`, true);
        }
      }

      const connectBody = {
        vault_dir: $("#setup-vault-dir").value.trim(),
        dump_dir: $("#setup-dump-dir").value.trim() || null,
        vlm_model: selectedModel,
        reconstruct: true,
        confirm_upgrade: confirmUpgrade,
      };
      if (setupMode !== "switch" && $("#setup-watcher-enabled")) {
        connectBody.watcher_enabled = $("#setup-watcher-enabled").checked;
      }

      const res = await api("/api/vault/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connectBody),
      });
      state.settings = res.settings;
      state.vlmBannerDismissed = false;
      setupMandatory = false;
      closeAnimatedModal($("#setup-modal"));

      const rec = res.reconstruction || {};
      const total = rec.total_documents ?? 0;
      const added = rec.indexed_added ?? 0;
      const tagCount = (rec.discovered_tags || []).length;
      if (added > 0) {
        toast(`Reconstructed ${added} document(s) and ${tagCount} tag(s) (${total} total)`);
      } else if (total > 0) {
        toast(`Connected Vault (${total} document(s), ${tagCount} tag(s))`);
      } else {
        toast(`Vault ready at ${res.settings.vault_dir}`);
      }

      await refreshHealth();
      if ($("#tab-settings").classList.contains("active")) {
        await loadSettingsIntoForm();
      }
      if (total > 0) {
        state.vaultCategory = "";
        state.vaultOpenPendingAnimation = true;
        switchTab("vault");
      } else if ($("#tab-vault").classList.contains("active")) {
        state.vaultOpenPendingAnimation = true;
        await loadVaultDocuments({ reason: "open", reconcile: false });
      }
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = prevLabel;
      updateSetupStep3Buttons();
    }
  });

  $("#switch-vault-btn").addEventListener("click", () => openSetupModal({ mandatory: false, mode: "switch" }));
  $("#open-welcome-guide-btn")?.addEventListener("click", () => openSetupModal({ mandatory: false, mode: "guide" }));
  $("#settings-welcome-guide-btn")?.addEventListener("click", () => openSetupModal({ mandatory: false, mode: "guide" }));

  $("#reconstruct-vault-btn").addEventListener("click", async () => {
    const btn = $("#reconstruct-vault-btn");
    btn.disabled = true;
    btn.textContent = "Syncing…";
    try {
      const res = await api("/api/vault/reconstruct", { method: "POST" });
      state.settings = res.settings;
      const rec = res.reconstruction || {};
      renderCategoryChips([...(res.settings.categories || [])]);
      toast(
        `Vault synced: +${rec.indexed_added ?? 0} indexed, ${rec.rebased ?? 0} rebased, ${rec.previews_rebuilt ?? 0} previews rebuilt, ${rec.pruned ?? 0} pruned`
      );
      if ($("#tab-vault").classList.contains("active")) {
        state.vaultOpenPendingAnimation = true;
        await loadVaultDocuments({ reason: "open", reconcile: false });
      }
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Reconstruct / Sync from Disk";
    }
  });

  function collectSettingsPayload() {
    const dumpDir = $("#set-dump-dir").value.trim();
    const vaultDir = $("#set-vault-dir").value.trim();
    const processedName = $("#set-processed-name").value.trim();
    const treeTemplate = $("#set-tree-template").value.trim();
    const filenameMask = $("#set-filename-mask").value.trim();
    const debounce = Number($("#set-debounce").value);

    if (!dumpDir || !vaultDir || !processedName || !treeTemplate || !filenameMask) {
      return { valid: false, reason: "Required field empty" };
    }
    if (!Number.isFinite(debounce) || debounce < 0.5 || debounce > 30) {
      return { valid: false, reason: "Debounce must be 0.5–30s" };
    }

    return {
      valid: true,
      payload: {
        dump_dir: dumpDir,
        vault_dir: vaultDir,
        processed_dir_name: processedName,
        watcher_enabled: $("#set-watcher-enabled").checked,
        watcher_debounce_seconds: debounce,
        categories: state.settings?.categories || [],
        tree_template: treeTemplate,
        filename_mask: filenameMask,
        date_format: $("#set-date-format").value,
        vlm_model: $("#set-vlm-model").value,
        thinking_mode: $("#set-thinking-mode").value,
        confidence_threshold: Number($("#set-threshold").value),
        title_language: $("#set-title-language").value,
        custom_instructions: ($("#set-custom-instructions")?.value || "").trim(),
        system_prompt_override: computeOverrideValueFromEditor(),
      },
    };
  }

  async function saveSettingsAuto({ refreshModels = false } = {}) {
    clearTimeout(settingsSaveDebounceTimer);
    if (!state.settings) return;

    const collected = collectSettingsPayload();
    if (!collected.valid) {
      setSettingsSaveStatus("error", collected.reason);
      return;
    }

    if (settingsSaveInFlight) {
      settingsSavePending = true;
      return;
    }

    settingsSaveInFlight = true;
    setSettingsSaveStatus("saving", "Saving…");
    try {
      const prevVault = state.settings?.vault_dir || "";
      const updated = await api("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collected.payload),
      });
      state.settings = updated;
      if (updated.vault_dir !== prevVault) {
        await loadSettingsIntoForm();
        toast(`Switched Vault to ${updated.vault_dir}`);
      } else {
        if ($("#settings-db-path")) {
          $("#settings-db-path").textContent = updated.vault_config_path || updated.vault_db_path || "";
        }
        if (refreshModels) {
          fetchVlmModels($("#set-vlm-model")).catch(() => {});
        }
      }
      setSettingsSaveStatus("saved", "Saved");
      refreshHealth();
    } catch (err) {
      setSettingsSaveStatus("error", "Save failed");
      toast(err.message, true);
    } finally {
      settingsSaveInFlight = false;
      if (settingsSavePending) {
        settingsSavePending = false;
        saveSettingsAuto();
      }
    }
  }

  function scheduleDebouncedSettingsSave() {
    clearTimeout(settingsSaveDebounceTimer);
    settingsSaveDebounceTimer = setTimeout(() => {
      saveSettingsAuto();
    }, 500);
  }

  function addCategoryFromInput() {
    const inp = $("#new-category-input");
    const val = inp.value.trim();
    if (!val) return;
    if (!state.settings.categories.some((c) => c.toLowerCase() === val.toLowerCase())) {
      state.settings.categories.push(val);
      renderCategoryChips(state.settings.categories);
      updatePromptPreviewAndBadge();
      saveSettingsAuto();
    }
    inp.value = "";
  }

  $("#add-category-btn").addEventListener("click", addCategoryFromInput);
  $("#new-category-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCategoryFromInput();
    }
  });

  $("#set-threshold").addEventListener("input", (e) => {
    $("#threshold-val").textContent = Number(e.target.value).toFixed(2);
  });
  $("#set-threshold").addEventListener("change", () => saveSettingsAuto());

  $("#set-tree-template").addEventListener("input", () => {
    renderMaskCanvas("tree");
    updateSettingsPathPreview();
    scheduleDebouncedSettingsSave();
  });
  $("#set-filename-mask").addEventListener("input", () => {
    renderMaskCanvas("filename");
    updateSettingsPathPreview();
    scheduleDebouncedSettingsSave();
  });
  $("#set-date-format").addEventListener("change", () => {
    updateSettingsPathPreview();
    saveSettingsAuto();
  });

  [
    "#set-watcher-enabled",
    "#set-vlm-model",
    "#set-thinking-mode",
    "#set-title-language",
    "#set-dump-dir",
    "#set-vault-dir",
  ].forEach((sel) => {
    $(sel).addEventListener("change", () => {
      if (sel === "#set-vlm-model") updateModelSelectButtons();
      if (sel === "#set-title-language") updatePromptPreviewAndBadge();
      saveSettingsAuto();
    });
  });

  ["#set-custom-instructions", "#set-system-prompt-override"].forEach((sel) => {
    $(sel).addEventListener("input", () => {
      updatePromptPreviewAndBadge();
      scheduleDebouncedSettingsSave();
    });
    $(sel).addEventListener("change", () => {
      updatePromptPreviewAndBadge();
      saveSettingsAuto();
    });
  });

  $("#toggle-full-prompt-btn").addEventListener("click", () => {
    const panel = $("#full-prompt-panel");
    const btn = $("#toggle-full-prompt-btn");
    const opening = panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !opening);
    btn.textContent = opening ? "Hide Full System Prompt ▾" : "View / Edit Full System Prompt ▸";
    if (opening) {
      updatePromptPreviewAndBadge();
    }
  });

  $("#reset-system-prompt-btn").addEventListener("click", () => {
    const editor = $("#set-system-prompt-override");
    if (editor) {
      editor.value = getDefaultPromptTemplate();
      updatePromptPreviewAndBadge();
      saveSettingsAuto();
      toast("System prompt reset to default");
    }
  });

  ["#set-processed-name", "#set-debounce"].forEach((sel) => {
    $(sel).addEventListener("input", scheduleDebouncedSettingsSave);
    $(sel).addEventListener("change", () => saveSettingsAuto());
  });

  $("#download-model-btn").addEventListener("click", async () => {
    try {
      await startModelDownload($("#set-vlm-model").value);
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#unload-model-btn").addEventListener("click", async () => {
    try {
      const res = await api("/api/models/unload", { method: "POST" });
      updateRuntimeActionButtons({ loaded_model: res.runtime?.loaded_model || null });
      syncRamClock(null);
      toast(res.unloaded ? "Unloaded model from memory" : "No model was loaded");
      refreshHealth();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#delete-model-btn").addEventListener("click", () => {
    const info = findCatalogModel($("#set-vlm-model").value);
    if (info && info.downloaded) {
      openDeleteModelConfirmModal(info);
    }
  });

  $("#cancel-download-btn").addEventListener("click", async () => {
    try {
      const dl = await api("/api/models/download/cancel", { method: "POST" });
      renderDownloadProgress(dl);
      toast("Cancelling download…");
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#open-licenses-btn").addEventListener("click", () => {
    openLicensesModal();
  });

  $("#settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    saveSettingsAuto();
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    initTheme();
    initMaskBuilders();
    const initialTab = restoreInitialTab();
    await loadSettings();
    await refreshHealth();
    if (!state.settings?.setup_completed) {
      openSetupModal({ mandatory: true });
    } else if (initialTab === "review") {
      await loadReviewQueue();
    } else if (initialTab === "settings") {
      await loadSettingsIntoForm();
    } else {
      state.vaultOpenPendingAnimation = true;
      await loadVaultDocuments({ reason: "open", reconcile: true });
    }
    if (typeof window.addEventListener === "function") {
      window.addEventListener("focus", () => {
        refreshHealth();
      });
    }
    setInterval(refreshHealth, 4000);
  }

  init();
})();
