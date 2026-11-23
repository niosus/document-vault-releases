/** Settings label chips, label rename/merge/delete modal, and filing rules list/form. */

import { closeAnimatedModal, setModalCompact, showAnimatedModal } from "./modals.js";
import {
  loadSettingsIntoForm,
  saveSettingsAuto,
  updatePromptPreviewAndBadge,
  updateSettingsPathPreview,
} from "./settings.js";
import { $, state } from "./state.js";
import {
  api,
  buildCategoryOptions,
  esc,
  formatLabelDisplay,
  getCategoryTone,
  toast,
} from "./utils.js";
import { loadVaultDocuments } from "./vault_grid.js";

function openRenameLabelModal(oldLabel) {
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

export function renderCategoryChips(categories) {
  const container = $("#category-chips");
  if (!container) return;
  container.innerHTML = "";
  const sorted = [...categories].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  sorted.forEach((cat) => {
    const chip = document.createElement("span");
    chip.className = `chip ${getCategoryTone(cat)}`;
    const label = document.createElement("span");
    const parts = String(cat).split("/").filter(Boolean);
    if (parts.length > 1) {
      const prefix = document.createElement("span");
      prefix.className = "chip-parent-prefix";
      prefix.textContent = `${parts.slice(0, -1).join(" / ")} / `;
      const leaf = document.createElement("span");
      leaf.textContent = parts[parts.length - 1];
      label.appendChild(prefix);
      label.appendChild(leaf);
    } else {
      label.textContent = cat;
    }

    const addSubBtn = document.createElement("button");
    addSubBtn.type = "button";
    addSubBtn.className = "chip-action-btn";
    addSubBtn.title = `Add sub-label under ${cat}`;
    addSubBtn.textContent = "+";
    addSubBtn.addEventListener("click", () => {
      const inp = $("#new-category-input");
      if (inp) {
        inp.value = `${cat}/`;
        inp.focus();
      }
    });

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "chip-action-btn";
    renameBtn.title = `Rename or merge ${cat}`;
    renameBtn.textContent = "✎";
    renameBtn.addEventListener("click", () => openRenameLabelModal(cat));

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.title = "Remove";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", async () => {
      if (String(cat).toLowerCase() === "other") {
        toast("Cannot remove the fallback 'Other' label.", true);
        return;
      }
      if (state.settings.categories.length <= 1) {
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
        renderCategoryChips(state.settings.categories);
        renderFilingRules(state.settings.filing_rules);
        updatePromptPreviewAndBadge();
        updateSettingsPathPreview();
        if ($("#tab-vault")?.classList.contains("active")) {
          loadVaultDocuments({ reason: "refresh", reconcile: false });
        }
        toast(`Removed "${formatLabelDisplay(cat)}"${res.moved_count ? ` (${res.moved_count} moved)` : ""}`);
      };

      if (hasChildren || hasRules) {
        const modal = $("#doc-modal");
        setModalCompact(true);
        $("#modal-title").textContent = `Delete Label: ${formatLabelDisplay(cat)}`;
        $("#modal-body").innerHTML = `
          <div class="reclass-modal-body">
            <p class="muted" style="margin:0;">
              Deleting <strong>${esc(formatLabelDisplay(cat))}</strong> will also remove any nested sub-labels and linked filing rules.
            </p>
            <label class="checkbox-field" style="font-size:12.5px;">
              <input id="del-label-relocate-cb" type="checkbox" />
              <span>Also move filed documents from this label into <strong>Other</strong></span>
            </label>
            <div class="modal-footer-actions">
              <button id="del-label-cancel" type="button" class="btn btn-secondary">Cancel</button>
              <button id="del-label-confirm" type="button" class="btn btn-danger">Delete Label</button>
            </div>
          </div>
        `;
        $("#del-label-cancel")?.addEventListener("click", () => closeAnimatedModal(modal));
        $("#del-label-confirm")?.addEventListener("click", async () => {
          const btn = $("#del-label-confirm");
          btn.disabled = true;
          try {
            await executeDelete(Boolean($("#del-label-relocate-cb")?.checked));
            closeAnimatedModal(modal);
          } catch (err) {
            toast(err.message, true);
            btn.disabled = false;
          }
        });
        showAnimatedModal(modal);
        return;
      }

      try {
        await executeDelete(false);
      } catch (err) {
        toast(err.message, true);
      }
    });

    chip.appendChild(label);
    chip.appendChild(addSubBtn);
    chip.appendChild(renameBtn);
    chip.appendChild(removeBtn);
    container.appendChild(chip);
  });
  const ruleTargetSel = $("#rule-target-select");
  if (ruleTargetSel) {
    ruleTargetSel.innerHTML = buildCategoryOptions(ruleTargetSel.value || (categories[0] || "Other"));
  }
}

export function renderFilingRules(rules) {
  const listEl = $("#filing-rules-list");
  if (!listEl) return;
  const ruleTargetSel = $("#rule-target-select");
  if (ruleTargetSel) {
    ruleTargetSel.innerHTML = buildCategoryOptions(ruleTargetSel.value || (state.settings?.categories?.[0] || "Other"));
  }
  if (!rules || !rules.length) {
    listEl.innerHTML = `<div class="muted" style="font-size:12px;">No filing rules yet. Teach the organizer by changing a document's label or adding a rule above.</div>`;
    return;
  }
  listEl.innerHTML = "";
  rules.forEach((rule) => {
    const row = document.createElement("div");
    row.className = "filing-rule-row";
    const kws = Array.isArray(rule.match_keywords) && rule.match_keywords.length
      ? `<code>${esc(rule.match_keywords.join(", "))}</code>`
      : "";
    const instr = rule.instruction ? `<span class="muted">${esc(rule.instruction)}</span>` : "";
    row.innerHTML = `
      <div class="filing-rule-main">
        <input type="checkbox" class="rule-enabled-cb" ${rule.enabled !== false ? "checked" : ""} title="Enable or disable rule" />
        ${kws}
        ${instr}
        <span class="muted">→</span>
        <span class="tag ${getCategoryTone(rule.target_label)}">${esc(formatLabelDisplay(rule.target_label))}</span>
      </div>
      <div class="filing-rule-actions">
        <button type="button" class="btn btn-ghost-danger btn-xs rule-delete-btn">Delete</button>
      </div>
    `;
    row.querySelector(".rule-enabled-cb")?.addEventListener("change", async (e) => {
      try {
        const res = await api("/api/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...rule, enabled: e.target.checked }),
        });
        state.settings.filing_rules = res.rules || [];
        toast(e.target.checked ? "Rule enabled" : "Rule paused");
      } catch (err) {
        toast(err.message, true);
        e.target.checked = !e.target.checked;
      }
    });
    row.querySelector(".rule-delete-btn")?.addEventListener("click", async () => {
      try {
        const res = await api(`/api/rules/${encodeURIComponent(rule.id)}`, { method: "DELETE" });
        state.settings.filing_rules = res.rules || [];
        renderFilingRules(state.settings.filing_rules);
        toast("Filing rule deleted");
      } catch (err) {
        toast(err.message, true);
      }
    });
    listEl.appendChild(row);
  });
}

function addCategoryFromInput() {
  const inp = $("#new-category-input");
  const val = inp.value
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("/");
  if (!val) return;
  if (!state.settings.categories.some((c) => c.toLowerCase() === val.toLowerCase())) {
    state.settings.categories.push(val);
    renderCategoryChips(state.settings.categories);
    updatePromptPreviewAndBadge();
    saveSettingsAuto();
  }
  inp.value = "";
}

export function initTaxonomySettingsListeners() {
  $("#add-rule-toggle-btn")?.addEventListener("click", () => {
    const form = $("#add-rule-form");
    if (!form) return;
    form.classList.toggle("hidden");
    const targetSel = $("#rule-target-select");
    if (targetSel) {
      targetSel.innerHTML = buildCategoryOptions(targetSel.value || (state.settings?.categories?.[0] || "Other"));
    }
  });
  $("#rule-cancel-btn")?.addEventListener("click", () => {
    $("#add-rule-form")?.classList.add("hidden");
  });
  $("#rule-save-btn")?.addEventListener("click", async () => {
    const kwRaw = ($("#rule-keywords-input")?.value || "").trim();
    const instr = ($("#rule-instruction-input")?.value || "").trim();
    const target = $("#rule-target-select")?.value || "Other";
    const matchKeywords = kwRaw ? kwRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
    if (!matchKeywords.length && !instr) {
      toast("Enter match keywords or an AI description.", true);
      return;
    }
    try {
      const res = await api("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_keywords: matchKeywords,
          instruction: instr,
          target_label: target,
          enabled: true,
        }),
      });
      state.settings.filing_rules = res.rules || [];
      if ($("#rule-keywords-input")) $("#rule-keywords-input").value = "";
      if ($("#rule-instruction-input")) $("#rule-instruction-input").value = "";
      $("#add-rule-form")?.classList.add("hidden");
      renderFilingRules(state.settings.filing_rules);
      toast("Filing rule saved");
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#add-category-btn").addEventListener("click", addCategoryFromInput);
  $("#new-category-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCategoryFromInput();
    }
  });
}
