/**
 * ToggleShop Demo App — Open this file in VS Code with FlagLens active!
 *
 * You will immediately see:
 *  1. Inline live ON/OFF & Experiment split badges next to each flagsmith.* call
 *  2. Rich hover cards with 1-click [Toggle in Development] buttons
 *  3. A yellow squiggly Ghost Flag warning on the intentional typo ("new_chekout")
 */

const IS_HOSTED_HTTPS =
  window.location.protocol === 'https:' && window.location.hostname !== 'localhost';
const URL_PARAMS = new URLSearchParams(window.location.search);
const CLOUD_ENV_KEY = URL_PARAMS.get('envKey');

const FLAGSMITH_API = CLOUD_ENV_KEY
  ? 'https://edge.api.flagsmith.com/api/v1/flags/'
  : 'http://localhost:8000/api/v1/flags/';
const ENVIRONMENT_KEY = CLOUD_ENV_KEY || 'env_dev_flaglens_local_key';

const HOSTED_PREVIEW_DEFAULTS = {
  new_checkout: { enabled: true, value: 'express_v2' },
  pricing_ab_test: { enabled: true, value: 'annual_first' },
  dark_mode_neon: { enabled: false, value: 'cyber_purple' },
  promo_banner_copy: {
    enabled: true,
    value: 'Toggle Wars 2026 — Live Flagsmith Sync Active!',
  },
  legacy_holiday_sale_2024: { enabled: false, value: null },
};

class MiniFlagsmithSDK {
  constructor() {
    this.flags = {};
    this.prevSnapshot = null;
    this.lastSyncAt = null;
    this.connectionState = 'connecting'; // 'confirmed' | 'preview' | 'cached' | 'offline'
  }

  enableHostedPreview() {
    if (Object.keys(this.flags).length === 0) {
      this.flags = JSON.parse(JSON.stringify(HOSTED_PREVIEW_DEFAULTS));
      this.prevSnapshot = JSON.parse(JSON.stringify(this.flags));
      logActivity('hosted preview active — click any flag row to toggle');
    }
    this.connectionState = 'preview';
  }

  togglePreviewFlag(name) {
    if (this.connectionState !== 'preview' || !this.flags[name]) return;
    if (name === 'pricing_ab_test') {
      const nextVal =
        this.flags[name].value === 'monthly_first' ? 'annual_first' : 'monthly_first';
      this.flags[name].value = nextVal;
      this.flags[name].enabled = true;
      logActivity(`preview: pricing_ab_test -> ${nextVal}`);
      showToast(`Experiment variant: ${nextVal}`);
    } else {
      this.flags[name].enabled = !this.flags[name].enabled;
      logActivity(`preview: ${name} -> ${this.flags[name].enabled ? 'ON' : 'OFF'}`);
      showToast(`${name} switched ${this.flags[name].enabled ? 'ON' : 'OFF'}`);
    }
    renderApp([name]);
  }

  async refresh() {
    const res = await fetch(FLAGSMITH_API, {
      headers: { 'X-Environment-Key': ENVIRONMENT_KEY },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const list = await res.json();
    const map = {};
    for (const item of list) {
      if (item.feature && item.feature.name) {
        map[item.feature.name] = {
          enabled: Boolean(item.enabled),
          value: item.feature_state_value,
        };
      }
    }
    const changedFlags = this.detectChanges(map);
    this.flags = map;
    this.lastSyncAt = new Date();
    this.connectionState = 'confirmed';
    return changedFlags;
  }

  detectChanges(nextMap) {
    const changed = [];
    if (!this.prevSnapshot) {
      this.prevSnapshot = nextMap;
      logActivity(`synced ${Object.keys(nextMap).length} flags from localhost:8000`);
      return changed;
    }
    for (const [name, state] of Object.entries(nextMap)) {
      const prev = this.prevSnapshot[name];
      if (!prev) {
        changed.push(name);
        logActivity(`created ${name} (${state.enabled ? 'ON' : 'OFF'})`);
      } else if (prev.enabled !== state.enabled) {
        changed.push(name);
        logActivity(`${name} -> ${state.enabled ? 'ON' : 'OFF'}`);
        showToast(`${name} switched ${state.enabled ? 'ON' : 'OFF'}`);
      } else if (prev.value !== state.value) {
        changed.push(name);
        logActivity(`${name} value -> "${state.value}"`);
        showToast(`Updated ${name}`);
      }
    }
    this.prevSnapshot = nextMap;
    return changed;
  }

  hasFeature(name) {
    return Boolean(this.flags[name]?.enabled);
  }

  getValue(name) {
    return this.flags[name]?.value ?? null;
  }
}

const flagsmith = new MiniFlagsmithSDK();
const activityLog = [];
const uiState = {
  selectedPayment: 'visa', // 'visa' | 'mastercard' | 'new_card'
  classicStep: 1,          // 1 | 2 | 3
  isSubmitting: false,
};
let toastTimer = null;

function formatTime(date) {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function showToast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function logActivity(message) {
  activityLog.unshift(`${formatTime(new Date())}  ${message}`);
  if (activityLog.length > 4) activityLog.pop();
  const box = document.getElementById('activity-feed');
  if (box) {
    box.innerHTML = activityLog
      .map((line) => `<div class="console-log-entry">${escapeHtml(line)}</div>`)
      .join('');
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function flashElement(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('region-flash');
  void el.offsetWidth;
  el.classList.add('region-flash');
}

function updateClassicStepUI() {
  document.querySelectorAll('.step-btn').forEach((btn) => {
    const step = Number(btn.getAttribute('data-step'));
    btn.classList.toggle('active', step === uiState.classicStep);
    btn.classList.toggle('done', step < uiState.classicStep);
    btn.setAttribute('aria-selected', String(step === uiState.classicStep));
  });
  document.querySelectorAll('.classic-step').forEach((panel) => {
    const step = Number(panel.getAttribute('data-step-panel'));
    panel.classList.toggle('hidden', step !== uiState.classicStep);
  });
  updatePrimaryActionLabels();
}

function updatePaymentSelectionUI() {
  document.querySelectorAll('.payment-option').forEach((btn) => {
    const method = btn.getAttribute('data-payment');
    btn.setAttribute('aria-checked', String(method === uiState.selectedPayment));
  });
  const newCardForm = document.getElementById('express-new-card-form');
  if (newCardForm) {
    newCardForm.classList.toggle('hidden', uiState.selectedPayment !== 'new_card');
  }
}

function updatePrimaryActionLabels() {
  const isMonthly = flagsmith.getValue('pricing_ab_test') === 'monthly_first';
  const showExpress = flagsmith.hasFeature('new_checkout');
  const dueText = isMonthly ? '$24.00' : '$228.00';

  const payLabel = document.getElementById('primary-pay-label');
  const secondaryBtn = document.getElementById('secondary-action-btn');

  if (showExpress) {
    payLabel.textContent = `Pay ${dueText} with Express Checkout`;
    secondaryBtn.textContent =
      uiState.selectedPayment === 'new_card'
        ? 'Use saved Visa ending in 4242'
        : 'Use a different payment method';
  } else {
    if (uiState.classicStep < 3) {
      const nextStepName = uiState.classicStep === 1 ? 'Billing Address' : 'Card Details';
      payLabel.textContent = `Continue to ${nextStepName}`;
      secondaryBtn.textContent =
        uiState.classicStep === 1 ? 'Reset form fields' : 'Back to previous step';
    } else {
      payLabel.textContent = `Complete Order (${dueText})`;
      secondaryBtn.textContent = 'Back to Billing Address';
    }
  }
}

function renderApp(changedFlags = []) {
  // 1. Promo Banner (Remote Config)
  const bannerEl = document.getElementById('promo-banner');
  const bannerTextEl = document.getElementById('promo-banner-text');
  const showBanner = flagsmith.hasFeature('promo_banner_copy');
  const bannerText = flagsmith.getValue('promo_banner_copy');
  bannerEl.classList.toggle('visible', showBanner);
  bannerTextEl.textContent = bannerText || 'ToggleShop Studio Pro';

  // 2. Pricing Experiment (Multivariate A/B Test)
  const pricingVariant = flagsmith.getValue('pricing_ab_test');
  const isMonthly = pricingVariant === 'monthly_first';

  document.getElementById('pricing-variant-chip').textContent = isMonthly
    ? 'monthly_first'
    : 'annual_first';

  const annualCard = document.getElementById('cadence-annual');
  const monthlyCard = document.getElementById('cadence-monthly');
  const cadenceList = document.getElementById('cadence-list');
  annualCard.classList.toggle('recommended', !isMonthly);
  monthlyCard.classList.toggle('recommended', isMonthly);
  // Visually order the experiment's primary option first
  if (isMonthly) {
    cadenceList.appendChild(monthlyCard);
    cadenceList.appendChild(annualCard);
  } else {
    cadenceList.appendChild(annualCard);
    cadenceList.appendChild(monthlyCard);
  }

  document.getElementById('sum-plan-name').textContent = isMonthly
    ? 'ToggleShop Studio Pro (Monthly)'
    : 'ToggleShop Studio Pro (Annual)';
  document.getElementById('sum-plan-rate').textContent = isMonthly ? '$24.00 / mo' : '$19.00 / mo';
  document.getElementById('sum-cycle').textContent = isMonthly
    ? 'Billed monthly (cancel anytime)'
    : 'Billed annually (12 months)';
  document.getElementById('sum-savings-row').classList.toggle('hidden', isMonthly);
  document.getElementById('sum-due-today').textContent = isMonthly ? '$24.00' : '$228.00';

  if (changedFlags.includes('pricing_ab_test')) {
    flashElement('pricing-region');
  }

  // 3. Express Checkout Feature Flag
  const showExpressCheckout = flagsmith.hasFeature('new_checkout');
  document.getElementById('express-view').classList.toggle('hidden', !showExpressCheckout);
  document.getElementById('classic-view').classList.toggle('hidden', showExpressCheckout);

  if (changedFlags.includes('new_checkout')) {
    flashElement('checkout-region');
  }

  // 4. Dark / Cyber Theme Toggle
  const isDarkMode = flagsmith.hasFeature('dark_mode_neon');
  document.body.classList.toggle('neon', isDarkMode);

  // 5. Intentional Typo Demo — FlagLens highlights this with a Quick Fix ("new_checkout")!
  const legacyCheck = flagsmith.hasFeature('new_chekout');
  if (legacyCheck) {
    console.log('Legacy checkout path active');
  }

  updatePrimaryActionLabels();
  renderTelemetry(changedFlags);
}

function renderTelemetry(changedFlags = []) {
  const entries = Object.entries(flagsmith.flags);
  const onCount = entries.filter(([, s]) => s.enabled).length;

  document.getElementById('active-count').textContent = `${onCount}/${entries.length} active`;
  document.getElementById('console-last-sync').textContent = flagsmith.lastSyncAt
    ? `Synced ${formatTime(flagsmith.lastSyncAt)}`
    : 'Last sync: —';

  const stateEl = document.getElementById('console-state-label');
  if (flagsmith.connectionState === 'confirmed') {
    stateEl.className = 'console-state-confirmed';
    stateEl.textContent = CLOUD_ENV_KEY
      ? 'Server confirmed · Flagsmith Cloud'
      : 'Server confirmed · localhost:8000';
  } else if (flagsmith.connectionState === 'preview') {
    stateEl.className = 'console-state-confirmed';
    stateEl.textContent = 'Hosted preview · click any flag to test';
  } else if (flagsmith.connectionState === 'cached') {
    stateEl.className = 'console-state-cached';
    stateEl.textContent = 'Offline · showing cached state';
  } else {
    stateEl.className = 'console-state-cached';
    stateEl.textContent = 'Unavailable · waiting for localhost:8000';
  }

  const rowsContainer = document.getElementById('telemetry-rows');
  if (!entries.length) {
    rowsContainer.innerHTML =
      '<div class="flag-row" role="listitem"><span class="flag-row-name">No flags loaded</span><span class="flag-state-pill off">—</span></div>';
    return;
  }

  const isInteractivePreview = flagsmith.connectionState === 'preview';
  rowsContainer.innerHTML = entries
    .map(([name, st]) => {
      const isChanged = changedFlags.includes(name);
      const valDisplay =
        st.value !== null && st.value !== undefined && String(st.value).length > 0
          ? `<span class="flag-row-val" title="${escapeHtml(st.value)}">${escapeHtml(st.value)}</span>`
          : '';
      return `
        <div class="flag-row${isChanged ? ' changed' : ''}${isInteractivePreview ? ' interactive' : ''}" role="listitem" data-flag-row="${escapeHtml(name)}"${isInteractivePreview ? ' tabindex="0" title="Click to toggle in hosted preview"' : ''}>
          <span class="flag-row-name">${escapeHtml(name)}</span>
          <span class="flag-row-right">
            ${valDisplay}
            <span class="flag-state-pill ${st.enabled ? 'on' : 'off'}">
              <span class="flag-state-dot" aria-hidden="true"></span>
              ${st.enabled ? 'ON' : 'OFF'}
            </span>
          </span>
        </div>
      `;
    })
    .join('');

  if (isInteractivePreview) {
    rowsContainer.querySelectorAll('[data-flag-row]').forEach((row) => {
      const name = row.getAttribute('data-flag-row');
      if (!name) return;
      row.addEventListener('click', () => flagsmith.togglePreviewFlag(name));
      row.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          flagsmith.togglePreviewFlag(name);
        }
      });
    });
  }
}

// ============================================================================
// Interactive Event Listeners
// ============================================================================

document.querySelectorAll('.payment-option').forEach((btn) => {
  btn.addEventListener('click', () => {
    uiState.selectedPayment = btn.getAttribute('data-payment') || 'visa';
    updatePaymentSelectionUI();
    updatePrimaryActionLabels();
  });
});

document.querySelectorAll('.step-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    uiState.classicStep = Number(btn.getAttribute('data-step')) || 1;
    updateClassicStepUI();
  });
});

document.getElementById('primary-pay-btn')?.addEventListener('click', () => {
  if (uiState.isSubmitting) return;
  const showExpress = flagsmith.hasFeature('new_checkout');

  if (!showExpress && uiState.classicStep < 3) {
    uiState.classicStep += 1;
    updateClassicStepUI();
    return;
  }

  // Simulated checkout submission with realistic loading state
  uiState.isSubmitting = true;
  const payBtn = document.getElementById('primary-pay-btn');
  const payLabel = document.getElementById('primary-pay-label');
  payBtn.disabled = true;
  payLabel.innerHTML = '<span class="spinner" aria-hidden="true"></span> Processing demo order...';

  setTimeout(() => {
    uiState.isSubmitting = false;
    payBtn.disabled = false;
    updatePrimaryActionLabels();

    const isMonthly = flagsmith.getValue('pricing_ab_test') === 'monthly_first';
    const methodLabel = !showExpress
      ? 'Card ending in 4242'
      : uiState.selectedPayment === 'mastercard'
      ? 'Mastercard ending in 8819'
      : uiState.selectedPayment === 'new_card'
      ? 'New card (demo)'
      : 'Visa ending in 4242';

    document.getElementById('receipt-flow').textContent = showExpress
      ? 'Express (new_checkout: ON)'
      : 'Standard 3-Step (new_checkout: OFF)';
    document.getElementById('receipt-plan').textContent = isMonthly
      ? 'Pro Monthly ($24.00)'
      : 'Pro Annual ($228.00)';
    document.getElementById('receipt-method').textContent = methodLabel;

    document.getElementById('checkout-active-flow').classList.add('hidden');
    document.getElementById('receipt-view').classList.remove('hidden');
    logActivity(`simulated checkout completed (${showExpress ? 'express' : 'standard'})`);
    showToast('Simulated checkout confirmed');
  }, 600);
});

document.getElementById('secondary-action-btn')?.addEventListener('click', () => {
  const showExpress = flagsmith.hasFeature('new_checkout');
  if (showExpress) {
    uiState.selectedPayment = uiState.selectedPayment === 'new_card' ? 'visa' : 'new_card';
    updatePaymentSelectionUI();
    updatePrimaryActionLabels();
    if (uiState.selectedPayment === 'new_card') {
      document.getElementById('express-card-number')?.focus();
    }
  } else {
    if (uiState.classicStep > 1) {
      uiState.classicStep -= 1;
      updateClassicStepUI();
    } else {
      showToast('Form is already on Step 1');
    }
  }
});

document.getElementById('reset-checkout-btn')?.addEventListener('click', () => {
  uiState.classicStep = 1;
  updateClassicStepUI();
  document.getElementById('receipt-view').classList.add('hidden');
  document.getElementById('checkout-active-flow').classList.remove('hidden');
});

document.getElementById('compare-tiers-btn')?.addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const drawer = document.getElementById('compare-drawer');
  const isOpen = !drawer.classList.contains('hidden');
  drawer.classList.toggle('hidden', isOpen);
  btn.setAttribute('aria-expanded', String(!isOpen));
  btn.textContent = isOpen ? 'Compare all plans' : 'Hide plan comparison';
});

document.getElementById('telemetry-toggle-btn')?.addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const consoleEl = document.getElementById('telemetry-console');
  const bodyEl = document.getElementById('telemetry-body-wrap');
  const collapsed = consoleEl.classList.toggle('collapsed');
  bodyEl.classList.toggle('hidden', collapsed);
  btn.setAttribute('aria-expanded', String(!collapsed));
});

// ============================================================================
// Live Flagsmith Polling Loop
// ============================================================================

async function pollFlags() {
  if (IS_HOSTED_HTTPS && !CLOUD_ENV_KEY) {
    flagsmith.enableHostedPreview();
    renderApp([]);
    return;
  }
  const statusEl = document.getElementById('sync-status');
  const labelEl = document.getElementById('sync-label');
  try {
    const changedFlags = await flagsmith.refresh();
    if (statusEl && labelEl) {
      statusEl.className = 'sync-indicator live';
      labelEl.textContent = 'Live · localhost:8000';
    }
    renderApp(changedFlags);
  } catch (err) {
    const hasCache = Object.keys(flagsmith.flags).length > 0;
    flagsmith.connectionState = hasCache ? 'cached' : 'offline';
    if (statusEl && labelEl) {
      statusEl.className = 'sync-indicator offline';
      labelEl.textContent = hasCache ? 'Cached · Offline' : 'Offline';
    }
    renderTelemetry([]);
  }
}

updatePaymentSelectionUI();
updateClassicStepUI();
pollFlags();
if (!IS_HOSTED_HTTPS || CLOUD_ENV_KEY) {
  setInterval(pollFlags, 1500);
}
