/** Unified modal scroll-lock, open/close animation, dismissal, and batch modal scaffold helpers. */

import { $ } from "./state.js";
import { esc, getCategoryTone, prefersReducedMotion } from "./utils.js";

const modalCloseTimers = new WeakMap();

function syncModalScrollLock() {
  const docEl = document.documentElement;
  if (!docEl || !docEl.classList) return;
  const modals = [$("#doc-modal"), $("#setup-modal"), $("#license-modal")].filter(Boolean);
  const anyOpen = modals.some((m) => !m.classList.contains("hidden"));
  if (anyOpen) {
    if (!docEl.classList.contains("modal-open")) {
      const innerW = typeof window.innerWidth === "number" ? window.innerWidth : 0;
      const clientW = typeof docEl.clientWidth === "number" ? docEl.clientWidth : 0;
      const scrollbarW = innerW > clientW ? innerW - clientW : 0;
      if (scrollbarW > 0 && docEl.style) {
        docEl.style.paddingRight = `${scrollbarW}px`;
      }
      docEl.classList.add("modal-open");
    }
    if (document.body && document.body.classList) {
      document.body.classList.add("modal-open");
    }
  } else {
    docEl.classList.remove("modal-open");
    if (docEl.style) {
      docEl.style.paddingRight = "";
    }
    if (document.body && document.body.classList) {
      document.body.classList.remove("modal-open");
    }
  }
}

export function showAnimatedModal(modal) {
  if (!modal) return;
  const prevTimer = modalCloseTimers.get(modal);
  if (prevTimer) {
    clearTimeout(prevTimer);
    modalCloseTimers.delete(modal);
  }
  modal.classList.remove("modal-closing", "hidden");
  const card = typeof modal.querySelector === "function" ? modal.querySelector(".modal-card") : null;
  if (card) card.scrollTop = 0;
  syncModalScrollLock();
}

export function closeAnimatedModal(modal) {
  if (!modal || modal.classList.contains("hidden") || modal.classList.contains("modal-closing")) {
    return;
  }
  const prevTimer = modalCloseTimers.get(modal);
  if (prevTimer) {
    clearTimeout(prevTimer);
    modalCloseTimers.delete(modal);
  }
  if (prefersReducedMotion()) {
    modal.classList.remove("modal-closing");
    modal.classList.add("hidden");
    syncModalScrollLock();
    return;
  }
  modal.classList.add("modal-closing");
  const timer = setTimeout(() => {
    modal.classList.remove("modal-closing");
    modal.classList.add("hidden");
    modalCloseTimers.delete(modal);
    syncModalScrollLock();
  }, 255);
  modalCloseTimers.set(modal, timer);
}

export function setModalCompact(compact) {
  const card = $("#doc-modal .modal-card");
  if (card) card.classList.toggle("modal-card-compact", Boolean(compact));
}

export function renderBatchDocRows(docs) {
  return docs.map((d) => `
    <div class="reclass-doc-row">
      <div class="reclass-doc-info">
        <div class="reclass-doc-title">${esc(d.title)}</div>
        <div class="reclass-doc-path">${esc(d.vault_rel_path)}</div>
      </div>
      <span class="tag ${getCategoryTone(d.category)}">${esc(d.category)}</span>
    </div>
  `).join("");
}

export function bindModalDismiss(modal, onClose) {
  if (!modal) return;
  const handler = onClose || (() => closeAnimatedModal(modal));
  modal.querySelector(".modal-backdrop")?.addEventListener("click", handler);
  modal.querySelector(".modal-close-btn")?.addEventListener("click", handler);
}

export function createDebouncedCallback(fn, delayMs = 180) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}
