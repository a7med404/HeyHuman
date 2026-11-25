// Generates the original, licence-free sounds in sounds/*.wav.
// Run with `npm run generate-sounds`.
const fs = require('node:fs');
const path = require('node:path');

const SAMPLE_RATE = 44100;

// Each note: frequency in Hz, start time in seconds, decay rate (higher = shorter ring),
// and optional pitch glide in Hz per second.
const SOUNDS = {
  chime: { duration: 0.9, gain: 0.35, overtone: 0.3, notes: [
    { freq: 659.25, start: 0, decay: 6 },
    { freq: 987.77, start: 0.14, decay: 6 },
  ] },
  ding: { duration: 1.1, gain: 0.4, overtone: 0.25, notes: [
    { freq: 1318.5, start: 0, decay: 4.5 },
  ] },
  pop: { duration: 0.25, gain: 0.5, overtone: 0, notes: [
    { freq: 520, start: 0, decay: 28, glide: 2400 },
  ] },
  rise: { duration: 0.95, gain: 0.3, overtone: 0.2, notes: [
    { freq: 523.25, start: 0, decay: 9 },
    { freq: 659.25, start: 0.11, decay: 9 },
    { freq: 783.99, start: 0.22, decay: 7 },
  ] },
  knock: { duration: 0.45, gain: 0.6, overtone: 0.5, notes: [
    { freq: 190, start: 0, decay: 38 },
    { freq: 170, start: 0.16, decay: 38 },
  ] },
};

function render({ duration, gain, overtone, notes }) {
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const buffer = Buffer.alloc(44 + numSamples * 2);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    let sample = 0;
    for (const { freq, start, decay, glide = 0 } of notes) {
      if (t < start) continue;
      const dt = t - start;
      const attack = Math.min(1, dt / 0.005); // avoids a click at note start
      const envelope = attack * Math.exp(-dt * decay);
      // Phase of a tone whose frequency glides linearly: f(t) = freq + glide * t.
      const phase = 2 * Math.PI * (freq * dt + (glide * dt * dt) / 2);
      sample += envelope * (Math.sin(phase) + overtone * Math.sin(2 * phase));
    }
    // Fade the last 20 ms so the file never ends on a click.
    const fadeOut = Math.min(1, (duration - t) / 0.02);
    const value = Math.max(-1, Math.min(1, sample * gain * fadeOut));
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  return buffer;
}

for (const [name, spec] of Object.entries(SOUNDS)) {
  const out = path.join(__dirname, '..', 'sounds', `${name}.wav`);
  fs.writeFileSync(out, render(spec));
  console.log(`Wrote ${out}`);
}
