/** Application entrypoint: wires UI module listeners and boots Document Vault. */

import { $, state } from "./state.js";
import { initTheme } from "./theme.js";
import { initTabsListeners, restoreInitialTab } from "./tabs.js";
import { initVlmListeners, refreshHealth } from "./vlm.js";
import { initActivityLogListeners } from "./activity_log.js";
import { initWatcherListeners } from "./watcher.js";
import { initLicenseListeners } from "./license.js";
import { initReviewListeners, loadReviewQueue } from "./review.js";
import { initVaultListeners, loadVaultDocuments } from "./vault_grid.js";
import { initDocModalListeners } from "./doc_modal.js";
import { initMaskBuilders } from "./settings_masks.js";
import { initModelSettingsListeners } from "./settings_models.js";
import { initTaxonomySettingsListeners } from "./settings_taxonomy.js";
import { initSettingsListeners, loadSettings, loadSettingsIntoForm } from "./settings.js";
import { initOnboardingListeners, openSetupModal } from "./onboarding.js";

let appBooted = false;

export function bindAllListeners() {
  initTabsListeners();
  initVlmListeners();
  initActivityLogListeners();
  initWatcherListeners();
  initLicenseListeners();
  initReviewListeners();
  initDocModalListeners();
  initVaultListeners();
  initSettingsListeners();
  initTaxonomySettingsListeners();
  initModelSettingsListeners();
  initOnboardingListeners();
}

export async function init() {
  if (!appBooted) {
    appBooted = true;
    bindAllListeners();
  }
  initTheme();
  initMaskBuilders();
  const initialTab = restoreInitialTab();
  await loadSettings();
  await refreshHealth();
  if (!state.settings?.setup_completed) {
    openSetupModal({ mandatory: true });
  } else if (initialTab === "review") {
    await loadReviewQueue();
  } else if (initialTab === "settings") {
    await loadSettingsIntoForm();
  } else {
    state.vaultOpenPendingAnimation = true;
    await loadVaultDocuments({ reason: "open", reconcile: true });
  }
  if (typeof window.addEventListener === "function") {
    window.addEventListener("focus", () => {
      refreshHealth();
    });
  }
  setInterval(refreshHealth, 4000);
}

if (!globalThis.__DV_MANUAL_BOOT__) {
  init();
}
