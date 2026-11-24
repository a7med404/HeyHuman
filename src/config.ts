import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

export const SECTION = 'heyHuman';

export const CLAUDE_SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json');
export const EVENTS_DIR = path.join(os.homedir(), '.claude', 'hey-human', 'events');

/** Claude Code hook events this extension listens to. */
export const HOOK_EVENTS = ['Notification', 'Stop'] as const;
export type HookEvent = (typeof HOOK_EVENTS)[number];

/** Which setting holds the sound for each hook event. */
export const SOUND_SETTING: Record<HookEvent, 'needsInputSound' | 'finishedSound'> = {
  Notification: 'needsInputSound',
  Stop: 'finishedSound',
};

export const EVENT_LABEL: Record<HookEvent, string> = {
  Notification: 'Claude needs your input',
  Stop: 'Claude finished its turn',
};

export interface Config {
  enabled: boolean;
  needsInputSound: string;
  finishedSound: string;
  customSoundPath: string;
  volume: number;
  onlyWhenUnfocused: boolean;
  matchWorkspace: boolean;
  cooldownMs: number;
}

export function getConfig(): Config {
  const c = vscode.workspace.getConfiguration(SECTION);
  return {
    enabled: c.get('enabled', true),
    needsInputSound: c.get('needsInputSound', 'faaah'),
    finishedSound: c.get('finishedSound', 'faaah'),
    customSoundPath: c.get('customSoundPath', ''),
    volume: c.get('volume', 70),
    onlyWhenUnfocused: c.get('onlyWhenUnfocused', false),
    matchWorkspace: c.get('matchWorkspace', true),
    cooldownMs: c.get('cooldownMs', 1500),
  };
}

export function updateSetting(key: keyof Config, value: unknown): Thenable<void> {
  return vscode.workspace
    .getConfiguration(SECTION)
    .update(key, value, vscode.ConfigurationTarget.Global);
}
