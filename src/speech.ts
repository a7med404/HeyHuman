import { execFile } from 'node:child_process';
import { Logger } from './logger';

type Command = [program: string, args: string[]];

function speechCommands(text: string): Command[] {
  if (process.platform === 'darwin') return [['say', [text]]];
  if (process.platform === 'win32') {
    const script =
      'Add-Type -AssemblyName System.Speech; ' +
      `(New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${text.replaceAll("'", "''")}')`;
    return [['powershell', ['-NoProfile', '-NonInteractive', '-Command', script]]];
  }
  return [
    ['spd-say', ['--wait', text]],
    ['espeak', [text]],
  ];
}

/** Reads text aloud with the operating system's voice. Errors are logged, never thrown. */
export async function speak(text: string): Promise<void> {
  // Anything outside plain words would be read out literally or misparsed by the shell tools.
  const clean = text.replaceAll(/[^\p{L}\p{N} .,'-]/gu, ' ').trim();
  if (!clean) return;

  let lastError: unknown;
  for (const [program, args] of speechCommands(clean)) {
    try {
      await new Promise<void>((resolve, reject) => {
        execFile(program, args, (err) => (err ? reject(err) : resolve()));
      });
      return;
    } catch (err) {
      lastError = err;
    }
  }
  Logger.error('Could not speak the alert', lastError);
}
