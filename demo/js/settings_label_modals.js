/** Rename/merge and cascading delete confirmation modals for Settings labels. */

import { closeAnimatedModal, openConfirmModal, setModalCompact, showAnimatedModal } from "./modals.js";
import {
  loadSettingsIntoForm,
  updatePromptPreviewAndBadge,
  updateSettingsPathPreview,
} from "./settings.js";
import { renderFilingRules } from "./settings_rules.js";
import { $, state } from "./state.js";
import { api, esc, formatLabelDisplay, toast } from "./utils.js";
import { loadVaultDocuments } from "./vault_grid.js";

export function openRenameLabelModal(oldLabel) {
  const modal = $("#doc-modal");
  setModalCompact(true);
  $("#modal-title").textContent = `Rename / Merge Label: ${formatLabelDisplay(oldLabel)}`;
  $("#modal-body").innerHTML = `
    <div class="reclass-modal-body">
      <label class="field">
        <span>New Label Path <small class="muted">(enter an existing label to merge, or a new path like Housing/Utilities)</small></span>
        <input id="rename-label-input" type="text" value="${esc(oldLabel)}" />
      </label>
      <label class="checkbox-field" style="font-size:12.5px;">
        <input id="rename-label-relocate-cb" type="checkbox" checked />
        <span>Also move matching filed documents in the Vault to the new folder</span>
      </label>
      <div class="modal-footer-actions">
        <button id="rename-label-cancel" type="button" class="btn btn-secondary">Cancel</button>
        <button id="rename-label-save" type="button" class="btn btn-primary">Rename / Merge</button>
      </div>
    </div>
  `;
  $("#rename-label-cancel")?.addEventListener("click", () => closeAnimatedModal(modal));
  $("#rename-label-save")?.addEventListener("click", async () => {
    const nextVal = ($("#rename-label-input")?.value || "").trim();
    if (!nextVal) {
      toast("Enter a target label name.", true);
      return;
    }
    const btn = $("#rename-label-save");
    btn.disabled = true;
    btn.textContent = "Applying…";
    try {
      const res = await api("/api/labels/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          old_label: oldLabel,
          new_label: nextVal,
          relocate_files: Boolean($("#rename-label-relocate-cb")?.checked),
        }),
      });
      toast(`Renamed "${formatLabelDisplay(oldLabel)}" → "${formatLabelDisplay(res.new_label)}" (${res.moved_count} moved)`);
      closeAnimatedModal(modal);
      await loadSettingsIntoForm();
      if ($("#tab-vault")?.classList.contains("active")) {
        await loadVaultDocuments({ reason: "refresh", reconcile: false });
      }
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
      btn.textContent = "Rename / Merge";
    }
  });
  showAnimatedModal(modal);
}

export async function deleteCategoryPath(cat, { onAfterDelete } = {}) {
  if (String(cat).toLowerCase() === "other") {
    toast("Cannot remove the fallback 'Other' label.", true);
    return;
  }
  if ((state.settings.categories || []).length <= 1) {
    toast("Keep at least one category.", true);
    return;
  }
  const catLower = String(cat).toLowerCase();
  const catPrefix = `${catLower}/`;
  const hasChildren = (state.settings.categories || []).some((c) => c.toLowerCase().startsWith(catPrefix));
  const hasRules = (state.settings.filing_rules || []).some(
    (r) => String(r.target_label || "").toLowerCase() === catLower || String(r.target_label || "").toLowerCase().startsWith(catPrefix)
  );
  const executeDelete = async (relocateFiles = false) => {
    const res = await api("/api/labels/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: cat,
        reassign_to: "Other",
        relocate_files: relocateFiles,
      }),
    });
    state.settings.categories = res.categories || ["Other"];
    state.settings.filing_rules = res.filing_rules || [];
    if (onAfterDelete) onAfterDelete(catLower);
    renderFilingRules(state.settings.filing_rules);
    updatePromptPreviewAndBadge();
    updateSettingsPathPreview();
    if ($("#tab-vault")?.classList.contains("active")) {
      loadVaultDocuments({ reason: "refresh", reconcile: false });
    }
    toast(`Removed "${formatLabelDisplay(cat)}"${res.moved_count ? ` (${res.moved_count} moved)` : ""}`);
  };

  const isSubLabel = String(cat).includes("/");
  const kindLabel = isSubLabel ? "Sub-label" : "Label";
  const cascadeNote =
    hasChildren || hasRules
      ? " This will also remove any nested sub-labels and linked filing rules."
      : "";

  openConfirmModal({
    title: `Remove ${kindLabel}: ${formatLabelDisplay(cat)}`,
    confirmLabel: `Remove ${kindLabel}`,
    bodyHtml: `
      <p class="muted" style="margin:0;">
        Are you sure you want to remove <strong>${esc(formatLabelDisplay(cat))}</strong>?${cascadeNote}
      </p>
      <label class="checkbox-field" style="font-size:12.5px;">
        <input id="del-label-relocate-cb" type="checkbox" />
        <span>Also move filed documents from this label into <strong>Other</strong></span>
      </label>
    `,
    onConfirm: async () => {
      try {
        await executeDelete(Boolean($("#del-label-relocate-cb")?.checked));
        return true;
      } catch (err) {
        toast(err.message, true);
        return false;
      }
    },
  });
}
