import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Logger } from './logger';

type Command = [program: string, args: string[]];

/**
 * Turns a sound setting value into a file path.
 * Returns undefined for "none" or when the file cannot be found.
 */
export function resolveSound(
  choice: string,
  customSoundPath: string,
  extensionPath: string,
): string | undefined {
  if (choice === 'none') return undefined;

  if (choice === 'custom') {
    const custom = customSoundPath.trim();
    if (custom && fs.existsSync(custom)) return custom;
    Logger.error(`Custom sound not found: '${custom}'`);
    return undefined;
  }

  for (const ext of ['wav', 'mp3']) {
    const file = path.join(extensionPath, 'sounds', `${choice}.${ext}`);
    if (fs.existsSync(file)) return file;
  }
  Logger.error(`Built-in sound not found: '${choice}'`);
  return undefined;
}

/** Players to try, in order, for the current platform. Volume is 0-100. */
function playerCommands(file: string, volume: number): Command[] {
  const level = Math.max(0, Math.min(100, volume)) / 100;

  if (process.platform === 'darwin') {
    return [['afplay', ['-v', String(level), file]]];
  }

  if (process.platform === 'win32') {
    // MediaPlayer handles both .wav and .mp3, unlike Media.SoundPlayer.
    const script = [
      'Add-Type -AssemblyName presentationCore;',
      '$p = New-Object System.Windows.Media.MediaPlayer;',
      `$p.Open([uri]'${file.replaceAll("'", "''")}');`,
      `$p.Volume = ${level};`,
      '$p.Play();',
      'Start-Sleep -Milliseconds 800;',
      'if ($p.NaturalDuration.HasTimeSpan) { Start-Sleep -Seconds $p.NaturalDuration.TimeSpan.TotalSeconds }',
    ].join(' ');
    return [['powershell', ['-NoProfile', '-NonInteractive', '-Command', script]]];
  }

  return [
    ['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', '-volume', String(Math.round(level * 100)), file]],
    ['paplay', [`--volume=${Math.round(level * 65536)}`, file]],
    ['mpg123', ['-q', file]],
    ['aplay', ['-q', file]],
  ];
}

function run([program, args]: Command): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(program, args, (err) => (err ? reject(err) : resolve()));
  });
}

/** Plays a sound file, falling back through the platform's available players. */
export async function play(file: string, volume: number): Promise<void> {
  let lastError: unknown;
  for (const command of playerCommands(file, volume)) {
    try {
      await run(command);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  Logger.error(`Could not play ${file}`, lastError);
  throw lastError;
}
