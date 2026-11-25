import * as vscode from 'vscode';

export const SECTION = 'heyHuman';

export interface Config {
  enabled: boolean;
  needsInputSound: string;
  finishedSound: string;
  errorSound: string;
  customSoundPath: string;
  volume: number;
  spokenAlerts: boolean;
  minTurnSeconds: number;
  desktopNotification: boolean;
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
    errorSound: c.get('errorSound', 'error'),
    customSoundPath: c.get('customSoundPath', ''),
    volume: c.get('volume', 70),
    spokenAlerts: c.get('spokenAlerts', false),
    minTurnSeconds: c.get('minTurnSeconds', 10),
    desktopNotification: c.get('desktopNotification', false),
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
