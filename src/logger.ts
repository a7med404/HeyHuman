import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

function write(level: string, message: string): void {
  channel ??= vscode.window.createOutputChannel('Hey, Human');
  channel.appendLine(`[${level} ${new Date().toLocaleTimeString()}] ${message}`);
}

export const Logger = {
  info: (message: string) => write('INFO ', message),
  error: (message: string, error?: unknown) =>
    write('ERROR', error instanceof Error ? `${message}: ${error.message}` : message),
  show: () => channel?.show(true),
  dispose: () => channel?.dispose(),
};
