import * as path from 'node:path';
import * as vscode from 'vscode';
import { FlagStore } from './flagStore';
import { FlagReference, ResolvedFlag } from './types';

export class FlagTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: 'flag' | 'envState' | 'usage' | 'info',
    public readonly flagName?: string,
    public readonly envApiKey?: string,
    public readonly reference?: FlagReference
  ) {
    super(label, collapsibleState);
  }
}

export class FlagLensFlagsProvider implements vscode.TreeDataProvider<FlagTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly store: FlagStore) {
    store.onDidChange(() => this._onDidChangeTreeData.fire());
  }

  public getTreeItem(element: FlagTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: FlagTreeItem): FlagTreeItem[] {
    if (!this.store.isConnected) {
      const errItem = new FlagTreeItem(
        'Not connected to Flagsmith',
        vscode.TreeItemCollapsibleState.None,
        'info'
      );
      errItem.description = this.store.lastError ? 'Click to configure' : 'Connecting...';
      errItem.tooltip = this.store.lastError ?? 'Configure your self-hosted Flagsmith URL & Token.';
      errItem.iconPath = new vscode.ThemeIcon('plug');
      errItem.command = {
        command: 'flaglens.configureConnection',
        title: 'Configure Connection',
      };
      return [errItem];
    }

    if (!element) {
      const activeEnv = this.store.getActiveEnvironment();
      const flags = this.store.getAllFlags();
      if (!flags.length) {
        const empty = new FlagTreeItem(
          'No feature flags found',
          vscode.TreeItemCollapsibleState.None,
          'info'
        );
        empty.iconPath = new vscode.ThemeIcon('info');
        return [empty];
      }

      return flags.map((resolved) => {
        const st = activeEnv ? resolved.statesByEnv[activeEnv.api_key] : undefined;
        const enabled = st?.enabled ?? false;
        const refs = this.store.health.referencesByFlag[resolved.feature.name] ?? [];

        const item = new FlagTreeItem(
          resolved.feature.name,
          vscode.TreeItemCollapsibleState.Collapsed,
          'flag',
          resolved.feature.name,
          activeEnv?.api_key
        );
        item.contextValue = 'flagItem';

        let desc = enabled ? 'ON' : 'OFF';
        if (st?.multivariateSplits.length) {
          desc += ` · 🧪 ${st.multivariateSplits.map((s) => `${s.percentage}%`).join('/')}`;
        } else if (st?.value !== null && st?.value !== undefined && String(st.value).length > 0) {
          desc += ` · "${String(st.value).slice(0, 18)}"`;
        }
        if (refs.length > 0) {
          desc += ` (${refs.length} use${refs.length === 1 ? '' : 's'})`;
        }
        item.description = desc;
        item.tooltip = `${resolved.feature.name}\n${resolved.feature.description || 'No description'}\nActive env: ${activeEnv?.name ?? 'N/A'}`;
        item.iconPath = new vscode.ThemeIcon(
          st?.multivariateSplits.length ? 'beaker' : enabled ? 'pass-filled' : 'circle-large-outline',
          new vscode.ThemeColor(
            st?.multivariateSplits.length
              ? 'charts.purple'
              : enabled
              ? 'charts.green'
              : 'disabledForeground'
          )
        );
        return item;
      });
    }

    if (element.itemType === 'flag' && element.flagName) {
      const resolved = this.store.getFlag(element.flagName);
      if (!resolved) {
        return [];
      }
      const children: FlagTreeItem[] = [];

      // Environment states
      for (const env of this.store.environments) {
        const st = resolved.statesByEnv[env.api_key];
        if (!st) {
          continue;
        }
        const envItem = new FlagTreeItem(
          env.name,
          vscode.TreeItemCollapsibleState.None,
          'envState',
          resolved.feature.name,
          env.api_key
        );
        envItem.description = st.enabled ? '● ON' : '○ OFF';
        if (st.value !== null && st.value !== undefined && String(st.value).length > 0) {
          envItem.description += ` · ${String(st.value).slice(0, 24)}`;
        }
        envItem.iconPath = new vscode.ThemeIcon(
          st.enabled ? 'check' : 'close',
          new vscode.ThemeColor(st.enabled ? 'charts.green' : 'disabledForeground')
        );
        envItem.tooltip = `Click to toggle "${resolved.feature.name}" in ${env.name}`;
        envItem.command = {
          command: 'flaglens.toggleFlag',
          title: `Toggle in ${env.name}`,
          arguments: [resolved.feature.name, env.api_key],
        };
        children.push(envItem);
      }

      // Codebase usages
      const refs = this.store.health.referencesByFlag[resolved.feature.name] ?? [];
      for (const ref of refs) {
        const usageItem = new FlagTreeItem(
          `${path.basename(ref.filePath)}:${ref.line + 1}`,
          vscode.TreeItemCollapsibleState.None,
          'usage',
          resolved.feature.name,
          undefined,
          ref
        );
        usageItem.description = ref.callPattern;
        usageItem.iconPath = new vscode.ThemeIcon('go-to-file');
        usageItem.command = {
          command: 'flaglens.findUsages',
          title: 'Jump to usage',
          arguments: [ref],
        };
        children.push(usageItem);
      }

      return children;
    }

    return [];
  }
}

export class HealthTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly group?: 'ghost' | 'stale',
    public readonly flag?: ResolvedFlag
  ) {
    super(label, collapsibleState);
  }
}

export class FlagLensHealthProvider implements vscode.TreeDataProvider<HealthTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly store: FlagStore) {
    store.onDidChange(() => this._onDidChangeTreeData.fire());
  }

  public getTreeItem(element: HealthTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: HealthTreeItem): HealthTreeItem[] {
    if (!this.store.isConnected) {
      return [];
    }

    if (!element) {
      const ghostCount = this.store.health.ghostFlags.length;
      const staleCount = this.store.health.staleFlags.length;

      const ghostGroup = new HealthTreeItem(
        `Ghost / Typo Flags (${ghostCount})`,
        ghostCount > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed,
        'ghost'
      );
      ghostGroup.iconPath = new vscode.ThemeIcon(
        'warning',
        new vscode.ThemeColor(ghostCount > 0 ? 'charts.yellow' : 'charts.green')
      );

      const staleGroup = new HealthTreeItem(
        `Stale / Unused Flags (${staleCount})`,
        staleCount > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed,
        'stale'
      );
      staleGroup.iconPath = new vscode.ThemeIcon(
        'trash',
        new vscode.ThemeColor(staleCount > 0 ? 'charts.orange' : 'charts.green')
      );

      return [ghostGroup, staleGroup];
    }

    if (element.group === 'ghost') {
      if (!this.store.health.ghostFlags.length) {
        const ok = new HealthTreeItem(
          'All flag references in code are valid!',
          vscode.TreeItemCollapsibleState.None
        );
        ok.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
        return [ok];
      }

      return this.store.health.ghostFlags.map((issue) => {
        const item = new HealthTreeItem(
          issue.reference.flagName,
          vscode.TreeItemCollapsibleState.None
        );
        const fileLabel = `${path.basename(issue.reference.filePath)}:${issue.reference.line + 1}`;
        item.description = issue.suggestion
          ? `${fileLabel} · Did you mean "${issue.suggestion}"?`
          : `${fileLabel} · Not in Flagsmith`;
        item.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.yellow'));
        item.command = {
          command: 'flaglens.findUsages',
          title: 'Jump to Ghost Flag',
          arguments: [issue.reference],
        };
        return item;
      });
    }

    if (element.group === 'stale') {
      if (!this.store.health.staleFlags.length) {
        const ok = new HealthTreeItem(
          'No unused flags detected!',
          vscode.TreeItemCollapsibleState.None
        );
        ok.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
        return [ok];
      }

      return this.store.health.staleFlags.map((resolved) => {
        const item = new HealthTreeItem(
          resolved.feature.name,
          vscode.TreeItemCollapsibleState.None,
          undefined,
          resolved
        );
        item.description = '0 references in workspace';
        item.tooltip =
          resolved.feature.description ||
          'This flag exists in Flagsmith but is not referenced anywhere in your codebase.';
        item.iconPath = new vscode.ThemeIcon('history', new vscode.ThemeColor('charts.orange'));
        return item;
      });
    }

    return [];
  }
}
