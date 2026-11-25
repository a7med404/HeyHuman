import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Config } from '../config';
import type { HookPayload } from '../constants';
import { DecideState, decide, isInWorkspace } from '../decide';

const baseConfig: Config = {
  enabled: true,
  needsInputSound: 'chime',
  finishedSound: 'chime',
  errorSound: 'error',
  customSoundPath: '',
  volume: 70,
  spokenAlerts: false,
  minTurnSeconds: 10,
  desktopNotification: false,
  onlyWhenUnfocused: false,
  matchWorkspace: true,
  cooldownMs: 1500,
};

const newState = (): DecideState => ({
  lastPlayed: 0,
  stoppedSessions: new Set(),
  turnStarts: new Map(),
});

function run(
  payload: HookPayload,
  state: DecideState,
  overrides: { config?: Partial<Config>; focused?: boolean; now?: number; snoozedUntil?: number } = {},
) {
  return decide(
    {
      payload: { cwd: '/proj', ...payload },
      config: { ...baseConfig, ...overrides.config },
      focused: overrides.focused ?? false,
      workspaceRoots: ['/proj'],
      now: overrides.now ?? 100_000,
      snoozedUntil: overrides.snoozedUntil ?? 0,
    },
    state,
  );
}

test('plays for a permission prompt in this workspace', () => {
  assert.deepEqual(run({ hook_event_name: 'Notification' }, newState()), {
    play: true,
    event: 'Notification',
  });
});

test('plays for a finished turn', () => {
  assert.deepEqual(run({ hook_event_name: 'Stop' }, newState()), { play: true, event: 'Stop' });
});

test('treats an unknown event as needing input', () => {
  assert.deepEqual(run({ hook_event_name: 'SomethingNew' }, newState()), {
    play: true,
    event: 'Notification',
  });
});

test('stays silent when muted, snoozed, or the sound is none', () => {
  const stop = { hook_event_name: 'Stop' };
  assert.equal(run(stop, newState(), { config: { enabled: false } }).play, false);
  assert.equal(run(stop, newState(), { snoozedUntil: 200_000 }).play, false);
  assert.equal(run(stop, newState(), { config: { finishedSound: 'none' } }).play, false);
});

test('an expired snooze no longer silences', () => {
  assert.equal(run({ hook_event_name: 'Stop' }, newState(), { snoozedUntil: 50_000 }).play, true);
});

test('respects onlyWhenUnfocused', () => {
  const config = { onlyWhenUnfocused: true };
  assert.equal(run({ hook_event_name: 'Stop' }, newState(), { config, focused: true }).play, false);
  assert.equal(run({ hook_event_name: 'Stop' }, newState(), { config, focused: false }).play, true);
});

test('ignores sessions from another workspace unless matchWorkspace is off', () => {
  const elsewhere = { hook_event_name: 'Stop', cwd: '/other' };
  assert.equal(run(elsewhere, newState()).play, false);
  assert.equal(run(elsewhere, newState(), { config: { matchWorkspace: false } }).play, true);
});

test('drops the idle reminder that follows a finished turn', () => {
  const state = newState();
  assert.equal(run({ hook_event_name: 'Stop', session_id: 's1' }, state, { now: 100_000 }).play, true);
  const idle = { hook_event_name: 'Notification', session_id: 's1', message: 'Claude is waiting for your input' };
  assert.equal(run(idle, state, { now: 160_000 }).play, false);
  const typed = { hook_event_name: 'Notification', session_id: 's1', notification_type: 'idle_prompt' };
  assert.equal(run(typed, state, { now: 160_000 }).play, false);
});

test('still plays the idle reminder when the finished sound was silent', () => {
  const state = newState();
  run({ hook_event_name: 'Stop', session_id: 's1' }, state, { config: { finishedSound: 'none' } });
  const idle = { hook_event_name: 'Notification', session_id: 's1', notification_type: 'idle_prompt' };
  assert.equal(run(idle, state, { now: 160_000 }).play, true);
});

test('a permission prompt after a finished turn still plays', () => {
  const state = newState();
  run({ hook_event_name: 'Stop', session_id: 's1' }, state, { now: 100_000 });
  const prompt = { hook_event_name: 'Notification', session_id: 's1', message: 'Claude needs your permission to use Bash' };
  assert.equal(run(prompt, state, { now: 160_000 }).play, true);
});

test('idle reminders for other sessions are unaffected', () => {
  const state = newState();
  run({ hook_event_name: 'Stop', session_id: 's1' }, state, { now: 100_000 });
  const idle = { hook_event_name: 'Notification', session_id: 's2', notification_type: 'idle_prompt' };
  assert.equal(run(idle, state, { now: 160_000 }).play, true);
});

test('applies the cooldown between sounds', () => {
  const state = newState();
  assert.equal(run({ hook_event_name: 'Stop' }, state, { now: 100_000 }).play, true);
  assert.equal(run({ hook_event_name: 'Notification' }, state, { now: 100_500 }).play, false);
  assert.equal(run({ hook_event_name: 'Notification' }, state, { now: 102_000 }).play, true);
});

test('isInWorkspace matches the root and nested folders only', () => {
  assert.equal(isInWorkspace('/proj', ['/proj']), true);
  assert.equal(isInWorkspace('/proj/src/deep', ['/proj']), true);
  assert.equal(isInWorkspace('/proj-other', ['/proj']), false);
  assert.equal(isInWorkspace(undefined, ['/proj']), false);
  assert.equal(isInWorkspace('/proj', []), false);
});

test('a prompt submission never alerts', () => {
  assert.equal(run({ hook_event_name: 'UserPromptSubmit', session_id: 's1' }, newState()).play, false);
});

test('a short turn stays quiet while the window is focused', () => {
  const state = newState();
  run({ hook_event_name: 'UserPromptSubmit', session_id: 's1' }, state, { now: 100_000 });
  const stop = { hook_event_name: 'Stop', session_id: 's1' };
  assert.equal(run(stop, state, { now: 104_000, focused: true }).play, false);
});

test('a short turn still alerts when the window is not focused', () => {
  const state = newState();
  run({ hook_event_name: 'UserPromptSubmit', session_id: 's1' }, state, { now: 100_000 });
  const stop = { hook_event_name: 'Stop', session_id: 's1' };
  assert.equal(run(stop, state, { now: 104_000, focused: false }).play, true);
});

test('a long turn alerts even while focused', () => {
  const state = newState();
  run({ hook_event_name: 'UserPromptSubmit', session_id: 's1' }, state, { now: 100_000 });
  const stop = { hook_event_name: 'Stop', session_id: 's1' };
  assert.equal(run(stop, state, { now: 130_000, focused: true }).play, true);
});

test('minTurnSeconds of 0 turns the short-turn filter off', () => {
  const state = newState();
  run({ hook_event_name: 'UserPromptSubmit', session_id: 's1' }, state, { now: 100_000 });
  const stop = { hook_event_name: 'Stop', session_id: 's1' };
  const overrides = { now: 101_000, focused: true, config: { minTurnSeconds: 0 } };
  assert.equal(run(stop, state, overrides).play, true);
});

test('a permission prompt is never treated as a short turn', () => {
  const state = newState();
  run({ hook_event_name: 'UserPromptSubmit', session_id: 's1' }, state, { now: 100_000 });
  const prompt = { hook_event_name: 'Notification', session_id: 's1' };
  assert.equal(run(prompt, state, { now: 102_000, focused: true }).play, true);
});

test('a turn with an unknown start time alerts', () => {
  const stop = { hook_event_name: 'Stop', session_id: 'unseen' };
  assert.equal(run(stop, newState(), { focused: true }).play, true);
});

test('informational notifications do not alert', () => {
  for (const type of ['auth_success', 'elicitation_complete', 'agent_completed', 'quota_auto_resume_fired']) {
    const payload = { hook_event_name: 'Notification', notification_type: type };
    assert.equal(run(payload, newState()).play, false, type);
  }
});

test('every kind of request for input alerts', () => {
  for (const type of ['permission_prompt', 'idle_prompt', 'elicitation_dialog', 'agent_needs_input']) {
    const payload = { hook_event_name: 'Notification', notification_type: type };
    assert.deepEqual(run(payload, newState()), { play: true, event: 'Notification' }, type);
  }
});

test('a question from Claude counts as needing input', () => {
  const payload = { hook_event_name: 'PreToolUse', session_id: 's1' };
  assert.deepEqual(run(payload, newState()), { play: true, event: 'Notification' });
});

test('an error stop uses the error sound and is never treated as a short turn', () => {
  const state = newState();
  run({ hook_event_name: 'UserPromptSubmit', session_id: 's1' }, state, { now: 100_000 });
  const failure = { hook_event_name: 'StopFailure', session_id: 's1', error: 'rate_limit' };
  assert.deepEqual(run(failure, state, { now: 101_000, focused: true }), { play: true, event: 'StopFailure' });
  assert.equal(run(failure, newState(), { config: { errorSound: 'none' } }).play, false);
});

test('the idle reminder after an error stop is dropped', () => {
  const state = newState();
  run({ hook_event_name: 'StopFailure', session_id: 's1' }, state, { now: 100_000 });
  const idle = { hook_event_name: 'Notification', session_id: 's1', notification_type: 'idle_prompt' };
  assert.equal(run(idle, state, { now: 160_000 }).play, false);
});
