/**
 * ToggleShop Demo App — Open this file in VS Code with FlagLens active!
 *
 * You will immediately see:
 *  1. Inline live ON/OFF & Experiment split badges next to each flagsmith.* call
 *  2. Rich hover cards with 1-click [Toggle in Development] buttons
 *  3. A yellow squiggly Ghost Flag warning on the intentional typo ("new_chekout")
 */

const FLAGSMITH_API = 'http://localhost:8000/api/v1/flags/';
const ENVIRONMENT_KEY = 'env_dev_flaglens_local_key';

class MiniFlagsmithSDK {
  constructor() {
    this.flags = {};
    this.prevSnapshot = null;
    this.lastSyncAt = null;
    this.connectionState = 'connecting'; // 'confirmed' | 'cached' | 'offline'
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
    stateEl.textContent = 'Server confirmed · localhost:8000';
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

  rowsContainer.innerHTML = entries
    .map(([name, st]) => {
      const isChanged = changedFlags.includes(name);
      const valDisplay =
        st.value !== null && st.value !== undefined && String(st.value).length > 0
          ? `<span class="flag-row-val" title="${escapeHtml(st.value)}">${escapeHtml(st.value)}</span>`
          : '';
      return `
        <div class="flag-row${isChanged ? ' changed' : ''}" role="listitem">
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
  const statusEl = document.getElementById('sync-status');
  const labelEl = document.getElementById('sync-label');
  try {
    const changedFlags = await flagsmith.refresh();
    statusEl.className = 'sync-indicator live';
    labelEl.textContent = 'Live · localhost:8000';
    renderApp(changedFlags);
  } catch (err) {
    const hasCache = Object.keys(flagsmith.flags).length > 0;
    flagsmith.connectionState = hasCache ? 'cached' : 'offline';
    statusEl.className = 'sync-indicator offline';
    labelEl.textContent = hasCache ? 'Cached · Offline' : 'Offline';
    renderTelemetry([]);
  }
}

updatePaymentSelectionUI();
updateClassicStepUI();
pollFlags();
setInterval(pollFlags, 1500);
