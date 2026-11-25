import * as path from 'node:path';
import type { Config } from './config';
import {
  HOOK_EVENTS,
  HookEvent,
  HookPayload,
  INPUT_NOTIFICATION_TYPES,
  SOUND_SETTING,
  TURN_START_EVENT,
} from './constants';

export interface DecideInput {
  payload: HookPayload;
  config: Config;
  /** Whether this VS Code window currently has focus. */
  focused: boolean;
  /** Absolute paths of this window's workspace folders. */
  workspaceRoots: string[];
  now: number;
  /** Epoch milliseconds until which sounds are snoozed; 0 when not snoozed. */
  snoozedUntil: number;
}

/** Carried between events by the caller. */
export interface DecideState {
  lastPlayed: number;
  /** Sessions whose latest alert was "finished", used to drop the idle reminder that follows. */
  stoppedSessions: Set<string>;
  /** When each session's current turn began, used to keep short turns quiet. */
  turnStarts: Map<string, number>;
}

export type Decision = { play: true; event: HookEvent } | { play: false; reason: string };

export function toHookEvent(name: string | undefined): HookEvent {
  return HOOK_EVENTS.find((event) => event === name) ?? 'Notification';
}

export function isInWorkspace(cwd: string | undefined, workspaceRoots: string[]): boolean {
  if (!cwd) return false;
  const target = path.resolve(cwd);
  return workspaceRoots.some((folder) => {
    const root = path.resolve(folder);
    return target === root || target.startsWith(root + path.sep);
  });
}

/** Claude Code sends this about a minute after a turn ends if the user has not replied. */
function isIdleReminder(payload: HookPayload): boolean {
  return (
    payload.notification_type === 'idle_prompt' ||
    /waiting for your input/i.test(payload.message ?? '')
  );
}

/** Decides whether this window should alert for an event. Updates `state` when it does. */
export function decide(input: DecideInput, state: DecideState): Decision {
  const { payload, config, now } = input;
  const session = payload.session_id;

  if (payload.hook_event_name === TURN_START_EVENT) {
    if (session) {
      if (state.turnStarts.size > 200) state.turnStarts.clear();
      state.turnStarts.set(session, now);
    }
    return { play: false, reason: 'turn started' };
  }
  const event = toHookEvent(payload.hook_event_name);

  // Notifications such as "signed in" or "quota resumed" are not requests for input.
  // A missing type is treated as a request, for Claude Code versions that do not send one.
  const type = payload.notification_type;
  if (payload.hook_event_name === 'Notification' && type && !INPUT_NOTIFICATION_TYPES.has(type)) {
    return { play: false, reason: `notification type ${type} does not need input` };
  }

  if (!config.enabled) return { play: false, reason: 'muted' };
  if (input.snoozedUntil > now) return { play: false, reason: 'snoozed' };
  if (config[SOUND_SETTING[event]] === 'none') return { play: false, reason: 'sound set to none' };
  if (config.onlyWhenUnfocused && input.focused) return { play: false, reason: 'window is focused' };
  if (config.matchWorkspace && !isInWorkspace(payload.cwd, input.workspaceRoots)) {
    return { play: false, reason: 'session belongs to another workspace' };
  }

  if (event === 'Notification' && session && isIdleReminder(payload) && state.stoppedSessions.has(session)) {
    return { play: false, reason: 'already alerted when this turn finished' };
  }
  // A quick reply the user watched arrive does not need announcing.
  const turnStart = session ? state.turnStarts.get(session) : undefined;
  if (
    event === 'Stop' &&
    input.focused &&
    turnStart !== undefined &&
    now - turnStart < config.minTurnSeconds * 1000
  ) {
    return { play: false, reason: 'short turn while the window was focused' };
  }
  if (now - state.lastPlayed < config.cooldownMs) return { play: false, reason: 'cooldown' };

  if (session) {
    if (event === 'Notification') state.stoppedSessions.delete(session);
    else state.stoppedSessions.add(session);
    if (state.stoppedSessions.size > 200) state.stoppedSessions.clear();
  }
  state.lastPlayed = now;
  return { play: true, event };
}
