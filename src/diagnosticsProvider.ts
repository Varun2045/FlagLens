import * as vscode from 'vscode';
import { findClosestFlagName, scanTextForFlags } from './flagScanner';
import { FlagStore } from './flagStore';

const DIAGNOSTIC_SOURCE = 'FlagLens';

export class FlagDiagnosticsProvider implements vscode.CodeActionProvider, vscode.Disposable {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.Refactor,
  ];

  private readonly collection: vscode.DiagnosticCollection;

  constructor(private readonly store: FlagStore) {
    this.collection = vscode.languages.createDiagnosticCollection('flaglens');
  }

  public updateAllDocuments(): void {
    this.collection.clear();
    if (!this.store.isConnected) {
      return;
    }
    for (const doc of vscode.workspace.textDocuments) {
      this.updateDocument(doc);
    }
  }

  public updateDocument(document: vscode.TextDocument): void {
    if (!this.store.isConnected) {
      this.collection.delete(document.uri);
      return;
    }

    const refs = scanTextForFlags(document.getText(), document.uri.fsPath);
    const knownNames = Array.from(this.store.flagsByName.keys());
    const diagnostics: vscode.Diagnostic[] = [];

    for (const ref of refs) {
      if (this.store.flagsByName.has(ref.flagName)) {
        continue;
      }

      const suggestion = findClosestFlagName(ref.flagName, knownNames);
      const range = new vscode.Range(ref.line, ref.startCol, ref.line, ref.endCol);
      const message = suggestion
        ? `Flag "${ref.flagName}" not found in Flagsmith. Did you mean "${suggestion}"?`
        : `Flag "${ref.flagName}" does not exist in Flagsmith.`;

      const diag = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning);
      diag.source = DIAGNOSTIC_SOURCE;
      diag.code = suggestion ? `ghost:${ref.flagName}:${suggestion}` : `ghost:${ref.flagName}`;
      diagnostics.push(diag);
    }

    this.collection.set(document.uri, diagnostics);
  }

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // 1. Quick fixes for Ghost Flags
    for (const diag of context.diagnostics) {
      if (diag.source !== DIAGNOSTIC_SOURCE || typeof diag.code !== 'string') {
        continue;
      }
      const parts = diag.code.split(':');
      if (parts[0] !== 'ghost') {
        continue;
      }
      const flagName = parts[1];
      const suggestion = parts[2];

      if (suggestion) {
        const fixTypo = new vscode.CodeAction(
          `FlagLens: Replace with "${suggestion}"`,
          vscode.CodeActionKind.QuickFix
        );
        fixTypo.isPreferred = true;
        fixTypo.diagnostics = [diag];
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, diag.range, suggestion);
        fixTypo.edit = edit;
        actions.push(fixTypo);
      }

      const createFlagAction = new vscode.CodeAction(
        `FlagLens: Create flag "${flagName}" in Flagsmith`,
        vscode.CodeActionKind.QuickFix
      );
      createFlagAction.diagnostics = [diag];
      createFlagAction.command = {
        command: 'flaglens.createFlag',
        title: `Create flag "${flagName}" in Flagsmith`,
        arguments: [flagName],
      };
      actions.push(createFlagAction);
    }

    // 2. Wrap selected code in a Flagsmith feature flag
    if (!range.isEmpty) {
      const wrapAction = new vscode.CodeAction(
        'FlagLens: Wrap selection in Flagsmith Feature Flag',
        vscode.CodeActionKind.Refactor
      );
      wrapAction.command = {
        command: 'flaglens.wrapInFlag',
        title: 'Wrap selection in Flagsmith Feature Flag',
      };
      actions.push(wrapAction);
    }

    return actions;
  }

  public dispose(): void {
    this.collection.dispose();
  }
}
