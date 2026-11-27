import * as vscode from 'vscode';
import { FlagsmithClient } from './flagsmithClient';
import { findClosestFlagName, scanTextForFlags } from './flagScanner';
import {
  EnvFlagState,
  FlagHealthReport,
  FlagReference,
  FlagsmithEnvironment,
  FlagsmithFeature,
  FlagsmithProject,
  GhostFlagIssue,
  ResolvedFlag,
} from './types';

export class FlagStore implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  public readonly onDidChange = this._onDidChange.event;

  public readonly client: FlagsmithClient;
  public project: FlagsmithProject | undefined;
  public environments: FlagsmithEnvironment[] = [];
  public activeEnvKey: string | undefined;
  public flagsByName = new Map<string, ResolvedFlag>();
  public health: FlagHealthReport = {
    ghostFlags: [],
    staleFlags: [],
    referencesByFlag: {},
  };
  public lastError: string | undefined;
  public isConnected = false;

  private pollTimer: NodeJS.Timeout | undefined;
  private isRefreshing = false;

  constructor() {
    const cfg = this.readConfig();
    this.client = new FlagsmithClient({ apiUrl: cfg.apiUrl, apiToken: cfg.apiToken });
    this.restartPolling();
  }

  public readConfig() {
    const cfg = vscode.workspace.getConfiguration('flaglens');
    return {
      apiUrl: cfg.get<string>('apiUrl', 'http://localhost:8000'),
      apiToken: cfg.get<string>('apiToken', 'flaglens-dev-token'),
      projectId: cfg.get<number>('projectId', 0),
      defaultEnvironment: cfg.get<string>('defaultEnvironment', 'Development'),
      autoRefreshSeconds: cfg.get<number>('autoRefreshSeconds', 15),
      showInlineBadges: cfg.get<boolean>('showInlineBadges', true),
      autoStartLocalSandbox: cfg.get<boolean>('autoStartLocalSandbox', true),
    };
  }

  public reloadConfig(): void {
    const cfg = this.readConfig();
    this.client.updateConfig({ apiUrl: cfg.apiUrl, apiToken: cfg.apiToken });
    this.restartPolling();
  }

  public restartPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    const seconds = this.readConfig().autoRefreshSeconds;
    if (seconds > 0) {
      this.pollTimer = setInterval(() => {
        void this.refresh();
      }, seconds * 1000);
    }
  }

  public getActiveEnvironment(): FlagsmithEnvironment | undefined {
    if (this.activeEnvKey) {
      const found = this.environments.find((e) => e.api_key === this.activeEnvKey);
      if (found) {
        return found;
      }
    }
    return this.environments[0];
  }

  public setActiveEnvironment(envApiKey: string): void {
    this.activeEnvKey = envApiKey;
    this._onDidChange.fire();
  }

  public getAllFlags(): ResolvedFlag[] {
    return Array.from(this.flagsByName.values()).sort((a, b) =>
      a.feature.name.localeCompare(b.feature.name)
    );
  }

  public getFlag(name: string): ResolvedFlag | undefined {
    return this.flagsByName.get(name);
  }

  public async refresh(): Promise<void> {
    if (this.isRefreshing) {
      return;
    }
    this.isRefreshing = true;
    try {
      const cfg = this.readConfig();
      const projects = await this.client.getProjects();
      if (!projects.length) {
        throw new Error('No projects found on this Flagsmith instance.');
      }

      const selectedProject =
        (cfg.projectId ? projects.find((p) => p.id === cfg.projectId) : undefined) ?? projects[0];
      this.project = selectedProject;

      const [environments, features] = await Promise.all([
        this.client.getEnvironments(selectedProject.id),
        this.client.getFeatures(selectedProject.id),
      ]);
      this.environments = environments;

      if (!this.activeEnvKey || !environments.some((e) => e.api_key === this.activeEnvKey)) {
        const preferred = environments.find(
          (e) => e.name.toLowerCase() === cfg.defaultEnvironment.toLowerCase()
        );
        this.activeEnvKey = (preferred ?? environments[0])?.api_key;
      }

      const envStatesList = await Promise.all(
        environments.map(async (env) => ({
          env,
          states: await this.client.getFeatureStates(env.api_key),
        }))
      );

      const newMap = new Map<string, ResolvedFlag>();
      for (const feature of features) {
        newMap.set(feature.name, { feature, statesByEnv: {} });
      }

      const featureById = new Map<number, FlagsmithFeature>(features.map((f) => [f.id, f]));

      for (const { env, states } of envStatesList) {
        for (const st of states) {
          const feature = featureById.get(st.feature);
          if (!feature) {
            continue;
          }
          const resolved = newMap.get(feature.name);
          if (!resolved) {
            continue;
          }

          const splits: Array<{ label: string; percentage: number }> = [];
          if (st.multivariate_feature_state_values?.length && feature.multivariate_options?.length) {
            for (const mv of st.multivariate_feature_state_values) {
              const opt = feature.multivariate_options.find(
                (o) => o.id === mv.multivariate_feature_option
              );
              const label =
                opt?.string_value ??
                (opt?.integer_value !== undefined && opt?.integer_value !== null
                  ? String(opt.integer_value)
                  : opt?.boolean_value !== undefined && opt?.boolean_value !== null
                  ? String(opt.boolean_value)
                  : `variant_${mv.multivariate_feature_option}`);
              splits.push({ label, percentage: mv.percentage_allocation });
            }
          }

          const envState: EnvFlagState = {
            environment: env,
            stateId: st.id,
            enabled: st.enabled,
            value: st.feature_state_value,
            multivariateSplits: splits,
          };
          resolved.statesByEnv[env.api_key] = envState;
        }
      }

      this.flagsByName = newMap;
      this.isConnected = true;
      this.lastError = undefined;

      await this.scanWorkspaceHealth();
    } catch (err) {
      this.isConnected = false;
      this.lastError = err instanceof Error ? err.message : String(err);
    } finally {
      this.isRefreshing = false;
      this._onDidChange.fire();
    }
  }

  public async scanWorkspaceHealth(): Promise<void> {
    const files = await vscode.workspace.findFiles(
      '**/*.{js,jsx,ts,tsx,mjs,cjs,py,go,java,dart,vue,svelte}',
      '{**/node_modules/**,**/out/**,**/dist/**,**/.git/**,**/docker/**,**/tests/**}',
      250
    );

    const allRefs: FlagReference[] = [];
    for (const uri of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const refs = scanTextForFlags(doc.getText(), uri.fsPath);
        allRefs.push(...refs);
      } catch {
        // Ignore unreadable binary/deleted files
      }
    }

    const referencesByFlag: Record<string, FlagReference[]> = {};
    const ghostFlags: GhostFlagIssue[] = [];
    const knownNames = Array.from(this.flagsByName.keys());

    for (const ref of allRefs) {
      if (!referencesByFlag[ref.flagName]) {
        referencesByFlag[ref.flagName] = [];
      }
      referencesByFlag[ref.flagName].push(ref);

      if (this.isConnected && !this.flagsByName.has(ref.flagName)) {
        ghostFlags.push({
          reference: ref,
          suggestion: findClosestFlagName(ref.flagName, knownNames),
        });
      }
    }

    const staleFlags: ResolvedFlag[] = [];
    if (this.isConnected) {
      for (const resolved of this.flagsByName.values()) {
        if (!referencesByFlag[resolved.feature.name]?.length) {
          staleFlags.push(resolved);
        }
      }
    }

    this.health = { ghostFlags, staleFlags, referencesByFlag };
  }

  public async toggleFlag(flagName: string, envApiKey?: string): Promise<boolean> {
    const resolved = this.flagsByName.get(flagName);
    const env = envApiKey
      ? this.environments.find((e) => e.api_key === envApiKey)
      : this.getActiveEnvironment();

    if (!resolved || !env) {
      throw new Error(`Could not locate flag "${flagName}" or active environment.`);
    }

    const current = resolved.statesByEnv[env.api_key];
    if (!current) {
      throw new Error(`No state found for "${flagName}" in ${env.name}.`);
    }

    const nextEnabled = !current.enabled;
    await this.client.updateFeatureState(env, resolved.feature.id, current.stateId, {
      enabled: nextEnabled,
      feature_state_value: current.value,
    });

    current.enabled = nextEnabled;
    this._onDidChange.fire();
    return nextEnabled;
  }

  public async updateFlagValue(
    flagName: string,
    newValue: string | null,
    envApiKey?: string
  ): Promise<void> {
    const resolved = this.flagsByName.get(flagName);
    const env = envApiKey
      ? this.environments.find((e) => e.api_key === envApiKey)
      : this.getActiveEnvironment();

    if (!resolved || !env) {
      throw new Error(`Could not locate flag "${flagName}" or active environment.`);
    }

    const current = resolved.statesByEnv[env.api_key];
    if (!current) {
      throw new Error(`No state found for "${flagName}" in ${env.name}.`);
    }

    await this.client.updateFeatureState(env, resolved.feature.id, current.stateId, {
      enabled: current.enabled,
      feature_state_value: newValue,
    });

    current.value = newValue;
    this._onDidChange.fire();
  }

  public async createFlag(
    name: string,
    options?: { description?: string; defaultEnabled?: boolean; initialValue?: string | null }
  ): Promise<FlagsmithFeature> {
    if (!this.project) {
      throw new Error('Not connected to a Flagsmith project.');
    }
    const created = await this.client.createFeature(this.project.id, {
      name,
      description: options?.description,
      default_enabled: options?.defaultEnabled ?? false,
      initial_value: options?.initialValue ?? null,
    });
    await this.refresh();
    return created;
  }

  public dispose(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    this._onDidChange.dispose();
  }
}
