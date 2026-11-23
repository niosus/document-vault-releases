/** Shared formatting, escaping, API client, toast, reliability badges, and live path preview helpers. */

import { openLicenseModal } from "./license.js";
import { $, state } from "./state.js";
import { refreshHealth } from "./vlm.js";

export function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

export function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getCategoryTone(category) {
  const root = String(category || "").split("/")[0].trim();
  let hash = 0;
  for (let i = 0; i < root.length; i += 1) {
    hash = (hash * 31 + root.charCodeAt(i)) >>> 0;
  }
  return `tone-${hash % 8}`;
}

export function formatLabelDisplay(label) {
  return String(label || "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" / ");
}

export function extractRuleClue(title, filename) {
  const clean = String(title || filename || "")
    .replace(/\.[^.]+$/, "")
    .replace(/^\d{4}[-_.]\d{2}[-_.]\d{2}\s+/, "")
    .trim();
  const words = clean.split(/\s+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w));
  return words.slice(0, 2).join(" ");
}

export function formatRelativeOrShortTime(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return "";
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec >= 0 && diffSec < 60) return "Just now";
  if (diffSec >= 60 && diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function toast(message, isError = false) {
  const el = document.createElement("div");
  el.className = `toast ${isError ? "toast-error" : ""}`;
  el.textContent = message;
  $("#toast-container").appendChild(el);
  setTimeout(() => {
    el.classList.add("toast-hide");
    setTimeout(() => el.remove(), 220);
  }, 3600);
}

export function removeCardSmoothly(cardEl, onDone) {
  cardEl.classList.add("card-exiting");
  setTimeout(() => {
    cardEl.remove();
    if (onDone) onDone();
  }, 200);
}

export async function api(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detailObj =
      data && typeof data.detail === "object" && data.detail !== null ? data.detail : null;
    const message =
      detailObj?.message ||
      (typeof data?.detail === "string" ? data.detail : "") ||
      `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    if (detailObj?.code) err.code = detailObj.code;
    if (data?.detail !== undefined) err.detail = data.detail;
    throw err;
  }
  return data;
}

export function isLicenseRequiredError(err) {
  return Boolean(err && (err.code === "license_required" || err.status === 402));
}

export function handleActionError(err, { openModalOnLimit = true } = {}) {
  if (isLicenseRequiredError(err)) {
    refreshHealth();
    toast(err.message, true);
    if (openModalOnLimit) {
      openLicenseModal({ reason: "limit_reached" });
    }
    return true;
  }
  toast(err?.message || "Request failed", true);
  return false;
}

export function shortModelLabel(modelId) {
  if (!modelId) return "";
  const parts = String(modelId).split("/");
  return parts[parts.length - 1] || String(modelId);
}

export function formatBytesGiB(bytes) {
  const n = Number(bytes || 0);
  if (n <= 0) return "0 MB";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  return `${(n / 1024 ** 2).toFixed(0)} MB`;
}

export function formatUnloadTooltip(seconds) {
  const s = Math.max(0, Math.round(Number(seconds)));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  if (mins > 0) return `${mins}m ${rem}s`;
  return `${rem}s`;
}

export function getConfidenceThresholdPct() {
  return Math.round((state.settings?.confidence_threshold ?? 0.75) * 100);
}

export function renderConfidenceTag(confidence) {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return "";
  const pct = Math.round(confidence * 100);
  const cls = pct >= getConfidenceThresholdPct() ? "tag-ok" : "tag-warn";
  return `<span class="tag ${cls}" title="Reliability score: ${pct}%">Confidence: ${pct}%</span>`;
}

export function renderReliabilityTag(item, { quietIfVerified = false } = {}) {
  const status = String(item?.reliability_status || "").toLowerCase();
  const reasons = Array.isArray(item?.reliability_reasons) ? item.reliability_reasons : [];
  const pct = typeof item?.confidence === "number" && Number.isFinite(item.confidence)
    ? Math.round(item.confidence * 100)
    : null;
  const tip = reasons.length ? reasons.join(" · ") : (pct !== null ? `Reliability score: ${pct}%` : "");

  if (status === "check_date") {
    return `<span class="tag tag-warn" title="${esc(tip || "Please verify the extracted date")}">Check Date</span>`;
  }
  if (status === "low") {
    return `<span class="tag tag-danger" title="${esc(tip || "Low extraction reliability")}">Low Reliability</span>`;
  }
  if (status === "verified") {
    if (quietIfVerified) return "";
    return `<span class="tag tag-ok" title="${esc(tip || "Date and label verified")}">Verified</span>`;
  }
  if (quietIfVerified) return "";
  return pct !== null ? renderConfidenceTag(item.confidence) : "";
}

export function getPreviewPageNumber(filename, fallbackIdx = 0) {
  const match = String(filename || "").match(/_p(\d+)\.png$/i);
  if (match) {
    const n = Number(match[1]);
    if (Number.isInteger(n) && n >= 1) return n;
  }
  return Number(fallbackIdx) + 1;
}

export function extractFiledMeta(entry) {
  const relPath =
    entry.vault_rel_path ||
    (entry.message && entry.message.startsWith("Filed -> ") ? entry.message.slice(9).trim() : "");
  const parts = relPath ? relPath.split("/") : [];
  const category = entry.category || (parts.length > 1 ? parts[0] : "");
  const filenameFromPath = parts.length ? parts[parts.length - 1] : "";
  const title = entry.title || filenameFromPath || entry.filename || "Filed document";
  return { relPath, category, title };
}

export function buildCategoryOptions(selected, extraSuggestion) {
  const cats = [...(state.settings?.categories || ["Finance", "Taxes", "Medical", "Other"])];
  if (extraSuggestion && !cats.some((c) => c.toLowerCase() === extraSuggestion.toLowerCase())) {
    cats.push(extraSuggestion);
  }
  if (selected && !cats.some((c) => c.toLowerCase() === selected.toLowerCase())) {
    cats.push(selected);
  }
  const sorted = [...cats].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return sorted
    .map((c) => `<option value="${esc(c)}" ${c.toLowerCase() === String(selected).toLowerCase() ? "selected" : ""}>${esc(formatLabelDisplay(c))}</option>`)
    .join("");
}

export const REASON_LABELS = {
  low_confidence: "Low Confidence",
  missing_date: "Missing Date",
  duplicate_hash: "Exact Duplicate",
  new_category: "New Category Suggested",
  missing_title: "Missing Title",
  model_error: "Model Error",
  ollama_error: "Model Error",
};

export function bindPreviewSwitcher(cardEl, previewImages) {
  const imgEl = cardEl.querySelector(".preview-img");
  cardEl.querySelectorAll(".page-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      imgEl.src = `/api/previews/${encodeURIComponent(previewImages[idx])}`;
      cardEl.querySelectorAll(".page-btn").forEach((b) => b.classList.remove("btn-primary"));
      btn.classList.add("btn-primary");
    });
  });
}

export async function updateLivePathPreview(cardEl, filename) {
  const dateVal = cardEl.querySelector(".inp-date").value;
  const catVal = cardEl.querySelector(".inp-cat").value;
  const titleVal = cardEl.querySelector(".inp-title").value;
  try {
    const { rel_path } = await api("/api/intake/preview-path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: dateVal,
        category: catVal,
        title: titleVal,
        filename,
      }),
    });
    cardEl.querySelector(".live-path-code").textContent = rel_path;
  } catch {
    // ignore
  }
}
