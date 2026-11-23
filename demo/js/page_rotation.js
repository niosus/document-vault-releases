/** Document card/modal sync after rotation and animated lossless page rotation. */

import { renderActivityLog } from "./activity_log.js";
import { $, state } from "./state.js";
import { api, prefersReducedMotion } from "./utils.js";
import { syncVaultCardElement } from "./vault_cards.js";

function applyUpdatedVaultDoc(updatedDoc) {
  if (!updatedDoc || updatedDoc.id == null) return;
  const docId = Number(updatedDoc.id);
  state.vaultDocsById.set(docId, updatedDoc);
  const idx = state.vaultDocs.findIndex((d) => Number(d.id) === docId);
  if (idx !== -1) {
    state.vaultDocs[idx] = updatedDoc;
  }
  const card = $(`#vault-list .vault-item[data-doc-id="${docId}"]`);
  if (card) {
    syncVaultCardElement(card, updatedDoc);
  }
  if (Array.isArray(state.latestActivity)) {
    let changed = false;
    state.latestActivity.forEach((entry) => {
      if (Number(entry.document_id) === docId) {
        entry.preview_images = [...(updatedDoc.preview_images || [])];
        changed = true;
      }
    });
    if (changed) {
      state.lastActivityRenderKey = "";
      renderActivityLog(state.latestActivity, undefined);
    }
  }
}

export function buildRotateButtonsHtml({ compact = false } = {}) {
  const btnCls = compact ? "btn btn-secondary btn-xs preview-rotate-btn" : "btn btn-secondary btn-sm preview-rotate-btn";
  const iconSize = compact ? 13 : 15;
  return `
    <button type="button" class="${btnCls}" data-angle="-90" title="Rotate page 90° left (counter-clockwise)" aria-label="Rotate page 90° left">
      <svg viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path>
        <path d="M3 3v5h5"></path>
      </svg>
    </button>
    <button type="button" class="${btnCls}" data-angle="90" title="Rotate page 90° right (clockwise)" aria-label="Rotate page 90° right">
      <svg viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-3-6.7L21 8"></path>
        <path d="M21 3v5h-5"></path>
      </svg>
    </button>
    <button type="button" class="${btnCls}" data-angle="180" title="Rotate page 180°" aria-label="Rotate page 180°">
      <svg viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
        <path d="M3 3v5h5"></path>
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
        <path d="M16 16h5v5"></path>
      </svg>
    </button>
  `;
}

export async function rotateVaultDocumentPage(docId, page, angle) {
  const res = await api(`/api/documents/${docId}/rotate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page, angle }),
  });
  if (res.document) {
    applyUpdatedVaultDoc(res.document);
  }
  return res;
}

function preloadImage(src) {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") {
      resolve();
      return;
    }
    const loader = new Image();
    loader.onload = () => {
      if (typeof loader.decode === "function") {
        loader.decode().then(resolve, resolve);
      } else {
        resolve();
      }
    };
    loader.onerror = resolve;
    loader.src = src;
  });
}

export async function animatePageRotation({
  imgEl,
  containerEl,
  angle,
  mode = "contain",
  onRequest,
  getNextSrc,
  onAfterSwap,
}) {
  const canAnimate = Boolean(
    imgEl &&
    !prefersReducedMotion() &&
    typeof imgEl.getBoundingClientRect === "function" &&
    typeof requestAnimationFrame === "function"
  );

  if (!canAnimate) {
    const res = await onRequest();
    const nextSrc = getNextSrc(res);
    await preloadImage(nextSrc);
    if (imgEl && imgEl.isConnected) {
      onAfterSwap?.(res);
      imgEl.src = nextSrc;
    }
    return res;
  }

  const rect = imgEl.getBoundingClientRect();
  const oldW = rect.width;
  const oldH = rect.height;
  if (oldW <= 0 || oldH <= 0) {
    const res = await onRequest();
    const nextSrc = getNextSrc(res);
    await preloadImage(nextSrc);
    if (imgEl.isConnected) {
      onAfterSwap?.(res);
      imgEl.src = nextSrc;
    }
    return res;
  }

  const isQuarterTurn = Math.abs(angle) % 180 === 90;
  const isPreviewFrame = Boolean(containerEl && containerEl.classList.contains("preview-frame"));
  const easing = "cubic-bezier(0.22, 1, 0.36, 1)";
  const durationMs = 280;
  const prevContainerPosition = containerEl ? containerEl.style.position : "";
  const prevAspectRatio = containerEl ? containerEl.style.aspectRatio : "";

  const cleanupInlineStyles = () => {
    if (imgEl.isConnected) {
      imgEl.style.position = "";
      imgEl.style.top = "";
      imgEl.style.left = "";
      imgEl.style.margin = "";
      imgEl.style.transform = "";
      imgEl.style.width = "";
      imgEl.style.height = "";
      imgEl.style.maxWidth = "";
      imgEl.style.maxHeight = "";
    }
    if (containerEl && containerEl.isConnected) {
      containerEl.style.height = "";
      containerEl.style.overflow = "";
      containerEl.style.position = prevContainerPosition;
    }
  };

  if (mode === "slot" && containerEl) {
    const slotW = containerEl.clientWidth || oldW;
    const slotRect = containerEl.getBoundingClientRect();
    const borderY = Math.max(0, slotRect.height - containerEl.clientHeight);
    const targetH = isQuarterTurn ? slotW * (oldW / oldH) : oldH;
    const animScale = isQuarterTurn ? slotW / oldH : 1;

    containerEl.style.aspectRatio = "auto";
    containerEl.style.height = `${oldH + borderY}px`;
    containerEl.style.overflow = "hidden";
    imgEl.style.position = "absolute";
    imgEl.style.top = "50%";
    imgEl.style.left = "50%";
    imgEl.style.margin = "0";
    imgEl.style.width = `${oldW}px`;
    imgEl.style.height = `${oldH}px`;
    imgEl.style.maxWidth = "none";
    imgEl.style.maxHeight = "none";
    imgEl.style.transform = "translate(-50%, -50%) rotate(0deg) scale(1)";
    void containerEl.offsetHeight;

    containerEl.style.transition = `height ${durationMs}ms ${easing}`;
    imgEl.style.transition = `transform ${durationMs}ms ${easing}`;
    containerEl.style.height = `${targetH + borderY}px`;
    imgEl.style.transform = `translate(-50%, -50%) rotate(${angle}deg) scale(${animScale})`;
  } else {
    const boundsW = (containerEl && containerEl.clientWidth) || oldW;
    const boundsH = isPreviewFrame
      ? (containerEl.clientHeight || oldH)
      : Math.round((window.innerHeight || 900) * 0.7);
    const natW = imgEl.naturalWidth || oldW;
    const natH = imgEl.naturalHeight || oldH;
    const fitScale = isQuarterTurn ? Math.min(1, boundsW / natH, boundsH / natW) : 1;
    const finalW = isQuarterTurn ? natH * fitScale : oldW;
    const finalH = isQuarterTurn ? natW * fitScale : oldH;
    const animScale = isQuarterTurn ? finalW / oldH : 1;

    if (containerEl) {
      if (!isPreviewFrame) {
        const contRect = containerEl.getBoundingClientRect();
        const borderY = Math.max(0, contRect.height - containerEl.clientHeight);
        containerEl.style.position = "relative";
        containerEl.style.height = `${oldH + borderY}px`;
        containerEl.style.overflow = "hidden";
      }
      imgEl.style.position = "absolute";
      imgEl.style.top = "50%";
      imgEl.style.left = "50%";
      imgEl.style.margin = "0";
      imgEl.style.width = `${oldW}px`;
      imgEl.style.height = `${oldH}px`;
      imgEl.style.maxWidth = "none";
      imgEl.style.maxHeight = "none";
      imgEl.style.transform = "translate(-50%, -50%) rotate(0deg) scale(1)";
      void containerEl.offsetHeight;

      if (!isPreviewFrame) {
        const contRect = containerEl.getBoundingClientRect();
        const borderY = Math.max(0, contRect.height - containerEl.clientHeight);
        containerEl.style.transition = `height ${durationMs}ms ${easing}`;
        containerEl.style.height = `${finalH + borderY}px`;
      }
    } else {
      void imgEl.offsetHeight;
    }

    imgEl.style.transition = `transform ${durationMs}ms ${easing}`;
    imgEl.style.transform = containerEl
      ? `translate(-50%, -50%) rotate(${angle}deg) scale(${animScale})`
      : `rotate(${angle}deg) scale(${animScale})`;
  }

  let res;
  try {
    [res] = await Promise.all([
      onRequest(),
      new Promise((resolve) => setTimeout(resolve, durationMs + 15)),
    ]);
  } catch (err) {
    if (imgEl.isConnected) {
      imgEl.style.transition = "transform 200ms ease";
      imgEl.style.transform = containerEl
        ? "translate(-50%, -50%) rotate(0deg) scale(1)"
        : "rotate(0deg) scale(1)";
      if (containerEl && (mode === "slot" || !isPreviewFrame)) {
        const contRect = containerEl.getBoundingClientRect();
        const borderY = Math.max(0, contRect.height - containerEl.clientHeight);
        containerEl.style.transition = "height 200ms ease";
        containerEl.style.height = `${oldH + borderY}px`;
      }
      setTimeout(() => {
        if (!imgEl.isConnected) return;
        imgEl.style.transition = "none";
        if (containerEl && containerEl.isConnected) {
          containerEl.style.transition = "none";
          if (mode === "slot") containerEl.style.aspectRatio = prevAspectRatio;
        }
        cleanupInlineStyles();
        requestAnimationFrame(() => {
          if (imgEl.isConnected) imgEl.style.transition = "";
          if (containerEl && containerEl.isConnected) containerEl.style.transition = "";
        });
      }, 210);
    }
    throw err;
  }

  const nextSrc = getNextSrc(res);
  await preloadImage(nextSrc);
  if (!imgEl.isConnected) return res;

  imgEl.style.transition = "none";
  if (containerEl) {
    containerEl.style.transition = "none";
    if (mode === "slot") containerEl.style.aspectRatio = prevAspectRatio;
  }
  onAfterSwap?.(res);
  imgEl.src = nextSrc;
  cleanupInlineStyles();
  void imgEl.offsetHeight;
  requestAnimationFrame(() => {
    if (imgEl.isConnected) imgEl.style.transition = "";
    if (containerEl && containerEl.isConnected) containerEl.style.transition = "";
  });

  return res;
}
