import {
  FlagsmithEnvironment,
  FlagsmithFeature,
  FlagsmithFeatureState,
  FlagsmithProject,
} from './types';

export interface FlagsmithClientConfig {
  apiUrl: string;
  apiToken: string;
}

interface PaginatedResponse<T> {
  count?: number;
  next?: string | null;
  results?: T[];
}

export class FlagsmithClient {
  private baseUrl: string;
  private apiToken: string;

  constructor(config: FlagsmithClientConfig) {
    this.baseUrl = config.apiUrl.replace(/\/+$/, '');
    this.apiToken = config.apiToken.trim();
  }

  public updateConfig(config: FlagsmithClientConfig): void {
    this.baseUrl = config.apiUrl.replace(/\/+$/, '');
    this.apiToken = config.apiToken.trim();
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  private getAuthHeader(): string {
    if (!this.apiToken) {
      return '';
    }
    if (
      this.apiToken.startsWith('Api-Key ') ||
      this.apiToken.startsWith('Token ') ||
      this.apiToken.startsWith('Bearer ')
    ) {
      return this.apiToken;
    }
    // Flagsmith Organisation API keys begin with "ser." and use Api-Key auth.
    if (this.apiToken.startsWith('ser.')) {
      return `Api-Key ${this.apiToken}`;
    }
    return `Token ${this.apiToken}`;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    const auth = this.getAuthHeader();
    if (auth) {
      headers['Authorization'] = auth;
    }

    const res = await fetch(url, {
      ...init,
      headers: {
        ...headers,
        ...(init?.headers as Record<string, string> | undefined),
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Flagsmith API ${res.status} (${path}): ${body || res.statusText}`);
    }

    if (res.status === 204) {
      return undefined as T;
    }

    return (await res.json()) as T;
  }

  private unwrapList<T>(data: T[] | PaginatedResponse<T>): T[] {
    if (Array.isArray(data)) {
      return data;
    }
    return data.results ?? [];
  }

  public async getProjects(): Promise<FlagsmithProject[]> {
    const data = await this.request<FlagsmithProject[] | PaginatedResponse<FlagsmithProject>>(
      '/api/v1/projects/'
    );
    return this.unwrapList(data);
  }

  public async getEnvironments(projectId: number): Promise<FlagsmithEnvironment[]> {
    const data = await this.request<
      FlagsmithEnvironment[] | PaginatedResponse<FlagsmithEnvironment>
    >(`/api/v1/environments/?project=${projectId}`);
    const envs = this.unwrapList(data);
    return envs.filter((e) => e.project === projectId);
  }

  public async getFeatures(projectId: number): Promise<FlagsmithFeature[]> {
    const data = await this.request<FlagsmithFeature[] | PaginatedResponse<FlagsmithFeature>>(
      `/api/v1/projects/${projectId}/features/?page_size=200`
    );
    return this.unwrapList(data).filter((f) => !f.is_archived);
  }

  public async getFeatureStates(environmentApiKey: string): Promise<FlagsmithFeatureState[]> {
    const data = await this.request<
      FlagsmithFeatureState[] | PaginatedResponse<FlagsmithFeatureState>
    >(`/api/v1/environments/${encodeURIComponent(environmentApiKey)}/featurestates/?page_size=200`);
    return this.unwrapList(data);
  }

  public async createFeature(
    projectId: number,
    payload: {
      name: string;
      description?: string;
      default_enabled?: boolean;
      initial_value?: string | null;
    }
  ): Promise<FlagsmithFeature> {
    return this.request<FlagsmithFeature>(`/api/v1/projects/${projectId}/features/`, {
      method: 'POST',
      body: JSON.stringify({
        name: payload.name,
        description: payload.description ?? 'Created from VS Code via FlagLens',
        default_enabled: payload.default_enabled ?? false,
        initial_value: payload.initial_value ?? null,
        type: 'STANDARD',
      }),
    });
  }

  public async updateFeatureState(
    env: FlagsmithEnvironment,
    featureId: number,
    stateId: number,
    update: {
      enabled: boolean;
      feature_state_value?: string | number | boolean | null;
    }
  ): Promise<FlagsmithFeatureState> {
    if (env.use_v2_feature_versioning) {
      return this.updateFeatureStateV2(env.id, featureId, update);
    }

    try {
      return await this.request<FlagsmithFeatureState>(
        `/api/v1/environments/${encodeURIComponent(env.api_key)}/featurestates/${stateId}/`,
        {
          method: 'PUT',
          body: JSON.stringify({
            id: stateId,
            feature: featureId,
            environment: env.id,
            enabled: update.enabled,
            feature_state_value: update.feature_state_value ?? null,
          }),
        }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('400') && msg.toLowerCase().includes('version')) {
        return this.updateFeatureStateV2(env.id, featureId, update);
      }
      throw err;
    }
  }

  private async updateFeatureStateV2(
    envId: number,
    featureId: number,
    update: {
      enabled: boolean;
      feature_state_value?: string | number | boolean | null;
    }
  ): Promise<FlagsmithFeatureState> {
    const version = await this.request<{ uuid: string }>(
      `/api/v1/environments/${envId}/features/${featureId}/versions/`,
      {
        method: 'POST',
        body: JSON.stringify({
          publish_immediately: true,
          feature_states_to_update: [
            {
              feature: featureId,
              enabled: update.enabled,
              feature_state_value: {
                type: 'unicode',
                string_value:
                  update.feature_state_value === null || update.feature_state_value === undefined
                    ? null
                    : String(update.feature_state_value),
              },
            },
          ],
        }),
      }
    );

    if (version?.uuid) {
      await this.request(
        `/api/v1/environments/${envId}/features/${featureId}/versions/${version.uuid}/publish/`,
        { method: 'POST', body: JSON.stringify({}) }
      ).catch(() => {
        // Already published when publish_immediately is supported
      });
    }

    return {
      id: 0,
      feature: featureId,
      environment: envId,
      enabled: update.enabled,
      feature_state_value: update.feature_state_value ?? null,
    };
  }
}
