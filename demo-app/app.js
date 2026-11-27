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
    this.detectChanges(map);
    this.flags = map;
  }

  detectChanges(nextMap) {
    if (!this.prevSnapshot) {
      this.prevSnapshot = nextMap;
      logActivity(`synced ${Object.keys(nextMap).length} flags from localhost:8000`);
      return;
    }
    for (const [name, state] of Object.entries(nextMap)) {
      const prev = this.prevSnapshot[name];
      if (!prev) {
        logActivity(`created ${name} (${state.enabled ? 'ON' : 'OFF'})`);
      } else if (prev.enabled !== state.enabled) {
        logActivity(`${name} -> ${state.enabled ? 'ON' : 'OFF'}`);
        showToast(`${name} switched ${state.enabled ? 'ON' : 'OFF'}`);
      } else if (prev.value !== state.value) {
        logActivity(`${name} value -> "${state.value}"`);
        showToast(`Updated ${name}`);
      }
    }
    this.prevSnapshot = nextMap;
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
let toastTimer = null;

function showToast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function logActivity(message) {
  const time = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  activityLog.unshift(`${time}  ${message}`);
  if (activityLog.length > 4) activityLog.pop();
  const box = document.getElementById('activity-feed');
  if (box) {
    box.innerHTML = activityLog.map((line) => `<div class="log-entry">${line}</div>`).join('');
  }
}

function renderApp() {
  // 1. Promo Banner (Remote Config)
  const bannerEl = document.getElementById('promo-banner');
  const showBanner = flagsmith.hasFeature('promo_banner_copy');
  const bannerText = flagsmith.getValue('promo_banner_copy');
  bannerEl.classList.toggle('visible', showBanner);
  bannerEl.textContent = bannerText || 'ToggleShop Studio';

  // 2. Pricing Experiment (Multivariate A/B Test)
  const pricingVariant = flagsmith.getValue('pricing_ab_test');
  const isMonthly = pricingVariant === 'monthly_first';

  document.getElementById('pricing-title').textContent = isMonthly ? 'Pro Monthly' : 'Pro Annual';
  document.getElementById('pricing-price').innerHTML = isMonthly
    ? '$24<span>/mo</span>'
    : '$19<span>/mo</span>';
  document.getElementById('pricing-desc').textContent = isMonthly
    ? 'Flexible month-to-month billing. Cancel or switch tiers anytime.'
    : 'Billed annually ($228/yr). Save 20% compared to monthly billing.';
  document.getElementById('pricing-badge').textContent = isMonthly
    ? 'variant: monthly_first'
    : 'variant: annual_first';

  document.getElementById('sum-plan-name').textContent = isMonthly
    ? 'Flagsmith Studio Pro (Monthly)'
    : 'Flagsmith Studio Pro (Annual)';
  document.getElementById('sum-plan-price').textContent = isMonthly ? '$24.00/mo' : '$19.00/mo';
  document.getElementById('sum-due-today').textContent = isMonthly ? '$24.00' : '$228.00';
  document.getElementById('express-pay-btn').textContent = isMonthly
    ? 'Pay $24.00 in 1 Click'
    : 'Pay $228.00 in 1 Click';

  // 3. Express Checkout Feature Flag
  const showExpressCheckout = flagsmith.hasFeature('new_checkout');
  const checkoutBadge = document.getElementById('checkout-badge');
  const checkoutTitle = document.getElementById('checkout-title');
  const expressView = document.getElementById('express-view');
  const classicView = document.getElementById('classic-view');

  checkoutBadge.className = showExpressCheckout ? 'flag-tag on' : 'flag-tag';
  checkoutBadge.textContent = showExpressCheckout ? 'new_checkout: ON' : 'new_checkout: OFF';
  checkoutTitle.textContent = showExpressCheckout ? 'Express Checkout' : 'Standard Checkout';
  expressView.classList.toggle('hidden', !showExpressCheckout);
  classicView.classList.toggle('hidden', showExpressCheckout);

  // 4. Dark Mode Toggle (Light Editorial <-> OLED Obsidian)
  const isDarkMode = flagsmith.hasFeature('dark_mode_neon');
  document.body.classList.toggle('neon', isDarkMode);
  const themeChip = document.getElementById('theme-indicator');
  if (themeChip) {
    themeChip.textContent = isDarkMode ? 'theme: dark' : 'theme: light';
  }

  // 5. Intentional Typo Demo — FlagLens highlights this with a Quick Fix ("new_checkout")!
  const legacyCheck = flagsmith.hasFeature('new_chekout');
  if (legacyCheck) {
    console.log('Legacy checkout path active');
  }

  // Update Live Telemetry Table
  const entries = Object.entries(flagsmith.flags);
  const onCount = entries.filter(([, s]) => s.enabled).length;
  document.getElementById('active-count').textContent = `${onCount}/${entries.length} ON`;
  document.getElementById('telemetry-body').innerHTML = entries
    .map(
      ([name, st]) =>
        `<tr><td class="t-name">${name}</td><td class="t-state ${st.enabled ? 't-on' : 't-off'}">${
          st.enabled ? 'ON' : 'OFF'
        }</td></tr>`
    )
    .join('');
}

document.getElementById('express-pay-btn')?.addEventListener('click', () => {
  showToast('Payment confirmed in 0.4s via Express Checkout');
});

document.getElementById('classic-pay-btn')?.addEventListener('click', () => {
  showToast('Proceeding to Step 2 of 4 (Billing Address)');
});

document.getElementById('pricing-btn')?.addEventListener('click', () => {
  showToast(`Active experiment variant: ${flagsmith.getValue('pricing_ab_test') || 'annual_first'}`);
});

async function pollFlags() {
  const statusEl = document.getElementById('sync-status');
  const labelEl = document.getElementById('sync-label');
  try {
    await flagsmith.refresh();
    statusEl.className = 'status-chip live';
    labelEl.textContent = 'localhost:8000';
    renderApp();
  } catch (err) {
    statusEl.className = 'status-chip offline';
    labelEl.textContent = 'offline';
  }
}

pollFlags();
setInterval(pollFlags, 1500);
