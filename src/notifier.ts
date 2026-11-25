import { execFile } from 'node:child_process';
import { Logger } from './logger';

/** AppleScript string literals use the same escapes as JSON for quotes and backslashes. */
function appleScriptString(text: string): string {
  return JSON.stringify(text.replaceAll(/[\u0000-\u001f]/g, ' '));
}

/** Shows an operating-system notification. Supported on macOS and Linux. */
export function notifyDesktop(title: string, body: string): void {
  const onError = (err: Error | null) => {
    if (err) Logger.error('Could not show desktop notification', err);
  };
  if (process.platform === 'darwin') {
    const script = `display notification ${appleScriptString(body)} with title ${appleScriptString(title)}`;
    execFile('osascript', ['-e', script], onError);
  } else if (process.platform === 'linux') {
    execFile('notify-send', ['--app-name=Hey, Human', title, body], onError);
  }
}

export const desktopNotificationsSupported = process.platform === 'darwin' || process.platform === 'linux';
