/** Filed document inspect/edit/reclassify modal and single-document delete confirmation modal. */

import { closeLicenseModal } from "./license.js";
import { closeAnimatedModal, setModalCompact, showAnimatedModal } from "./modals.js";
import { animatePageRotation, buildRotateButtonsHtml, rotateVaultDocumentPage } from "./page_rotation.js";
import { loadSettings } from "./settings.js";
import { $, state } from "./state.js";
import {
  api,
  buildCategoryOptions,
  esc,
  extractRuleClue,
  formatLabelDisplay,
  getPreviewPageNumber,
  handleActionError,
  isLicenseRequiredError,
  renderReliabilityTag,
  toast,
} from "./utils.js";
import { loadVaultDocuments } from "./vault_grid.js";
import { openBundleInspectorModal } from "./vault_tags.js";
import { openFullFilePreview } from "./viewer.js";
import { refreshHealth } from "./vlm.js";

export function openDeleteConfirmModal(doc) {
  const modal = $("#doc-modal");
  setModalCompact(true);
  $("#modal-title").textContent = "Confirm Permanent Deletion";
  $("#modal-body").innerHTML = `
    <div style="display:flex; flex-direction:column; gap:14px;">
      <p style="margin:0;">
        Are you sure you want to permanently delete <strong>${esc(doc.title)}</strong> (${esc(doc.category)}) from your Vault?
      </p>
      <div class="field">
        <span>Exact File Path to Delete</span>
        <div class="danger-path-box">${esc(doc.vault_abs_path)}</div>
      </div>
      <p class="muted">
        This deletes only the file at the path shown above and removes its index entry. Any original file archived in your dump folder's <code>_processed/</code> directory will not be deleted.
      </p>
      <div class="action-buttons" style="justify-content:flex-end;">
        <button id="cancel-delete-btn" type="button" class="btn btn-secondary">Cancel</button>
        <button id="confirm-delete-btn" type="button" class="btn btn-danger">Delete Permanently</button>
      </div>
    </div>
  `;
  $("#cancel-delete-btn").addEventListener("click", () => closeAnimatedModal(modal));
  $("#confirm-delete-btn").addEventListener("click", async () => {
    const btn = $("#confirm-delete-btn");
    btn.disabled = true;
    btn.textContent = "Deleting…";
    try {
      await api(`/api/documents/${doc.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_path: doc.vault_abs_path }),
      });
      toast(`Deleted ${doc.vault_rel_path}`);
      closeAnimatedModal(modal);
      loadVaultDocuments();
      refreshHealth();
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
      btn.textContent = "Delete Permanently";
    }
  });
  showAnimatedModal(modal);
}

export function openDocModal(doc) {
  const modal = $("#doc-modal");
  setModalCompact(false);
  $("#modal-title").textContent = doc.title;
  let currentImgs = [...(doc.preview_images || [])];
  let activePageIdx = 0;
  let modalRotating = false;
  const firstImg = currentImgs[0] ? `/api/previews/${encodeURIComponent(currentImgs[0])}` : "";
  const datePlaceholder = state.settings?.date_format || "YYYY-MM-DD";

  $("#modal-body").innerHTML = `
    <div class="doc-card" style="box-shadow:none; border:none; padding:0;">
      <div class="preview-pane">
        <div class="preview-frame" title="Click to preview full document">
          ${firstImg ? `<img class="preview-img" src="${firstImg}" alt="Preview" />` : `<span class="muted">No preview</span>`}
        </div>
        <div class="page-switcher preview-pane-controls">
          ${
            currentImgs.length > 1
              ? currentImgs.map((imgName, i) => `<button type="button" class="btn btn-sm btn-secondary page-btn ${i === 0 ? "btn-primary" : ""}" data-idx="${i}">Page ${getPreviewPageNumber(imgName, i)}</button>`).join("")
              : ""
          }
          <div class="preview-rotate-inline">
            ${buildRotateButtonsHtml({ compact: true })}
          </div>
        </div>
      </div>
      <div class="doc-meta-pane">
        <div class="doc-card-header">
          <div style="display:flex; flex-direction:column; gap:4px;">
            <div class="muted">Original: ${esc(doc.original_filename)} · Source: ${esc(doc.source_mode)}</div>
            <div class="tag-row">
              ${renderReliabilityTag(doc)}
              ${Array.isArray(doc.reliability_reasons) && doc.reliability_reasons.length ? `<span class="muted" style="font-size:11.5px;">${esc(doc.reliability_reasons.join(" · "))}</span>` : ""}
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <button id="modal-reclassify-btn" type="button" class="btn btn-secondary btn-sm">Reclassify with AI</button>
          </div>
        </div>
        ${
          doc.suggested_new_label
            ? `<div id="modal-doc-suggestion-banner" class="banner-warn banner-warn-row" style="align-items:center;">
                 <div>
                   <strong>Suggested New Label:</strong> <code>${esc(formatLabelDisplay(doc.suggested_new_label))}</code>
                 </div>
                 <div style="display:flex; gap:6px;">
                   <button id="modal-apply-sug-btn" type="button" class="btn btn-primary btn-xs">Create &amp; Move</button>
                   <button id="modal-inspect-sug-btn" type="button" class="btn btn-secondary btn-xs">Inspect Bundle</button>
                   <button id="modal-dismiss-sug-btn" type="button" class="btn btn-secondary btn-xs">Dismiss</button>
                 </div>
               </div>`
            : ""
        }
        <div id="modal-reclassify-result" class="reclassify-ai-box hidden"></div>
        <div class="form-grid-3">
          <label class="field">
            <span>Date</span>
            <input id="modal-date" type="text" value="${esc(doc.doc_date || "")}" placeholder="${esc(datePlaceholder)}" />
          </label>
          <label class="field">
            <span>Label</span>
            <select id="modal-cat">${buildCategoryOptions(doc.category)}</select>
          </label>
          <label class="field">
            <span>Title</span>
            <input id="modal-title-input" type="text" value="${esc(doc.title)}" />
          </label>
        </div>
        <label id="modal-add-cat-row" class="checkbox-field hidden" style="font-size:12px;">
          <input id="modal-add-cat-cb" type="checkbox" />
          <span id="modal-add-cat-label">Add label to saved Settings</span>
        </label>
        <div id="modal-learn-rule-box" class="learn-rule-box hidden">
          <label class="checkbox-field" style="font-size:12px;">
            <input id="modal-learn-rule-cb" type="checkbox" />
            <span id="modal-learn-rule-label">Always file similar documents under this label</span>
          </label>
          <input id="modal-learn-rule-kw" class="hidden" type="text" value="${esc(extractRuleClue(doc.title, doc.original_filename))}" placeholder="Match keyword or sender (e.g. Telekom)" />
        </div>
        <div class="path-preview-box">
          <span class="muted">Target Path:</span>
          <code id="modal-target-path">${esc(doc.vault_rel_path)}</code>
        </div>
        <div class="action-buttons">
          <button id="modal-save-btn" type="button" class="btn btn-primary">Save &amp; Relocate Copy</button>
          <button id="modal-preview-btn" type="button" class="btn btn-secondary">Preview PDF / Full</button>
          <button id="modal-delete-btn" type="button" class="btn btn-ghost-danger">Delete…</button>
        </div>
      </div>
    </div>
  `;
  const modalBodyEl = $("#modal-body");
  modalBodyEl.querySelectorAll(".page-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activePageIdx = Number(btn.dataset.idx) || 0;
      const imgEl = modalBodyEl.querySelector(".preview-img");
      if (imgEl && currentImgs[activePageIdx]) {
        imgEl.src = `/api/previews/${encodeURIComponent(currentImgs[activePageIdx])}`;
      }
      modalBodyEl.querySelectorAll(".page-btn").forEach((b) => b.classList.remove("btn-primary"));
      btn.classList.add("btn-primary");
    });
  });

  const previewFrameEl = modalBodyEl.querySelector(".preview-frame");
  if (previewFrameEl) {
    previewFrameEl.addEventListener("click", () =>
      openFullFilePreview(`/api/documents/${doc.id}/file`, doc.title, doc.vault_rel_path, { docId: doc.id })
    );
  }

  modalBodyEl.querySelectorAll(".preview-rotate-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (modalRotating) return;
      const angle = Number(btn.dataset.angle || 90);
      const targetPage = getPreviewPageNumber(currentImgs[activePageIdx], activePageIdx);
      const imgEl = modalBodyEl.querySelector(".preview-img");
      modalRotating = true;
      modalBodyEl.querySelectorAll(".preview-rotate-btn").forEach((b) => { b.disabled = true; });
      try {
        if (imgEl && previewFrameEl) {
          await animatePageRotation({
            imgEl,
            containerEl: previewFrameEl,
            angle,
            mode: "contain",
            onRequest: () => rotateVaultDocumentPage(doc.id, targetPage, angle),
            getNextSrc: (res) => {
              if (res.document) {
                currentImgs = [...(res.document.preview_images || currentImgs)];
                doc.preview_images = currentImgs;
                doc.sha256 = res.document.sha256;
                doc.updated_at = res.document.updated_at;
              }
              const nextName = currentImgs[activePageIdx];
              return nextName ? `/api/previews/${encodeURIComponent(nextName)}` : imgEl.src;
            },
          });
        } else {
          const res = await rotateVaultDocumentPage(doc.id, targetPage, angle);
          if (!modalBodyEl.isConnected) return;
          if (res.document) {
            currentImgs = [...(res.document.preview_images || currentImgs)];
            doc.preview_images = currentImgs;
            doc.sha256 = res.document.sha256;
            doc.updated_at = res.document.updated_at;
          }
        }
        if (!modalBodyEl.isConnected) return;
        const dirLabel = angle === -90 ? "90° left" : angle === 180 ? "180°" : "90° right";
        toast(`Rotated page ${targetPage} ${dirLabel} and updated file`);
      } catch (err) {
        toast(err.message, true);
      } finally {
        modalRotating = false;
        if (modalBodyEl.isConnected) {
          modalBodyEl.querySelectorAll(".preview-rotate-btn").forEach((b) => { b.disabled = false; });
        }
      }
    });
  });

  async function refreshModalTargetPath() {
    const targetEl = $("#modal-target-path");
    if (!targetEl) return;
    try {
      const { rel_path } = await api("/api/intake/preview-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: $("#modal-date").value,
          category: $("#modal-cat").value,
          title: $("#modal-title-input").value,
          filename: doc.vault_rel_path || doc.original_filename || "document.pdf",
        }),
      });
      targetEl.textContent = rel_path;
    } catch {
      // ignore preview errors
    }
  }

  function syncModalAddCatRow() {
    const chosenCat = $("#modal-cat").value;
    const addRow = $("#modal-add-cat-row");
    const addCb = $("#modal-add-cat-cb");
    const isKnownCat = (state.settings?.categories || []).some(
      (c) => c.toLowerCase() === String(chosenCat).toLowerCase()
    );
    if (!isKnownCat && chosenCat) {
      addRow.classList.remove("hidden");
      addCb.checked = true;
      $("#modal-add-cat-label").textContent = `Add "${formatLabelDisplay(chosenCat)}" to saved labels`;
    } else {
      addRow.classList.add("hidden");
      addCb.checked = false;
    }
    const learnBox = $("#modal-learn-rule-box");
    const learnCb = $("#modal-learn-rule-cb");
    const learnKw = $("#modal-learn-rule-kw");
    const learnLbl = $("#modal-learn-rule-label");
    const catChanged = String(chosenCat).toLowerCase() !== String(doc.category || "").toLowerCase();
    if (learnBox) {
      learnBox.classList.toggle("hidden", !catChanged && !learnCb?.checked);
    }
    if (learnLbl) {
      learnLbl.textContent = `Always file similar documents under ${formatLabelDisplay(chosenCat)}`;
    }
    if (learnKw && learnCb) {
      learnKw.classList.toggle("hidden", !learnCb.checked);
    }
  }

  $("#modal-learn-rule-cb")?.addEventListener("change", syncModalAddCatRow);

  $("#modal-apply-sug-btn")?.addEventListener("click", async () => {
    try {
      await api("/api/labels/suggestions/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggested_label: doc.suggested_new_label,
          doc_ids: [doc.id],
        }),
      });
      toast(`Moved -> ${formatLabelDisplay(doc.suggested_new_label)}`);
      closeAnimatedModal(modal);
      await loadSettings();
      await loadVaultDocuments({ reason: "refresh", reconcile: false });
    } catch (err) {
      toast(err.message, true);
    }
  });
  $("#modal-inspect-sug-btn")?.addEventListener("click", () => {
    openBundleInspectorModal(doc.suggested_new_label);
  });
  $("#modal-dismiss-sug-btn")?.addEventListener("click", async () => {
    try {
      await api("/api/labels/suggestions/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggested_label: doc.suggested_new_label, doc_ids: [doc.id] }),
      });
      $("#modal-doc-suggestion-banner")?.remove();
      toast("Suggestion dismissed");
      loadVaultDocuments({ reason: "filter", reconcile: false });
    } catch (err) {
      toast(err.message, true);
    }
  });

  ["#modal-date", "#modal-cat", "#modal-title-input"].forEach((sel) => {
    $(sel).addEventListener("input", refreshModalTargetPath);
    $(sel).addEventListener("change", refreshModalAddCatAndPath);
  });

  function refreshModalAddCatAndPath() {
    syncModalAddCatRow();
    refreshModalTargetPath();
  }

  $("#modal-reclassify-btn").addEventListener("click", async () => {
    const btn = $("#modal-reclassify-btn");
    const prevLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Reclassifying…";
    try {
      const res = await api(`/api/documents/${doc.id}/reclassify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: false }),
      });
      const sug = res.suggestion || {};
      const suggestedNew = sug.suggested_new_category;
      const chosenCat = suggestedNew || sug.category || doc.category;
      const relTagHtml = renderReliabilityTag({
        reliability_status: sug.reliability?.status,
        reliability_reasons: sug.reliability?.reasons,
        confidence: sug.confidence,
      });

      $("#modal-cat").innerHTML = buildCategoryOptions(chosenCat, suggestedNew);
      $("#modal-cat").value = chosenCat;
      if (sug.date !== undefined) $("#modal-date").value = sug.date || "";
      if (sug.title) $("#modal-title-input").value = sug.title;

      syncModalAddCatRow();

      const box = $("#modal-reclassify-result");
      box.classList.remove("hidden");
      box.innerHTML = `
        <div class="reclassify-ai-head">
          <strong>AI Classification Suggestion</strong>
          <div class="tag-row">
            ${relTagHtml}
            ${suggestedNew ? `<span class="tag tag-info">Suggested New Label: ${esc(formatLabelDisplay(suggestedNew))}</span>` : ""}
          </div>
        </div>
        ${sug.reason ? `<div class="muted">${esc(sug.reason)}</div>` : ""}
        ${
          sug.thinking
            ? `<details class="thinking-details">
                 <summary>Model Thinking</summary>
                 <pre class="thinking-box">${esc(sug.thinking)}</pre>
               </details>`
            : ""
        }
      `;
      await refreshModalTargetPath();
      toast("AI suggestion ready — review and click Save & Relocate Copy");
    } catch (err) {
      if (isLicenseRequiredError(err)) {
        closeAnimatedModal($("#doc-modal"));
      }
      handleActionError(err);
    } finally {
      btn.disabled = false;
      btn.textContent = prevLabel;
    }
  });

  $("#modal-preview-btn").addEventListener("click", () =>
    openFullFilePreview(`/api/documents/${doc.id}/file`, doc.title, doc.vault_rel_path, { docId: doc.id })
  );
  $("#modal-delete-btn").addEventListener("click", () => openDeleteConfirmModal(doc));

  $("#modal-save-btn").addEventListener("click", async () => {
    const btn = $("#modal-save-btn");
    btn.disabled = true;
    const addCategory = Boolean($("#modal-add-cat-cb")?.checked);
    const chosenCat = $("#modal-cat").value;
    const patchPayload = {
      date: $("#modal-date").value.trim(),
      category: chosenCat,
      title: $("#modal-title-input").value.trim(),
      add_category: addCategory,
    };
    if ($("#modal-learn-rule-cb")?.checked) {
      const kwRaw = ($("#modal-learn-rule-kw")?.value || "").trim();
      const kws = kwRaw ? kwRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
      if (kws.length) {
        patchPayload.learn_rule = {
          target_label: chosenCat,
          match_keywords: kws,
          instruction: `Documents matching ${kws.join(", ")}`,
        };
      }
    }
    try {
      const updated = await api(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchPayload),
      });
      if (addCategory || patchPayload.learn_rule) {
        await loadSettings();
      }
      toast(patchPayload.learn_rule ? `Updated & learned rule -> ${updated.vault_rel_path}` : `Updated -> ${updated.vault_rel_path}`);
      closeAnimatedModal(modal);
      loadVaultDocuments();
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
    }
  });

  showAnimatedModal(modal);
}

export function initDocModalListeners() {
  $("#modal-close").addEventListener("click", () => closeAnimatedModal($("#doc-modal")));
  $("#doc-modal .modal-backdrop").addEventListener("click", () => closeAnimatedModal($("#doc-modal")));
  document.addEventListener("keydown", (e) => {
    const licModal = $("#license-modal");
    if (e.key === "Escape" && licModal && !licModal.classList.contains("hidden")) {
      closeLicenseModal();
      return;
    }
    const modal = $("#doc-modal");
    if (!modal || modal.classList.contains("hidden")) return;
    if (e.key === "Escape") {
      closeAnimatedModal(modal);
      return;
    }
    const tag = (e.target && e.target.tagName ? e.target.tagName : "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (e.key === "ArrowLeft") {
      const prevBtn = $("#preview-prev-page");
      if (prevBtn && !prevBtn.disabled) prevBtn.click();
    } else if (e.key === "ArrowRight") {
      const nextBtn = $("#preview-next-page");
      if (nextBtn && !nextBtn.disabled) nextBtn.click();
    }
  });
}
