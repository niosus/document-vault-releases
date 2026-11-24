/** Review queue cards, incremental DOM reconciliation, and review approval/dismissal. */

import { loadSettings } from "./settings.js";
import { $, state } from "./state.js";
import { navigateToVaultDocument } from "./tabs.js";
import {
  REASON_LABELS,
  api,
  bindPreviewSwitcher,
  buildCategoryOptions,
  esc,
  extractRuleClue,
  formatLabelDisplay,
  getConfidenceThresholdPct,
  getPreviewPageNumber,
  handleActionError,
  removeCardSmoothly,
  toast,
  updateLivePathPreview,
} from "./utils.js";
import { openFullFilePreview } from "./viewer.js";
import { refreshHealth, updateReviewBadge } from "./vlm.js";
import { renderWatcherTopbar } from "./watcher.js";

function renderReviewCard(item) {
  const card = document.createElement("article");
  card.className = "doc-card";
  card.dataset.reviewId = String(item.id);

  const imgs = item.preview_images || [];
  const firstImg = imgs[0] ? `/api/previews/${encodeURIComponent(imgs[0])}` : "";
  const fullFileUrl = `/api/review/${encodeURIComponent(item.id)}/file`;
  const pct = Math.round((item.confidence || 0) * 100);
  const thresholdPct = getConfidenceThresholdPct();
  const reasonBadges = (item.review_reasons || [])
    .map((r) => `<span class="tag ${r === "duplicate_hash" || r === "model_error" || r === "ollama_error" ? "tag-danger" : "tag-warn"}">${esc(REASON_LABELS[r] || r)}</span>`)
    .join("");

  const dupHtml = item.duplicate_document
    ? `<div class="banner-warn banner-warn-row">
         <div>
           <strong>Exact duplicate detected (SHA-256 match):</strong> Already filed at
           <code>${esc(item.duplicate_document.vault_rel_path)}</code>. Saving will keep both copies safely with a suffix; nothing will be deleted.
         </div>
         <button type="button" class="btn btn-secondary btn-xs btn-dup-vault">View in Vault →</button>
       </div>`
    : "";

  const newCatBtn = item.suggested_new_category
    ? `<label class="checkbox-field" style="font-size:12px;">
         <input type="checkbox" class="inp-add-cat" checked />
         <span>Add "${esc(item.suggested_new_category)}" to saved categories if selected</span>
       </label>`
    : `<input type="checkbox" class="inp-add-cat hidden" />`;

  const thinkingHtml = item.thinking
    ? `<details class="thinking-details">
         <summary>Model Thinking</summary>
         <pre class="thinking-box">${esc(item.thinking)}</pre>
       </details>`
    : "";

  const actionHtml = `<button type="button" class="btn btn-primary btn-approve-review">Approve &amp; File</button>
       <button type="button" class="btn btn-ghost-danger btn-dismiss-review">Dismiss (Keep Original)</button>`;

  const datePlaceholder = state.settings?.date_format || "YYYY-MM-DD";

  const learnClueDefault = extractRuleClue(item.suggested_title, item.original_filename);
  const learnRuleHtml = `
    <div class="learn-rule-box hidden" style="margin-top:6px;">
      <label class="checkbox-field" style="font-size:12px;">
        <input type="checkbox" class="inp-learn-rule" />
        <span class="inp-learn-rule-label">Always file similar documents under this label</span>
      </label>
      <input type="text" class="inp-learn-keywords hidden" value="${esc(learnClueDefault)}" placeholder="Matching keyword or sender (e.g. Telekom)" />
    </div>`;

  card.innerHTML = `
    <div class="preview-pane">
      <div class="preview-frame" title="Click to preview full document">
        ${firstImg ? `<img class="preview-img" src="${firstImg}" alt="Document preview" />` : `<span class="muted">No preview</span>`}
      </div>
      <div class="page-switcher">
        ${
          imgs.length > 1
            ? imgs.map((imgName, i) => `<button type="button" class="btn btn-sm btn-secondary page-btn ${i === 0 ? "btn-primary" : ""}" data-idx="${i}">Page ${getPreviewPageNumber(imgName, i)}</button>`).join("")
            : ""
        }
        <button type="button" class="btn btn-sm btn-secondary btn-preview-full">Preview PDF / Full</button>
      </div>
    </div>

    <div class="doc-meta-pane">
      <div class="doc-card-header">
        <div class="doc-filename">${esc(item.original_filename)}</div>
        <div class="tag-row">
          <span class="tag ${pct >= thresholdPct ? "tag-ok" : "tag-warn"}" title="Overall extraction reliability score: ${pct}%">${pct >= thresholdPct ? "Verified" : `Check (${pct}%)`}</span>
          ${reasonBadges}
        </div>
      </div>

      ${item.reason ? `<p class="muted">${esc(item.reason)}</p>` : ""}
      ${thinkingHtml}
      ${dupHtml}

      <div class="form-grid-3">
        <label class="field">
          <span>Document Date</span>
          <input type="text" class="inp-date" value="${esc(item.suggested_date || "")}" placeholder="${esc(datePlaceholder)}" />
        </label>
        <label class="field">
          <span>Label</span>
          <select class="inp-cat">
            ${buildCategoryOptions(item.suggested_category, item.suggested_new_category)}
          </select>
        </label>
        <label class="field">
          <span>Title</span>
          <input type="text" class="inp-title" value="${esc(item.suggested_title || "")}" placeholder="Document title" />
        </label>
      </div>

      ${newCatBtn}
      ${learnRuleHtml}

      <div class="path-preview-box">
        <span class="muted">Target Vault Path:</span>
        <code class="live-path-code">${esc(item.preview_rel_path || "")}</code>
      </div>

      <div class="card-actions">
        <span class="save-status muted"></span>
        <div class="action-buttons">${actionHtml}</div>
      </div>
    </div>
  `;

  if (imgs.length > 1) bindPreviewSwitcher(card, imgs);
  card.querySelector(".preview-frame").addEventListener("click", () =>
    openFullFilePreview(fullFileUrl, item.original_filename, item.original_filename)
  );
  card.querySelector(".btn-preview-full").addEventListener("click", () =>
    openFullFilePreview(fullFileUrl, item.original_filename, item.original_filename)
  );

  const catSelEl = card.querySelector(".inp-cat");
  const learnBoxEl = card.querySelector(".learn-rule-box");
  const learnCbEl = card.querySelector(".inp-learn-rule");
  const learnKwEl = card.querySelector(".inp-learn-keywords");
  const learnLblEl = card.querySelector(".inp-learn-rule-label");
  const origSuggestedCat = String(item.suggested_category || "");

  const syncReviewLearnRule = () => {
    const nextCat = catSelEl.value;
    const changed = nextCat.toLowerCase() !== origSuggestedCat.toLowerCase();
    learnBoxEl.classList.toggle("hidden", !changed && !learnCbEl.checked);
    if (learnLblEl) {
      learnLblEl.textContent = `Always file similar documents under ${formatLabelDisplay(nextCat)}`;
    }
    learnKwEl.classList.toggle("hidden", !learnCbEl.checked);
  };
  catSelEl.addEventListener("change", syncReviewLearnRule);
  learnCbEl.addEventListener("change", syncReviewLearnRule);

  ["inp-date", "inp-cat", "inp-title"].forEach((cls) => {
    card.querySelector(`.${cls}`).addEventListener("input", () => updateLivePathPreview(card, item.original_filename));
    card.querySelector(`.${cls}`).addEventListener("change", () => updateLivePathPreview(card, item.original_filename));
  });

  const dupBtn = card.querySelector(".btn-dup-vault");
  if (dupBtn && item.duplicate_document) {
    dupBtn.addEventListener("click", () =>
      navigateToVaultDocument({
        documentId: item.duplicate_document.id,
        category: item.duplicate_document.category,
        vaultRelPath: item.duplicate_document.vault_rel_path,
      })
    );
  }

  const approveBtn = card.querySelector(".btn-approve-review");
  const dismissBtn = card.querySelector(".btn-dismiss-review");

  approveBtn.addEventListener("click", async () => {
    approveBtn.disabled = true;
    dismissBtn.disabled = true;
    try {
      const chosenCat = card.querySelector(".inp-cat").value;
      const bodyPayload = {
        date: card.querySelector(".inp-date").value.trim(),
        category: chosenCat,
        title: card.querySelector(".inp-title").value.trim(),
        add_category: Boolean(card.querySelector(".inp-add-cat")?.checked),
      };
      if (learnCbEl.checked) {
        const kwRaw = learnKwEl.value.trim();
        const kws = kwRaw ? kwRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
        if (kws.length) {
          bodyPayload.learn_rule = {
            target_label: chosenCat,
            match_keywords: kws,
            instruction: `Documents matching ${kws.join(", ")}`,
          };
        }
      }
      const res = await api(`/api/review/${item.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });
      state.reviewItems = state.reviewItems.filter((r) => Number(r.id) !== Number(item.id));
      state.lastPendingReviews = Number(res.pending_count || 0);
      updateReviewBadge(res.pending_count);
      toast(res.learned_rule ? `Filed & learned rule -> ${res.document.vault_rel_path}` : `Filed -> ${res.document.vault_rel_path}`);
      removeCardSmoothly(card, () => {
        if (!$("#review-list").children.length) renderEmptyReview();
      });
      await loadSettings();
      refreshHealth();
    } catch (err) {
      handleActionError(err);
      approveBtn.disabled = false;
      dismissBtn.disabled = false;
    }
  });

  dismissBtn.addEventListener("click", async () => {
    approveBtn.disabled = true;
    dismissBtn.disabled = true;
    try {
      const res = await api(`/api/review/${item.id}/dismiss`, { method: "POST" });
      state.reviewItems = state.reviewItems.filter((r) => Number(r.id) !== Number(item.id));
      state.lastPendingReviews = Number(res.pending_count || 0);
      updateReviewBadge(res.pending_count);
      toast("Dismissed from queue (original kept untouched)");
      removeCardSmoothly(card, () => {
        if (!$("#review-list").children.length) renderEmptyReview();
      });
      refreshHealth();
    } catch (err) {
      toast(err.message, true);
      approveBtn.disabled = false;
      dismissBtn.disabled = false;
    }
  });

  return card;
}

// ── Activity & Review Tab ─────────────────────────────────────────────────
function renderEmptyReview() {
  $("#review-list").innerHTML = `
    <div class="empty-state empty-state-nice">
      <div class="empty-state-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <div class="empty-state-title">All caught up</div>
      <p class="muted">No documents awaiting review. Confident scans and dropped documents are filed automatically below.</p>
    </div>`;
}

function syncReviewListDom(items) {
  const listEl = $("#review-list");
  if (!listEl) return;
  if (!items.length) {
    const hasOnlyEmpty =
      listEl.children.length === 1 && listEl.children[0].classList?.contains("empty-state");
    if (!hasOnlyEmpty) {
      renderEmptyReview();
    }
    return;
  }

  Array.from(listEl.children).forEach((child) => {
    if (!child.dataset?.reviewId) child.remove();
  });

  const existingById = new Map();
  Array.from(listEl.children).forEach((child) => {
    const rid = child.dataset?.reviewId;
    if (rid) existingById.set(rid, child);
  });

  const desiredIds = new Set(items.map((item) => String(item.id)));
  existingById.forEach((el, rid) => {
    if (!desiredIds.has(rid)) el.remove();
  });

  items.forEach((item, idx) => {
    const rid = String(item.id);
    let card = existingById.get(rid);
    if (!card) {
      card = renderReviewCard(item);
    }
    if (listEl.children[idx] !== card) {
      listEl.insertBefore(card, listEl.children[idx] || null);
    }
  });
}

export async function loadReviewQueue({ skipTopbar = false } = {}) {
  if (state.reviewLoading) {
    state.reviewReloadQueued = true;
    return;
  }
  state.reviewLoading = true;
  try {
    const data = await api("/api/review");
    state.reviewItems = data.items || [];
    state.reviewLoadedOnce = true;
    const pendingCount = Number(data.pending_count || 0);
    state.lastPendingReviews = pendingCount;
    updateReviewBadge(pendingCount);
    syncReviewListDom(state.reviewItems);
    if (!skipTopbar) {
      const w = await api("/api/watcher/status");
      renderWatcherTopbar(w, { skipReviewReload: true });
    }
  } catch (err) {
    toast(err.message, true);
  } finally {
    state.reviewLoading = false;
    if (state.reviewReloadQueued) {
      state.reviewReloadQueued = false;
      loadReviewQueue({ skipTopbar: true });
    }
  }
}

export function initReviewListeners() {
  $("#refresh-review-btn").addEventListener("click", () => loadReviewQueue());
}
