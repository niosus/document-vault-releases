/** Background watcher topbar, live queue panel, manual scan, Finder reveal, sample PDF, and global drop. */

import { renderActivityLog } from "./activity_log.js";
import { renderLicenseState } from "./license.js";
import { loadReviewQueue } from "./review.js";
import { loadSettings, settingsSaveInFlight } from "./settings.js";
import { $, state } from "./state.js";
import { navigateToVaultDocument } from "./tabs.js";
import {
  api,
  getConfidenceThresholdPct,
  handleActionError,
  toast,
} from "./utils.js";
import { loadVaultDocuments } from "./vault_grid.js";
import {
  ensureFastQueuePoll,
  getModelReadinessState,
  openModelRequiredPrompt,
  refreshHealth,
  stopFastQueuePoll,
  updateReviewBadge,
} from "./vlm.js";

export function renderWatcherTopbar(w, { skipReviewReload = false } = {}) {
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
      refreshHealth();
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
  resolved: { label: "Resolved", cls: "tag-ok" },
  skipped: { label: "Skipped", cls: "" },
  cancelled: { label: "Stopped", cls: "tag-danger" },
  license_required: { label: "License Needed", cls: "tag-warn" },
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

export async function openFolderInFinder(target = "dump") {
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

export async function trySampleDocument(deferOverride = false) {
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
    handleActionError(err);
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
    handleActionError(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "Scan Now";
  }
}

let dragDepth = 0;

function isFileDragEvent(e) {
  const types = e.dataTransfer?.types;
  return Boolean(types && Array.from(types).includes("Files"));
}

function hideGlobalDropOverlay() {
  dragDepth = 0;
  $("#global-drop-overlay")?.classList.add("hidden");
}

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
    if (res.license) {
      renderLicenseState(res.license);
    }
  } catch (err) {
    handleActionError(err);
  }
}

export function initWatcherListeners() {
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
  $("#scan-now-btn").addEventListener("click", () => runManualScan(false));
  const globalFileInput = $("#global-file-input");
  const globalDropIndicator = $("#global-drop-indicator");
  globalDropIndicator.addEventListener("click", () => globalFileInput.click());
  globalFileInput.addEventListener("change", () => {
    if (globalFileInput.files?.length) enqueueDroppedFiles(globalFileInput.files);
    globalFileInput.value = "";
  });

  window.addEventListener("dragenter", (e) => {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    dragDepth += 1;
    $("#global-drop-overlay")?.classList.remove("hidden");
  });

  window.addEventListener("dragover", (e) => {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    $("#global-drop-overlay")?.classList.remove("hidden");
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
}
