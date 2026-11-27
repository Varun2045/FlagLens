import * as vscode from 'vscode';
import { findClosestFlagName, scanTextForFlags } from './flagScanner';
import { FlagStore } from './flagStore';

export class DecorationProvider implements vscode.Disposable {
  private readonly onDecoration: vscode.TextEditorDecorationType;
  private readonly offDecoration: vscode.TextEditorDecorationType;
  private readonly experimentDecoration: vscode.TextEditorDecorationType;
  private readonly ghostDecoration: vscode.TextEditorDecorationType;

  constructor(private readonly store: FlagStore) {
    this.onDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 14px',
        color: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.14)',
        border: '1px solid rgba(16, 185, 129, 0.35)',
        fontWeight: '600',
      },
    });

    this.offDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 14px',
        color: '#94A3B8',
        backgroundColor: 'rgba(148, 163, 184, 0.12)',
        border: '1px solid rgba(148, 163, 184, 0.30)',
        fontWeight: '600',
      },
    });

    this.experimentDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 14px',
        color: '#A78BFA',
        backgroundColor: 'rgba(104, 55, 252, 0.18)',
        border: '1px solid rgba(139, 92, 246, 0.45)',
        fontWeight: '600',
      },
    });

    this.ghostDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 14px',
        color: '#F59E0B',
        backgroundColor: 'rgba(245, 158, 11, 0.14)',
        border: '1px solid rgba(245, 158, 11, 0.40)',
        fontWeight: '600',
      },
    });
  }

  public updateAllVisibleEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.updateEditor(editor);
    }
  }

  public updateEditor(editor: vscode.TextEditor): void {
    if (!this.store.readConfig().showInlineBadges || !this.store.isConnected) {
      this.clearEditor(editor);
      return;
    }

    const refs = scanTextForFlags(editor.document.getText(), editor.document.uri.fsPath);
    const activeEnv = this.store.getActiveEnvironment();
    const prodEnv = this.store.environments.find(
      (e) => e.name.toLowerCase().includes('prod') && e.api_key !== activeEnv?.api_key
    );

    const onRanges: vscode.DecorationOptions[] = [];
    const offRanges: vscode.DecorationOptions[] = [];
    const expRanges: vscode.DecorationOptions[] = [];
    const ghostRanges: vscode.DecorationOptions[] = [];

    const knownNames = Array.from(this.store.flagsByName.keys());
    const decoratedLines = new Set<number>();

    for (const ref of refs) {
      if (decoratedLines.has(ref.line)) {
        continue;
      }
      decoratedLines.add(ref.line);

      const lineObj = editor.document.lineAt(ref.line);
      const range = new vscode.Range(lineObj.range.end, lineObj.range.end);
      const resolved = this.store.getFlag(ref.flagName);

      if (!resolved) {
        const suggestion = findClosestFlagName(ref.flagName, knownNames);
        const hint = suggestion ? ` — Did you mean "${suggestion}"?` : '';
        ghostRanges.push({
          range,
          renderOptions: {
            after: { contentText: ` ⚠ Ghost Flag${hint} ` },
          },
        });
        continue;
      }

      const activeState = activeEnv ? resolved.statesByEnv[activeEnv.api_key] : undefined;
      const prodState = prodEnv ? resolved.statesByEnv[prodEnv.api_key] : undefined;
      const envShort = activeEnv ? formatEnvShort(activeEnv.name) : 'env';

      if (!activeState) {
        continue;
      }

      // Multivariate / Experimentation badge
      if (activeState.multivariateSplits.length > 0) {
        const splitText = activeState.multivariateSplits.map((s) => `${s.percentage}%`).join(' / ');
        const statusDot = activeState.enabled ? '● ON' : '○ OFF';
        expRanges.push({
          range,
          renderOptions: {
            after: {
              contentText: ` 🧪 ${statusDot} · ${splitText} Split [${envShort}] `,
            },
          },
        });
        continue;
      }

      // Standard flag badge (+ optional prod comparison & remote config value)
      const activeText = activeState.enabled ? `● ON [${envShort}]` : `○ OFF [${envShort}]`;
      const prodText = prodState
        ? prodState.enabled
          ? ' | ● ON [prod]'
          : ' | ○ OFF [prod]'
        : '';
      const valSnippet =
        activeState.value !== null &&
        activeState.value !== undefined &&
        String(activeState.value).length > 0 &&
        ref.callPattern.toLowerCase().includes('value')
          ? ` · "${String(activeState.value).slice(0, 22)}"`
          : '';

      const contentText = ` ${activeText}${valSnippet}${prodText} `;
      if (activeState.enabled) {
        onRanges.push({ range, renderOptions: { after: { contentText } } });
      } else {
        offRanges.push({ range, renderOptions: { after: { contentText } } });
      }
    }

    editor.setDecorations(this.onDecoration, onRanges);
    editor.setDecorations(this.offDecoration, offRanges);
    editor.setDecorations(this.experimentDecoration, expRanges);
    editor.setDecorations(this.ghostDecoration, ghostRanges);
  }

  public clearEditor(editor: vscode.TextEditor): void {
    editor.setDecorations(this.onDecoration, []);
    editor.setDecorations(this.offDecoration, []);
    editor.setDecorations(this.experimentDecoration, []);
    editor.setDecorations(this.ghostDecoration, []);
  }

  public dispose(): void {
    this.onDecoration.dispose();
    this.offDecoration.dispose();
    this.experimentDecoration.dispose();
    this.ghostDecoration.dispose();
  }
}

function formatEnvShort(name: string): string {
  const lower = name.toLowerCase();
  if (lower.startsWith('dev')) {
    return 'dev';
  }
  if (lower.startsWith('stag')) {
    return 'stg';
  }
  if (lower.startsWith('prod')) {
    return 'prod';
  }
  return lower.slice(0, 4);
}
