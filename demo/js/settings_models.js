/** MLX model catalog selector, download progress polling, RAM unload, delete, and third-party licenses modal. */

import { closeAnimatedModal, setModalCompact, showAnimatedModal } from "./modals.js";
import { updateSetupStep3Buttons } from "./onboarding.js";
import { renderSetupModelCards } from "./onboarding_presets.js";
import { saveSettingsAuto } from "./settings.js";
import { $, state } from "./state.js";
import {
  api,
  esc,
  formatBytesGiB,
  shortModelLabel,
  toast,
} from "./utils.js";
import { getRecommendedModelInfo, refreshHealth, syncRamClock } from "./vlm.js";

let modelDownloadPollTimer = null;
let lastDownloadNotifiedId = "";

export function findCatalogModel(modelId) {
  return (state.models || []).find((m) => m.name === modelId) || null;
}

export function updateModelSelectButtons() {
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

export function updateRuntimeActionButtons(vlm) {
  const unloadBtn = $("#unload-model-btn");
  if (unloadBtn) {
    unloadBtn.classList.toggle("hidden", !vlm?.loaded_model);
  }
  updateModelSelectButtons();
}

export function renderDownloadProgress(dl) {
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

export async function startModelDownload(modelId) {
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

export async function fetchVlmModels(targetSelect = $("#set-vlm-model")) {
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
  if (!current && sel === $("#setup-vlm-model") && state.setup.mode !== "switch") {
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

export function initModelSettingsListeners() {
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
}
