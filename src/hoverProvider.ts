import * as vscode from 'vscode';
import { findClosestFlagName, scanTextForFlags } from './flagScanner';
import { FlagStore } from './flagStore';

export class FlagHoverProvider implements vscode.HoverProvider {
  constructor(private readonly store: FlagStore) {}

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    if (!this.store.isConnected) {
      return undefined;
    }

    const lineText = document.lineAt(position.line).text;
    const refs = scanTextForFlags(lineText, document.uri.fsPath);
    const match = refs.find(
      (r) => position.character >= r.startCol && position.character <= r.endCol
    );
    if (!match) {
      return undefined;
    }

    const range = new vscode.Range(position.line, match.startCol, position.line, match.endCol);
    const resolved = this.store.getFlag(match.flagName);
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportThemeIcons = true;

    if (!resolved) {
      const suggestion = findClosestFlagName(
        match.flagName,
        Array.from(this.store.flagsByName.keys())
      );
      md.appendMarkdown(`### $(warning) Ghost Flag: \`${match.flagName}\`\n\n`);
      md.appendMarkdown(
        `This flag does not exist in your self-hosted Flagsmith project **${this.store.project?.name ?? ''}**.\n\n`
      );
      if (suggestion) {
        md.appendMarkdown(`Did you mean **\`${suggestion}\`**?\n\n`);
      }
      const createArgs = encodeURIComponent(JSON.stringify([match.flagName]));
      md.appendMarkdown(
        `[$(add) Create \`${match.flagName}\` in Flagsmith](command:flaglens.createFlag?${createArgs})`
      );
      return new vscode.Hover(md, range);
    }

    const activeEnv = this.store.getActiveEnvironment();
    md.appendMarkdown(`### $(beaker) Flagsmith: \`${resolved.feature.name}\`\n\n`);
    if (resolved.feature.description) {
      md.appendMarkdown(`${resolved.feature.description}\n\n`);
    }

    md.appendMarkdown(`| Environment | Status | Value / Experiment Split |\n`);
    md.appendMarkdown(`| :--- | :--- | :--- |\n`);

    for (const env of this.store.environments) {
      const st = resolved.statesByEnv[env.api_key];
      if (!st) {
        continue;
      }
      const envLabel = env.api_key === activeEnv?.api_key ? `**${env.name}** ★` : env.name;
      const statusLabel = st.enabled ? '🟢 ON' : '⚪ OFF';
      let detail = st.value !== null && st.value !== undefined ? `\`${String(st.value)}\`` : '—';
      if (st.multivariateSplits.length > 0) {
        detail = st.multivariateSplits.map((s) => `${s.label} (${s.percentage}%)`).join(' · ');
      }
      md.appendMarkdown(`| ${envLabel} | ${statusLabel} | ${detail} |\n`);
    }

    md.appendMarkdown('\n---\n');

    if (activeEnv) {
      const toggleArgs = encodeURIComponent(
        JSON.stringify([resolved.feature.name, activeEnv.api_key])
      );
      const editArgs = encodeURIComponent(
        JSON.stringify([resolved.feature.name, activeEnv.api_key])
      );
      const openArgs = encodeURIComponent(JSON.stringify([resolved.feature.name]));

      md.appendMarkdown(
        `[$(debug-restart) Toggle in ${activeEnv.name}](command:flaglens.toggleFlag?${toggleArgs})  •  ` +
          `[$(edit) Edit Value](command:flaglens.editFlagValue?${editArgs})  •  ` +
          `[$(link-external) Open in Flagsmith](command:flaglens.openInFlagsmith?${openArgs})`
      );
    }

    return new vscode.Hover(md, range);
  }
}
