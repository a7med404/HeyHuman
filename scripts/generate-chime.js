// Generates sounds/chime.wav: a short two-note bell used as the default sound.
// Run with `npm run generate-chime`.
const fs = require('node:fs');
const path = require('node:path');

const sampleRate = 44100;
const notes = [
  { freq: 659.25, start: 0.0 }, // E5
  { freq: 987.77, start: 0.14 }, // B5
];
const duration = 0.9;
const numSamples = Math.floor(sampleRate * duration);
const buffer = Buffer.alloc(44 + numSamples * 2);

buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + numSamples * 2, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20); // PCM
buffer.writeUInt16LE(1, 22); // mono
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write('data', 36);
buffer.writeUInt32LE(numSamples * 2, 40);

for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  let sample = 0;
  for (const { freq, start } of notes) {
    if (t < start) continue;
    const dt = t - start;
    const attack = Math.min(1, dt / 0.005); // avoids a click at note start
    const envelope = attack * Math.exp(-dt * 6);
    // Fundamental plus a quiet octave gives a bell-like tone.
    sample += envelope * (Math.sin(2 * Math.PI * freq * dt) + 0.3 * Math.sin(4 * Math.PI * freq * dt));
  }
  buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample * 0.35)) * 32767), 44 + i * 2);
}

const out = path.join(__dirname, '..', 'sounds', 'chime.wav');
fs.writeFileSync(out, buffer);
console.log(`Wrote ${out}`);
