/** Welcome wizard Vault/Incoming folder presets, recommended model cards, and vault inspection. */

import { updateSetupStep3Buttons } from "./onboarding.js";
import { pickFolderForInput } from "./settings.js";
import { updateModelSelectButtons } from "./settings_models.js";
import { $, state } from "./state.js";
import {
  api,
  esc,
  getCategoryTone,
  shortModelLabel,
} from "./utils.js";

function renderSetupVaultPresets(s) {
  const wrap = $("#setup-vault-presets-wrap");
  const container = $("#setup-vault-presets");
  if (!wrap || !container) return;
  const presets = (s?.onboarding_presets || []).filter((p) => p.available !== false);
  if (state.setup.mode === "switch") {
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
  if (state.setup.mode === "switch") {
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

export function renderSetupPresets(s) {
  renderSetupVaultPresets(s);
  renderSetupDumpPresets(s);
}

export function renderSetupModelCards() {
  const cardsEl = $("#setup-model-cards");
  const sel = $("#setup-vlm-model");
  if (!cardsEl || !sel) return;
  if (state.setup.mode === "switch") {
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

export async function inspectSetupVault(rawPath) {
  const box = $("#setup-inspect-box");
  const title = $("#setup-inspect-title");
  const detail = $("#setup-inspect-detail");
  const tagsEl = $("#setup-inspect-tags");
  const submitBtn = $("#setup-submit-btn");
  const next2Btn = $("#setup-next-2-btn");
  const trimmed = String(rawPath || "").trim();
  state.setup.lastInspectInfo = null;
  submitBtn.disabled = false;
  if (next2Btn) next2Btn.disabled = false;

  if (!trimmed) {
    box.className = "setup-inspect-box inspect-new";
    title.textContent = "Enter or browse to a Vault folder";
    detail.textContent = "A new folder will be initialized if it does not exist yet.";
    tagsEl.innerHTML = "";
    if (state.setup.mode === "switch") submitBtn.textContent = "Initialize Vault";
    return;
  }

  try {
    const info = await api(`/api/vault/inspect?path=${encodeURIComponent(trimmed)}`);
    state.setup.lastInspectInfo = info;
    tagsEl.innerHTML = "";
    if (info.exists && !info.is_dir) {
      box.className = "setup-inspect-box inspect-err";
      title.textContent = "Path points to a file, not a folder";
      detail.textContent = "Please choose a directory for your Vault.";
      submitBtn.disabled = true;
      if (next2Btn) next2Btn.disabled = true;
      if (state.setup.mode === "switch") submitBtn.textContent = "Open Vault";
      return;
    }
    if (info.version_blocked) {
      box.className = "setup-inspect-box inspect-err";
      title.textContent = `Vault requires a newer Document Vault (v${info.vault_version})`;
      detail.textContent = info.upgrade_warning || "Please update Document Vault to open this vault.";
      submitBtn.disabled = true;
      if (next2Btn) next2Btn.disabled = true;
      if (state.setup.mode === "switch") submitBtn.textContent = "Update Required";
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
      if (state.setup.mode === "switch") submitBtn.textContent = "Upgrade & Open Vault";
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
      if (state.setup.mode === "switch") submitBtn.textContent = "Open Existing Vault";
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
      if (state.setup.mode === "switch") submitBtn.textContent = "Connect & Reconstruct Vault";
    } else {
      box.className = "setup-inspect-box inspect-new";
      title.textContent = info.exists ? "Empty folder — ready for a new Vault" : "New folder — will be created";
      detail.textContent = "Vault configuration (.document_vault/vault.json) will be initialized inside this folder.";
      if (state.setup.mode === "switch") submitBtn.textContent = "Initialize New Vault";
    }
    updateSetupStep3Buttons();
  } catch (err) {
    box.className = "setup-inspect-box inspect-err";
    title.textContent = "Could not inspect folder";
    detail.textContent = err.message;
    tagsEl.innerHTML = "";
  }
}
