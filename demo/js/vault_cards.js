/** Vault document card rendering, FLIP exit ghosts, incremental append, and empty-vault quickstart. */

import { openSetupModal } from "./onboarding.js";
import { findCatalogModel, startModelDownload } from "./settings_models.js";
import { $, state } from "./state.js";
import { switchTab } from "./tabs.js";
import {
  api,
  esc,
  formatBytesGiB,
  formatLabelDisplay,
  formatRelativeOrShortTime,
  getCategoryTone,
  prefersReducedMotion,
  renderReliabilityTag,
  shortModelLabel,
  toast,
} from "./utils.js";
import { loadVaultDocuments, updateBatchActionBar } from "./vault_grid.js";
import { ensureModelsLoaded, getSelectedOrRecommendedModelId, refreshHealth } from "./vlm.js";
import { openFolderInFinder, renderWatcherTopbar, trySampleDocument } from "./watcher.js";

// ── Vault Browser Tab ─────────────────────────────────────────────────────
function getDocCardSig(doc) {
  const thumb = doc.preview_images?.[0] || "";
  const labelsSig = Array.isArray(doc.labels) && doc.labels.length ? doc.labels.join(",") : (doc.category || "");
  return `${doc.title}|${doc.category}|${labelsSig}|${doc.doc_date || ""}|${doc.vault_rel_path || ""}|${thumb}|${doc.suggested_new_label || ""}|${doc.reliability_status || ""}|${doc.created_at || ""}`;
}

function buildVaultCardInnerHtml(doc, isSelected) {
  const thumb = doc.preview_images?.[0] ? `/api/previews/${encodeURIComponent(doc.preview_images[0])}` : "";
  const labels = Array.isArray(doc.labels) && doc.labels.length ? doc.labels : String(doc.category || "Other").split("/").filter(Boolean);
  const labelButtonsHtml = labels
    .map((lbl, idx) => {
      const prefixPath = labels.slice(0, idx + 1).join("/");
      const tone = getCategoryTone(prefixPath);
      return `<button type="button" class="tag tag-cat-btn ${tone}" data-category="${esc(prefixPath)}" title="Show all ${esc(formatLabelDisplay(prefixPath))} documents">${esc(lbl)}</button>`;
    })
    .join("");
  const relBadgeHtml = renderReliabilityTag(doc, { quietIfVerified: true });
  const sugBadgeHtml = doc.suggested_new_label
    ? `<button type="button" class="tag tag-sug-pill btn-doc-suggestion" data-suggested="${esc(doc.suggested_new_label)}" title="AI suggests moving to ${esc(formatLabelDisplay(doc.suggested_new_label))} — click to inspect or move">+ ${esc(formatLabelDisplay(doc.suggested_new_label))}?</button>`
    : "";
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
        ${relBadgeHtml}
        ${sugBadgeHtml}
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

export function syncVaultCardElement(card, doc) {
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

export function appendVaultCards(newDocs) {
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

export function renderVaultGrid(docs, { animateMode = "filter" } = {}) {
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
