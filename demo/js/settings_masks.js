/** Interactive drag-and-drop folder tree & filename mask token builders. */

import { $ } from "./state.js";
import { scheduleDebouncedSettingsSave, updateSettingsPathPreview } from "./settings.js";

const MASK_TOKENS = [
  { key: "category", label: "Category", token: "{category}", cls: "mask-tok-category" },
  { key: "year", label: "Year", token: "{year}", cls: "mask-tok-year" },
  { key: "date", label: "Date", token: "{date}", cls: "mask-tok-date" },
  { key: "title", label: "Title", token: "{title}", cls: "mask-tok-title" },
];
const MASK_TOKEN_MAP = Object.fromEntries(MASK_TOKENS.map((t) => [t.key, t]));
const MASK_SEP_CYCLES = {
  tree: ["/", " - ", "-", "_", " "],
  filename: [" ", " - ", "-", "_"],
};

const maskBuilderConfigs = {
  tree: {
    kind: "tree",
    label: "Folder Tree",
    inputSel: "#set-tree-template",
    builderSel: "#tree-mask-builder",
    canvasSel: "#tree-mask-canvas",
    toggleSel: "#toggle-tree-raw-btn",
    defaultSep: "/",
  },
  filename: {
    kind: "filename",
    label: "Filename Mask",
    inputSel: "#set-filename-mask",
    builderSel: "#filename-mask-builder",
    canvasSel: "#filename-mask-canvas",
    toggleSel: "#toggle-filename-raw-btn",
    defaultSep: " ",
  },
};

let activeMaskDrag = null;
let activeMaskTarget = "tree";

function parseMaskModel(templateStr) {
  const raw = String(templateStr || "");
  const re = /\{(category|year|date|title)\}/g;
  const matches = [];
  let match;
  while ((match = re.exec(raw)) !== null) {
    matches.push({ key: match[1], start: match.index, end: re.lastIndex });
  }
  if (matches.length === 0) {
    return { prefix: raw, tokens: [], seps: [], suffix: "" };
  }
  const prefix = raw.slice(0, matches[0].start);
  const suffix = raw.slice(matches[matches.length - 1].end);
  const tokens = matches.map((m) => m.key);
  const seps = [];
  for (let i = 0; i < matches.length - 1; i += 1) {
    seps.push(raw.slice(matches[i].end, matches[i + 1].start));
  }
  return { prefix, tokens, seps, suffix };
}

function serializeMaskModel(model) {
  if (!model.tokens.length) {
    return `${model.prefix || ""}${model.suffix || ""}`;
  }
  const middle = model.tokens
    .map((key, i) => (i === 0 ? "" : model.seps[i - 1] ?? "") + `{${key}}`)
    .join("");
  return `${model.prefix || ""}${middle}${model.suffix || ""}`;
}

function formatMaskSepLabel(value) {
  if (value === "") return "∅";
  if (value === " ") return "Space";
  if (value === " - ") return "␣ - ␣";
  return value;
}

function insertMaskToken(model, key, insertIdx, defaultSep) {
  const tokens = [...model.tokens];
  const seps = [...model.seps];
  const clampedIdx = Math.max(0, Math.min(tokens.length, insertIdx));
  if (tokens.length === 0) {
    tokens.push(key);
  } else if (clampedIdx === 0) {
    tokens.unshift(key);
    seps.unshift(defaultSep);
  } else if (clampedIdx >= tokens.length) {
    tokens.push(key);
    seps.push(defaultSep);
  } else {
    tokens.splice(clampedIdx, 0, key);
    seps.splice(clampedIdx - 1, 0, defaultSep);
  }
  return { ...model, tokens, seps };
}

function removeMaskToken(model, index) {
  const tokens = [...model.tokens];
  const seps = [...model.seps];
  if (index < 0 || index >= tokens.length) return model;
  tokens.splice(index, 1);
  if (seps.length > 0) {
    seps.splice(index === 0 ? 0 : index - 1, 1);
  }
  return { ...model, tokens, seps };
}

function moveMaskToken(model, fromIdx, toIdx) {
  const tokens = [...model.tokens];
  if (fromIdx < 0 || fromIdx >= tokens.length) return model;
  const [moved] = tokens.splice(fromIdx, 1);
  const clampedTarget = Math.max(0, Math.min(tokens.length, toIdx));
  tokens.splice(clampedTarget, 0, moved);
  return { ...model, tokens };
}

function commitMaskModel(kind, model) {
  const cfg = maskBuilderConfigs[kind];
  const input = $(cfg.inputSel);
  if (input) {
    input.value = serializeMaskModel(model);
  }
  renderMaskCanvas(kind, model);
  updateSettingsPathPreview();
  scheduleDebouncedSettingsSave();
}

function setActiveMaskTarget(kind) {
  if (!maskBuilderConfigs[kind]) return;
  activeMaskTarget = kind;
  Object.values(maskBuilderConfigs).forEach((cfg) => {
    const canvas = $(cfg.canvasSel);
    if (canvas) canvas.classList.toggle("is-active-target", cfg.kind === kind);
  });
  const hint = $("#mask-pool-hint");
  if (hint) {
    hint.textContent = `Drag blocks into either template below, or click to add to ${maskBuilderConfigs[kind].label}`;
  }
}

function hideMaskDropCaret(canvas) {
  if (!canvas) return;
  canvas.classList.remove("is-drag-over");
  if (canvas._dropCaret) {
    canvas._dropCaret.classList.add("hidden");
  }
}

function getMaskDropIndex(canvas, clientX, clientY) {
  const children = Array.from(canvas.children).filter(
    (el) => el.classList && el.classList.contains("mask-token-block") && !el.classList.contains("is-dragging")
  );
  if (children.length === 0) return { index: 0, caretRect: null };

  const rects = children.map((el, idx) => ({ idx, rect: el.getBoundingClientRect() }));
  const target = rects.find(
    ({ rect }) => clientY >= rect.top - 6 && clientY <= rect.bottom + 6 && clientX <= rect.left + rect.width / 2
  );
  if (!target) {
    const sameRow = rects.filter(({ rect }) => clientY >= rect.top - 6 && clientY <= rect.bottom + 6);
    if (sameRow.length > 0) {
      const lastInRow = sameRow[sameRow.length - 1];
      if (clientX > lastInRow.rect.left + lastInRow.rect.width / 2) {
        return { index: lastInRow.idx + 1, caretRect: lastInRow.rect, after: true };
      }
    }
    const below = rects.find(({ rect }) => clientY < rect.top);
    if (below) {
      return { index: below.idx, caretRect: below.rect, after: false };
    }
    const last = rects[rects.length - 1];
    return { index: last.idx + 1, caretRect: last.rect, after: true };
  }
  return { index: target.idx, caretRect: target.rect, after: false };
}

function showMaskDropCaret(canvas, clientX, clientY) {
  if (!canvas || typeof canvas.getBoundingClientRect !== "function") return 0;
  const { index, caretRect, after } = getMaskDropIndex(canvas, clientX, clientY);
  if (!canvas._dropCaret) {
    const caret = document.createElement("div");
    caret.className = "mask-drop-caret hidden";
    canvas._dropCaret = caret;
    canvas.appendChild(caret);
  }
  const caret = canvas._dropCaret;
  if (!caret.parentNode) canvas.appendChild(caret);
  const canvasRect = canvas.getBoundingClientRect();
  if (!caretRect) {
    caret.style.left = "10px";
    caret.style.top = "10px";
    caret.style.height = "26px";
  } else {
    const x = (after ? caretRect.right + 3 : caretRect.left - 4) - canvasRect.left;
    const y = caretRect.top - canvasRect.top;
    caret.style.left = `${Math.max(4, x)}px`;
    caret.style.top = `${Math.max(6, y)}px`;
    caret.style.height = `${Math.max(22, caretRect.height)}px`;
  }
  caret.classList.remove("hidden");
  return index;
}

export function renderMaskCanvas(kind, explicitModel = null) {
  const cfg = maskBuilderConfigs[kind];
  const canvas = $(cfg.canvasSel);
  const input = $(cfg.inputSel);
  if (!canvas || !input) return;

  const model = explicitModel ?? parseMaskModel(input.value);
  canvas.innerHTML = "";
  canvas._dropCaret = null;

  if (model.tokens.length === 0 && !model.prefix && !model.suffix) {
    const empty = document.createElement("span");
    empty.className = "mask-canvas-empty";
    empty.textContent = "Drop blocks here or click a block above to add…";
    canvas.appendChild(empty);
    return;
  }

  if (model.prefix) {
    const prefixEl = document.createElement("span");
    prefixEl.className = "mask-literal-chip";
    prefixEl.textContent = model.prefix;
    canvas.appendChild(prefixEl);
  }

  model.tokens.forEach((key, index) => {
    if (index > 0) {
      const sepIdx = index - 1;
      const sepVal = model.seps[sepIdx] ?? cfg.defaultSep;
      const sepBtn = document.createElement("button");
      sepBtn.type = "button";
      sepBtn.className = "mask-sep-btn";
      sepBtn.textContent = formatMaskSepLabel(sepVal);
      sepBtn.title = "Click to cycle separator";
      sepBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        setActiveMaskTarget(kind);
        const curModel = parseMaskModel(input.value);
        const cycle = MASK_SEP_CYCLES[kind] || [" "];
        const curPos = cycle.indexOf(curModel.seps[sepIdx]);
        curModel.seps[sepIdx] = cycle[(curPos + 1) % cycle.length];
        commitMaskModel(kind, curModel);
      });
      canvas.appendChild(sepBtn);
    }

    const meta = MASK_TOKEN_MAP[key];
    const block = document.createElement("span");
    block.draggable = true;
    block.dataset.index = String(index);
    block.className = `mask-block mask-token-block ${meta ? meta.cls : "mask-tok-category"}`;

    const grip = document.createElement("span");
    grip.className = "mask-block-grip";
    grip.textContent = "⋮⋮";
    block.appendChild(grip);

    const label = document.createElement("span");
    label.textContent = meta ? meta.label : key;
    block.appendChild(label);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "mask-block-remove";
    removeBtn.title = "Remove block";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setActiveMaskTarget(kind);
      const curModel = parseMaskModel(input.value);
      commitMaskModel(kind, removeMaskToken(curModel, index));
    });
    block.appendChild(removeBtn);

    block.addEventListener("dragstart", (e) => {
      activeMaskDrag = { source: "canvas", fromKind: kind, fromIndex: index, key };
      block.classList.add("is-dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "copyMove";
        e.dataTransfer.setData("text/plain", JSON.stringify(activeMaskDrag));
      }
    });

    block.addEventListener("dragend", () => {
      block.classList.remove("is-dragging");
      activeMaskDrag = null;
      hideMaskDropCaret(canvas);
    });

    canvas.appendChild(block);
  });

  if (model.suffix) {
    const suffixEl = document.createElement("span");
    suffixEl.className = "mask-literal-chip";
    suffixEl.textContent = model.suffix;
    canvas.appendChild(suffixEl);
  }
}

function renderMaskPool() {
  const pool = $("#mask-block-pool");
  if (!pool) return;
  pool.innerHTML = "";

  MASK_TOKENS.forEach((tok) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.draggable = true;
    btn.dataset.tokenKey = tok.key;
    btn.className = `mask-block mask-palette-btn ${tok.cls}`;

    const grip = document.createElement("span");
    grip.className = "mask-block-grip";
    grip.textContent = "⋮⋮";
    btn.appendChild(grip);

    const text = document.createElement("span");
    text.textContent = tok.label;
    btn.appendChild(text);

    btn.title = `Drag into a template, or click to add ${tok.label}`;

    btn.addEventListener("click", () => {
      const cfg = maskBuilderConfigs[activeMaskTarget] || maskBuilderConfigs.tree;
      const input = $(cfg.inputSel);
      if (!input) return;
      const model = parseMaskModel(input.value);
      commitMaskModel(cfg.kind, insertMaskToken(model, tok.key, model.tokens.length, cfg.defaultSep));
    });

    btn.addEventListener("dragstart", (e) => {
      activeMaskDrag = { source: "pool", key: tok.key };
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("text/plain", JSON.stringify(activeMaskDrag));
      }
    });

    btn.addEventListener("dragend", () => {
      activeMaskDrag = null;
      Object.values(maskBuilderConfigs).forEach((cfg) => hideMaskDropCaret($(cfg.canvasSel)));
    });

    pool.appendChild(btn);
  });
}

export function renderMaskBuilders() {
  renderMaskCanvas("tree");
  renderMaskCanvas("filename");
}

export function initMaskBuilders() {
  renderMaskPool();
  setActiveMaskTarget(activeMaskTarget);

  Object.values(maskBuilderConfigs).forEach((cfg) => {
    const { kind } = cfg;
    const canvas = $(cfg.canvasSel);
    const builder = $(cfg.builderSel);
    const input = $(cfg.inputSel);
    const toggleBtn = $(cfg.toggleSel);

    if (canvas && input) {
      canvas.addEventListener("click", () => setActiveMaskTarget(kind));
      canvas.addEventListener("focus", () => setActiveMaskTarget(kind));

      canvas.addEventListener("dragover", (e) => {
        if (!activeMaskDrag) return;
        e.preventDefault();
        canvas.classList.add("is-drag-over");
        showMaskDropCaret(canvas, e.clientX, e.clientY);
      });

      canvas.addEventListener("dragleave", (e) => {
        if (!e.relatedTarget || (typeof canvas.contains === "function" && !canvas.contains(e.relatedTarget))) {
          hideMaskDropCaret(canvas);
        }
      });

      canvas.addEventListener("drop", (e) => {
        e.preventDefault();
        let drag = activeMaskDrag;
        if (!drag && e.dataTransfer) {
          try {
            drag = JSON.parse(e.dataTransfer.getData("text/plain") || "null");
          } catch {
            drag = null;
          }
        }
        const insertIdx = showMaskDropCaret(canvas, e.clientX, e.clientY);
        hideMaskDropCaret(canvas);
        activeMaskDrag = null;
        if (!drag || !drag.key) return;

        setActiveMaskTarget(kind);
        const model = parseMaskModel(input.value);
        if (drag.source === "canvas" && drag.fromKind === kind && Number.isInteger(drag.fromIndex)) {
          commitMaskModel(kind, moveMaskToken(model, drag.fromIndex, insertIdx));
        } else {
          commitMaskModel(kind, insertMaskToken(model, drag.key, insertIdx, cfg.defaultSep));
        }
      });
    }

    if (toggleBtn && builder && input) {
      toggleBtn.addEventListener("click", () => {
        const showingRaw = !input.classList.contains("hidden");
        if (showingRaw) {
          input.classList.add("hidden");
          builder.classList.remove("hidden");
          toggleBtn.textContent = "Edit as text";
          renderMaskCanvas(kind);
        } else {
          builder.classList.add("hidden");
          input.classList.remove("hidden");
          toggleBtn.textContent = "Use blocks";
          if (typeof input.focus === "function") input.focus();
        }
      });
    }
  });
}
