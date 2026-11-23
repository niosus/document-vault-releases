/** Free-tier quota indicator, multi-currency plans, purchase modal, and license activation. */

import { closeAnimatedModal, showAnimatedModal } from "./modals.js";
import { $, $$, state } from "./state.js";
import {
  api,
  esc,
  formatRelativeOrShortTime,
  toast,
} from "./utils.js";
import { refreshHealth } from "./vlm.js";

// ── Licensing & Free-Tier Quota UI ───────────────────────────────────────
const LICENSE_CURRENCY_KEY = "dv_preferred_currency";
const VALID_LICENSE_CURRENCIES = new Set(["USD", "EUR", "CHF"]);
const EUR_REGION_CODES = new Set([
  "AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
]);
const EUR_TZ_SET = new Set([
  "Europe/Berlin", "Europe/Paris", "Europe/Rome", "Europe/Madrid",
  "Europe/Amsterdam", "Europe/Vienna", "Europe/Brussels", "Europe/Dublin",
  "Europe/Lisbon", "Europe/Helsinki", "Europe/Athens", "Europe/Luxembourg",
  "Europe/Bratislava", "Europe/Ljubljana", "Europe/Tallinn", "Europe/Riga",
  "Europe/Vilnius", "Europe/Valletta", "Europe/Nicosia", "Europe/Zagreb",
]);

function detectPreferredCurrency() {
  try {
    const saved = localStorage.getItem(LICENSE_CURRENCY_KEY);
    if (VALID_LICENSE_CURRENCIES.has(saved)) return saved;
  } catch {
    // ignore storage errors
  }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz === "Europe/Zurich" || tz === "Europe/Busingen" || tz === "Europe/Vaduz") return "CHF";
    if (EUR_TZ_SET.has(tz)) return "EUR";
  } catch {
    // ignore Intl errors
  }
  try {
    const langs =
      Array.isArray(navigator?.languages) && navigator.languages.length
        ? navigator.languages
        : navigator?.language
          ? [navigator.language]
          : [];
    for (const lang of langs) {
      const parts = String(lang || "").split(/[-_]/);
      const region = (parts[parts.length - 1] || "").toUpperCase();
      if (region === "CH" || region === "LI") return "CHF";
      if (EUR_REGION_CODES.has(region)) return "EUR";
    }
  } catch {
    // ignore navigator errors
  }
  return "USD";
}

function getSelectedCurrency() {
  if (!VALID_LICENSE_CURRENCIES.has(state.selectedCurrency)) {
    state.selectedCurrency = detectPreferredCurrency();
  }
  return state.selectedCurrency;
}

function setSelectedCurrency(currency) {
  const next = VALID_LICENSE_CURRENCIES.has(currency) ? currency : "USD";
  state.selectedCurrency = next;
  try {
    localStorage.setItem(LICENSE_CURRENCY_KEY, next);
  } catch {
    // ignore storage errors
  }
  renderLicenseModalContent();
}

function formatPlanPrice(currency, amount) {
  if (amount === null || amount === undefined) return "Custom";
  const num = Number(amount);
  if (!Number.isFinite(num)) return String(amount);
  if (currency === "CHF") return `CHF ${num}`;
  if (currency === "EUR") return `€${num}`;
  return `$${num}`;
}

function getDefaultLicensePlans() {
  return [
    {
      id: "starter",
      name: "Starter",
      subtitle: "Single Mac license",
      seats: 1,
      seats_label: "1 Mac",
      prices: { USD: 19, EUR: 19, CHF: 19 },
      billing: "One-time payment",
      checkout_url: "",
      badge: "",
      contact_only: false,
      contact_email: "",
      features: [
        "Unlimited processed documents",
        "1 Mac activation",
        "Works 100% offline after activation",
        "All v1.x updates included",
      ],
    },
    {
      id: "personal",
      name: "Personal",
      subtitle: "Desktop + laptop bundle",
      seats: 3,
      seats_label: "3 Macs",
      prices: { USD: 29, EUR: 29, CHF: 29 },
      billing: "One-time payment",
      checkout_url: "",
      badge: "Most Popular",
      contact_only: false,
      contact_email: "",
      features: [
        "Unlimited processed documents",
        "Up to 3 Mac activations",
        "Deactivate & transfer Macs anytime",
        "All v1.x updates included",
      ],
    },
    {
      id: "business",
      name: "Business",
      subtitle: "Teams & commercial use",
      seats: null,
      seats_label: "5+ Macs",
      prices: null,
      billing: "Custom quote",
      checkout_url: "",
      badge: "",
      contact_only: true,
      contact_email: "hello@document-vault.app",
      features: [
        "5+ seats & shared team vaults",
        "Custom VAT invoice & procurement",
        "Priority onboarding support",
      ],
    },
  ];
}

function getEffectiveLicenseStatus() {
  return (
    state.license || {
      licensed: false,
      state: "free",
      provider: "polar",
      polar_configured: false,
      free_limit: 30,
      processed_count: 0,
      remaining_free: 30,
      can_process: true,
      tier: "",
      tier_label: "Free Tier",
      display_key: "",
      limit_activations: null,
      label: "",
      last_validated_at: null,
      plans: getDefaultLicensePlans(),
      portal_url: "",
      business_contact_email: "hello@document-vault.app",
    }
  );
}

function renderSettingsLicenseCard(lic) {
  const badgeEl = $("#settings-license-badge");
  const bodyEl = $("#settings-license-body");
  if (!bodyEl) return;

  const freeLimit = Number(lic.free_limit ?? 30);
  const processed = Number(lic.processed_count ?? 0);
  const pct = freeLimit > 0 ? Math.min(100, Math.round((processed / freeLimit) * 100)) : 0;

  if (badgeEl) {
    badgeEl.className = `tag ${lic.licensed ? "tag-ok" : processed >= freeLimit ? "tag-warn" : ""}`;
    badgeEl.textContent = lic.licensed
      ? lic.tier_label || "Licensed"
      : `Free · ${processed} / ${freeLimit}`;
  }

  if (lic.licensed) {
    const seatInfo = lic.limit_activations ? `${lic.limit_activations} Mac${Number(lic.limit_activations) === 1 ? "" : "s"}` : "Active";
    const validatedStr = lic.last_validated_at ? formatRelativeOrShortTime(lic.last_validated_at) : "Recently";
    bodyEl.innerHTML = `
      <div class="settings-license-active">
        <div class="settings-license-meta">
          <div><strong>${esc(lic.tier_label || "Licensed")}</strong> · <span class="muted">${esc(seatInfo)}</span></div>
          <div class="muted" style="font-size:12px;">
            Key: <code>${esc(lic.display_key || "Active")}</code>
            ${lic.label ? ` · Device: <strong>${esc(lic.label)}</strong>` : ""}
            · Verified: ${esc(validatedStr)}
          </div>
        </div>
        <div class="settings-license-actions">
          <button id="settings-license-refresh-btn" type="button" class="btn btn-secondary btn-sm">Verify Now</button>
          ${lic.portal_url ? `<a class="btn btn-secondary btn-sm" href="${esc(lic.portal_url)}" target="_blank" rel="noopener noreferrer">Manage Seats</a>` : ""}
          <button id="settings-license-deactivate-btn" type="button" class="btn btn-ghost-danger btn-sm">Deactivate Mac</button>
        </div>
      </div>
    `;
    $("#settings-license-refresh-btn")?.addEventListener("click", refreshLicenseValidation);
    $("#settings-license-deactivate-btn")?.addEventListener("click", deactivateLicense);
    return;
  }

  const statusMsg =
    processed >= freeLimit
      ? `You've reached the ${freeLimit}-document free limit in this vault. Purchase a one-time license or delete a processed document to free a slot.`
      : `You have processed ${processed} of ${freeLimit} free documents in this vault (${Math.max(0, freeLimit - processed)} remaining).`;
  bodyEl.innerHTML = `
    <div class="settings-license-free">
      <div class="settings-license-free-info">
        <div style="font-size:13px;">${esc(statusMsg)}</div>
        <div class="progress-bar-track" style="margin-top:8px;">
          <div class="progress-bar-fill ${processed >= freeLimit ? "is-limit" : ""}" style="width:${pct}%"></div>
        </div>
      </div>
      <div class="settings-license-actions">
        <button id="settings-license-open-btn" type="button" class="btn btn-primary btn-sm">Upgrade / Enter Key</button>
      </div>
    </div>
  `;
  $("#settings-license-open-btn")?.addEventListener("click", () => openLicenseModal());
}

export function renderLicenseState(lic) {
  if (!lic) return;
  state.license = lic;
  const pill = $("#license-pill");
  const pillText = $("#license-pill-text");
  const pillFill = $("#license-pill-fill");
  const freeLimit = Math.max(1, Number(lic.free_limit ?? 30));
  const processed = Math.max(0, Number(lic.processed_count ?? 0));
  const pct = Math.min(100, Math.round((processed / freeLimit) * 100));

  if (pill) {
    if (lic.licensed) {
      pill.classList.add("hidden");
      pill.classList.remove("is-warning", "is-limit");
    } else {
      pill.classList.remove("hidden");
      const isLimit = processed >= freeLimit;
      const isWarn = !isLimit && processed >= Math.max(1, Math.floor(freeLimit * 0.8));
      pill.classList.toggle("is-limit", isLimit);
      pill.classList.toggle("is-warning", isWarn);
      if (pillText) {
        pillText.textContent = isLimit
          ? `${processed} / ${freeLimit} · Upgrade`
          : `Free · ${processed} / ${freeLimit}`;
      }
      if (pillFill) {
        pillFill.style.width = `${pct}%`;
      }
      pill.title = isLimit
        ? `Free tier limit reached (${processed} of ${freeLimit} processed docs) — click to upgrade or activate`
        : `Free tier: ${processed} of ${freeLimit} processed documents used in active vault — click to upgrade`;
    }
  }

  renderSettingsLicenseCard(lic);
  const modal = $("#license-modal");
  if (modal && !modal.classList.contains("hidden")) {
    renderLicenseModalContent();
  }
}

function renderLicenseModalContent({ reason = "" } = {}) {
  const lic = getEffectiveLicenseStatus();
  const freeLimit = Math.max(1, Number(lic.free_limit ?? 30));
  const processed = Math.max(0, Number(lic.processed_count ?? 0));
  const pct = Math.min(100, Math.round((processed / freeLimit) * 100));
  const currency = getSelectedCurrency();

  const titleEl = $("#license-modal-title");
  const subtitleEl = $("#license-modal-subtitle");
  const quotaBanner = $("#license-quota-banner");
  const quotaTitle = $("#license-quota-title");
  const quotaPill = $("#license-quota-pill");
  const quotaBar = $("#license-quota-bar");
  const activePanel = $("#license-active-panel");
  const plansSection = $("#license-plans-section");
  const plansGrid = $("#license-plans-grid");
  const activateBox = $("#license-activate-box");

  if (lic.licensed) {
    if (titleEl) titleEl.textContent = "Document Vault License";
    if (subtitleEl) subtitleEl.textContent = `${lic.tier_label || "Licensed"} · Unlimited local document processing`;
    if (quotaBanner) quotaBanner.classList.add("hidden");
    if (plansSection) plansSection.classList.add("hidden");
    if (activateBox) activateBox.classList.add("hidden");
    if (activePanel) {
      activePanel.classList.remove("hidden");
      const seatsText = lic.limit_activations ? `${lic.limit_activations} Mac${Number(lic.limit_activations) === 1 ? "" : "s"}` : "Active";
      activePanel.innerHTML = `
        <div class="license-active-card">
          <div class="license-active-row">
            <div>
              <div style="font-size:15px; font-weight:700;">${esc(lic.tier_label || "Active License")}</div>
              <div class="muted" style="font-size:12.5px; margin-top:2px;">
                Key <code>${esc(lic.display_key || "Active")}</code> · ${esc(seatsText)}
                ${lic.label ? ` · Activated on <strong>${esc(lic.label)}</strong>` : ""}
              </div>
            </div>
            <span class="tag tag-ok">Active</span>
          </div>
          <div class="license-active-actions">
            <button id="modal-license-validate-btn" type="button" class="btn btn-secondary btn-sm">Verify License</button>
            ${lic.portal_url ? `<a class="btn btn-secondary btn-sm" href="${esc(lic.portal_url)}" target="_blank" rel="noopener noreferrer">Customer Portal</a>` : ""}
            <button id="modal-license-deactivate-btn" type="button" class="btn btn-ghost-danger btn-sm">Deactivate This Mac</button>
          </div>
        </div>
      `;
      $("#modal-license-validate-btn")?.addEventListener("click", refreshLicenseValidation);
      $("#modal-license-deactivate-btn")?.addEventListener("click", deactivateLicense);
    }
    return;
  }

  if (activePanel) activePanel.classList.add("hidden");
  if (quotaBanner) quotaBanner.classList.remove("hidden");
  if (plansSection) plansSection.classList.remove("hidden");
  if (activateBox) activateBox.classList.remove("hidden");

  const isLimit = processed >= freeLimit || reason === "limit_reached";
  if (titleEl) {
    titleEl.textContent = isLimit
      ? `Free Tier Limit Reached (${processed} / ${freeLimit})`
      : "Upgrade Document Vault";
  }
  if (subtitleEl) {
    subtitleEl.textContent = "One-time Polar.sh license · No subscription · Works offline after activation";
  }
  if (quotaTitle) {
    quotaTitle.textContent = isLimit
      ? `${processed} of ${freeLimit} free processed documents used — license required to process more`
      : `${processed} of ${freeLimit} free processed documents used in this vault`;
  }
  if (quotaPill) {
    quotaPill.textContent = isLimit ? "Limit Reached" : `${Math.max(0, freeLimit - processed)} left`;
    quotaPill.className = `tag ${isLimit ? "tag-warn" : "tag-info"}`;
  }
  if (quotaBar) {
    quotaBar.style.width = `${pct}%`;
    quotaBar.classList.toggle("is-limit", isLimit);
  }

  $$("#license-currency-switch .currency-opt-btn").forEach((btn) => {
    const active = btn.dataset.currency === currency;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });

  const plans = Array.isArray(lic.plans) && lic.plans.length ? lic.plans : getDefaultLicensePlans();
  if (plansGrid) {
    plansGrid.innerHTML = plans
      .map((plan) => {
        const isPopular = plan.id === "personal";
        const priceStr = plan.prices ? formatPlanPrice(currency, plan.prices[currency] ?? plan.prices.USD) : "Custom";
        const featuresHtml = (plan.features || [])
          .map((f) => `<li><span aria-hidden="true">✓</span><span>${esc(f)}</span></li>`)
          .join("");
        let ctaHtml = "";
        if (plan.contact_only) {
          const email = plan.contact_email || lic.business_contact_email || "hello@document-vault.app";
          const subject = encodeURIComponent("Document Vault Business License Inquiry");
          ctaHtml = `<a class="btn btn-secondary license-plan-cta" href="mailto:${esc(email)}?subject=${subject}">Contact Us</a>`;
        } else if (plan.checkout_url) {
          ctaHtml = `<a class="btn ${isPopular ? "btn-primary" : "btn-secondary"} license-plan-cta" href="${esc(plan.checkout_url)}" target="_blank" rel="noopener noreferrer">Buy ${esc(plan.name)}</a>`;
        } else {
          ctaHtml = `<button type="button" class="btn ${isPopular ? "btn-primary" : "btn-secondary"} license-plan-cta license-buy-unconfigured-btn" data-plan-name="${esc(plan.name)}">Buy ${esc(plan.name)}</button>`;
        }
        return `
          <div class="license-plan-card ${isPopular ? "is-popular" : ""}">
            <div class="license-plan-head">
              <div>
                <div class="license-plan-name">${esc(plan.name)}</div>
                <div class="muted" style="font-size:12px;">${esc(plan.subtitle || "")}</div>
              </div>
              ${plan.badge ? `<span class="tag tag-info">${esc(plan.badge)}</span>` : ""}
            </div>
            <div class="license-plan-price">
              <span class="license-price-amount">${esc(priceStr)}</span>
              <span class="muted" style="font-size:12px;">${esc(plan.billing || "")}</span>
            </div>
            <ul class="license-plan-features">${featuresHtml}</ul>
            ${ctaHtml}
          </div>
        `;
      })
      .join("");

    plansGrid.querySelectorAll(".license-buy-unconfigured-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const planName = btn.dataset.planName || "License";
        const statusEl = $("#license-activate-status");
        if (statusEl) {
          statusEl.classList.remove("hidden", "is-err", "is-ok");
          statusEl.textContent = `${planName} checkout URL is not configured in this local build yet. Already have a key? Paste it below to activate.`;
        }
        $("#license-key-input")?.focus?.();
      });
    });
  }
}

export function openLicenseModal(opts = {}) {
  const modal = $("#license-modal");
  if (!modal) return;
  const statusEl = $("#license-activate-status");
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.classList.add("hidden");
    statusEl.classList.remove("is-err", "is-ok");
  }
  renderLicenseModalContent(opts);
  showAnimatedModal(modal);
}

export function closeLicenseModal() {
  closeAnimatedModal($("#license-modal"));
}

async function submitLicenseActivation(e) {
  if (e && typeof e.preventDefault === "function") e.preventDefault();
  const inputEl = $("#license-key-input");
  const btn = $("#license-activate-btn");
  const statusEl = $("#license-activate-status");
  const rawKey = String(inputEl?.value || "").trim();
  if (!rawKey) {
    if (statusEl) {
      statusEl.textContent = "Enter your Polar.sh license key first.";
      statusEl.classList.remove("hidden", "is-ok");
      statusEl.classList.add("is-err");
    }
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Activating…";
  }
  if (statusEl) {
    statusEl.classList.add("hidden");
    statusEl.classList.remove("is-err", "is-ok");
  }
  try {
    const updated = await api("/api/license/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: rawKey }),
    });
    if (inputEl) inputEl.value = "";
    renderLicenseState(updated);
    toast(`Activated ${updated.tier_label || "License"} on this Mac`);
    await refreshHealth();
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = err?.message || "License activation failed.";
      statusEl.classList.remove("hidden", "is-ok");
      statusEl.classList.add("is-err");
    }
    toast(err?.message || "License activation failed.", true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Activate Key";
    }
  }
}

async function refreshLicenseValidation() {
  try {
    const res = await api("/api/license/validate", { method: "POST" });
    renderLicenseState(res);
    if (res.validation?.offline) {
      toast("Offline — keeping cached license active.");
    } else if (res.licensed) {
      toast("License verified with Polar.sh");
    } else {
      toast("License is no longer active.", true);
    }
  } catch (err) {
    toast(err?.message || "Could not verify license", true);
  }
}

async function deactivateLicense() {
  try {
    const res = await api("/api/license/deactivate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ local_only: false }),
    });
    renderLicenseState(res);
    toast("Deactivated license on this Mac");
    await refreshHealth();
  } catch (err) {
    toast(err?.message || "Failed to deactivate license", true);
  }
}

export function initLicenseListeners() {
  $("#license-pill")?.addEventListener("click", () => openLicenseModal());
  $("#license-modal-close")?.addEventListener("click", closeLicenseModal);
  $("#license-modal-backdrop")?.addEventListener("click", closeLicenseModal);
  $("#license-activate-form")?.addEventListener("submit", submitLicenseActivation);
  $$("#license-currency-switch .currency-opt-btn").forEach((btn) => {
    btn.addEventListener("click", () => setSelectedCurrency(btn.dataset.currency || "USD"));
  });
}
