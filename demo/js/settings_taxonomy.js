/** Settings hierarchical category tree, filtering, and inline sub-label creation. */

import { saveSettingsAuto, updatePromptPreviewAndBadge } from "./settings.js";
import { deleteCategoryPath, openRenameLabelModal } from "./settings_label_modals.js";
import { initFilingRuleListeners } from "./settings_rules.js";
import { $, state } from "./state.js";
import {
  buildCategoryOptions,
  formatLabelDisplay,
  getCategoryTone,
  toast,
} from "./utils.js";

const collapsedCategoryPaths = new Set();
const branchUiByPath = new Map();
let activeInlineAddParent = null;
let categoryFilterQuery = "";

const ICON_CHEVRON = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4l4 4-4 4"/></svg>`;
const ICON_PLUS = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>`;
const ICON_PENCIL = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.5 2.5a1.4 1.4 0 0 1 2 2L5.5 12.5l-3 .75.75-3z"/></svg>`;
const ICON_TRASH = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 4.5l.5 8.5a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1l.5-8.5"/></svg>`;

function normalizeLabelInput(raw) {
  return String(raw || "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("/");
}

function sortTreeNodes(nodes, isRoot = false) {
  nodes.sort((a, b) => {
    if (isRoot) {
      const aOther = a.path.toLowerCase() === "other";
      const bOther = b.path.toLowerCase() === "other";
      if (aOther !== bOther) return aOther ? 1 : -1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  nodes.forEach((node) => {
    if (node.children.length) sortTreeNodes(node.children, false);
  });
  return nodes;
}

export function buildCategoryTree(categories) {
  const nodesByLower = new Map();
  const ordered = [...(categories || [])]
    .map((c) => normalizeLabelInput(c))
    .filter(Boolean)
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b, undefined, { sensitivity: "base" }));

  for (const fullPath of ordered) {
    const parts = fullPath.split("/");
    for (let idx = 0; idx < parts.length; idx += 1) {
      const seg = parts[idx];
      const subLower = parts.slice(0, idx + 1).join("/").toLowerCase();
      const isLeaf = idx === parts.length - 1;
      if (!nodesByLower.has(subLower)) {
        const parentLower = idx > 0 ? parts.slice(0, idx).join("/").toLowerCase() : "";
        const parentNode = parentLower ? nodesByLower.get(parentLower) : null;
        const canonPath = parentNode ? `${parentNode.path}/${seg}` : seg;
        const node = {
          path: canonPath,
          name: seg,
          explicit: isLeaf,
          children: [],
        };
        nodesByLower.set(subLower, node);
      } else if (isLeaf) {
        nodesByLower.get(subLower).explicit = true;
      }
    }
  }

  const roots = [];
  for (const node of nodesByLower.values()) {
    const parts = node.path.split("/");
    if (parts.length <= 1) {
      roots.push(node);
    } else {
      const parentLower = parts.slice(0, -1).join("/").toLowerCase();
      const parent = nodesByLower.get(parentLower);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }
  return sortTreeNodes(roots, true);
}

function countDescendants(node) {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

function collectParentPaths(nodes, out = []) {
  for (const node of nodes) {
    if (node.children.length) {
      out.push(node.path.toLowerCase());
      collectParentPaths(node.children, out);
    }
  }
  return out;
}

function updateCollapseAllButton(roots) {
  const toggleAllBtn = $("#toggle-all-categories-btn");
  if (!toggleAllBtn) return;
  const parentPaths = collectParentPaths(roots);
  if (!parentPaths.length || categoryFilterQuery) {
    toggleAllBtn.classList.add("hidden");
    return;
  }
  toggleAllBtn.classList.remove("hidden");
  const anyCollapsed = parentPaths.some((p) => collapsedCategoryPaths.has(p));
  toggleAllBtn.textContent = anyCollapsed ? "Expand all" : "Collapse all";
  toggleAllBtn.dataset.mode = anyCollapsed ? "expand" : "collapse";
}

function expandAncestors(path) {
  const parts = normalizeLabelInput(path).split("/").filter(Boolean);
  for (let i = 1; i < parts.length; i += 1) {
    collapsedCategoryPaths.delete(parts.slice(0, i).join("/").toLowerCase());
  }
}

function addCategoryPath(rawPath) {
  const val = normalizeLabelInput(rawPath);
  if (!val) return false;
  const list = state.settings.categories || [];
  if (!list.some((c) => c.toLowerCase() === val.toLowerCase())) {
    list.push(val);
    state.settings.categories = list;
    expandAncestors(val);
    renderCategoryTree(list);
    updatePromptPreviewAndBadge();
    saveSettingsAuto();
    return true;
  }
  toast(`"${formatLabelDisplay(val)}" already exists.`);
  return false;
}

function createActionButton({ className = "", title = "", ariaLabel = "", svg = "", label = "", onClick }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `category-tree-action-btn ${className}`.trim();
  if (title) btn.title = title;
  if (ariaLabel) btn.setAttribute("aria-label", ariaLabel);
  if (svg) btn.innerHTML = svg;
  if (label) {
    const span = document.createElement("span");
    span.textContent = label;
    btn.appendChild(span);
  }
  btn.addEventListener("click", (e) => {
    e.stopPropagation?.();
    onClick();
  });
  return btn;
}

function createInlineAddRow(parentNode) {
  const row = document.createElement("div");
  row.className = "category-tree-inline-add";

  const swatch = document.createElement("span");
  swatch.className = `category-tree-swatch is-sub ${getCategoryTone(parentNode.path)}`;
  swatch.setAttribute("aria-hidden", "true");

  const input = document.createElement("input");
  input.type = "text";
  input.className = "category-tree-inline-input";
  input.placeholder = `Sub-label under ${parentNode.name}…`;
  input.setAttribute("aria-label", `New sub-label under ${parentNode.path}`);

  const submit = () => {
    const childPath = normalizeLabelInput(input.value);
    if (!childPath) {
      activeInlineAddParent = null;
      renderCategoryTree(state.settings.categories || []);
      return;
    }
    const fullPath = `${parentNode.path}/${childPath}`;
    activeInlineAddParent = null;
    addCategoryPath(fullPath);
  };

  const cancel = () => {
    activeInlineAddParent = null;
    renderCategoryTree(state.settings.categories || []);
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  });

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn btn-primary btn-xs";
  addBtn.textContent = "Add";
  addBtn.addEventListener("click", submit);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn-secondary btn-xs";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", cancel);

  row.appendChild(swatch);
  row.appendChild(input);
  row.appendChild(addBtn);
  row.appendChild(cancelBtn);
  return { row, input };
}

function setBranchCollapsedState(key, collapsed) {
  if (collapsed) collapsedCategoryPaths.add(key);
  else collapsedCategoryPaths.delete(key);

  const refs = branchUiByPath.get(key);
  if (!refs) return;
  const { row, toggleBtn, countBadge, shell, path } = refs;
  const expandedStr = collapsed ? "false" : "true";
  row.setAttribute("aria-expanded", expandedStr);
  if (toggleBtn) {
    toggleBtn.setAttribute("aria-expanded", expandedStr);
    toggleBtn.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${path}`);
  }
  if (countBadge) {
    countBadge.classList.toggle("hidden", !collapsed);
  }
  if (shell) {
    shell.classList.toggle("is-collapsed", collapsed);
    shell.setAttribute("aria-hidden", collapsed ? "true" : "false");
    shell.inert = collapsed;
  }
}

function renderTreeNode(node, depth = 0) {
  const branch = document.createElement("div");
  branch.className = "category-tree-branch";
  branch.dataset.category = node.path;

  const key = node.path.toLowerCase();
  const isOther = key === "other";
  const hasChildren = node.children.length > 0;
  const isInlineTarget = Boolean(activeInlineAddParent && activeInlineAddParent.toLowerCase() === key);
  const isCollapsed = !isInlineTarget && !categoryFilterQuery && collapsedCategoryPaths.has(key);

  const row = document.createElement("div");
  row.className = `category-tree-row${isOther ? " is-other" : ""}`;
  row.dataset.category = node.path;
  row.dataset.depth = String(depth);
  row.setAttribute("role", "treeitem");
  if (hasChildren) {
    row.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
  }

  const main = document.createElement("div");
  main.className = "category-tree-main";

  let toggleBtn = null;
  if (hasChildren) {
    toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "category-tree-toggle";
    toggleBtn.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    toggleBtn.setAttribute("aria-label", `${isCollapsed ? "Expand" : "Collapse"} ${node.path}`);
    toggleBtn.innerHTML = ICON_CHEVRON;
    toggleBtn.addEventListener("click", () => {
      const nextCollapsed = !collapsedCategoryPaths.has(key);
      setBranchCollapsedState(key, nextCollapsed);
      updateCollapseAllButton(buildCategoryTree(state.settings?.categories || []));
    });
    main.appendChild(toggleBtn);
  } else if (depth === 0) {
    const spacer = document.createElement("span");
    spacer.className = "category-tree-toggle-spacer";
    spacer.setAttribute("aria-hidden", "true");
    main.appendChild(spacer);
  }

  const swatch = document.createElement("span");
  swatch.className = `category-tree-swatch ${depth > 0 ? "is-sub " : ""}${getCategoryTone(node.path)}`.trim();
  swatch.setAttribute("aria-hidden", "true");
  main.appendChild(swatch);

  if (isOther) {
    const nameSpan = document.createElement("span");
    nameSpan.className = "category-tree-name is-static";
    nameSpan.textContent = node.name;
    main.appendChild(nameSpan);

    const badge = document.createElement("span");
    badge.className = "category-tree-badge";
    badge.textContent = "Fallback";
    main.appendChild(badge);
  } else {
    const nameBtn = document.createElement("button");
    nameBtn.type = "button";
    nameBtn.className = `category-tree-name${depth > 0 ? " is-sub" : ""}`;
    nameBtn.textContent = node.name;
    nameBtn.title = `Rename or merge ${formatLabelDisplay(node.path)}`;
    nameBtn.addEventListener("click", () => openRenameLabelModal(node.path));
    main.appendChild(nameBtn);
  }

  let countBadge = null;
  if (hasChildren) {
    const count = countDescendants(node);
    countBadge = document.createElement("span");
    countBadge.className = `category-tree-count${isCollapsed ? "" : " hidden"}`;
    countBadge.textContent = `${count} sub-label${count === 1 ? "" : "s"}`;
    main.appendChild(countBadge);
  }

  const actions = document.createElement("div");
  actions.className = "category-tree-actions";

  actions.appendChild(
    createActionButton({
      className: "is-add",
      title: `Add sub-label under ${formatLabelDisplay(node.path)}`,
      ariaLabel: `Add sub-label under ${node.path}`,
      svg: ICON_PLUS,
      label: "Sub-label",
      onClick: () => {
        collapsedCategoryPaths.delete(key);
        activeInlineAddParent = node.path;
        renderCategoryTree(state.settings.categories || []);
      },
    })
  );

  if (!isOther) {
    actions.appendChild(
      createActionButton({
        title: `Rename or merge ${formatLabelDisplay(node.path)}`,
        ariaLabel: `Rename ${node.path}`,
        svg: ICON_PENCIL,
        onClick: () => openRenameLabelModal(node.path),
      })
    );
    actions.appendChild(
      createActionButton({
        className: "is-danger",
        title: `Remove ${formatLabelDisplay(node.path)}`,
        ariaLabel: `Remove ${node.path}`,
        svg: ICON_TRASH,
        onClick: () =>
          deleteCategoryPath(node.path, {
            onAfterDelete: (deletedLower) => {
              if (activeInlineAddParent && activeInlineAddParent.toLowerCase().startsWith(deletedLower)) {
                activeInlineAddParent = null;
              }
              renderCategoryTree(state.settings.categories);
            },
          }),
      })
    );
  }

  row.appendChild(main);
  row.appendChild(actions);
  branch.appendChild(row);

  let focusInput = null;
  let shell = null;
  if (hasChildren || isInlineTarget) {
    shell = document.createElement("div");
    shell.className = `category-tree-children-shell${isCollapsed ? " is-collapsed" : ""}`;
    shell.setAttribute("aria-hidden", isCollapsed ? "true" : "false");
    shell.inert = isCollapsed;

    const childrenWrap = document.createElement("div");
    childrenWrap.className = "category-tree-children";
    childrenWrap.setAttribute("role", "group");
    node.children.forEach((child) => {
      const childRendered = renderTreeNode(child, depth + 1);
      childrenWrap.appendChild(childRendered.branch);
      if (childRendered.focusInput) focusInput = childRendered.focusInput;
    });
    if (isInlineTarget) {
      const inlineAdded = createInlineAddRow(node);
      childrenWrap.appendChild(inlineAdded.row);
      focusInput = inlineAdded.input;
    }
    shell.appendChild(childrenWrap);
    branch.appendChild(shell);
  }

  if (hasChildren) {
    branchUiByPath.set(key, { row, toggleBtn, countBadge, shell, path: node.path });
  }

  return { branch, focusInput };
}

export function renderCategoryTree(categories) {
  const container = $("#category-chips");
  if (!container) return;
  const allCategories = [...(categories || [])];

  const countPill = $("#category-count-badge");
  if (countPill) {
    countPill.textContent = String(allCategories.length);
    countPill.classList.toggle("hidden", allCategories.length === 0);
  }

  const filterInput = $("#category-filter-input");
  if (filterInput) {
    const showFilter = allCategories.length >= 10 || Boolean(categoryFilterQuery);
    filterInput.classList.toggle("hidden", !showFilter);
    if (!showFilter && filterInput.value) {
      filterInput.value = "";
      categoryFilterQuery = "";
    }
  }

  const q = categoryFilterQuery.trim().toLowerCase();
  const visibleCategories = q
    ? allCategories.filter((c) => String(c).toLowerCase().includes(q))
    : allCategories;

  container.innerHTML = "";
  branchUiByPath.clear();
  const roots = buildCategoryTree(visibleCategories);
  updateCollapseAllButton(roots);

  if (!roots.length) {
    const empty = document.createElement("div");
    empty.className = "category-tree-empty";
    empty.textContent = q ? `No labels match "${categoryFilterQuery.trim()}".` : "No categories configured yet.";
    container.appendChild(empty);
  } else {
    let pendingFocusInput = null;
    roots.forEach((root) => {
      const { branch, focusInput } = renderTreeNode(root, 0);
      container.appendChild(branch);
      if (focusInput) pendingFocusInput = focusInput;
    });
    if (pendingFocusInput) {
      requestAnimationFrame(() => pendingFocusInput.focus?.());
    }
  }

  const ruleTargetSel = $("#rule-target-select");
  if (ruleTargetSel) {
    ruleTargetSel.innerHTML = buildCategoryOptions(ruleTargetSel.value || (allCategories[0] || "Other"));
  }
}

function addCategoryFromInput() {
  const inp = $("#new-category-input");
  if (!inp) return;
  addCategoryPath(inp.value);
  inp.value = "";
}

export function initTaxonomySettingsListeners() {
  $("#toggle-all-categories-btn")?.addEventListener("click", () => {
    const roots = buildCategoryTree(state.settings?.categories || []);
    const parentPaths = collectParentPaths(roots);
    const shouldExpand = $("#toggle-all-categories-btn")?.dataset.mode === "expand";
    parentPaths.forEach((p) => setBranchCollapsedState(p, !shouldExpand));
    updateCollapseAllButton(roots);
  });

  $("#category-filter-input")?.addEventListener("input", (e) => {
    categoryFilterQuery = e.target.value || "";
    renderCategoryTree(state.settings?.categories || []);
  });

  initFilingRuleListeners();

  $("#add-category-btn").addEventListener("click", addCategoryFromInput);
  $("#new-category-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCategoryFromInput();
    }
  });
}
