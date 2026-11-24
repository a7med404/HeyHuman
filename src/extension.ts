import * as path from 'node:path';
import * as vscode from 'vscode';
import { play, resolveSound } from './audio-player';
import {
  CLAUDE_SETTINGS_FILE,
  EVENT_LABEL,
  HOOK_EVENTS,
  HookEvent,
  SECTION,
  SOUND_SETTING,
  getConfig,
  updateSetting,
} from './config';
import { EventWatcher, HookPayload } from './event-watcher';
import { hooksInstalled, installHooks, uninstallHooks } from './hooks-installer';
import { Logger } from './logger';

let lastPlayed = 0;

function isInWorkspace(cwd: string | undefined): boolean {
  if (!cwd) return false;
  const target = path.resolve(cwd);
  return (vscode.workspace.workspaceFolders ?? []).some((folder) => {
    const root = path.resolve(folder.uri.fsPath);
    return target === root || target.startsWith(root + path.sep);
  });
}

function toHookEvent(name: string | undefined): HookEvent {
  return HOOK_EVENTS.find((event) => event === name) ?? 'Notification';
}

/** Plays the sound configured for an event. Errors are logged, never thrown. */
async function playFor(context: vscode.ExtensionContext, event: HookEvent, choice?: string) {
  const config = getConfig();
  const file = resolveSound(
    choice ?? config[SOUND_SETTING[event]],
    config.customSoundPath,
    context.extensionPath,
  );
  if (!file) return;
  try {
    await play(file, config.volume);
  } catch {
    vscode.window.setStatusBarMessage('Hey, Human: could not play sound (see log)', 5000);
  }
}

function onHookEvent(context: vscode.ExtensionContext, payload: HookPayload): void {
  const config = getConfig();
  const event = toHookEvent(payload.hook_event_name);

  if (!config.enabled) return;
  if (config.onlyWhenUnfocused && vscode.window.state.focused) return;
  if (config.matchWorkspace && !isInWorkspace(payload.cwd)) return;

  const now = Date.now();
  if (now - lastPlayed < config.cooldownMs) return;
  lastPlayed = now;

  Logger.info(`${EVENT_LABEL[event]} (${payload.cwd ?? 'unknown directory'})`);
  void playFor(context, event);
}

// ---------- commands ----------

async function installHooksCommand(): Promise<void> {
  const answer = await vscode.window.showInformationMessage(
    `Add Claude Code hooks for ${HOOK_EVENTS.join(' and ')} to ${CLAUDE_SETTINGS_FILE}? ` +
      'A backup is saved as settings.json.bak.',
    { modal: true },
    'Install',
  );
  if (answer !== 'Install') return;
  try {
    installHooks();
    Logger.info('Hooks installed.');
    vscode.window.showInformationMessage(
      'Hey, Human: hooks installed. Restart running Claude Code sessions to pick them up.',
    );
  } catch (err) {
    Logger.error('Could not install hooks', err);
    vscode.window.showErrorMessage(`Hey, Human: could not update ${CLAUDE_SETTINGS_FILE}.`);
  }
}

function uninstallHooksCommand(): void {
  try {
    uninstallHooks();
    Logger.info('Hooks removed.');
    vscode.window.showInformationMessage('Hey, Human: hooks removed.');
  } catch (err) {
    Logger.error('Could not remove hooks', err);
    vscode.window.showErrorMessage(`Hey, Human: could not update ${CLAUDE_SETTINGS_FILE}.`);
  }
}

async function pickCustomSound(): Promise<boolean> {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: 'Select Sound',
    filters: { 'Audio Files': ['mp3', 'wav'] },
  });
  if (!uris?.[0]) return false;
  await updateSetting('customSoundPath', uris[0].fsPath);
  return true;
}

/** Lets the user pick the sound for an event, previewing each one as it is highlighted. */
async function chooseSoundCommand(context: vscode.ExtensionContext): Promise<void> {
  const eventPick = await vscode.window.showQuickPick(
    HOOK_EVENTS.map((event) => ({ label: EVENT_LABEL[event], event })),
    { placeHolder: 'Which moment do you want to set a sound for?' },
  );
  if (!eventPick) return;

  const setting = SOUND_SETTING[eventPick.event];
  const options: string[] =
    context.extension.packageJSON.contributes.configuration.properties[`${SECTION}.${setting}`].enum;
  const current = getConfig()[setting];

  const soundPick = await vscode.window.showQuickPick(
    options.map((name) => ({ label: name, description: name === current ? 'current' : '' })),
    {
      placeHolder: `Sound for: ${eventPick.label}`,
      onDidSelectItem: (item) => {
        const name = (item as vscode.QuickPickItem).label;
        if (name !== 'custom') void playFor(context, eventPick.event, name);
      },
    },
  );
  if (!soundPick) return;
  if (soundPick.label === 'custom' && !(await pickCustomSound())) return;

  await updateSetting(setting, soundPick.label);
  void playFor(context, eventPick.event);
}

// ---------- lifecycle ----------

export function activate(context: vscode.ExtensionContext): void {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = 'heyHuman.toggleMute';
  const refreshStatus = () => {
    const on = getConfig().enabled;
    status.text = on ? '$(bell) Claude' : '$(bell-slash) Claude';
    status.tooltip = `Hey, Human: ${on ? 'sound on (click to mute)' : 'muted (click to unmute)'}`;
  };
  refreshStatus();
  status.show();

  const watcher = new EventWatcher((payload) => onHookEvent(context, payload));
  try {
    watcher.start();
  } catch (err) {
    Logger.error('Could not start watching for Claude events', err);
  }

  const register = (name: string, handler: () => unknown) =>
    vscode.commands.registerCommand(`${SECTION}.${name}`, handler);

  context.subscriptions.push(
    status,
    watcher,
    { dispose: Logger.dispose },
    register('installHooks', installHooksCommand),
    register('uninstallHooks', uninstallHooksCommand),
    register('chooseSound', () => chooseSoundCommand(context)),
    register('testSound', () => playFor(context, 'Notification')),
    register('toggleMute', () => updateSetting('enabled', !getConfig().enabled)),
    register('showLog', Logger.show),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SECTION)) refreshStatus();
    }),
  );

  if (!hooksInstalled()) {
    vscode.window
      .showInformationMessage(
        'Hey, Human needs Claude Code hooks to hear from Claude.',
        'Install hooks',
      )
      .then((choice) => choice && installHooksCommand());
  }
}

export function deactivate(): void {
  // Everything is disposed through context.subscriptions.
}
