/** Vault document loading, pagination, selection/batch bar, observers, and vault DOM listeners. */

import {
  downloadSelectedZip,
  openBatchDeleteModal,
  openBatchMoveModal,
  openBatchReclassifyModal,
} from "./batch_modals.js";
import { openDeleteConfirmModal, openDocModal } from "./doc_modal.js";
import { $, $$, VAULT_PAGE_SIZE, VAULT_RECONCILE_THROTTLE_MS, state } from "./state.js";
import { api, toast } from "./utils.js";
import { appendVaultCards, renderVaultGrid } from "./vault_cards.js";
import {
  loadLabelSuggestions,
  openBundleInspectorModal,
  populateVaultFacets,
  renderVaultTagBar,
  syncVaultTagBarActive,
  updateNeedsCheckFilterBtn,
  updateSuggestedFilterChip,
} from "./vault_tags.js";
import { openFullFilePreview } from "./viewer.js";

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

export async function loadVaultDocuments(opts = {}) {
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
  const relFilter = state.vaultReliability || "";
  const sugFilter = state.vaultSuggestedLabel || "";
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
  if (relFilter) params.set("reliability", relFilter);
  if (sugFilter) params.set("suggested_label", sugFilter);
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

    const facets = data.facets || { categories: [], category_counts: {}, label_tree: [], total_count: 0, years: [] };
    const total = data.total ?? docs.length;
    const hasMore = Boolean(data.has_more);
    const renderSig = JSON.stringify({
      q,
      cat,
      year,
      relFilter,
      sugFilter,
      sort,
      total,
      hasMore,
      docs: docs.map((d) => [d.id, d.updated_at, d.category, d.doc_date, d.title, d.vault_rel_path, d.suggested_new_label, d.reliability_status]),
      facets: [facets.total_count, facets.category_counts, facets.years, facets.needs_check_count, facets.suggested_bundles_count],
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
    state.lastFacets = facets;

    state.selectedDocIds = new Set(
      Array.from(state.selectedDocIds).filter((id) => state.vaultDocsById.has(id))
    );
    state.lastSelectedDocIdx = null;

    populateVaultFacets(facets, cat, year);
    updateNeedsCheckFilterBtn(facets);
    updateSuggestedFilterChip();
    renderVaultTagBar(facets, cat, animateMode === "open");
    renderVaultGrid(state.vaultDocs, { animateMode });
    updateVaultPaginationUI();
    updateBatchActionBar();
    loadLabelSuggestions();

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

function getSelectedVaultDocs() {
  return state.vaultDocs.filter((d) => state.selectedDocIds.has(Number(d.id)));
}

export function updateBatchActionBar() {
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

export function clearDocSelection() {
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

export function initVaultListeners() {
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

  $("#vault-needs-check-btn")?.addEventListener("click", () => {
    state.vaultReliability = state.vaultReliability === "needs_check" ? "" : "needs_check";
    loadVaultDocuments({ reason: "filter" });
  });

  $("#vault-sug-filter-chip")?.addEventListener("click", () => {
    state.vaultSuggestedLabel = "";
    loadVaultDocuments({ reason: "filter" });
  });

  $("#vault-tag-bar").addEventListener("click", (e) => {
    const pill = e.target.closest(".vault-tag-pill");
    if (!pill) return;
    const catValue = pill.dataset.category || "";
    if (catValue === "") {
      if (state.vaultCategory === "" && !state.vaultSuggestedLabel && !state.vaultReliability) return;
      state.vaultCategory = "";
      state.vaultSuggestedLabel = "";
      state.vaultReliability = "";
    } else {
      if (state.vaultCategory === catValue) return;
      state.vaultCategory = catValue;
    }
    syncVaultTagBarActive(catValue);
    loadVaultDocuments({ reason: "filter" });
  });

  $("#vault-subtag-bar")?.addEventListener("click", (e) => {
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

    if (e.target.closest(".btn-doc-suggestion")) {
      const sug = e.target.closest(".btn-doc-suggestion").dataset.suggested || doc.suggested_new_label;
      if (sug) openBundleInspectorModal(sug);
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
      return;
    }
    if (e.target.closest(".btn-preview-doc")) {
      openFullFilePreview(`/api/documents/${doc.id}/file`, doc.title, doc.vault_rel_path, { docId: doc.id });
      return;
    }
    if (e.target.closest("button, a, input, label, select, textarea")) {
      return;
    }
    if (typeof window !== "undefined" && typeof window.getSelection === "function") {
      const sel = window.getSelection();
      if (sel && String(sel).trim()) return;
    }
    openFullFilePreview(`/api/documents/${doc.id}/file`, doc.title, doc.vault_rel_path, { docId: doc.id });
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
}
