/** Recent activity feed rendering and filter pills. */

import { $, $$, state } from "./state.js";
import { navigateToVaultDocument } from "./tabs.js";
import {
  REASON_LABELS,
  api,
  esc,
  extractFiledMeta,
  formatRelativeOrShortTime,
  getCategoryTone,
  getConfidenceThresholdPct,
  renderConfidenceTag,
} from "./utils.js";
import { openFullFilePreview } from "./viewer.js";

const ACTIVITY_KIND_META = {
  filed: { label: "Filed", cls: "tag-ok" },
  queued: { label: "Needs Review", cls: "tag-warn" },
  error: { label: "Error", cls: "tag-danger" },
  stopped: { label: "Stopped", cls: "tag-danger" },
  watcher: { label: "Watcher", cls: "tag-info" },
};

export function renderActivityLog(items, lastScanAt) {
  if (lastScanAt !== undefined) {
    $("#last-scan-label").textContent = lastScanAt
      ? `Last scan: ${new Date(lastScanAt).toLocaleString()}`
      : "No manual scan run yet";
  }

  state.latestActivity = items || [];
  const filtered = state.latestActivity.filter((entry) => {
    if (state.activityFilter === "filed") return entry.kind === "filed" || entry.kind === "reclassified";
    if (state.activityFilter === "attention") return entry.kind !== "filed" && entry.kind !== "reclassified";
    return true;
  });

  const countChip = $("#activity-count-chip");
  if (countChip) {
    countChip.textContent =
      state.activityFilter === "all"
        ? `${state.latestActivity.length}`
        : `${filtered.length} of ${state.latestActivity.length}`;
  }

  const renderKey = JSON.stringify({
    filter: state.activityFilter,
    threshold: getConfidenceThresholdPct(),
    items: filtered.map((e) => [e.timestamp, e.kind, e.document_id, e.vault_rel_path, e.confidence, e.message]),
  });
  if (renderKey === state.lastActivityRenderKey) {
    return;
  }
  state.lastActivityRenderKey = renderKey;

  const logEl = $("#activity-log");
  if (!filtered.length) {
    const emptyMsg =
      state.activityFilter === "filed"
        ? "No filed documents recorded yet."
        : state.activityFilter === "attention"
          ? "No review warnings or errors recorded."
          : "No recent watcher or scan activity yet.";
    logEl.innerHTML = `<li class="activity-empty muted">${emptyMsg}</li>`;
    return;
  }

  logEl.innerHTML = "";
  filtered.forEach((entry) => {
    const li = document.createElement("li");
    const timeLabel = formatRelativeOrShortTime(entry.timestamp);

    if (entry.kind === "filed" || entry.kind === "reclassified") {
      const { relPath, category, title } = extractFiledMeta(entry);
      const thumbSrc = entry.preview_images?.[0]
        ? `/api/previews/${encodeURIComponent(entry.preview_images[0])}`
        : "";
      const tone = category ? getCategoryTone(category) : "";
      const dateBadge = entry.doc_date
        ? `<span class="tag tag-subtle">${esc(entry.doc_date)}</span>`
        : "";
      const prevCatHtml =
        entry.kind === "reclassified" && entry.previous_category && entry.previous_category !== category
          ? `<span class="tag tag-subtle">${esc(entry.previous_category)}</span><span class="activity-arrow" aria-hidden="true">→</span>`
          : "";
      const catBtn = category
        ? `<button type="button" class="tag tag-cat-btn ${tone}" title="Browse ${esc(category)} in Vault">${esc(category)}</button>`
        : "";
      const kindBadge =
        entry.kind === "reclassified"
          ? `<span class="tag tag-info">Reclassified</span>`
          : `<span class="tag tag-ok">Filed</span>`;
      const confBadge = renderConfidenceTag(entry.confidence);
      const origHtml = entry.filename
        ? `<span class="activity-orig" title="Original file: ${esc(entry.filename)}">${esc(entry.filename)}</span><span class="activity-arrow" aria-hidden="true">→</span>`
        : "";
      const pathBtn = relPath
        ? `<button type="button" class="activity-vault-path" title="Navigate to document in Vault">${esc(relPath)}</button>`
        : "";

      li.className = "activity-row activity-row-filed";
      li.innerHTML = `
        <button type="button" class="activity-thumb" title="${entry.document_id ? "Preview document" : "View in Vault"}">
          ${thumbSrc ? `<img src="${thumbSrc}" alt="" />` : `<span>PDF</span>`}
        </button>
        <div class="activity-main">
          <div class="activity-top-line">
            <span class="activity-doc-title">${esc(title)}</span>
            ${kindBadge}
            ${confBadge}
            ${prevCatHtml}
            ${catBtn}
            ${dateBadge}
          </div>
          <div class="activity-sub-line">
            ${origHtml}
            ${pathBtn}
          </div>
        </div>
        <div class="activity-right">
          <span class="activity-time" title="${esc(new Date(entry.timestamp).toLocaleString())}">${esc(timeLabel)}</span>
          <button type="button" class="btn btn-secondary btn-xs btn-jump-vault">View in Vault →</button>
        </div>
      `;

      const goVault = () =>
        navigateToVaultDocument({
          documentId: entry.document_id || null,
          category,
          vaultRelPath: relPath,
        });

      li.querySelector(".btn-jump-vault").addEventListener("click", goVault);
      const pathEl = li.querySelector(".activity-vault-path");
      if (pathEl) pathEl.addEventListener("click", goVault);

      const catEl = li.querySelector(".tag-cat-btn");
      if (catEl) {
        catEl.addEventListener("click", () => {
          navigateToVaultDocument({ category });
        });
      }

      li.querySelector(".activity-thumb").addEventListener("click", () => {
        if (entry.document_id) {
          openFullFilePreview(
            `/api/documents/${entry.document_id}/file`,
            title,
            relPath || entry.filename,
            { docId: entry.document_id }
          );
        } else {
          goVault();
        }
      });
    } else {
      const meta = ACTIVITY_KIND_META[entry.kind] || { label: entry.kind, cls: "" };
      const confBadge = renderConfidenceTag(entry.confidence);
      const reasonsHtml = (entry.review_reasons || [])
        .map((r) => `<span class="tag tag-warn">${esc(REASON_LABELS[r] || r)}</span>`)
        .join("");
      li.className = `activity-row activity-row-event activity-kind-${esc(entry.kind)}`;
      li.innerHTML = `
        <span class="activity-status-dot"></span>
        <div class="activity-main">
          <div class="activity-top-line">
            <span class="tag ${meta.cls}">${esc(meta.label)}</span>
            ${entry.filename ? `<span class="activity-event-file">${esc(entry.filename)}</span>` : ""}
            ${confBadge}
            ${reasonsHtml}
          </div>
          <div class="activity-event-msg">${esc(entry.message)}</div>
        </div>
        <div class="activity-right">
          <span class="activity-time" title="${esc(new Date(entry.timestamp).toLocaleString())}">${esc(timeLabel)}</span>
        </div>
      `;
    }

    logEl.appendChild(li);
  });
}

export function initActivityLogListeners() {
  $$("#activity-filter-pills .seg-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activityFilter = btn.dataset.filter || "all";
      $$("#activity-filter-pills .seg-pill").forEach((b) =>
        b.classList.toggle("active", b === btn)
      );
      state.lastActivityRenderKey = "";
      renderActivityLog(state.latestActivity, undefined);
    });
  });
}
