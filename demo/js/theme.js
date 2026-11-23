/** Auto/Light/Dark theme persistence and dark-mode document inversion. */

import { $, $$ } from "./state.js";
import { setSettingsSaveStatus } from "./settings.js";

// ── Theme Selection (Auto / Light / Dark) ────────────────────────────────
const THEME_STORAGE_KEY = "dv_theme_mode";
const INVERT_DOCS_STORAGE_KEY = "dv_invert_docs_dark";
const themeMediaQuery = window.matchMedia
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;

export function getStoredInvertDocsDark() {
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

export function applyInvertDocsDark(enabled) {
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

export function setInvertDocsDark(enabled) {
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

export function initTheme() {
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
