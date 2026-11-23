/** Batch AI reclassify, batch move/re-date, batch ZIP download, and batch delete modals. */

import {
  closeAnimatedModal,
  renderBatchDocRows,
  setModalCompact,
  showAnimatedModal,
} from "./modals.js";
import { loadSettings } from "./settings.js";
import { $, $$, state } from "./state.js";
import {
  api,
  buildCategoryOptions,
  esc,
  extractRuleClue,
  formatLabelDisplay,
  getCategoryTone,
  handleActionError,
  isLicenseRequiredError,
  toast,
} from "./utils.js";
import { clearDocSelection, loadVaultDocuments } from "./vault_grid.js";
import { ensureFastQueuePoll, refreshHealth } from "./vlm.js";
import { renderWatcherTopbar } from "./watcher.js";

export function openBatchReclassifyModal(selectedDocs) {
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
              <div class="reclass-toggle-title">Auto-create new labels immediately</div>
              <div class="reclass-toggle-sub">Off by default: files stay under the best existing label and bundle suggestions for 1-click review</div>
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
      if (isLicenseRequiredError(err)) {
        closeAnimatedModal(modal);
      }
      handleActionError(err);
      btn.disabled = false;
      btn.textContent = `Reclassify ${docLabel}`;
    }
  });

  showAnimatedModal(modal);
}

export function openBatchMoveModal(selectedDocs) {
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

      <div id="batch-learn-rule-box" class="learn-rule-box hidden">
        <label class="checkbox-field" style="font-size:12px;">
          <input id="batch-learn-rule-cb" type="checkbox" />
          <span id="batch-learn-rule-label">Always file similar documents under this label</span>
        </label>
        <input id="batch-learn-rule-kw" class="hidden" type="text" value="${esc(extractRuleClue(selectedDocs[0]?.title, selectedDocs[0]?.original_filename))}" placeholder="Match keywords (comma-separated)" />
      </div>

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
    const learnBox = $("#batch-learn-rule-box");
    const learnLbl = $("#batch-learn-rule-label");
    const learnCb = $("#batch-learn-rule-cb");
    if (learnBox) learnBox.classList.toggle("hidden", !val);
    if (learnLbl && val) {
      learnLbl.textContent = isCustom
        ? "Always file similar documents under the new label"
        : `Always file similar documents under ${formatLabelDisplay(val)}`;
    }
    if (!val && learnCb) learnCb.checked = false;
  }

  $("#batch-learn-rule-cb")?.addEventListener("change", (e) => {
    $("#batch-learn-rule-kw")?.classList.toggle("hidden", !e.target.checked);
  });

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
    const batchBody = {
      doc_ids: selectedDocs.map((d) => Number(d.id)),
      category: targetCat || null,
      date: dateVal ? dateVal : null,
      add_category: rawCat === "__custom__" && Boolean($("#batch-add-cat-cb").checked),
      relocate_only: relocateOnly,
    };
    if (targetCat && $("#batch-learn-rule-cb")?.checked) {
      const kwRaw = ($("#batch-learn-rule-kw")?.value || "").trim();
      const kws = kwRaw ? kwRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
      if (kws.length) {
        batchBody.learn_rule = {
          target_label: targetCat,
          match_keywords: kws,
          instruction: `Documents matching ${kws.join(", ")}`,
        };
      }
    }
    try {
      const res = await api("/api/documents/batch/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batchBody),
      });
      if ((rawCat === "__custom__" && $("#batch-add-cat-cb").checked) || batchBody.learn_rule) {
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

export async function downloadSelectedZip(selectedDocs) {
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

export function openBatchDeleteModal(selectedDocs) {
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
      refreshHealth();
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
      btn.textContent = `Delete ${selectedDocs.length} Permanently`;
    }
  });
  showAnimatedModal(modal);
}
