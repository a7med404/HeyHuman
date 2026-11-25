// Runs inside a real VS Code extension host (see scripts/integration-test.js).
// HOME points at a scratch directory, so the user's real Claude Code settings are never touched.
import assert from 'node:assert/strict';
import type * as ChildProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

// Loaded with require so the test can wrap execFile on the same module object the extension uses.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const childProcess: typeof ChildProcess = require('node:child_process');

const EXTENSION_ID = 'a7med404.hey-human';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Every external program the extension starts, with whether it succeeded. Calls still run for real. */
const calls: { program: string; args: string[]; ok?: boolean }[] = [];

function recordExternalPrograms(): void {
  const original = childProcess.execFile as (...args: unknown[]) => unknown;
  (childProcess as { execFile: unknown }).execFile = (program: string, args: string[], callback: unknown) => {
    const entry: (typeof calls)[number] = { program, args };
    if (program !== 'ps') calls.push(entry);
    return original(program, args, (err: Error | null, ...rest: unknown[]) => {
      entry.ok = !err;
      if (typeof callback === 'function') callback(err, ...rest);
    });
  };
}

const played = () => calls.filter((c) => c.program === 'afplay').map((c) => path.basename(c.args.at(-1) ?? ''));
const spoken = () => calls.filter((c) => c.program === 'say').map((c) => c.args[0]);

async function setting(key: string, value: unknown): Promise<void> {
  await vscode.workspace.getConfiguration('heyHuman').update(key, value, vscode.ConfigurationTarget.Global);
}

export async function run(): Promise<void> {
  const home = os.homedir();
  const workspace = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  assert.ok(workspace, 'a workspace folder is open');
  assert.ok(home.includes('hey-human-it'), `HOME is the scratch directory, got ${home}`);

  const results: string[] = [];
  const check = async (name: string, body: () => Promise<void> | void) => {
    calls.length = 0;
    try {
      await body();
      results.push(`PASS  ${name}`);
    } catch (err) {
      results.push(`FAIL  ${name}\n      ${(err as Error).message.split('\n')[0]}`);
    }
  };

  recordExternalPrograms();
  await setting('volume', 15);
  await setting('cooldownMs', 0);
  await setting('minTurnSeconds', 0);
  await setting('needsInputSound', 'ding');
  await setting('finishedSound', 'rise');

  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, 'extension is present');
  await extension.activate();

  const settingsFile = path.join(home, '.claude', 'settings.json');
  const hookCommand: string = JSON.parse(fs.readFileSync(settingsFile, 'utf8')).hooks.Stop[0].hooks[0].command;
  const hookScript = path.join(home, 'hook.sh');
  fs.writeFileSync(hookScript, hookCommand);

  /** Runs the real hook command the way Claude Code would, then waits for the watcher. */
  const fire = async (payload: Record<string, unknown>) => {
    const input = JSON.stringify({ cwd: workspace, session_id: 's1', ...payload });
    childProcess.execSync(`sh "${hookScript}"`, { input });
    await sleep(900);
  };

  await check('activates and registers every contributed command', async () => {
    assert.equal(extension.isActive, true);
    const registered = new Set(await vscode.commands.getCommands(true));
    for (const { command } of extension.packageJSON.contributes.commands) {
      assert.ok(registered.has(command), `${command} is registered`);
    }
  });

  await check('Play Test Sound plays the needs-input sound through afplay', async () => {
    await vscode.commands.executeCommand('heyHuman.testSound');
    assert.deepEqual(played(), ['ding.wav']);
    assert.equal(calls[0].ok, true, 'afplay exited successfully');
  });

  await check('every bundled sound file plays', async () => {
    const options: string[] =
      extension.packageJSON.contributes.configuration.properties['heyHuman.needsInputSound'].enum;
    const sounds = options.filter((name) => name !== 'custom' && name !== 'none');
    await setting('volume', 0);
    for (const name of sounds) {
      await setting('needsInputSound', name);
      await vscode.commands.executeCommand('heyHuman.testSound');
    }
    await setting('volume', 15);
    await setting('needsInputSound', 'ding');
    assert.equal(calls.length, sounds.length);
    assert.deepEqual(calls.filter((c) => !c.ok).map((c) => c.args.at(-1)), []);
  });

  await check('a permission prompt in this workspace plays the needs-input sound', async () => {
    await fire({ hook_event_name: 'Notification', notification_type: 'permission_prompt' });
    assert.deepEqual(played(), ['ding.wav']);
  });

  await check('a finished turn plays the finished sound', async () => {
    await fire({ hook_event_name: 'UserPromptSubmit' });
    await fire({ hook_event_name: 'Stop' });
    assert.deepEqual(played(), ['rise.wav']);
  });

  await check('the idle reminder after a finished turn is silent', async () => {
    await fire({ hook_event_name: 'Notification', notification_type: 'idle_prompt' });
    assert.deepEqual(played(), []);
  });

  await check('an error stop plays the error sound', async () => {
    await fire({ hook_event_name: 'StopFailure', error: 'rate_limit' });
    assert.deepEqual(played(), ['error.mp3']);
  });

  await check('a question from Claude plays the needs-input sound', async () => {
    await fire({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion' });
    assert.deepEqual(played(), ['ding.wav']);
  });

  await check('informational notifications are silent', async () => {
    await fire({ hook_event_name: 'Notification', notification_type: 'auth_success' });
    assert.deepEqual(played(), []);
  });

  await check('a session in another folder is silent', async () => {
    await fire({ hook_event_name: 'Stop', cwd: path.join(home, 'elsewhere'), session_id: 's2' });
    assert.deepEqual(played(), []);
  });

  await check('spoken alerts say which project is waiting', async () => {
    await setting('spokenAlerts', true);
    await fire({ hook_event_name: 'Notification', notification_type: 'permission_prompt' });
    // The speech starts after the sound ends, so give both time to finish.
    await sleep(7000);
    await setting('spokenAlerts', false);
    assert.deepEqual(spoken(), [`Claude needs you in ${path.basename(workspace)}`]);
    const say = calls.find((c) => c.program === 'say');
    assert.equal(say?.ok, true, `say exited successfully (ok=${say?.ok})`);
  });

  await check('mute silences alerts and unmute restores them', async () => {
    await vscode.commands.executeCommand('heyHuman.toggleMute');
    await fire({ hook_event_name: 'Notification', notification_type: 'permission_prompt' });
    assert.deepEqual(played(), []);
    await vscode.commands.executeCommand('heyHuman.toggleMute');
    await fire({ hook_event_name: 'Notification', notification_type: 'permission_prompt' });
    assert.deepEqual(played(), ['ding.wav']);
  });

  await check('snooze silences alerts and End Snooze restores them', async () => {
    const snoozeFile = path.join(home, '.claude', 'hey-human', 'snoozed-until');
    fs.writeFileSync(snoozeFile, String(Date.now() + 600_000));
    await fire({ hook_event_name: 'Notification', notification_type: 'permission_prompt' });
    assert.deepEqual(played(), []);
    await vscode.commands.executeCommand('heyHuman.endSnooze');
    assert.equal(fs.existsSync(snoozeFile), false);
    await fire({ hook_event_name: 'Notification', notification_type: 'permission_prompt' });
    assert.deepEqual(played(), ['ding.wav']);
  });

  await check('clicking the status bar jumps to the terminal that raised the alert', async () => {
    const source = vscode.window.createTerminal('claude-session');
    const other = vscode.window.createTerminal('other');
    other.show();
    await sleep(3000);
    assert.equal(vscode.window.activeTerminal?.name, 'other');

    // The outer shell stands in for the Claude Code process: the hook runs as its child.
    const payload = JSON.stringify({ hook_event_name: 'Notification', notification_type: 'permission_prompt', cwd: workspace, session_id: 's3' });
    const fireScript = path.join(home, 'fire.sh');
    fs.writeFileSync(fireScript, `printf '%s' '${payload}' | sh "${hookScript}"\nsleep 20\n`);
    source.sendText(`sh "${fireScript}"`);
    await sleep(3500);
    assert.deepEqual(played(), ['ding.wav']);

    const menu = vscode.commands.executeCommand('heyHuman.menu');
    const outcome = await Promise.race([menu.then(() => 'done'), sleep(3000).then(() => 'menu opened instead')]);
    if (outcome !== 'done') await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
    assert.equal(outcome, 'done');
    await sleep(500);
    assert.equal(vscode.window.activeTerminal?.name, 'claude-session');
    source.dispose();
    other.dispose();
  });

  await check('the setup guide opens', async () => {
    await vscode.commands.executeCommand('heyHuman.openWalkthrough');
  });

  await check('Remove Claude Code Hooks leaves no hooks behind', async () => {
    await vscode.commands.executeCommand('heyHuman.uninstallHooks');
    assert.equal(fs.readFileSync(settingsFile, 'utf8').includes('hey-human'), false);
  });

  console.log(`\n===== Hey, Human integration results =====\n${results.join('\n')}\n==========================================`);
  const failed = results.filter((line) => line.startsWith('FAIL')).length;
  if (failed > 0) throw new Error(`${failed} integration check(s) failed`);
}
