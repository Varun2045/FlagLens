import * as http from 'node:http';
import * as vscode from 'vscode';

/**
 * Built-in Flagsmith-compatible local sandbox server embedded directly inside FlagLens.
 *
 * When a user installs FlagLens and no external Flagsmith server is running on localhost:8000,
 * FlagLens can auto-start this sandbox so the extension works out-of-the-box immediately.
 * If real self-hosted Flagsmith (Docker) is already running on port 8000, FlagLens connects
 * directly to the real instance instead.
 */
export class LocalFlagsmithSandbox implements vscode.Disposable {
  private server: http.Server | undefined;
  private isRunning = false;
  private port = 8000;

  private readonly project = {
    id: 1,
    name: 'ToggleShop Demo (Local Sandbox)',
    organisation: 1,
  };

  private readonly environments = [
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

  private nextFeatureId = 6;
  private nextStateId = 500;

  private readonly features: Array<Record<string, unknown>> = [
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

  private readonly featureStatesByEnv: Record<string, Array<Record<string, unknown>>> = {
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

  public get running(): boolean {
    return this.isRunning;
  }

  public async start(port = 8000): Promise<boolean> {
    if (this.isRunning) {
      return true;
    }
    this.port = port;

    return new Promise<boolean>((resolve) => {
      const server = http.createServer((req, res) => {
        void this.handleRequest(req, res);
      });

      server.once('error', () => {
        this.isRunning = false;
        resolve(false);
      });

      server.listen(this.port, '127.0.0.1', () => {
        this.server = server;
        this.isRunning = true;
        resolve(true);
      });
    });
  }

  public stop(): void {
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
    this.isRunning = false;
  }

  private sendJson(res: http.ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Environment-Key',
    });
    res.end(JSON.stringify(data));
  }

  private readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let raw = '';
      req.on('data', (chunk) => (raw += String(chunk)));
      req.on('end', () => {
        if (!raw) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(raw) as Record<string, unknown>);
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Environment-Key',
      });
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://127.0.0.1:${this.port}`);
    const pathname = url.pathname;

    try {
      if (pathname === '/' || pathname === '/health') {
        this.sendJson(res, 200, { status: 'ok', mode: 'flaglens-embedded-sandbox' });
        return;
      }

      // Client SDK API: GET /api/v1/flags/
      if (pathname === '/api/v1/flags/' && req.method === 'GET') {
        const envKey = String(
          req.headers['x-environment-key'] ||
            url.searchParams.get('env') ||
            'env_dev_flaglens_local_key'
        );
        const states =
          this.featureStatesByEnv[envKey] || this.featureStatesByEnv.env_dev_flaglens_local_key;
        const payload = states.map((s) => {
          const f = this.features.find((feat) => feat.id === s.feature);
          return {
            id: s.id,
            enabled: s.enabled,
            feature_state_value: s.feature_state_value,
            feature: f
              ? { id: f.id, name: f.name, type: f.type, description: f.description }
              : { id: s.feature, name: 'unknown', type: 'STANDARD' },
          };
        });
        this.sendJson(res, 200, payload);
        return;
      }

      if (pathname === '/api/v1/projects/' && req.method === 'GET') {
        this.sendJson(res, 200, [this.project]);
        return;
      }

      if (pathname === '/api/v1/environments/' && req.method === 'GET') {
        this.sendJson(res, 200, { count: this.environments.length, results: this.environments });
        return;
      }

      const projFeaturesMatch = pathname.match(/^\/api\/v1\/projects\/(\d+)\/features\/$/);
      if (projFeaturesMatch) {
        if (req.method === 'GET') {
          this.sendJson(res, 200, { count: this.features.length, results: this.features });
          return;
        }
        if (req.method === 'POST') {
          const body = await this.readBody(req);
          const name = typeof body.name === 'string' ? body.name.trim() : '';
          if (!name) {
            this.sendJson(res, 400, { detail: 'Feature name is required' });
            return;
          }
          if (this.features.some((f) => f.name === name)) {
            this.sendJson(res, 400, { detail: `Feature "${name}" already exists` });
            return;
          }
          const newFeature = {
            id: this.nextFeatureId++,
            name,
            description: typeof body.description === 'string' ? body.description : '',
            type: typeof body.type === 'string' ? body.type : 'STANDARD',
            initial_value: body.initial_value ?? null,
            default_enabled: Boolean(body.default_enabled),
            is_archived: false,
            multivariate_options: [],
          };
          this.features.push(newFeature);
          for (const env of this.environments) {
            this.featureStatesByEnv[env.api_key].push({
              id: this.nextStateId++,
              feature: newFeature.id,
              environment: env.id,
              enabled: newFeature.default_enabled,
              feature_state_value: newFeature.initial_value,
              multivariate_feature_state_values: [],
            });
          }
          this.sendJson(res, 201, newFeature);
          return;
        }
      }

      const envStatesMatch = pathname.match(/^\/api\/v1\/environments\/([^/]+)\/featurestates\/$/);
      if (envStatesMatch && req.method === 'GET') {
        const envKey = decodeURIComponent(envStatesMatch[1]);
        const states = this.featureStatesByEnv[envKey];
        if (!states) {
          this.sendJson(res, 404, { detail: 'Environment not found' });
          return;
        }
        this.sendJson(res, 200, { count: states.length, results: states });
        return;
      }

      const updateStateMatch = pathname.match(
        /^\/api\/v1\/environments\/([^/]+)\/featurestates\/(\d+)\/$/
      );
      if (updateStateMatch && (req.method === 'PUT' || req.method === 'PATCH')) {
        const envKey = decodeURIComponent(updateStateMatch[1]);
        const stateId = Number(updateStateMatch[2]);
        const states = this.featureStatesByEnv[envKey];
        const state = states?.find((s) => s.id === stateId);
        if (!state) {
          this.sendJson(res, 404, { detail: 'Feature state not found' });
          return;
        }
        const body = await this.readBody(req);
        if (typeof body.enabled === 'boolean') {
          state.enabled = body.enabled;
        }
        if ('feature_state_value' in body) {
          state.feature_state_value = body.feature_state_value;
        }
        this.sendJson(res, 200, state);
        return;
      }

      this.sendJson(res, 404, { detail: `Not found: ${pathname}` });
    } catch (err) {
      this.sendJson(res, 500, { detail: err instanceof Error ? err.message : String(err) });
    }
  }

  public dispose(): void {
    this.stop();
  }
}
