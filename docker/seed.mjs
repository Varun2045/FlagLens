#!/usr/bin/env node
/**
 * Seeds a real Self-Hosted Flagsmith instance (running via `docker compose up -d`)
 * with the ToggleShop demo flags so judges & developers can test FlagLens in 1 command.
 *
 * Usage:
 *   FLAGSMITH_URL=http://localhost:8000 FLAGSMITH_TOKEN=ser.your_org_api_key node docker/seed.mjs
 */

const BASE_URL = (process.env.FLAGSMITH_URL || 'http://localhost:8000').replace(/\/+$/, '');
const TOKEN = (process.env.FLAGSMITH_TOKEN || '').trim();

if (!TOKEN) {
  console.error('Error: Please set FLAGSMITH_TOKEN (Organisation API Key starting with ser.* or Admin Token).');
  console.error('Example: FLAGSMITH_TOKEN=ser.xxxxx node docker/seed.mjs');
  process.exit(1);
}

const authHeader = TOKEN.startsWith('ser.') ? `Api-Key ${TOKEN}` : `Token ${TOKEN}`;

async function api(path, init = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${path}: ${text}`);
  }
  return res.json();
}

const SEED_FLAGS = [
  {
    name: 'new_checkout',
    description: 'Enables the streamlined 1-click express checkout experience.',
    default_enabled: true,
    initial_value: 'express_v2',
  },
  {
    name: 'pricing_ab_test',
    description: 'Experimentation split: Annual-first vs Monthly-first pricing cards.',
    default_enabled: true,
    initial_value: 'annual_first',
  },
  {
    name: 'dark_mode_neon',
    description: 'Switches ToggleShop into high-contrast neon dark mode.',
    default_enabled: false,
    initial_value: 'cyber_purple',
  },
  {
    name: 'promo_banner_copy',
    description: 'Remote config string for the top promotional announcement bar.',
    default_enabled: true,
    initial_value: 'Toggle Wars 2026 — Live Flagsmith Sync Active!',
  },
  {
    name: 'legacy_holiday_sale_2024',
    description: 'Old seasonal flag — no longer referenced in code (stale flag example).',
    default_enabled: false,
    initial_value: null,
  },
];

async function main() {
  console.log(`Connecting to self-hosted Flagsmith at ${BASE_URL}...`);
  const projectsResp = await api('/api/v1/projects/');
  const projects = Array.isArray(projectsResp) ? projectsResp : projectsResp.results || [];
  if (!projects.length) {
    throw new Error('No projects found in Flagsmith. Create a project in the Flagsmith UI first.');
  }

  const project = projects[0];
  console.log(`Using project: ${project.name} (id=${project.id})`);

  const existingResp = await api(`/api/v1/projects/${project.id}/features/?page_size=200`);
  const existing = Array.isArray(existingResp) ? existingResp : existingResp.results || [];
  const existingNames = new Set(existing.map((f) => f.name));

  for (const flag of SEED_FLAGS) {
    if (existingNames.has(flag.name)) {
      console.log(`  [skip] ${flag.name} already exists`);
      continue;
    }
    await api(`/api/v1/projects/${project.id}/features/`, {
      method: 'POST',
      body: JSON.stringify({ ...flag, type: 'STANDARD' }),
    });
    console.log(`  [created] ${flag.name}`);
  }

  console.log('\nDone! Your self-hosted Flagsmith is seeded and ready for FlagLens.');
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
