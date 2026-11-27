import * as vscode from 'vscode';
import { DecorationProvider } from './decorationProvider';
import { FlagDiagnosticsProvider } from './diagnosticsProvider';
import { FlagStore } from './flagStore';
import { FlagHoverProvider } from './hoverProvider';
import { LocalFlagsmithSandbox } from './localSandbox';
import {
  FlagLensFlagsProvider,
  FlagLensHealthProvider,
  FlagTreeItem,
} from './sidebarProvider';
import { FlagStatusBar } from './statusBar';
import { FlagReference } from './types';

const SUPPORTED_LANGUAGES = [
  'javascript',
  'javascriptreact',
  'typescript',
  'typescriptreact',
  'python',
  'go',
  'java',
  'dart',
  'vue',
  'svelte',
];

export function activate(context: vscode.ExtensionContext): void {
  const store = new FlagStore();
  const sandbox = new LocalFlagsmithSandbox();
  const decorations = new DecorationProvider(store);
  const diagnostics = new FlagDiagnosticsProvider(store);
  const hoverProvider = new FlagHoverProvider(store);
  const flagsTree = new FlagLensFlagsProvider(store);
  const healthTree = new FlagLensHealthProvider(store);
  const statusBar = new FlagStatusBar(store);

  context.subscriptions.push(
    store,
    sandbox,
    decorations,
    diagnostics,
    statusBar,
    vscode.window.registerTreeDataProvider('flaglens.flagsView', flagsTree),
    vscode.window.registerTreeDataProvider('flaglens.healthView', healthTree),
    vscode.languages.registerHoverProvider(SUPPORTED_LANGUAGES, hoverProvider),
    vscode.languages.registerCodeActionsProvider(SUPPORTED_LANGUAGES, diagnostics, {
      providedCodeActionKinds: FlagDiagnosticsProvider.providedCodeActionKinds,
    })
  );

  const syncUi = () => {
    decorations.updateAllVisibleEditors();
    diagnostics.updateAllDocuments();
  };

  store.onDidChange(syncUi, null, context.subscriptions);

  // Update decorations & diagnostics when switching or editing documents
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        decorations.updateEditor(editor);
        diagnostics.updateDocument(editor.document);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      const active = vscode.window.activeTextEditor;
      if (active && active.document === event.document) {
        decorations.updateEditor(active);
      }
      diagnostics.updateDocument(event.document);
    }),
    vscode.workspace.onDidSaveTextDocument(() => {
      void store.scanWorkspaceHealth().then(() => syncUi());
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('flaglens')) {
        store.reloadConfig();
        void store.refresh();
      }
    })
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('flaglens.refresh', async () => {
      await store.refresh();
      if (store.isConnected) {
        vscode.window.setStatusBarMessage(
          `FlagLens: Synced ${store.flagsByName.size} flags from ${store.client.getBaseUrl()}`,
          3000
        );
      } else {
        vscode.window.showWarningMessage(
          `FlagLens could not connect to ${store.client.getBaseUrl()}: ${store.lastError}`
        );
      }
    }),

    vscode.commands.registerCommand('flaglens.switchEnvironment', async () => {
      if (!store.environments.length) {
        await store.refresh();
      }
      if (!store.environments.length) {
        vscode.window.showWarningMessage('FlagLens: No environments available. Check your connection.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        store.environments.map((env) => ({
          label: env.name,
          description: env.api_key === store.activeEnvKey ? '(Active)' : env.api_key,
          env,
        })),
        { placeHolder: 'Select active Flagsmith environment' }
      );
      if (picked) {
        store.setActiveEnvironment(picked.env.api_key);
        vscode.window.setStatusBarMessage(`FlagLens: Switched to ${picked.env.name}`, 2500);
      }
    }),

    vscode.commands.registerCommand(
      'flaglens.toggleFlag',
      async (flagArg?: string | FlagTreeItem, envApiKey?: string) => {
        const flagName = typeof flagArg === 'string' ? flagArg : flagArg?.flagName;
        const targetEnvKey =
          envApiKey ?? (typeof flagArg === 'object' ? flagArg?.envApiKey : undefined);

        if (!flagName) {
          return;
        }
        try {
          const newState = await store.toggleFlag(flagName, targetEnvKey);
          const envName =
            store.environments.find((e) => e.api_key === (targetEnvKey ?? store.activeEnvKey))
              ?.name ?? 'environment';
          vscode.window.setStatusBarMessage(
            `FlagLens: "${flagName}" is now ${newState ? 'ON' : 'OFF'} in ${envName}`,
            3000
          );
        } catch (err) {
          vscode.window.showErrorMessage(
            `FlagLens: Failed to toggle "${flagName}": ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    ),

    vscode.commands.registerCommand(
      'flaglens.editFlagValue',
      async (flagArg?: string | FlagTreeItem, envApiKey?: string) => {
        const flagName = typeof flagArg === 'string' ? flagArg : flagArg?.flagName;
        const targetEnvKey =
          envApiKey ?? (typeof flagArg === 'object' ? flagArg?.envApiKey : undefined);
        if (!flagName) {
          return;
        }
        const resolved = store.getFlag(flagName);
        const env = targetEnvKey
          ? store.environments.find((e) => e.api_key === targetEnvKey)
          : store.getActiveEnvironment();
        if (!resolved || !env) {
          return;
        }
        const currentVal = resolved.statesByEnv[env.api_key]?.value;
        const input = await vscode.window.showInputBox({
          title: `Edit Remote Config Value for "${flagName}" (${env.name})`,
          value: currentVal !== null && currentVal !== undefined ? String(currentVal) : '',
          prompt: 'Enter a new remote config value (leave blank to clear)',
        });
        if (input === undefined) {
          return;
        }
        try {
          await store.updateFlagValue(flagName, input === '' ? null : input, env.api_key);
          vscode.window.setStatusBarMessage(
            `FlagLens: Updated value of "${flagName}" in ${env.name}`,
            3000
          );
        } catch (err) {
          vscode.window.showErrorMessage(
            `FlagLens: Failed to update value: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    ),

    vscode.commands.registerCommand('flaglens.createFlag', async (prefillName?: unknown) => {
      const name =
        typeof prefillName === 'string' && prefillName.trim().length > 0
          ? prefillName
          : await vscode.window.showInputBox({
              title: 'Create Flagsmith Feature Flag',
              prompt: 'Enter a snake_case flag name (e.g. new_onboarding_flow)',
              validateInput: (val) =>
                /^[a-zA-Z0-9_.-]+$/.test(val.trim())
                  ? undefined
                  : 'Use only letters, numbers, underscores, hyphens, or dots.',
            });
      if (!name) {
        return;
      }

      const description = await vscode.window.showInputBox({
        title: `Description for "${name.trim()}"`,
        prompt: 'Optional description for your team',
        value: 'Created from VS Code via FlagLens',
      });
      if (description === undefined) {
        return;
      }

      const defaultPick = await vscode.window.showQuickPick(
        [
          { label: 'OFF by default', enabled: false },
          { label: 'ON by default', enabled: true },
        ],
        { placeHolder: `Initial state for "${name.trim()}"` }
      );
      if (!defaultPick) {
        return;
      }

      try {
        await store.createFlag(name.trim(), {
          description,
          defaultEnabled: defaultPick.enabled,
        });
        vscode.window.showInformationMessage(
          `FlagLens: Created "${name.trim()}" in self-hosted Flagsmith!`
        );
      } catch (err) {
        vscode.window.showErrorMessage(
          `FlagLens: Failed to create flag: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }),

    vscode.commands.registerCommand('flaglens.wrapInFlag', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showInformationMessage('Select a block of code first to wrap in a flag.');
        return;
      }

      const flagName = await vscode.window.showInputBox({
        title: 'Wrap Selection in Flagsmith Feature Flag',
        prompt: 'Enter the flag name (will be created in Flagsmith if it does not exist)',
        placeHolder: 'e.g. express_checkout_v2',
        validateInput: (val) =>
          /^[a-zA-Z0-9_.-]+$/.test(val.trim())
            ? undefined
            : 'Use only letters, numbers, underscores, hyphens, or dots.',
      });
      if (!flagName) {
        return;
      }

      const cleanName = flagName.trim();
      const selection = editor.selection;
      const selectedText = editor.document.getText(selection);
      const langId = editor.document.languageId;

      // Determine leading indentation of first selected line
      const firstLine = editor.document.lineAt(selection.start.line).text;
      const indentMatch = firstLine.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : '';
      const indentedBody = selectedText
        .split(/\r?\n/)
        .map((line) => (line.trim().length ? `  ${line}` : line))
        .join('\n');

      let wrapped: string;
      if (langId === 'python') {
        wrapped = `if flags.is_feature_enabled("${cleanName}"):\n${indentedBody}`;
      } else if (langId === 'go') {
        wrapped = `if flags.IsFeatureEnabled("${cleanName}") {\n${indentedBody}\n${indent}}`;
      } else {
        wrapped = `if (flagsmith.hasFeature('${cleanName}')) {\n${indentedBody}\n${indent}}`;
      }

      await editor.edit((editBuilder) => {
        editBuilder.replace(selection, wrapped);
      });

      // Auto-create the flag in Flagsmith if connected & not yet present
      if (store.isConnected && !store.getFlag(cleanName)) {
        try {
          await store.createFlag(cleanName, {
            description: `Wrapped in ${editor.document.fileName.split(/[\\/]/).pop()} via FlagLens`,
            defaultEnabled: true,
          });
          vscode.window.showInformationMessage(
            `FlagLens: Wrapped code & created "${cleanName}" (ON) in Flagsmith!`
          );
        } catch (err) {
          vscode.window.showWarningMessage(
            `Code wrapped, but creating "${cleanName}" in Flagsmith failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      } else {
        decorations.updateEditor(editor);
      }
    }),

    vscode.commands.registerCommand(
      'flaglens.openInFlagsmith',
      async (flagArg?: string | FlagTreeItem) => {
        const baseUrl = store.client.getBaseUrl();
        const projectId = store.project?.id;
        const envKey = store.getActiveEnvironment()?.api_key;
        const flagName = typeof flagArg === 'string' ? flagArg : flagArg?.flagName;

        const targetUrl =
          projectId && envKey
            ? `${baseUrl}/project/${projectId}/environment/${envKey}/features${flagName ? `?search=${encodeURIComponent(flagName)}` : ''}`
            : baseUrl;
        await vscode.env.openExternal(vscode.Uri.parse(targetUrl));
      }
    ),

    vscode.commands.registerCommand('flaglens.configureConnection', async () => {
      const cfg = vscode.workspace.getConfiguration('flaglens');
      const currentUrl = cfg.get<string>('apiUrl', 'http://localhost:8000');
      const newUrl = await vscode.window.showInputBox({
        title: 'FlagLens: Self-Hosted Flagsmith URL',
        value: currentUrl,
        prompt: 'Enter your self-hosted Flagsmith URL (e.g. http://localhost:8000)',
      });
      if (newUrl === undefined) {
        return;
      }

      const currentToken = cfg.get<string>('apiToken', 'flaglens-dev-token');
      const newToken = await vscode.window.showInputBox({
        title: 'FlagLens: Flagsmith Organisation API Key / Token',
        value: currentToken,
        password: true,
        prompt: 'Enter your Organisation API Key (ser.*) or Admin Token',
      });
      if (newToken === undefined) {
        return;
      }

      await cfg.update('apiUrl', newUrl.trim(), vscode.ConfigurationTarget.Global);
      await cfg.update('apiToken', newToken.trim(), vscode.ConfigurationTarget.Global);
      store.reloadConfig();
      await store.refresh();

      if (store.isConnected) {
        vscode.window.showInformationMessage(
          `FlagLens connected to ${newUrl.trim()} (${store.flagsByName.size} flags loaded).`
        );
      } else {
        vscode.window.showWarningMessage(
          `FlagLens saved settings, but could not connect: ${store.lastError}`
        );
      }
    }),

    vscode.commands.registerCommand('flaglens.findUsages', async (ref?: FlagReference) => {
      if (!ref) {
        return;
      }
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(ref.filePath));
      const editor = await vscode.window.showTextDocument(doc);
      const pos = new vscode.Position(ref.line, ref.startCol);
      const range = new vscode.Range(ref.line, ref.startCol, ref.line, ref.endCol);
      editor.selection = new vscode.Selection(pos, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }),

    vscode.commands.registerCommand('flaglens.toggleLocalSandbox', async () => {
      if (sandbox.running) {
        sandbox.stop();
        vscode.window.showInformationMessage('FlagLens: Built-in local sandbox stopped.');
        await store.refresh();
        return;
      }
      const started = await sandbox.start(8000);
      if (started) {
        vscode.window.showInformationMessage(
          'FlagLens: Built-in local Flagsmith sandbox started on http://localhost:8000!'
        );
        await store.refresh();
      } else {
        vscode.window.showWarningMessage(
          'FlagLens: Port 8000 is already in use (another Flagsmith server may already be running).'
        );
      }
    })
  );

  // Initial sync on activation: connect to self-hosted Flagsmith, or auto-start built-in local sandbox if offline
  void (async () => {
    await store.refresh();
    const cfg = store.readConfig();
    if (
      !store.isConnected &&
      cfg.autoStartLocalSandbox &&
      /^https?:\/\/(localhost|127\.0\.0\.1)(:8000)?\/?$/i.test(cfg.apiUrl.trim())
    ) {
      const started = await sandbox.start(8000);
      if (started) {
        await store.refresh();
        vscode.window.setStatusBarMessage(
          'FlagLens: Built-in local sandbox started automatically on localhost:8000',
          4000
        );
      }
    }
  })();
}

export function deactivate(): void {
  // Cleaned up via context.subscriptions
}
