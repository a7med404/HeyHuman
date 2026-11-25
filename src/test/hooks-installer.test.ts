import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { hooksInstalled, hooksOutdated, installHooks, uninstallHooks } from '../hooks-installer';

function tempSettings(content?: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hey-human-'));
  const file = path.join(dir, '.claude', 'settings.json');
  if (content !== undefined) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(content));
  }
  return file;
}

const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const userHook = { hooks: [{ type: 'command', command: 'echo mine' }] };

test('installs into a missing settings file', () => {
  const file = tempSettings();
  assert.equal(hooksInstalled(file), false);
  installHooks(file);
  assert.equal(hooksInstalled(file), true);
  const hooks = read(file).hooks;
  assert.deepEqual(Object.keys(hooks).sort(), ['Notification', 'PreToolUse', 'Stop', 'StopFailure', 'UserPromptSubmit']);
  assert.equal(hooks.PreToolUse[0].matcher, 'AskUserQuestion');
  assert.equal(hooks.Stop[0].matcher, undefined);
});

test('keeps existing settings and hooks, and writes a backup', () => {
  const original = { model: 'opus', hooks: { Stop: [userHook] } };
  const file = tempSettings(original);
  installHooks(file);
  const settings = read(file);
  assert.equal(settings.model, 'opus');
  assert.deepEqual(settings.hooks.Stop[0], userHook);
  assert.equal(settings.hooks.Stop.length, 2);
  assert.deepEqual(read(`${file}.bak`), original);
});

test('installing twice does not duplicate hooks', () => {
  const file = tempSettings({});
  installHooks(file);
  installHooks(file);
  const settings = read(file);
  assert.equal(settings.hooks.Stop.length, 1);
  assert.equal(settings.hooks.Notification.length, 1);
});

test('uninstall restores the original settings', () => {
  const original = { model: 'opus', hooks: { Stop: [userHook] } };
  const file = tempSettings(original);
  installHooks(file);
  uninstallHooks(file);
  assert.deepEqual(read(file), original);
  assert.equal(hooksInstalled(file), false);
});

test('uninstall removes the hooks key when nothing else is left', () => {
  const file = tempSettings({ model: 'opus' });
  installHooks(file);
  uninstallHooks(file);
  assert.deepEqual(read(file), { model: 'opus' });
});

test('uninstall does not create a settings file', () => {
  const file = tempSettings();
  uninstallHooks(file);
  assert.equal(fs.existsSync(file), false);
});

test('install replaces hooks left by the old extension name', () => {
  const legacy = { hooks: [{ type: 'command', command: 'cat > x # claude-is-waiting' }] };
  const file = tempSettings({ hooks: { Stop: [legacy], SessionStart: [legacy] } });
  installHooks(file);
  const settings = read(file);
  assert.equal(settings.hooks.Stop.length, 1);
  assert.equal(settings.hooks.SessionStart, undefined);
  assert.equal(JSON.stringify(settings).includes('claude-is-waiting'), false);
});

test('invalid JSON is left untouched and reported', () => {
  const file = tempSettings();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ not json');
  assert.throws(() => installHooks(file));
  assert.equal(fs.readFileSync(file, 'utf8'), '{ not json');
  assert.equal(hooksInstalled(file), false);
});

test('the hook command writes its stdin as a complete event file', { skip: process.platform === 'win32' }, () => {
  const file = tempSettings();
  installHooks(file);
  const command: string = read(file).hooks.Notification[0].hooks[0].command;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hey-human-home-'));
  const payload = { hook_event_name: 'Notification', cwd: '/proj' };
  execSync(command, { input: JSON.stringify(payload), env: { ...process.env, HOME: home }, shell: '/bin/sh' });
  const eventsDir = path.join(home, '.claude', 'hey-human', 'events');
  const files = fs.readdirSync(eventsDir);
  assert.equal(files.length, 1);
  assert.match(files[0], /^\d+-\d+-\d+\.json$/);
  assert.deepEqual(read(path.join(eventsDir, files[0])), payload);
});

test('hooks from an earlier version are reported as outdated, then replaced', () => {
  const old = { hooks: [{ type: 'command', command: 'cat > somewhere # hey-human' }] };
  const file = tempSettings({ hooks: { Notification: [old], Stop: [old] } });
  assert.equal(hooksInstalled(file), false);
  assert.equal(hooksOutdated(file), true);
  installHooks(file);
  assert.equal(hooksInstalled(file), true);
  assert.equal(hooksOutdated(file), false);
  assert.equal(read(file).hooks.Stop.length, 1);
});

test('a settings file without our hooks is not outdated', () => {
  assert.equal(hooksOutdated(tempSettings({ hooks: { Stop: [userHook] } })), false);
  assert.equal(hooksOutdated(tempSettings()), false);
});
