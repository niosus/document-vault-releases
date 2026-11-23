/** Vault tag/subtag bars, needs-check filter, suggested-label strip, and bundle inspector modal. */

import { closeAnimatedModal, setModalCompact, showAnimatedModal } from "./modals.js";
import { loadSettings } from "./settings.js";
import { $, $$, state } from "./state.js";
import {
  api,
  buildCategoryOptions,
  esc,
  extractRuleClue,
  formatLabelDisplay,
  getCategoryTone,
  prefersReducedMotion,
  renderReliabilityTag,
  toast,
} from "./utils.js";
import { loadVaultDocuments } from "./vault_grid.js";
import { openFullFilePreview } from "./viewer.js";

export function updateNeedsCheckFilterBtn(facets) {
  const btn = $("#vault-needs-check-btn");
  if (!btn) return;
  const count = Number(facets?.needs_check_count || 0);
  const active = state.vaultReliability === "needs_check";
  if (count === 0 && !active) {
    btn.classList.add("hidden");
    return;
  }
  btn.classList.remove("hidden");
  btn.classList.toggle("is-active", active);
  btn.textContent = active ? `Needs Check (${count}) ×` : `Needs Check (${count})`;
}

export function updateSuggestedFilterChip() {
  const chip = $("#vault-sug-filter-chip");
  if (!chip) return;
  const sug = String(state.vaultSuggestedLabel || "").trim();
  if (!sug) {
    chip.classList.add("hidden");
    chip.textContent = "";
    return;
  }
  chip.classList.remove("hidden");
  chip.textContent = `Suggested: ${formatLabelDisplay(sug)} ×`;
}

export function syncVaultTagBarActive(selectedCat) {
  const bar = $("#vault-tag-bar");
  const subBar = $("#vault-subtag-bar");
  const targetCat = selectedCat || "";
  const rootCat = targetCat ? targetCat.split("/")[0] : "";
  if (bar) {
    bar.querySelectorAll(".vault-tag-pill").forEach((btn) => {
      const val = btn.dataset.category || "";
      const isActive = val === targetCat || (val !== "" && val === rootCat);
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }
  if (subBar) {
    subBar.querySelectorAll(".vault-tag-pill").forEach((btn) => {
      const val = btn.dataset.category || "";
      const isActive = val === targetCat;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }
}

function renderVaultSubtagBar(facets, selectedCat) {
  const subBar = $("#vault-subtag-bar");
  if (!subBar) return;
  const target = String(selectedCat || "");
  if (!target) {
    subBar.classList.add("hidden");
    subBar.innerHTML = "";
    return;
  }
  const parts = target.split("/").filter(Boolean);
  const rootName = parts[0];
  const tree = Array.isArray(facets?.label_tree) ? facets.label_tree : [];
  const rootNode = tree.find((n) => String(n.path).toLowerCase() === rootName.toLowerCase());
  const subNodes = [];
  const collectChildren = (node) => {
    if (!node || !Array.isArray(node.children)) return;
    node.children.forEach((child) => {
      subNodes.push(child);
      collectChildren(child);
    });
  };
  collectChildren(rootNode);

  if (!subNodes.length) {
    subBar.classList.add("hidden");
    subBar.innerHTML = "";
    return;
  }

  subBar.classList.remove("hidden");
  subBar.innerHTML = `<span class="vault-subtag-label">${esc(rootName)}:</span>`;
  const makeSubPill = (label, path, count) => {
    const btn = document.createElement("button");
    const isActive = path.toLowerCase() === target.toLowerCase();
    btn.type = "button";
    btn.dataset.category = path;
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    btn.className = `vault-tag-pill vault-subtag-pill ${getCategoryTone(path)} ${isActive ? "active" : ""}`.trim();
    btn.innerHTML = `<span class="vtp-label">${esc(label)}</span><span class="vtp-count">${count}</span>`;
    return btn;
  };
  subBar.appendChild(makeSubPill(`All ${rootName}`, rootNode.path, rootNode.count ?? 0));
  subNodes.forEach((node) => {
    const relSub = String(node.path).slice(rootNode.path.length + 1).replaceAll("/", " / ");
    subBar.appendChild(makeSubPill(relSub || node.name, node.path, node.count ?? 0));
  });
}

export function renderVaultTagBar(facets, selectedCat, animateOpen = false) {
  const bar = $("#vault-tag-bar");
  if (!bar) return;
  const nav = $(".vault-tag-nav");
  const counts = facets.category_counts || {};
  const totalCount = facets.total_count ?? Object.values(counts).reduce((a, b) => a + b, 0);
  const rawCategories = facets.categories || [];
  const rootCategories = Array.isArray(facets.label_tree) && facets.label_tree.length
    ? facets.label_tree.map((n) => n.path)
    : rawCategories.filter((c) => !String(c).includes("/"));
  const desiredValues = ["", ...rootCategories];
  const targetRoot = selectedCat ? String(selectedCat).split("/")[0] : "";
  const existingButtons = Array.from(bar.querySelectorAll(".vault-tag-pill"));
  const sameKeys =
    existingButtons.length === desiredValues.length &&
    existingButtons.every((btn, i) => (btn.dataset.category || "") === desiredValues[i]);

  if (sameKeys) {
    existingButtons.forEach((btn, i) => {
      const catVal = desiredValues[i];
      const count = catVal === "" ? totalCount : (counts[catVal] ?? 0);
      const isActive = catVal === selectedCat || (catVal !== "" && catVal === targetRoot);
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      const countEl = btn.querySelector(".vtp-count");
      if (countEl && countEl.textContent !== String(count)) {
        countEl.textContent = String(count);
      }
    });
  } else {
    const canAnimateResize = Boolean(
      nav && existingButtons.length > 0 && !animateOpen && !prefersReducedMotion()
    );
    const oldHeight = canAnimateResize ? nav.getBoundingClientRect().height : 0;

    bar.innerHTML = "";
    const makePill = (label, catValue, count, toneCls = "") => {
      const btn = document.createElement("button");
      const isActive = catValue === selectedCat || (catValue !== "" && catValue === targetRoot);
      btn.type = "button";
      btn.dataset.category = catValue;
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      btn.className = `vault-tag-pill ${toneCls} ${isActive ? "active" : ""}`.trim();
      btn.innerHTML = `<span class="vtp-label">${esc(label)}</span><span class="vtp-count">${count}</span>`;
      return btn;
    };

    const frag = document.createDocumentFragment();
    frag.appendChild(makePill("All", "", totalCount));
    rootCategories.forEach((c) => {
      frag.appendChild(makePill(c, c, counts[c] ?? 0, getCategoryTone(c)));
    });
    bar.appendChild(frag);

    if (canAnimateResize) {
      nav.style.height = "auto";
      const newHeight = nav.getBoundingClientRect().height;
      if (Math.abs(oldHeight - newHeight) > 1) {
        nav.style.height = `${oldHeight}px`;
        nav.style.overflow = "hidden";
        void nav.offsetHeight;
        requestAnimationFrame(() => {
          nav.style.height = `${newHeight}px`;
        });
        setTimeout(() => {
          nav.style.height = "";
          nav.style.overflow = "";
        }, 260);
      } else {
        nav.style.height = "";
      }
    }
  }

  renderVaultSubtagBar(facets, selectedCat);

  if (animateOpen && nav && !prefersReducedMotion()) {
    nav.classList.remove("vault-nav-enter");
    void nav.offsetWidth;
    nav.classList.add("vault-nav-enter");
  }
}

export async function loadLabelSuggestions() {
  const strip = $("#vault-suggestions-strip");
  if (!strip) return;
  try {
    const data = await api("/api/labels/suggestions");
    const bundles = data.bundles || [];
    const sig = JSON.stringify(bundles.map((b) => [b.suggested_label, b.count]));
    state.labelSuggestions = bundles;
    if (sig === state.lastSuggestionsSig) return;
    state.lastSuggestionsSig = sig;
    renderSuggestionsStrip(bundles);
  } catch {
    // ignore suggestion fetch failures cleanly
  }
}

function renderSuggestionsStrip(bundles) {
  const strip = $("#vault-suggestions-strip");
  if (!strip) return;
  if (!bundles || !bundles.length) {
    strip.classList.add("hidden");
    strip.innerHTML = "";
    if (state.vaultSuggestedLabel) {
      state.vaultSuggestedLabel = "";
    }
    return;
  }

  strip.classList.remove("hidden");
  strip.innerHTML = `<span class="suggestions-strip-label">Suggested Labels</span>`;
  bundles.forEach((bundle) => {
    const chip = document.createElement("div");
    const sug = bundle.suggested_label;
    chip.className = "suggestion-bundle-chip";
    chip.innerHTML = `
      <span class="suggestion-bundle-name">${esc(formatLabelDisplay(sug))}</span>
      <span class="suggestion-bundle-count">${bundle.count}</span>
      <button type="button" class="btn btn-secondary btn-xs btn-bundle-inspect">Inspect</button>
      <button type="button" class="btn btn-primary btn-xs btn-bundle-apply" title="Create label and move ${bundle.count} document(s)">Create &amp; Move</button>
      <button type="button" class="btn btn-secondary btn-xs btn-bundle-dismiss" title="Dismiss suggestion">×</button>
    `;
    chip.querySelector(".btn-bundle-inspect").addEventListener("click", () => openBundleInspectorModal(sug));
    chip.querySelector(".btn-bundle-apply").addEventListener("click", async (ev) => {
      const btn = ev.currentTarget;
      btn.disabled = true;
      try {
        const res = await api("/api/labels/suggestions/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suggested_label: sug }),
        });
        toast(`Created "${formatLabelDisplay(res.target_label)}" and moved ${res.moved_count} document(s)`);
        await loadSettings();
        await loadVaultDocuments({ reason: "refresh", reconcile: false });
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false;
      }
    });
    chip.querySelector(".btn-bundle-dismiss").addEventListener("click", async () => {
      try {
        await api("/api/labels/suggestions/dismiss", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suggested_label: sug }),
        });
        toast(`Dismissed suggestion "${formatLabelDisplay(sug)}"`);
        await loadVaultDocuments({ reason: "filter", reconcile: false });
      } catch (err) {
        toast(err.message, true);
      }
    });
    strip.appendChild(chip);
  });
}

export async function openBundleInspectorModal(suggestedLabel, draftState = null) {
  const modal = $("#doc-modal");
  setModalCompact(false);
  $("#modal-title").textContent = `Inspect Suggested Label: ${formatLabelDisplay(suggestedLabel)}`;
  $("#modal-body").innerHTML = `<div class="muted" style="padding:18px 0;">Loading bundle documents…</div>`;
  showAnimatedModal(modal);

  try {
    const bundle = await api(`/api/labels/suggestions/detail?suggested_label=${encodeURIComponent(suggestedLabel)}`);
    const docs = bundle.documents || [];
    if (!docs.length) {
      closeAnimatedModal(modal);
      await loadVaultDocuments({ reason: "filter", reconcile: false });
      return;
    }

    const firstClue = extractRuleClue(docs[0]?.title, docs[0]?.original_filename);
    const draftUnchecked = draftState?.uncheckedIds instanceof Set ? draftState.uncheckedIds : new Set();
    const draftOverrides = draftState?.overrides && typeof draftState.overrides === "object" ? draftState.overrides : {};
    const targetVal = draftState?.targetLabel ?? suggestedLabel;
    const learnChecked = Boolean(draftState?.learnRuleChecked);
    const learnKwVal = draftState?.learnKeywords ?? firstClue;
    const dismissExcludedChecked = Boolean(draftState?.dismissExcluded);

    const renderRows = () => docs.map((d) => {
      const thumb = d.preview_images?.[0] ? `/api/previews/${encodeURIComponent(d.preview_images[0])}` : "";
      const relBadge = renderReliabilityTag(d, { quietIfVerified: true });
      const isChecked = !draftUnchecked.has(Number(d.id));
      const ovVal = draftOverrides[Number(d.id)] || "";
      return `
        <div class="bundle-doc-row" data-doc-id="${d.id}">
          <input type="checkbox" class="bundle-doc-cb" ${isChecked ? "checked" : ""} aria-label="Include ${esc(d.title)}" />
          <div class="bundle-doc-thumb" title="Preview document">
            ${thumb ? `<img src="${thumb}" alt="" />` : `<span class="muted" style="font-size:10px;">PDF</span>`}
          </div>
          <div style="min-width:0;">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <strong style="font-size:13px;">${esc(d.title)}</strong>
              <span class="tag">${esc(d.doc_date || "Undated")}</span>
              ${relBadge}
            </div>
            <div class="muted" style="font-size:11.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              Currently: ${esc(d.vault_rel_path)}
            </div>
          </div>
          <div class="bundle-doc-controls">
            <select class="bundle-doc-override-sel" title="Assign a different label manually to this document">
              <option value="">Move to bundle target</option>
              ${buildCategoryOptions(ovVal)}
            </select>
            <button type="button" class="btn btn-secondary btn-xs bundle-doc-remove-btn" title="Remove this document from bundle (keep in current label)">×</button>
          </div>
        </div>
      `;
    }).join("");

    $("#modal-body").innerHTML = `
      <div class="reclass-modal-body">
        <div class="bundle-inspector-head">
          <label class="field">
            <span>Target Label Path <small class="muted">(create or rename before moving)</small></span>
            <input id="bundle-target-input" type="text" value="${esc(targetVal)}" />
          </label>
          <button id="bundle-filter-grid-btn" type="button" class="btn btn-secondary btn-sm">Filter Vault Grid</button>
        </div>

        <div class="learn-rule-box">
          <label class="checkbox-field" style="font-size:12.5px;">
            <input id="bundle-learn-rule-cb" type="checkbox" ${learnChecked ? "checked" : ""} />
            <span>Also save a Filing Rule for similar documents</span>
          </label>
          <input id="bundle-learn-kw" class="${learnChecked ? "" : "hidden"}" type="text" value="${esc(learnKwVal)}" placeholder="Match keywords (comma-separated, e.g. Telekom)" />
        </div>

        <div class="bundle-docs-list" id="bundle-docs-list">
          ${renderRows()}
        </div>

        <label class="checkbox-field" style="font-size:12px;">
          <input id="bundle-dismiss-excluded-cb" type="checkbox" ${dismissExcludedChecked ? "checked" : ""} />
          <span>Dismiss suggestion on unchecked documents</span>
        </label>

        <div class="modal-footer-actions">
          <button id="bundle-dismiss-all-btn" type="button" class="btn btn-ghost-danger btn-sm">Dismiss Bundle</button>
          <div style="display:flex; gap:8px;">
            <button id="bundle-cancel-btn" type="button" class="btn btn-secondary">Close</button>
            <button id="bundle-apply-btn" type="button" class="btn btn-primary">Create &amp; Move (${docs.length})</button>
          </div>
        </div>
      </div>
    `;

    const captureDraftState = () => {
      const overrides = {};
      const uncheckedIds = new Set();
      $$("#bundle-docs-list .bundle-doc-row").forEach((r) => {
        const idNum = Number(r.dataset.docId);
        const cb = r.querySelector(".bundle-doc-cb");
        const ovSel = r.querySelector(".bundle-doc-override-sel");
        if (cb && !cb.checked) uncheckedIds.add(idNum);
        if (ovSel && ovSel.value) overrides[idNum] = ovSel.value;
      });
      return {
        targetLabel: $("#bundle-target-input")?.value || suggestedLabel,
        learnRuleChecked: Boolean($("#bundle-learn-rule-cb")?.checked),
        learnKeywords: $("#bundle-learn-kw")?.value || "",
        dismissExcluded: Boolean($("#bundle-dismiss-excluded-cb")?.checked),
        uncheckedIds,
        overrides,
      };
    };

    const updateApplyCount = () => {
      const rows = Array.from($$("#bundle-docs-list .bundle-doc-row"));
      let count = 0;
      rows.forEach((row) => {
        const checked = row.querySelector(".bundle-doc-cb")?.checked;
        const overrideVal = row.querySelector(".bundle-doc-override-sel")?.value;
        if (checked || overrideVal) count += 1;
      });
      const dismissExcluded = Boolean($("#bundle-dismiss-excluded-cb")?.checked);
      const btn = $("#bundle-apply-btn");
      if (btn) {
        btn.textContent = count === 0 && dismissExcluded ? "Dismiss Unchecked" : `Create & Move (${count})`;
        btn.disabled = count === 0 && !dismissExcluded;
      }
    };

    $("#bundle-learn-rule-cb")?.addEventListener("change", (e) => {
      $("#bundle-learn-kw")?.classList.toggle("hidden", !e.target.checked);
    });
    $("#bundle-dismiss-excluded-cb")?.addEventListener("change", updateApplyCount);

    $("#bundle-filter-grid-btn")?.addEventListener("click", () => {
      state.vaultSuggestedLabel = suggestedLabel;
      closeAnimatedModal(modal);
      loadVaultDocuments({ reason: "filter" });
    });

    $$("#bundle-docs-list .bundle-doc-row").forEach((row) => {
      const did = Number(row.dataset.docId);
      const docObj = docs.find((d) => Number(d.id) === did);
      const selEl = row.querySelector(".bundle-doc-override-sel");
      if (selEl && draftOverrides[did]) {
        selEl.value = draftOverrides[did];
      }
      row.querySelector(".bundle-doc-thumb")?.addEventListener("click", () => {
        if (docObj) {
          const snapshot = captureDraftState();
          openFullFilePreview(`/api/documents/${docObj.id}/file`, docObj.title, docObj.vault_rel_path, {
            docId: docObj.id,
            onBack: () => openBundleInspectorModal(suggestedLabel, snapshot),
          });
        }
      });
      row.querySelector(".bundle-doc-cb")?.addEventListener("change", updateApplyCount);
      row.querySelector(".bundle-doc-override-sel")?.addEventListener("change", updateApplyCount);
      row.querySelector(".bundle-doc-remove-btn")?.addEventListener("click", async () => {
        row.classList.add("is-removing");
        try {
          await api("/api/labels/suggestions/dismiss", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ suggested_label: suggestedLabel, doc_ids: [did] }),
          });
          setTimeout(() => {
            row.remove();
            updateApplyCount();
            if (!$$("#bundle-docs-list .bundle-doc-row").length) {
              closeAnimatedModal(modal);
            }
          }, prefersReducedMotion() ? 0 : 160);
          loadVaultDocuments({ reason: "filter", reconcile: false });
        } catch (err) {
          row.classList.remove("is-removing");
          toast(err.message, true);
        }
      });
    });

    $("#bundle-cancel-btn")?.addEventListener("click", () => closeAnimatedModal(modal));
    updateApplyCount();
    $("#bundle-dismiss-all-btn")?.addEventListener("click", async () => {
      try {
        await api("/api/labels/suggestions/dismiss", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suggested_label: suggestedLabel }),
        });
        toast(`Dismissed suggestion "${formatLabelDisplay(suggestedLabel)}"`);
        closeAnimatedModal(modal);
        await loadVaultDocuments({ reason: "filter", reconcile: false });
      } catch (err) {
        toast(err.message, true);
      }
    });

    $("#bundle-apply-btn")?.addEventListener("click", async () => {
      const targetLabel = ($("#bundle-target-input")?.value || "").trim() || suggestedLabel;
      const selectedIds = [];
      const manualOverrides = {};
      $$("#bundle-docs-list .bundle-doc-row").forEach((row) => {
        const did = Number(row.dataset.docId);
        const ov = row.querySelector(".bundle-doc-override-sel")?.value || "";
        const checked = Boolean(row.querySelector(".bundle-doc-cb")?.checked);
        if (ov) {
          manualOverrides[did] = ov;
          selectedIds.push(did);
        } else if (checked) {
          selectedIds.push(did);
        }
      });
      const body = {
        suggested_label: suggestedLabel,
        target_label: targetLabel,
        doc_ids: selectedIds,
        manual_overrides: manualOverrides,
        dismiss_excluded: Boolean($("#bundle-dismiss-excluded-cb")?.checked),
      };
      if ($("#bundle-learn-rule-cb")?.checked) {
        const kwRaw = ($("#bundle-learn-kw")?.value || "").trim();
        const kws = kwRaw ? kwRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
        if (kws.length) {
          body.learn_rule = {
            target_label: targetLabel,
            match_keywords: kws,
            instruction: `Documents matching ${kws.join(", ")}`,
          };
        }
      }
      const btn = $("#bundle-apply-btn");
      btn.disabled = true;
      btn.textContent = "Moving…";
      try {
        const res = await api("/api/labels/suggestions/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast(`Moved ${res.moved_count} document(s)`);
        closeAnimatedModal(modal);
        await loadSettings();
        await loadVaultDocuments({ reason: "refresh", reconcile: false });
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false;
        updateApplyCount();
      }
    });
  } catch (err) {
    toast(err.message, true);
    closeAnimatedModal(modal);
  }
}

export function populateVaultFacets(facets, _selectedCat, selectedYear) {
  const yearSel = $("#vault-filter-year");
  yearSel.innerHTML = `<option value="">All Years</option>` +
    (facets.years || []).map((y) => `<option value="${esc(y)}" ${y === selectedYear ? "selected" : ""}>${esc(y)}</option>`).join("");
}
