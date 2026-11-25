import { execFile } from 'node:child_process';
import * as vscode from 'vscode';

function parentPid(pid: number): Promise<number | undefined> {
  return new Promise((resolve) => {
    execFile('ps', ['-o', 'ppid=', '-p', String(pid)], (err, stdout) => {
      const parent = Number(stdout.trim());
      resolve(!err && Number.isInteger(parent) && parent > 1 ? parent : undefined);
    });
  });
}

/**
 * Finds the integrated terminal a Claude Code process is running in, by walking up the
 * process tree until it reaches a terminal's shell. Returns undefined when the session
 * is not in one of this window's terminals, or on Windows where `ps` is unavailable.
 */
export async function findTerminalForProcess(pid: number | undefined): Promise<vscode.Terminal | undefined> {
  if (!pid || process.platform === 'win32') return undefined;

  const byShellPid = new Map<number, vscode.Terminal>();
  for (const terminal of vscode.window.terminals) {
    const shellPid = await terminal.processId;
    if (shellPid) byShellPid.set(shellPid, terminal);
  }
  if (byShellPid.size === 0) return undefined;

  let current: number | undefined = pid;
  for (let depth = 0; current && depth < 8; depth++) {
    const terminal = byShellPid.get(current);
    if (terminal) return terminal;
    current = await parentPid(current);
  }
  return undefined;
}
