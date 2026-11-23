/** 3-step Welcome wizard, Connect/Switch Vault modal, step transitions, and reconstruct button. */

import { closeAnimatedModal, showAnimatedModal } from "./modals.js";
import { inspectSetupVault, renderSetupModelCards, renderSetupPresets } from "./onboarding_presets.js";
import { loadSettings, loadSettingsIntoForm, pickFolderForInput } from "./settings.js";
import {
  fetchVlmModels,
  findCatalogModel,
  renderDownloadProgress,
  startModelDownload,
  updateModelSelectButtons,
} from "./settings_models.js";
import { renderCategoryChips } from "./settings_taxonomy.js";
import { $, $$, state } from "./state.js";
import { switchTab } from "./tabs.js";
import { api, prefersReducedMotion, toast } from "./utils.js";
import { loadVaultDocuments } from "./vault_grid.js";
import { refreshHealth } from "./vlm.js";

export function updateSetupStep3Buttons() {
  const submitBtn = $("#setup-submit-btn");
  const skipBtn = $("#setup-skip-model-btn");
  if (!submitBtn) return;

  if (state.setup.mode === "switch") {
    if (skipBtn) skipBtn.classList.add("hidden");
    return;
  }

  const sel = $("#setup-vlm-model");
  const val = sel?.value || "";
  const info = findCatalogModel(val);
  const isDownloaded = Boolean(info && info.downloaded);
  const isDownloading = state.latestDownload?.status === "downloading";

  if (isDownloading) {
    submitBtn.textContent = "Finish & Download in Background";
    if (skipBtn) skipBtn.classList.add("hidden");
  } else if (isDownloaded || !val) {
    submitBtn.textContent = state.setup.lastInspectInfo?.has_db || state.setup.lastInspectInfo?.has_vault_config
      ? "Open Existing Vault"
      : "Open Vault";
    if (skipBtn) skipBtn.classList.toggle("hidden", isDownloaded);
  } else {
    const sizeSuffix = info?.size_gb ? ` (${info.size_gb} GB)` : "";
    submitBtn.textContent = `Download${sizeSuffix} & Open Vault`;
    if (skipBtn) skipBtn.classList.remove("hidden");
  }
}

function setSetupStep(stepNum, { animate = true } = {}) {
  const prevStep = state.setup.step;
  state.setup.step = stepNum;
  const stage = $("#setup-steps-stage");
  const s1 = $("#setup-step-1");
  const s2 = $("#setup-step-2");
  const s3 = $("#setup-step-3");
  const stepper = $("#setup-stepper");
  const switchIntro = $("#setup-switch-intro");
  const card = $(".modal-card-setup");
  const selectWrap = $("#setup-select-fallback-field");
  const back2 = $("#setup-back-2-btn");
  const next2 = $("#setup-next-2-btn");
  const back3 = $("#setup-back-3-btn");
  const watcherRow = $("#setup-watcher-row");
  const modelHead = $(".setup-model-head");
  const step2Footer = $("#setup-step2-footer");
  const browseVaultBtn = $("#setup-browse-vault-btn");
  const browseDumpBtn = $("#setup-browse-dump-btn");
  const vaultLabel = $("#setup-vault-field-label");
  const dumpLabel = $("#setup-dump-field-label");

  if (state.setup.stepAnimTimer) {
    clearTimeout(state.setup.stepAnimTimer);
    state.setup.stepAnimTimer = null;
  }
  if (stage) {
    stage.style.height = "";
  }
  [s1, s2, s3].forEach((panel) => {
    if (panel) panel.classList.remove("setup-step-enter-next", "setup-step-enter-prev");
  });

  if (state.setup.mode === "switch") {
    if (card) card.classList.add("is-switch-mode");
    if (stepper) stepper.classList.add("hidden");
    if (switchIntro) switchIntro.classList.remove("hidden");
    if (s1) s1.classList.add("hidden");
    if (s2) s2.classList.remove("hidden");
    if (s3) s3.classList.remove("hidden");
    if (step2Footer) step2Footer.classList.add("hidden");
    if (back2) back2.classList.add("hidden");
    if (next2) next2.classList.add("hidden");
    if (back3) back3.classList.add("hidden");
    if (watcherRow) watcherRow.classList.add("hidden");
    if (modelHead) modelHead.classList.add("hidden");
    if (selectWrap) selectWrap.classList.remove("hidden");
    if (browseVaultBtn) browseVaultBtn.classList.remove("hidden");
    if (browseDumpBtn) browseDumpBtn.classList.remove("hidden");
    if (vaultLabel) vaultLabel.classList.remove("hidden");
    if (dumpLabel) dumpLabel.classList.remove("hidden");
    renderSetupModelCards();
    updateSetupStep3Buttons();
    return;
  }

  if (card) card.classList.remove("is-switch-mode");
  if (stepper) stepper.classList.remove("hidden");
  if (switchIntro) switchIntro.classList.add("hidden");
  if (step2Footer) step2Footer.classList.remove("hidden");
  if (back2) back2.classList.remove("hidden");
  if (next2) next2.classList.remove("hidden");
  if (back3) back3.classList.remove("hidden");
  if (watcherRow) watcherRow.classList.remove("hidden");
  if (modelHead) modelHead.classList.remove("hidden");
  if (selectWrap) selectWrap.classList.toggle("hidden", (state.models || []).length > 0);
  if (browseVaultBtn) browseVaultBtn.classList.add("hidden");
  if (browseDumpBtn) browseDumpBtn.classList.add("hidden");
  if (vaultLabel) vaultLabel.classList.add("hidden");
  if (dumpLabel) dumpLabel.classList.add("hidden");

  const shouldAnimate =
    animate && !prefersReducedMotion() && stage && prevStep !== stepNum && typeof stage.offsetHeight === "number";
  const prevHeight = shouldAnimate ? stage.offsetHeight : 0;

  if (s1) s1.classList.toggle("hidden", stepNum !== 1);
  if (s2) s2.classList.toggle("hidden", stepNum !== 2);
  if (s3) s3.classList.toggle("hidden", stepNum !== 3);

  $$(".setup-step-pill").forEach((pill) => {
    const n = Number(pill.dataset.step);
    pill.classList.toggle("is-active", n === stepNum);
    pill.classList.toggle("is-done", n < stepNum);
  });

  if (stepNum === 3) {
    renderSetupModelCards();
    updateModelSelectButtons();
  }
  updateSetupStep3Buttons();

  if (shouldAnimate) {
    const targetPanel = stepNum === 1 ? s1 : stepNum === 2 ? s2 : s3;
    if (targetPanel) {
      targetPanel.classList.add(stepNum > prevStep ? "setup-step-enter-next" : "setup-step-enter-prev");
    }
    const nextHeight = stage.offsetHeight;
    if (prevHeight > 0 && nextHeight > 0 && prevHeight !== nextHeight) {
      stage.style.height = `${prevHeight}px`;
      void stage.offsetHeight;
      requestAnimationFrame(() => {
        stage.style.height = `${nextHeight}px`;
      });
    }
    state.setup.stepAnimTimer = setTimeout(() => {
      stage.style.height = "";
      if (targetPanel) {
        targetPanel.classList.remove("setup-step-enter-next", "setup-step-enter-prev");
      }
      state.setup.stepAnimTimer = null;
    }, 250);
  }
}

function closeSetupModal() {
  if (state.setup.mandatory) return;
  closeAnimatedModal($("#setup-modal"));
}

export async function openSetupModal({ mandatory = false, mode } = {}) {
  state.setup.mandatory = mandatory;
  state.setup.mode = mode || (mandatory ? "wizard" : "switch");
  state.setup.skipModel = false;

  const s = state.settings || (await loadSettings());
  $("#setup-modal-title").textContent =
    state.setup.mode === "switch" ? "Connect or Switch Vault" : "Welcome to Document Vault";
  $("#setup-close-btn").classList.toggle("hidden", mandatory);
  $("#setup-cancel-btn").classList.toggle("hidden", mandatory);

  let defaultVault = s.vault_dir || "";
  let defaultDump = s.dump_dir || "";
  if (state.setup.mode === "wizard" && !s.setup_completed && s.onboarding_presets?.length) {
    const recPreset = s.onboarding_presets.find((p) => p.id === "documents") || s.onboarding_presets[0];
    const looksUntouched =
      defaultVault.endsWith("/vault") || defaultVault.endsWith("\\vault") || !defaultVault;
    if (recPreset && looksUntouched) {
      defaultVault = recPreset.vault_dir;
      defaultDump = recPreset.dump_dir;
    }
  }

  $("#setup-vault-dir").value = defaultVault;
  $("#setup-dump-dir").value = defaultDump;
  if ($("#setup-watcher-enabled")) {
    $("#setup-watcher-enabled").checked =
      state.setup.mode === "wizard" && !s.setup_completed ? true : Boolean(s.watcher_enabled);
  }

  renderSetupPresets(s);
  setSetupStep(state.setup.mode === "switch" ? 2 : 1, { animate: false });

  await inspectSetupVault($("#setup-vault-dir").value);
  try {
    await fetchVlmModels($("#setup-vlm-model"));
  } catch {
    // ignore
  }
  renderSetupModelCards();
  updateSetupStep3Buttons();
  showAnimatedModal($("#setup-modal"));
}

export function initOnboardingListeners() {
  $("#setup-close-btn").addEventListener("click", closeSetupModal);
  $("#setup-cancel-btn").addEventListener("click", closeSetupModal);
  $("#setup-modal-backdrop").addEventListener("click", closeSetupModal);

  $$(".setup-step-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      const targetStep = Number(pill.dataset.step);
      if (targetStep >= 1 && targetStep <= 3 && state.setup.mode !== "switch") {
        setSetupStep(targetStep);
      }
    });
  });

  $("#setup-next-1-btn")?.addEventListener("click", () => setSetupStep(2));
  $("#setup-back-2-btn")?.addEventListener("click", () => setSetupStep(1));
  $("#setup-next-2-btn")?.addEventListener("click", () => setSetupStep(3));
  $("#setup-back-3-btn")?.addEventListener("click", () => setSetupStep(2));

  $("#setup-skip-model-btn")?.addEventListener("click", () => {
    state.setup.skipModel = true;
    const form = $("#setup-form");
    if (form && typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else if (form) {
      form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    }
  });

  $("#setup-cancel-download-btn")?.addEventListener("click", async () => {
    try {
      const dl = await api("/api/models/download/cancel", { method: "POST" });
      renderDownloadProgress(dl);
      toast("Cancelling download…");
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#setup-vault-dir").addEventListener("input", () => {
    clearTimeout(state.setup.inspectTimer);
    state.setup.inspectTimer = setTimeout(() => {
      renderSetupPresets(state.settings);
      inspectSetupVault($("#setup-vault-dir").value);
    }, 180);
  });

  $("#setup-dump-dir").addEventListener("input", () => {
    renderSetupPresets(state.settings);
  });

  $("#setup-browse-vault-btn").addEventListener("click", () =>
    pickFolderForInput($("#setup-vault-dir"), "Choose Existing or New Vault Folder", {
      triggerBtn: $("#setup-browse-vault-btn"),
    })
  );
  $("#setup-browse-dump-btn").addEventListener("click", () =>
    pickFolderForInput($("#setup-dump-dir"), "Choose Incoming Folder (Unsorted Scans)", {
      triggerBtn: $("#setup-browse-dump-btn"),
    })
  );

  $("#setup-vlm-model").addEventListener("change", () => {
    renderSetupModelCards();
    updateModelSelectButtons();
  });

  $("#setup-download-model-btn").addEventListener("click", async () => {
    try {
      await startModelDownload($("#setup-vlm-model").value);
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#setup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const skipModel = state.setup.skipModel;
    state.setup.skipModel = false;

    if (state.setup.lastInspectInfo?.version_blocked) {
      toast(state.setup.lastInspectInfo.upgrade_warning || "This vault requires a newer version of Document Vault.", true);
      return;
    }
    let confirmUpgrade = false;
    if (state.setup.lastInspectInfo?.requires_upgrade_confirmation) {
      const warnMsg =
        (state.setup.lastInspectInfo.upgrade_warning || "This vault was last updated by an older version.") +
        "\n\nProceed with upgrading this Vault?";
      if (typeof window !== "undefined" && typeof window.confirm === "function") {
        if (!window.confirm(warnMsg)) return;
      }
      confirmUpgrade = true;
    }

    const btn = $("#setup-submit-btn");
    const prevLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Connecting…";

    const selectedModel = skipModel ? "" : ($("#setup-vlm-model")?.value || "");
    const selectedInfo = findCatalogModel(selectedModel);
    const isDownloading = state.latestDownload?.status === "downloading";

    try {
      if (state.setup.mode !== "switch" && selectedModel && !selectedInfo?.downloaded && !isDownloading) {
        try {
          await startModelDownload(selectedModel);
        } catch (dlErr) {
          toast(`Vault connected, but model download could not start: ${dlErr.message}`, true);
        }
      }

      const connectBody = {
        vault_dir: $("#setup-vault-dir").value.trim(),
        dump_dir: $("#setup-dump-dir").value.trim() || null,
        vlm_model: selectedModel,
        reconstruct: true,
        confirm_upgrade: confirmUpgrade,
      };
      if (state.setup.mode !== "switch" && $("#setup-watcher-enabled")) {
        connectBody.watcher_enabled = $("#setup-watcher-enabled").checked;
      }

      const res = await api("/api/vault/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connectBody),
      });
      state.settings = res.settings;
      state.vlmBannerDismissed = false;
      state.setup.mandatory = false;
      closeAnimatedModal($("#setup-modal"));

      const rec = res.reconstruction || {};
      const total = rec.total_documents ?? 0;
      const added = rec.indexed_added ?? 0;
      const tagCount = (rec.discovered_tags || []).length;
      if (added > 0) {
        toast(`Reconstructed ${added} document(s) and ${tagCount} tag(s) (${total} total)`);
      } else if (total > 0) {
        toast(`Connected Vault (${total} document(s), ${tagCount} tag(s))`);
      } else {
        toast(`Vault ready at ${res.settings.vault_dir}`);
      }

      await refreshHealth();
      if ($("#tab-settings").classList.contains("active")) {
        await loadSettingsIntoForm();
      }
      if (total > 0) {
        state.vaultCategory = "";
        state.vaultOpenPendingAnimation = true;
        switchTab("vault");
      } else if ($("#tab-vault").classList.contains("active")) {
        state.vaultOpenPendingAnimation = true;
        await loadVaultDocuments({ reason: "open", reconcile: false });
      }
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = prevLabel;
      updateSetupStep3Buttons();
    }
  });

  $("#switch-vault-btn").addEventListener("click", () => openSetupModal({ mandatory: false, mode: "switch" }));
  $("#open-welcome-guide-btn")?.addEventListener("click", () => openSetupModal({ mandatory: false, mode: "guide" }));
  $("#settings-welcome-guide-btn")?.addEventListener("click", () => openSetupModal({ mandatory: false, mode: "guide" }));

  $("#reconstruct-vault-btn").addEventListener("click", async () => {
    const btn = $("#reconstruct-vault-btn");
    btn.disabled = true;
    btn.textContent = "Syncing…";
    try {
      const res = await api("/api/vault/reconstruct", { method: "POST" });
      state.settings = res.settings;
      const rec = res.reconstruction || {};
      renderCategoryChips([...(res.settings.categories || [])]);
      toast(
        `Vault synced: +${rec.indexed_added ?? 0} indexed, ${rec.rebased ?? 0} rebased, ${rec.previews_rebuilt ?? 0} previews rebuilt, ${rec.pruned ?? 0} pruned`
      );
      if ($("#tab-vault").classList.contains("active")) {
        state.vaultOpenPendingAnimation = true;
        await loadVaultDocuments({ reason: "open", reconcile: false });
      }
      refreshHealth();
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Reconstruct / Sync from Disk";
    }
  });
}
