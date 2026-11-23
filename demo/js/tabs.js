/** Tab navigation, sliding indicator, session persistence, and cross-tab document jump. */

import { loadReviewQueue } from "./review.js";
import { loadSettingsIntoForm } from "./settings.js";
import { $, $$, state } from "./state.js";
import { prefersReducedMotion } from "./utils.js";
import { loadVaultDocuments } from "./vault_grid.js";

export function navigateToVaultDocument({ documentId = null, category = "", vaultRelPath = "" } = {}) {
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

export function restoreInitialTab() {
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

export function updateTabIndicator({ immediate = false } = {}) {
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

export function switchTab(tabName) {
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

export function initTabsListeners() {
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
}
