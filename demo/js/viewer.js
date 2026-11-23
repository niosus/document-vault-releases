/** Full-file PDF/image scroll viewer modal with zoom, dark inversion, and page rotation. */

import { $ } from "./state.js";
import { setModalCompact, showAnimatedModal } from "./modals.js";
import { animatePageRotation, buildRotateButtonsHtml, rotateVaultDocumentPage } from "./page_rotation.js";
import { getStoredInvertDocsDark, setInvertDocsDark } from "./theme.js";
import {
  api,
  esc,
  prefersReducedMotion,
  toast,
} from "./utils.js";

export function openFullFilePreview(fileUrl, title, filename, options = {}) {
  const modal = $("#doc-modal");
  const modalBody = $("#modal-body");
  setModalCompact(false);
  $("#modal-title").textContent = title || filename || "Document Preview";

  const docId = options?.docId ? Number(options.docId) : null;
  const lowerName = String(filename || "").toLowerCase();
  const isPdf = lowerName.endsWith(".pdf");
  const isTiff = lowerName.endsWith(".tif") || lowerName.endsWith(".tiff");
  const useScrollPages = Boolean(docId && (isPdf || isTiff));

  let currentPage = 1;
  let pageCount = 1;
  let pagesMeta = [{ page: 1, width: 612, height: 792 }];
  let fileVersion = Date.now();
  let isRotating = false;
  let pageObserver = null;
  let scrollEl = null;
  let pageSlots = [];
  let scrollRafId = null;
  let suppressScrollUntil = 0;

  const toolbarHtml = docId
    ? `<div class="preview-toolbar">
         <div class="preview-toolbar-group">
           <div id="preview-page-nav" class="preview-page-nav ${isPdf || isTiff ? "" : "hidden"}">
             <button id="preview-prev-page" type="button" class="btn btn-secondary btn-xs" title="Previous page" disabled>‹</button>
             <span class="preview-page-label">
               Page
               <input id="preview-page-input" class="preview-page-input" type="number" min="1" max="1" value="1" aria-label="Page number" />
               of <span id="preview-page-total">1</span>
             </span>
             <button id="preview-next-page" type="button" class="btn btn-secondary btn-xs" title="Next page" disabled>›</button>
           </div>
         </div>
         <div class="preview-toolbar-group preview-rotate-group">
           <span id="preview-rotate-status" class="preview-rotate-status muted">Rotate page</span>
           ${buildRotateButtonsHtml({ compact: false })}
         </div>
       </div>`
    : "";

  const backBtnHtml = typeof options?.onBack === "function"
    ? `<button id="preview-back-btn" type="button" class="btn btn-secondary btn-sm">← Back</button>`
    : "";

  modalBody.innerHTML = `
    <div id="full-preview-root" class="full-preview-root" style="display:flex; flex-direction:column; gap:12px;">
      ${toolbarHtml}
      <div id="viewer-frame-wrap" class="viewer-frame-wrap"></div>
      <div class="preview-modal-footer">
        <label class="switch-label preview-invert-toggle" title="Invert white document colors while in dark mode">
          <input type="checkbox" class="preview-invert-cb" ${getStoredInvertDocsDark() ? "checked" : ""} />
          <span class="switch-track"></span>
          <span>Invert in Dark Mode</span>
        </label>
        <div class="action-buttons" style="justify-content:flex-end;">
          ${backBtnHtml}
          <a id="preview-open-tab-link" class="btn btn-secondary btn-sm" href="${esc(fileUrl)}" target="_blank" rel="noopener">Open in New Tab</a>
          <a id="preview-download-link" class="btn btn-secondary btn-sm" href="${esc(fileUrl)}?download=1">Download</a>
        </div>
      </div>
    </div>
  `;

  const rootEl = modalBody.querySelector("#full-preview-root");
  const frameWrap = modalBody.querySelector("#viewer-frame-wrap");
  const openTabLink = modalBody.querySelector("#preview-open-tab-link");
  const backBtn = modalBody.querySelector("#preview-back-btn");
  if (backBtn && typeof options?.onBack === "function") {
    backBtn.addEventListener("click", () => {
      disconnectScrollResources();
      options.onBack();
    });
  }
  const invertCb = modalBody.querySelector(".preview-invert-cb");
  if (invertCb) {
    invertCb.addEventListener("change", (e) => setInvertDocsDark(e.target.checked));
  }

  function disconnectScrollResources() {
    if (pageObserver) {
      pageObserver.disconnect();
      pageObserver = null;
    }
    if (scrollRafId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(scrollRafId);
      scrollRafId = null;
    }
    scrollEl = null;
    pageSlots = [];
  }

  function ensureSlotImageLoaded(slot) {
    if (!slot || !docId) return;
    const pNum = Number(slot.dataset.page || 1);
    const img = slot.querySelector(".pdf-page-img");
    if (!img) return;
    const desiredSrc = `/api/documents/${docId}/pages/${pNum}?v=${fileVersion}`;
    if (img.dataset.loadedSrc !== desiredSrc) {
      img.dataset.loadedSrc = desiredSrc;
      img.src = desiredSrc;
    }
  }

  function syncToolbarState() {
    if (!docId) return;
    const pageNav = modalBody.querySelector("#preview-page-nav");
    if (pageNav) {
      pageNav.classList.toggle("hidden", !isPdf && pageCount <= 1);
    }
    const prevBtn = modalBody.querySelector("#preview-prev-page");
    const nextBtn = modalBody.querySelector("#preview-next-page");
    const pageInput = modalBody.querySelector("#preview-page-input");
    const totalEl = modalBody.querySelector("#preview-page-total");
    if (pageInput) {
      pageInput.max = String(pageCount);
      pageInput.value = String(currentPage);
      pageInput.disabled = pageCount <= 1 || isRotating;
    }
    if (totalEl) totalEl.textContent = String(pageCount);
    if (prevBtn) prevBtn.disabled = isRotating || currentPage <= 1;
    if (nextBtn) nextBtn.disabled = isRotating || currentPage >= pageCount;

    modalBody.querySelectorAll(".preview-rotate-btn").forEach((btn) => {
      btn.disabled = isRotating;
    });
    const statusEl = modalBody.querySelector("#preview-rotate-status");
    if (statusEl) {
      statusEl.textContent = isRotating ? "Rotating…" : "Rotate page";
    }
  }

  function detectMostVisiblePage() {
    if (!scrollEl || !pageSlots.length) return currentPage;
    if (scrollEl.scrollTop <= 4) return 1;
    if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 4) {
      return pageSlots.length;
    }
    const viewRect = scrollEl.getBoundingClientRect();
    const viewMid = viewRect.top + viewRect.height * 0.45;
    let bestPage = currentPage;
    let bestVisiblePx = -1;
    let closestDist = Infinity;

    for (let i = 0; i < pageSlots.length; i += 1) {
      const slot = pageSlots[i];
      const r = slot.getBoundingClientRect();
      const visibleTop = Math.max(r.top, viewRect.top);
      const visibleBottom = Math.min(r.bottom, viewRect.bottom);
      const visiblePx = Math.max(0, visibleBottom - visibleTop);
      const mid = (r.top + r.bottom) / 2;
      const dist = Math.abs(mid - viewMid);

      if (visiblePx > bestVisiblePx || (visiblePx === bestVisiblePx && dist < closestDist)) {
        bestVisiblePx = visiblePx;
        closestDist = dist;
        bestPage = i + 1;
      }
    }
    return bestPage;
  }

  function renderScrollViewer() {
    if (!frameWrap || !docId) return;
    disconnectScrollResources();

    const container = document.createElement("div");
    container.id = "pdf-scroll-viewer";
    container.className = "pdf-scroll-viewer";

    const slots = [];
    for (let idx = 0; idx < pageCount; idx += 1) {
      const meta = pagesMeta[idx] || { page: idx + 1, width: 612, height: 792 };
      const pNum = Number(meta.page || idx + 1);
      const w = Math.max(1, Number(meta.width || 612));
      const h = Math.max(1, Number(meta.height || 792));

      const slot = document.createElement("div");
      slot.className = "pdf-page-slot";
      slot.dataset.page = String(pNum);
      slot.style.aspectRatio = `${w} / ${h}`;
      slot.innerHTML = `
        <span class="pdf-page-badge">Page ${pNum}${pageCount > 1 ? ` / ${pageCount}` : ""}</span>
        <img class="pdf-page-img" alt="Page ${pNum}" decoding="async" />
      `;
      container.appendChild(slot);
      slots.push(slot);
    }

    frameWrap.innerHTML = "";
    frameWrap.appendChild(container);
    scrollEl = container;
    pageSlots = slots;

    if (typeof IntersectionObserver !== "undefined") {
      pageObserver = new IntersectionObserver(
        (entries) => {
          if (!rootEl || !rootEl.isConnected) {
            disconnectScrollResources();
            return;
          }
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              ensureSlotImageLoaded(entry.target);
            }
          });
        },
        { root: container, rootMargin: "650px 0px" }
      );
      slots.forEach((slot) => pageObserver.observe(slot));
    }

    // Eagerly load current page and neighbors
    for (let p = Math.max(1, currentPage - 1); p <= Math.min(pageCount, currentPage + 1); p += 1) {
      ensureSlotImageLoaded(slots[p - 1]);
    }

    container.addEventListener("scroll", () => {
      if (!rootEl || !rootEl.isConnected) return;
      if (Date.now() < suppressScrollUntil) return;
      if (scrollRafId !== null) return;
      const schedule = typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (fn) => setTimeout(fn, 16);
      scrollRafId = schedule(() => {
        scrollRafId = null;
        if (!scrollEl || !scrollEl.isConnected) return;
        const visiblePage = detectMostVisiblePage();
        if (visiblePage !== currentPage) {
          currentPage = visiblePage;
          syncToolbarState();
        }
        for (let p = Math.max(1, currentPage - 1); p <= Math.min(pageCount, currentPage + 1); p += 1) {
          ensureSlotImageLoaded(pageSlots[p - 1]);
        }
      });
    }, { passive: true });

    if (currentPage > 1 && slots[currentPage - 1] && typeof slots[currentPage - 1].scrollIntoView === "function") {
      suppressScrollUntil = Date.now() + 200;
      slots[currentPage - 1].scrollIntoView({ behavior: "auto", block: "start" });
    }
  }

  function renderViewerContent() {
    if (!frameWrap) return;
    if (!docId && isPdf) {
      disconnectScrollResources();
      frameWrap.innerHTML = `<iframe class="pdf-viewer-frame" src="${esc(fileUrl)}" title="PDF Preview"></iframe>`;
    } else if (useScrollPages || (docId && pageCount > 1)) {
      renderScrollViewer();
    } else {
      disconnectScrollResources();
      const imgUrl = docId ? `${fileUrl}?v=${fileVersion}` : fileUrl;
      frameWrap.innerHTML = `<img class="image-viewer-full" src="${esc(imgUrl)}" alt="Document preview" />`;
    }
    if (openTabLink && docId) {
      openTabLink.href = `${fileUrl}?v=${fileVersion}`;
    }
  }

  function goToPage(nextPage) {
    const clamped = Math.max(1, Math.min(pageCount, Number(nextPage) || 1));
    currentPage = clamped;
    syncToolbarState();
    if (pageSlots[clamped - 1]) {
      const targetSlot = pageSlots[clamped - 1];
      for (let p = Math.max(1, clamped - 1); p <= Math.min(pageCount, clamped + 1); p += 1) {
        ensureSlotImageLoaded(pageSlots[p - 1]);
      }
      suppressScrollUntil = Date.now() + 500;
      if (typeof targetSlot.scrollIntoView === "function") {
        targetSlot.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: "start",
        });
      }
    } else {
      renderViewerContent();
    }
  }

  if (docId) {
    const prevBtn = modalBody.querySelector("#preview-prev-page");
    const nextBtn = modalBody.querySelector("#preview-next-page");
    const pageInput = modalBody.querySelector("#preview-page-input");
    if (prevBtn) prevBtn.addEventListener("click", () => goToPage(currentPage - 1));
    if (nextBtn) nextBtn.addEventListener("click", () => goToPage(currentPage + 1));
    if (pageInput) {
      pageInput.addEventListener("change", () => goToPage(pageInput.value));
    }

    modalBody.querySelectorAll(".preview-rotate-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (isRotating) return;
        const angle = Number(btn.dataset.angle || 90);
        const targetPage = currentPage;
        isRotating = true;
        syncToolbarState();
        try {
          const targetSlot = pageSlots[targetPage - 1] || null;
          const targetImg = targetSlot
            ? targetSlot.querySelector(".pdf-page-img")
            : frameWrap.querySelector(".image-viewer-full");

          let res;
          if (targetImg) {
            res = await animatePageRotation({
              imgEl: targetImg,
              containerEl: targetSlot || frameWrap,
              angle,
              mode: targetSlot ? "slot" : "contain",
              onRequest: () => rotateVaultDocumentPage(docId, targetPage, angle),
              getNextSrc: () => {
                fileVersion = Date.now();
                return (useScrollPages || pageCount > 1)
                  ? `/api/documents/${docId}/pages/${targetPage}?v=${fileVersion}`
                  : `${fileUrl}?v=${fileVersion}`;
              },
              onAfterSwap: (rotateRes) => {
                if (Array.isArray(rotateRes.pages) && rotateRes.pages.length) {
                  pagesMeta = rotateRes.pages;
                }
                if (targetSlot) {
                  const meta = pagesMeta[targetPage - 1];
                  if (meta) {
                    targetSlot.style.aspectRatio = `${Math.max(1, meta.width)} / ${Math.max(1, meta.height)}`;
                  }
                  targetImg.dataset.loadedSrc = `/api/documents/${docId}/pages/${targetPage}?v=${fileVersion}`;
                }
                if (openTabLink) {
                  openTabLink.href = `${fileUrl}?v=${fileVersion}`;
                }
              },
            });
          } else {
            res = await rotateVaultDocumentPage(docId, targetPage, angle);
            if (!rootEl || !rootEl.isConnected) return;
            fileVersion = Date.now();
            if (Array.isArray(res.pages) && res.pages.length) {
              pagesMeta = res.pages;
            }
            renderViewerContent();
          }

          if (!rootEl || !rootEl.isConnected) return;
          pageCount = Math.max(1, Number(res.page_count || pageCount));
          currentPage = Math.min(targetPage, pageCount);
          const dirLabel = angle === -90 ? "90° left" : angle === 180 ? "180°" : "90° right";
          toast(`Rotated page ${currentPage} ${dirLabel} and updated file`);
        } catch (err) {
          toast(err.message, true);
        } finally {
          if (rootEl && rootEl.isConnected) {
            isRotating = false;
            syncToolbarState();
          }
        }
      });
    });

    api(`/api/documents/${docId}/pages`)
      .then((info) => {
        if (!rootEl || !rootEl.isConnected) return;
        pageCount = Math.max(1, Number(info.page_count || 1));
        if (Array.isArray(info.pages) && info.pages.length) {
          pagesMeta = info.pages;
        }
        currentPage = Math.min(currentPage, pageCount);
        syncToolbarState();
        if (useScrollPages || pageCount > 1) {
          renderScrollViewer();
        }
      })
      .catch(() => {
        // Keep default pageCount=1 if metadata lookup fails
      });
  }

  syncToolbarState();
  renderViewerContent();
  showAnimatedModal(modal);
}
