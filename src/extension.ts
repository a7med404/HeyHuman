import * as path from 'node:path';
import * as vscode from 'vscode';
import { play, resolveSound } from './audio-player';
import { SECTION, getConfig, updateSetting } from './config';
import {
  CLAUDE_SETTINGS_FILE,
  EVENT_LABEL,
  HOOK_EVENTS,
  HookEvent,
  HookPayload,
  SOUND_SETTING,
  TURN_START_EVENT,
} from './constants';
import { DecideState, decide } from './decide';
import { EventWatcher } from './event-watcher';
import { hooksInstalled, hooksOutdated, installHooks, uninstallHooks } from './hooks-installer';
import { Logger } from './logger';
import { desktopNotificationsSupported, notifyDesktop } from './notifier';
import { getSnoozedUntil, setSnoozedUntil } from './snooze';
import { speak } from './speech';
import { describeStats, getStats, recordAlert, recordWait } from './stats';
import { findTerminalForProcess } from './terminal-finder';

const WAITING_BADGE_MS = 10_000;
const WALKTHROUGH_SHOWN_KEY = 'walkthroughShown';

/** What is said aloud for each alert; the project name is appended. */
const SPOKEN: Record<HookEvent, string> = {
  Notification: 'Claude needs you in',
  Stop: 'Claude is done in',
  StopFailure: 'Claude hit an error in',
};

const state: DecideState = { lastPlayed: 0, stoppedSessions: new Set(), turnStarts: new Map() };
let status: vscode.StatusBarItem;
let store: vscode.Memento;
let hooksReady = false;

/** True while the status bar is highlighting an alert the user has not seen yet. */
let waiting = false;
let waitingTimer: NodeJS.Timeout | undefined;
/** When the unseen alert arrived, if the user was away from this window at the time. */
let waitingSince: number | undefined;
/** The terminal running the session that raised the unseen alert, when it could be found. */
let waitingTerminal: vscode.Terminal | undefined;

// ---------- status bar ----------

function refreshStatus(): void {
  const snoozedUntil = getSnoozedUntil();
  status.backgroundColor = undefined;

  if (!hooksReady) {
    status.text = '$(warning) Hey, Human';
    status.tooltip = 'Hey, Human: Claude Code hooks are not installed. Click to set up.';
  } else if (waiting) {
    status.text = '$(bell-dot) Claude is waiting';
    status.tooltip = waitingTerminal
      ? 'Hey, Human: Claude is waiting for you. Click to go to its terminal.'
      : 'Hey, Human: Claude is waiting for you.';
    status.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else if (!getConfig().enabled) {
    status.text = '$(bell-slash) Hey, Human';
    status.tooltip = 'Hey, Human: muted. Click for options.';
  } else if (snoozedUntil) {
    const minutes = Math.ceil((snoozedUntil - Date.now()) / 60_000);
    status.text = `$(bell-slash) ${minutes}m`;
    status.tooltip = `Hey, Human: snoozed for ${minutes} more minute${minutes === 1 ? '' : 's'}. Click for options.`;
  } else {
    status.text = '$(bell) Hey, Human';
    status.tooltip = 'Hey, Human: listening for Claude. Click for options.';
  }
}

function startWaiting(): void {
  clearTimeout(waitingTimer);
  waiting = true;
  if (vscode.window.state.focused) {
    // The user is already looking at this window, so the highlight only needs to be brief.
    waitingTimer = setTimeout(stopWaiting, WAITING_BADGE_MS);
  } else {
    waitingSince ??= Date.now();
  }
  refreshStatus();
}

function stopWaiting(): void {
  clearTimeout(waitingTimer);
  if (waitingSince !== undefined) void recordWait(store, Date.now() - waitingSince);
  waiting = false;
  waitingSince = undefined;
  waitingTerminal = undefined;
  refreshStatus();
}

// ---------- alerts ----------

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

function desktopBody(event: HookEvent, payload: HookPayload): string {
  if (event === 'Notification' && payload.message) return payload.message;
  if (event === 'StopFailure' && payload.error) return `${EVENT_LABEL[event]}: ${payload.error}`;
  return EVENT_LABEL[event];
}

function onHookEvent(context: vscode.ExtensionContext, payload: HookPayload): void {
  const config = getConfig();
  const focused = vscode.window.state.focused;
  const decision = decide(
    {
      payload,
      config,
      focused,
      workspaceRoots: (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath),
      now: Date.now(),
      snoozedUntil: getSnoozedUntil(),
    },
    state,
  );
  if (!decision.play) {
    if (payload.hook_event_name !== TURN_START_EVENT) {
      Logger.info(`Skipped ${payload.hook_event_name ?? 'event'}: ${decision.reason}`);
    }
    return;
  }

  const { event } = decision;
  const project = payload.cwd ? path.basename(payload.cwd) : 'Claude Code';
  Logger.info(`${EVENT_LABEL[event]} (${payload.cwd ?? 'unknown directory'})`);

  void playFor(context, event).then(() =>
    config.spokenAlerts ? speak(`${SPOKEN[event]} ${project}`) : undefined,
  );
  if (config.desktopNotification && !focused) {
    notifyDesktop(`Hey, Human - ${project}`, desktopBody(event, payload));
  }
  void recordAlert(store);
  startWaiting();

  void findTerminalForProcess(payload.claudePid).then((terminal) => {
    if (!waiting || !terminal) return;
    waitingTerminal = terminal;
    refreshStatus();
  });
}

// ---------- commands ----------

async function installHooksCommand(): Promise<void> {
  const answer = await vscode.window.showInformationMessage(
    `Add the Hey, Human hooks to ${CLAUDE_SETTINGS_FILE}? ` +
      'Your other settings are kept and a backup is saved as settings.json.bak.',
    { modal: true },
    'Install',
  );
  if (answer !== 'Install') return;
  try {
    installHooks();
    hooksReady = true;
    refreshStatus();
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
    hooksReady = false;
    refreshStatus();
    Logger.info('Hooks removed.');
    vscode.window.showInformationMessage('Hey, Human: hooks removed.');
  } catch (err) {
    Logger.error('Could not remove hooks', err);
    vscode.window.showErrorMessage(`Hey, Human: could not update ${CLAUDE_SETTINGS_FILE}.`);
  }
}

/**
 * The user already agreed to the hooks; a new version only changes what they contain.
 * Replacing them in place avoids asking again after every update.
 */
function updateOutdatedHooks(): void {
  try {
    installHooks();
    hooksReady = true;
    Logger.info('Hooks updated for this version.');
    vscode.window.showInformationMessage(
      'Hey, Human updated its Claude Code hooks. Restart running Claude Code sessions to pick them up.',
    );
  } catch (err) {
    Logger.error('Could not update hooks', err);
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

function snooze(minutes: number): void {
  setSnoozedUntil(minutes > 0 ? Date.now() + minutes * 60_000 : 0);
  stopWaiting();
}

async function snoozeCommand(): Promise<void> {
  const pick = await vscode.window.showQuickPick(
    [
      { label: '15 minutes', minutes: 15 },
      { label: '30 minutes', minutes: 30 },
      { label: '1 hour', minutes: 60 },
      { label: '2 hours', minutes: 120 },
    ],
    { placeHolder: 'Silence Hey, Human in every window for...' },
  );
  if (pick) snooze(pick.minutes);
}

/** The status bar item: jumps to the waiting terminal if there is one, otherwise opens the menu. */
async function menuCommand(): Promise<void> {
  const terminal = waiting ? waitingTerminal : undefined;
  stopWaiting();
  if (terminal) {
    terminal.show();
    return;
  }
  if (!hooksReady) return installHooksCommand();

  const enabled = getConfig().enabled;
  const snoozed = getSnoozedUntil() > 0;
  const items: { label: string; command: string }[] = [
    { label: enabled ? '$(bell-slash) Mute' : '$(bell) Unmute', command: 'toggleMute' },
    snoozed
      ? { label: '$(clock) End snooze', command: 'endSnooze' }
      : { label: '$(clock) Snooze...', command: 'snooze' },
    { label: '$(unmute) Choose sound...', command: 'chooseSound' },
    { label: '$(play) Play test sound', command: 'testSound' },
    { label: '$(gear) Open settings', command: 'openSettings' },
    { label: '$(book) Open setup guide', command: 'openWalkthrough' },
    { label: '$(output) Show log', command: 'showLog' },
  ];
  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: `Hey, Human - ${describeStats(getStats(store))}`,
  });
  if (pick) await vscode.commands.executeCommand(`${SECTION}.${pick.command}`);
}

// ---------- lifecycle ----------

export function activate(context: vscode.ExtensionContext): void {
  store = context.globalState;
  hooksReady = hooksInstalled();

  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = `${SECTION}.menu`;
  refreshStatus();
  status.show();

  const watcher = new EventWatcher((payload) => onHookEvent(context, payload));
  try {
    watcher.start();
  } catch (err) {
    Logger.error('Could not start watching for Claude events', err);
  }

  // Keeps the snooze countdown current, including a snooze started from another window.
  const ticker = setInterval(refreshStatus, 30_000);

  const openWalkthrough = () =>
    vscode.commands.executeCommand(
      'workbench.action.openWalkthrough',
      `${context.extension.id}#setup`,
      false,
    );
  const register = (name: string, handler: () => unknown) =>
    vscode.commands.registerCommand(`${SECTION}.${name}`, handler);

  context.subscriptions.push(
    status,
    watcher,
    { dispose: () => clearInterval(ticker) },
    { dispose: () => clearTimeout(waitingTimer) },
    { dispose: Logger.dispose },
    register('menu', menuCommand),
    register('installHooks', installHooksCommand),
    register('uninstallHooks', uninstallHooksCommand),
    register('chooseSound', () => chooseSoundCommand(context)),
    register('testSound', () => playFor(context, 'Notification')),
    register('toggleMute', () => updateSetting('enabled', !getConfig().enabled)),
    register('snooze', snoozeCommand),
    register('endSnooze', () => snooze(0)),
    register('openSettings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${context.extension.id}`),
    ),
    register('openWalkthrough', openWalkthrough),
    register('showLog', Logger.show),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(SECTION)) return;
      if (getConfig().desktopNotification && !desktopNotificationsSupported) {
        vscode.window.showWarningMessage(
          'Hey, Human: desktop notifications are only available on macOS and Linux.',
        );
      }
      refreshStatus();
    }),
    vscode.window.onDidChangeWindowState((windowState) => {
      // Coming back to the window means the alert has been seen. The highlight stays a
      // moment longer so the user can still click through to the terminal.
      if (windowState.focused && waiting) {
        if (waitingSince !== undefined) void recordWait(store, Date.now() - waitingSince);
        waitingSince = undefined;
        clearTimeout(waitingTimer);
        waitingTimer = setTimeout(stopWaiting, WAITING_BADGE_MS);
      }
      refreshStatus();
    }),
  );

  if (hooksReady) return;
  if (hooksOutdated()) {
    updateOutdatedHooks();
    refreshStatus();
  } else if (store.get(WALKTHROUGH_SHOWN_KEY)) {
    vscode.window
      .showInformationMessage('Hey, Human needs Claude Code hooks to hear from Claude.', 'Install hooks')
      .then((choice) => choice && installHooksCommand());
  } else {
    void store.update(WALKTHROUGH_SHOWN_KEY, true);
    void openWalkthrough();
  }
}

export function deactivate(): void {
  // Everything is disposed through context.subscriptions.
}
