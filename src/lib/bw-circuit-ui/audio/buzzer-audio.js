/**
 * Buzzer audio — Web Audio oscillator driven by board.buzzerTone().
 *
 * The board reports { hz, on }. This module maps that to an oscillator:
 * - on=true → start/update oscillator at the given frequency
 * - on=false → stop oscillator
 *
 * The frequency comes from the engine (toggle period measurement).
 * Nothing is fabricated.
 */

let audioCtx = null;
const oscillators = new Map(); // partId → { osc, gain }

/**
 * Get or create the AudioContext (lazy, needs user gesture).
 */
function getAudioCtx() {
  if (!audioCtx) {
    if (typeof window === 'undefined' || (!window.AudioContext && !window.webkitAudioContext)) {
      return null; // non-browser environment
    }
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

/**
 * Update the buzzer audio for a given part.
 *
 * @param {string} partId
 * @param {{ hz: number, on: boolean }} tone — from board.buzzerTone()
 */
export function updateBuzzerAudio(partId, tone) {
  if (!tone || !tone.on) {
    stopBuzzer(partId);
    return;
  }

  const ctx = getAudioCtx();
  if (!ctx) return; // no audio available
  let entry = oscillators.get(partId);

  if (!entry) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = tone.hz;
    gain.gain.value = 0.05; // quiet — this is a teaching tool, not an alarm
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    entry = { osc, gain };
    oscillators.set(partId, entry);
  }

  // Update frequency smoothly
  entry.osc.frequency.setTargetAtTime(tone.hz, ctx.currentTime, 0.01);
}

/**
 * Stop the buzzer for a given part.
 * @param {string} partId
 */
export function stopBuzzer(partId) {
  const entry = oscillators.get(partId);
  if (entry) {
    try {
      entry.osc.stop();
      entry.osc.disconnect();
      entry.gain.disconnect();
    } catch {
      // Already stopped
    }
    oscillators.delete(partId);
  }
}

/**
 * Stop all buzzers.
 */
export function stopAllBuzzers() {
  for (const partId of oscillators.keys()) {
    stopBuzzer(partId);
  }
}
