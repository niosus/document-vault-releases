/** Settings filing rules list rendering, toggling, deletion, and inline rule creation. */

import { closeAnimatedModal, openConfirmModal, setModalCompact, showAnimatedModal } from "./modals.js";
import { $, state } from "./state.js";
import {
  api,
  buildCategoryOptions,
  esc,
  formatLabelDisplay,
  getCategoryTone,
  toast,
} from "./utils.js";

function openEditRuleModal(rule) {
  const modal = $("#doc-modal");
  if (!modal) return;
  setModalCompact(true);
  $("#modal-title").textContent = "Edit Filing Rule";
  const kwText = Array.isArray(rule.match_keywords) ? rule.match_keywords.join(", ") : "";
  $("#modal-body").innerHTML = `
    <div class="reclass-modal-body">
      <label class="field">
        <span>Match Keywords <small class="muted">(comma-separated, optional)</small></span>
        <input id="edit-rule-keywords-input" type="text" value="${esc(kwText)}" placeholder="e.g. Telekom, Swisscom" />
      </label>
      <label class="field">
        <span>AI Description <small class="muted">(optional)</small></span>
        <input id="edit-rule-instruction-input" type="text" value="${esc(rule.instruction || "")}" placeholder="e.g. Monthly internet &amp; mobile bills" />
      </label>
      <label class="field">
        <span>Target Label</span>
        <select id="edit-rule-target-select">${buildCategoryOptions(rule.target_label || "Other")}</select>
      </label>
      <label class="checkbox-field" style="font-size:12.5px;">
        <input id="edit-rule-enabled-cb" type="checkbox" ${rule.enabled !== false ? "checked" : ""} />
        <span>Rule enabled</span>
      </label>
      <div class="modal-footer-actions">
        <button id="edit-rule-cancel" type="button" class="btn btn-secondary">Cancel</button>
        <button id="edit-rule-save" type="button" class="btn btn-primary">Save Rule</button>
      </div>
    </div>
  `;
  $("#edit-rule-cancel")?.addEventListener("click", () => closeAnimatedModal(modal));
  $("#edit-rule-save")?.addEventListener("click", async () => {
    const kwRaw = ($("#edit-rule-keywords-input")?.value || "").trim();
    const instr = ($("#edit-rule-instruction-input")?.value || "").trim();
    const target = $("#edit-rule-target-select")?.value || "Other";
    const enabled = Boolean($("#edit-rule-enabled-cb")?.checked);
    const matchKeywords = kwRaw ? kwRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
    if (!matchKeywords.length && !instr) {
      toast("Enter match keywords or an AI description.", true);
      return;
    }
    const btn = $("#edit-rule-save");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Saving…";
    }
    try {
      const res = await api("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: rule.id,
          match_keywords: matchKeywords,
          instruction: instr,
          target_label: target,
          enabled,
        }),
      });
      state.settings.filing_rules = res.rules || [];
      renderFilingRules(state.settings.filing_rules);
      closeAnimatedModal(modal);
      toast("Filing rule updated");
    } catch (err) {
      toast(err.message, true);
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Save Rule";
      }
    }
  });
  showAnimatedModal(modal);
}

export function renderFilingRules(rules) {
  const listEl = $("#filing-rules-list");
  if (!listEl) return;
  const countPill = $("#filing-rules-count-badge");
  if (countPill) {
    const total = Array.isArray(rules) ? rules.length : 0;
    countPill.textContent = String(total);
    countPill.classList.toggle("hidden", total === 0);
  }
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
        <button type="button" class="btn btn-secondary btn-xs rule-edit-btn">Edit</button>
        <button type="button" class="btn btn-ghost-danger btn-xs rule-delete-btn">Delete</button>
      </div>
    `;
    row.querySelector(".rule-edit-btn")?.addEventListener("click", () => openEditRuleModal(rule));
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
    row.querySelector(".rule-delete-btn")?.addEventListener("click", () => {
      const summaryParts = [];
      if (Array.isArray(rule.match_keywords) && rule.match_keywords.length) {
        summaryParts.push(`Keywords: <code>${esc(rule.match_keywords.join(", "))}</code>`);
      }
      if (rule.instruction) {
        summaryParts.push(esc(rule.instruction));
      }
      const detailsHtml = summaryParts.length
        ? `<div class="muted" style="font-size:12px;">${summaryParts.join(" · ")}</div>`
        : "";
      openConfirmModal({
        title: "Delete Filing Rule",
        confirmLabel: "Delete Rule",
        bodyHtml: `
          <p class="muted" style="margin:0;">
            Are you sure you want to delete this filing rule targeting <strong>${esc(formatLabelDisplay(rule.target_label))}</strong>?
          </p>
          ${detailsHtml}
        `,
        onConfirm: async () => {
          try {
            const res = await api(`/api/rules/${encodeURIComponent(rule.id)}`, { method: "DELETE" });
            state.settings.filing_rules = res.rules || [];
            renderFilingRules(state.settings.filing_rules);
            toast("Filing rule deleted");
            return true;
          } catch (err) {
            toast(err.message, true);
            return false;
          }
        },
      });
    });
    listEl.appendChild(row);
  });
}

export function initFilingRuleListeners() {
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
}
