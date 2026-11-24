/** Settings load/autosave, live path preview, prompt editor, folder picker/browser, and form listeners. */

import { closeAnimatedModal, setModalCompact, showAnimatedModal } from "./modals.js";
import { renderMaskBuilders, renderMaskCanvas } from "./settings_masks.js";
import { fetchVlmModels, updateModelSelectButtons } from "./settings_models.js";
import { renderFilingRules } from "./settings_rules.js";
import { renderCategoryTree } from "./settings_taxonomy.js";
import { $, state } from "./state.js";
import { applyInvertDocsDark, getStoredInvertDocsDark } from "./theme.js";
import { api, esc, toast } from "./utils.js";
import { refreshHealth } from "./vlm.js";
import { openFolderInFinder } from "./watcher.js";

// ── Settings Tab ──────────────────────────────────────────────────────────
export let settingsSaveInFlight = false;
let settingsSavePending = false;
let settingsSaveDebounceTimer = null;
let settingsStatusResetTimer = null;

export function setSettingsSaveStatus(mode = "idle", text = "Changes save automatically") {
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

export async function loadSettings() {
  state.settings = await api("/api/settings");
  return state.settings;
}

export async function updateSettingsPathPreview() {
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
        title_separator: $("#set-title-separator")?.value || state.settings?.title_separator || "space",
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

export function updatePromptPreviewAndBadge() {
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
    const enabledRules = (state.settings?.filing_rules || []).filter((r) => r && r.enabled !== false && r.target_label);
    if (enabledRules.length) {
      const ruleLines = enabledRules.slice(0, 25).map((r) => {
        const parts = [];
        if (Array.isArray(r.match_keywords) && r.match_keywords.length) {
          parts.push(`keywords [${r.match_keywords.join(", ")}]`);
        }
        if (r.instruction) parts.push(String(r.instruction).trim());
        return parts.length ? `- If ${parts.join("; ")} -> file under \`${r.target_label}\`` : "";
      }).filter(Boolean);
      if (ruleLines.length) {
        rendered = `${rendered}\n\nUser filing rules (follow strictly when applicable):\n${ruleLines.join("\n")}`;
      }
    }
    const extra = ($("#set-custom-instructions")?.value || "").trim();
    if (extra) {
      rendered = `${rendered}\n\nAdditional user instructions:\n${extra}`;
    }
    preview.textContent = rendered;
  }
}

export async function loadSettingsIntoForm() {
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
  if ($("#set-title-separator")) {
    $("#set-title-separator").value = s.title_separator || "space";
  }
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

  renderCategoryTree([...s.categories]);
  renderFilingRules([...(s.filing_rules || [])]);
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

export async function pickFolderForInput(targetInput, promptTitle, { triggerBtn = null, onPicked = null } = {}) {
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
      filing_rules: state.settings?.filing_rules || [],
      tree_template: treeTemplate,
      filename_mask: filenameMask,
      date_format: $("#set-date-format").value,
      title_separator: $("#set-title-separator")?.value || state.settings?.title_separator || "space",
      vlm_model: $("#set-vlm-model").value,
      thinking_mode: $("#set-thinking-mode").value,
      confidence_threshold: Number($("#set-threshold").value),
      title_language: $("#set-title-language").value,
      custom_instructions: ($("#set-custom-instructions")?.value || "").trim(),
      system_prompt_override: computeOverrideValueFromEditor(),
    },
  };
}

export async function saveSettingsAuto({ refreshModels = false } = {}) {
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

export function scheduleDebouncedSettingsSave() {
  clearTimeout(settingsSaveDebounceTimer);
  settingsSaveDebounceTimer = setTimeout(() => {
    saveSettingsAuto();
  }, 500);
}

export function initSettingsListeners() {
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
  $("#set-title-separator")?.addEventListener("change", () => {
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
  $("#settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    saveSettingsAuto();
  });
}
