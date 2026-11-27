import * as vscode from 'vscode';
import { FlagStore } from './flagStore';

export class FlagStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor(private readonly store: FlagStore) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.show();
    this.update();
    store.onDidChange(() => this.update());
  }

  public update(): void {
    if (!this.store.isConnected) {
      this.item.text = '$(plug) FlagLens: Offline';
      this.item.tooltip = this.store.lastError
        ? `FlagLens could not reach Flagsmith: ${this.store.lastError}\nClick to configure.`
        : 'Click to configure self-hosted Flagsmith connection.';
      this.item.command = 'flaglens.configureConnection';
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      return;
    }

    const env = this.store.getActiveEnvironment();
    const count = this.store.flagsByName.size;
    const ghosts = this.store.health.ghostFlags.length;
    const ghostSuffix = ghosts > 0 ? ` · $(warning) ${ghosts}` : '';

    this.item.text = `$(beaker) FlagLens: ${env?.name ?? 'Connected'} (${count})${ghostSuffix}`;
    this.item.tooltip = `Connected to ${this.store.client.getBaseUrl()} (${this.store.project?.name ?? ''})\nClick to switch active environment.`;
    this.item.command = 'flaglens.switchEnvironment';
    this.item.backgroundColor = undefined;
  }

  public dispose(): void {
    this.item.dispose();
  }
}
