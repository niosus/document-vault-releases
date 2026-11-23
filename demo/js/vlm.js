/** Health polling, MLX RAM keep-alive clock, VLM status banner, popover, and model-required prompt. */

import { renderLicenseState } from "./license.js";
import { closeAnimatedModal, setModalCompact, showAnimatedModal } from "./modals.js";
import { loadReviewQueue } from "./review.js";
import {
  fetchVlmModels,
  findCatalogModel,
  renderDownloadProgress,
  startModelDownload,
  updateRuntimeActionButtons,
} from "./settings_models.js";
import { $, state } from "./state.js";
import { switchTab, updateTabIndicator } from "./tabs.js";
import {
  api,
  esc,
  formatBytesGiB,
  formatUnloadTooltip,
  shortModelLabel,
  toast,
} from "./utils.js";
import { renderVaultGrid } from "./vault_cards.js";
import { renderWatcherTopbar } from "./watcher.js";

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

export function syncRamClock(vlm) {
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
export async function refreshHealth() {
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
    if (h.license) {
      state.license = h.license;
      renderLicenseState(h.license);
    }
    const watcherBlocked = Boolean(h.watcher?.license_blocked);
    if (watcherBlocked && !state.lastWatcherLicenseBlocked) {
      toast(
        h.watcher?.license_block_message ||
          "Free tier limit reached. Activate a license or delete a document to continue.",
        true
      );
    }
    state.lastWatcherLicenseBlocked = watcherBlocked;
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

export function updateReviewBadge(count) {
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

export function ensureFastQueuePoll() {
  if (state.fastPollTimer) return;
  state.fastPollTimer = setInterval(refreshHealth, 650);
}

export function stopFastQueuePoll() {
  if (!state.fastPollTimer) return;
  clearInterval(state.fastPollTimer);
  state.fastPollTimer = null;
}

export function getRecommendedModelInfo() {
  const models = state.models || [];
  return (
    models.find((m) => m.recommended_for_device) ||
    models.find((m) => m.downloaded) ||
    models[0] ||
    null
  );
}

export function getSelectedOrRecommendedModelId(vlm = state.latestHealth?.vlm) {
  const selected = String(vlm?.selected_model || state.settings?.vlm_model || "").trim();
  if (selected) return selected;
  const rec = getRecommendedModelInfo();
  return rec ? rec.name : "";
}

export async function ensureModelsLoaded() {
  if (!state.models || state.models.length === 0) {
    try {
      await fetchVlmModels($("#set-vlm-model"));
    } catch {
      // ignore
    }
  }
}

export function getModelReadinessState(h = state.latestHealth) {
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

export function openModelRequiredPrompt({
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

export function initVlmListeners() {
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
}
