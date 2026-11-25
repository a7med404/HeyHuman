import * as os from 'node:os';
import * as path from 'node:path';

// This module must not import `vscode`: it is also used by the uninstall script and the tests.

const BASE_DIR = path.join(os.homedir(), '.claude', 'hey-human');

export const CLAUDE_SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json');
export const EVENTS_DIR = path.join(BASE_DIR, 'events');
export const SNOOZE_FILE = path.join(BASE_DIR, 'snoozed-until');

/** Claude Code hook events that can produce an alert. */
export const HOOK_EVENTS = ['Notification', 'Stop', 'StopFailure'] as const;
export type HookEvent = (typeof HOOK_EVENTS)[number];

/** Recorded only to time how long a turn took; never produces an alert. */
export const TURN_START_EVENT = 'UserPromptSubmit';

/**
 * Every hook the extension installs into the user's Claude Code settings.
 * Claude's multiple-choice questions do not raise a Notification, so they are caught as
 * the AskUserQuestion tool is about to run and treated as "needs input".
 */
export const INSTALLED_HOOKS: readonly { event: string; matcher?: string }[] = [
  { event: 'Notification' },
  { event: 'Stop' },
  { event: 'StopFailure' },
  { event: TURN_START_EVENT },
  { event: 'PreToolUse', matcher: 'AskUserQuestion' },
];

/** Notification types that mean Claude is blocked on the user. Others are informational. */
export const INPUT_NOTIFICATION_TYPES = new Set([
  'permission_prompt',
  'idle_prompt',
  'elicitation_dialog',
  'elicitation_url_dialog',
  'agent_needs_input',
]);

/** Which setting holds the sound for each alert. */
export const SOUND_SETTING: Record<HookEvent, 'needsInputSound' | 'finishedSound' | 'errorSound'> = {
  Notification: 'needsInputSound',
  Stop: 'finishedSound',
  StopFailure: 'errorSound',
};

export const EVENT_LABEL: Record<HookEvent, string> = {
  Notification: 'Claude needs your input',
  Stop: 'Claude finished its turn',
  StopFailure: 'Claude stopped on an error',
};

/** The fields we use from a Claude Code hook payload. */
export interface HookPayload {
  hook_event_name?: string;
  session_id?: string;
  cwd?: string;
  message?: string;
  notification_type?: string;
  /** Set on StopFailure, e.g. `rate_limit` or `server_error`. */
  error?: string;
  /** PID of the Claude Code process, taken from the event file name rather than the payload. */
  claudePid?: number;
}
