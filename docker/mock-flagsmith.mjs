#!/usr/bin/env node
/**
 * Zero-Docker Flagsmith-Compatible Local Server
 *
 * Implements the exact Flagsmith Management API (/api/v1/...) and Client SDK API
 * (/api/v1/flags/) on http://localhost:8000 so you can test FlagLens and the Live Demo App
 * immediately even before installing Docker Desktop.
 *
 * When running real self-hosted Flagsmith via `docker compose up -d`, stop this server
 * and FlagLens will connect to the exact same endpoints on http://localhost:8000.
 */

import http from 'node:http';

const PORT = Number(process.env.PORT || 8000);

const project = {
  id: 1,
  name: 'ToggleShop Demo',
  organisation: 1,
};

const environments = [
  {
    id: 101,
    name: 'Development',
    api_key: 'env_dev_flaglens_local_key',
    project: 1,
    use_v2_feature_versioning: false,
  },
  {
    id: 102,
    name: 'Staging',
    api_key: 'env_staging_flaglens_local_key',
    project: 1,
    use_v2_feature_versioning: false,
  },
  {
    id: 103,
    name: 'Production',
    api_key: 'env_prod_flaglens_local_key',
    project: 1,
    use_v2_feature_versioning: false,
  },
];

let nextFeatureId = 6;
let nextStateId = 500;

const features = [
  {
    id: 1,
    name: 'new_checkout',
    description: 'Enables the streamlined 1-click express checkout experience.',
    type: 'STANDARD',
    initial_value: 'express_v2',
    default_enabled: true,
    is_archived: false,
    multivariate_options: [],
  },
  {
    id: 2,
    name: 'pricing_ab_test',
    description: 'Experimentation split: Annual-first vs Monthly-first pricing cards.',
    type: 'MULTIVARIATE',
    initial_value: 'annual_first',
    default_enabled: true,
    is_archived: false,
    multivariate_options: [
      { id: 21, type: 'unicode', string_value: 'annual_first', default_percentage_allocation: 50 },
      { id: 22, type: 'unicode', string_value: 'monthly_first', default_percentage_allocation: 50 },
    ],
  },
  {
    id: 3,
    name: 'dark_mode_neon',
    description: 'Switches ToggleShop into high-contrast neon dark mode.',
    type: 'STANDARD',
    initial_value: 'cyber_purple',
    default_enabled: false,
    is_archived: false,
    multivariate_options: [],
  },
  {
    id: 4,
    name: 'promo_banner_copy',
    description: 'Remote config string for the top promotional announcement bar.',
    type: 'STANDARD',
    initial_value: 'Toggle Wars 2026 — Live Flagsmith Sync Active!',
    default_enabled: true,
    is_archived: false,
    multivariate_options: [],
  },
  {
    id: 5,
    name: 'legacy_holiday_sale_2024',
    description: 'Old seasonal flag — no longer referenced in code (stale flag example).',
    type: 'STANDARD',
    initial_value: null,
    default_enabled: false,
    is_archived: false,
    multivariate_options: [],
  },
];

// Environment -> FeatureState[]
const featureStatesByEnv = {
  env_dev_flaglens_local_key: [
    { id: 201, feature: 1, environment: 101, enabled: true, feature_state_value: 'express_v2', multivariate_feature_state_values: [] },
    {
      id: 202,
      feature: 2,
      environment: 101,
      enabled: true,
      feature_state_value: 'annual_first',
      multivariate_feature_state_values: [
        { id: 301, multivariate_feature_option: 21, percentage_allocation: 50 },
        { id: 302, multivariate_feature_option: 22, percentage_allocation: 50 },
      ],
    },
    { id: 203, feature: 3, environment: 101, enabled: false, feature_state_value: 'cyber_purple', multivariate_feature_state_values: [] },
    { id: 204, feature: 4, environment: 101, enabled: true, feature_state_value: 'Toggle Wars 2026 — Live Flagsmith Sync Active!', multivariate_feature_state_values: [] },
    { id: 205, feature: 5, environment: 101, enabled: false, feature_state_value: null, multivariate_feature_state_values: [] },
  ],
  env_staging_flaglens_local_key: [
    { id: 211, feature: 1, environment: 102, enabled: true, feature_state_value: 'express_v2', multivariate_feature_state_values: [] },
    {
      id: 212,
      feature: 2,
      environment: 102,
      enabled: true,
      feature_state_value: 'annual_first',
      multivariate_feature_state_values: [
        { id: 311, multivariate_feature_option: 21, percentage_allocation: 50 },
        { id: 312, multivariate_feature_option: 22, percentage_allocation: 50 },
      ],
    },
    { id: 213, feature: 3, environment: 102, enabled: true, feature_state_value: 'cyber_purple', multivariate_feature_state_values: [] },
    { id: 214, feature: 4, environment: 102, enabled: true, feature_state_value: 'Staging Preview Build', multivariate_feature_state_values: [] },
    { id: 215, feature: 5, environment: 102, enabled: false, feature_state_value: null, multivariate_feature_state_values: [] },
  ],
  env_prod_flaglens_local_key: [
    { id: 221, feature: 1, environment: 103, enabled: false, feature_state_value: 'classic_v1', multivariate_feature_state_values: [] },
    {
      id: 222,
      feature: 2,
      environment: 103,
      enabled: true,
      feature_state_value: 'annual_first',
      multivariate_feature_state_values: [
        { id: 321, multivariate_feature_option: 21, percentage_allocation: 80 },
        { id: 322, multivariate_feature_option: 22, percentage_allocation: 20 },
      ],
    },
    { id: 223, feature: 3, environment: 103, enabled: false, feature_state_value: 'cyber_purple', multivariate_feature_state_values: [] },
    { id: 224, feature: 4, environment: 103, enabled: false, feature_state_value: 'Welcome to ToggleShop', multivariate_feature_state_values: [] },
    { id: 225, feature: 5, environment: 103, enabled: false, feature_state_value: null, multivariate_feature_state_values: [] },
  ],
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Environment-Key',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export function createMockFlagsmithServer() {
  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Environment-Key',
      });
      return res.end();
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    try {
      // Health / Dashboard info
      if (pathname === '/' || pathname === '/health') {
        return sendJson(res, 200, {
          status: 'ok',
          mode: 'flaglens-local-flagsmith-compatible-server',
          project,
          environments: environments.map((e) => ({ name: e.name, api_key: e.api_key })),
          featureCount: features.length,
        });
      }

      // Client SDK endpoint: GET /api/v1/flags/ (with X-Environment-Key)
      if (pathname === '/api/v1/flags/' && req.method === 'GET') {
        const envKey =
          req.headers['x-environment-key'] ||
          url.searchParams.get('env') ||
          'env_dev_flaglens_local_key';
        const states = featureStatesByEnv[envKey] || featureStatesByEnv.env_dev_flaglens_local_key;
        const payload = states.map((s) => {
          const f = features.find((feat) => feat.id === s.feature);
          return {
            id: s.id,
            enabled: s.enabled,
            feature_state_value: s.feature_state_value,
            feature: f
              ? {
                  id: f.id,
                  name: f.name,
                  type: f.type,
                  description: f.description,
                }
              : { id: s.feature, name: 'unknown', type: 'STANDARD' },
          };
        });
        return sendJson(res, 200, payload);
      }

      // Admin API: GET /api/v1/projects/
      if (pathname === '/api/v1/projects/' && req.method === 'GET') {
        return sendJson(res, 200, [project]);
      }

      // Admin API: GET /api/v1/environments/
      if (pathname === '/api/v1/environments/' && req.method === 'GET') {
        return sendJson(res, 200, { count: environments.length, results: environments });
      }

      // Admin API: GET/POST /api/v1/projects/:id/features/
      const projFeaturesMatch = pathname.match(/^\/api\/v1\/projects\/(\d+)\/features\/$/);
      if (projFeaturesMatch) {
        if (req.method === 'GET') {
          return sendJson(res, 200, { count: features.length, results: features });
        }
        if (req.method === 'POST') {
          const body = await readBody(req);
          if (!body.name) {
            return sendJson(res, 400, { detail: 'Feature name is required' });
          }
          const existing = features.find((f) => f.name === body.name);
          if (existing) {
            return sendJson(res, 400, { detail: `Feature '${body.name}' already exists` });
          }
          const newFeature = {
            id: nextFeatureId++,
            name: body.name,
            description: body.description || '',
            type: body.type || 'STANDARD',
            initial_value: body.initial_value ?? null,
            default_enabled: Boolean(body.default_enabled),
            is_archived: false,
            multivariate_options: [],
          };
          features.push(newFeature);

          for (const env of environments) {
            featureStatesByEnv[env.api_key].push({
              id: nextStateId++,
              feature: newFeature.id,
              environment: env.id,
              enabled: newFeature.default_enabled,
              feature_state_value: newFeature.initial_value,
              multivariate_feature_state_values: [],
            });
          }
          console.log(`[Flagsmith-Local] Created flag "${newFeature.name}" (default: ${newFeature.default_enabled})`);
          return sendJson(res, 201, newFeature);
        }
      }

      // Admin API: GET /api/v1/environments/:envKey/featurestates/
      const envStatesMatch = pathname.match(/^\/api\/v1\/environments\/([^/]+)\/featurestates\/$/);
      if (envStatesMatch && req.method === 'GET') {
        const envKey = decodeURIComponent(envStatesMatch[1]);
        const states = featureStatesByEnv[envKey];
        if (!states) {
          return sendJson(res, 404, { detail: 'Environment not found' });
        }
        return sendJson(res, 200, { count: states.length, results: states });
      }

      // Admin API: PUT/PATCH /api/v1/environments/:envKey/featurestates/:stateId/
      const updateStateMatch = pathname.match(
        /^\/api\/v1\/environments\/([^/]+)\/featurestates\/(\d+)\/$/
      );
      if (updateStateMatch && (req.method === 'PUT' || req.method === 'PATCH')) {
        const envKey = decodeURIComponent(updateStateMatch[1]);
        const stateId = Number(updateStateMatch[2]);
        const states = featureStatesByEnv[envKey];
        if (!states) {
          return sendJson(res, 404, { detail: 'Environment not found' });
        }
        const state = states.find((s) => s.id === stateId);
        if (!state) {
          return sendJson(res, 404, { detail: 'Feature state not found' });
        }
        const body = await readBody(req);
        if (typeof body.enabled === 'boolean') {
          state.enabled = body.enabled;
        }
        if ('feature_state_value' in body) {
          state.feature_state_value = body.feature_state_value;
        }
        const feat = features.find((f) => f.id === state.feature);
        const env = environments.find((e) => e.api_key === envKey);
        console.log(
          `[Flagsmith-Local] Updated "${feat?.name}" in ${env?.name}: enabled=${state.enabled}, value=${JSON.stringify(state.feature_state_value)}`
        );
        return sendJson(res, 200, state);
      }

      return sendJson(res, 404, { detail: `Route not found: ${req.method} ${pathname}` });
    } catch (err) {
      return sendJson(res, 500, { detail: err instanceof Error ? err.message : String(err) });
    }
  });
}

// Start server if executed directly
const isDirectRun =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());

if (isDirectRun) {
  const server = createMockFlagsmithServer();
  server.listen(PORT, () => {
    console.log(`\n🚀 Flagsmith-Compatible Local Server running at http://localhost:${PORT}`);
    console.log(`   Admin API:  http://localhost:${PORT}/api/v1/projects/`);
    console.log(`   Client SDK: http://localhost:${PORT}/api/v1/flags/ (X-Environment-Key: env_dev_flaglens_local_key)\n`);
  });
}
