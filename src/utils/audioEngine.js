/**
 * audioEngine.js — pure Web Audio API tones + haptics
 *
 * Single shared AudioContext (fixes iOS suspension bug).
 * Haptics via navigator.vibrate (Android only — iOS ignores silently).
 * MediaSession registered for Android lock screen persistence.
 * No WAV blobs, no speech synthesis, no external files.
 */

let _ctx = null

function ctx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

// ── Core tone builder ─────────────────────────────────────
// fade-in + sustain + fade-out for smooth soft sound
function tone(freq, startOffset, duration, volume = 0.18, type = 'sine') {
  try {
    const c    = ctx()
    const osc  = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain)
    gain.connect(c.destination)
    osc.type            = type
    osc.frequency.value = freq
    const t = c.currentTime + startOffset
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(volume, t + 0.04)   // soft attack
    gain.gain.setValueAtTime(volume, t + duration - 0.06)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration) // smooth release
    osc.start(t)
    osc.stop(t + duration + 0.01)
  } catch(e) {}
}

// ── Haptics (Android only, iOS ignores) ──────────────────
function vibrate(pattern) {
  try { navigator.vibrate?.(pattern) } catch(e) {}
}

// ── Phase sounds — each feels like its phase ─────────────

// INHALE — two gentle rising notes (C5 → G5), soft triangle
// Feels like breath coming in, opens upward
function soundInhale() {
  tone(523.25, 0.00, 0.45, 0.16, 'triangle') // C5
  tone(784.00, 0.30, 0.50, 0.14, 'triangle') // G5 — rises
  vibrate([30, 20, 30])                        // two soft pulses
}

// HOLD — warm single sustained note (E4), pure sine
// Feels like stillness, no movement
function soundHold() {
  tone(329.63, 0.00, 0.70, 0.13, 'sine')     // E4 — centred, calm
  vibrate([60])                                // one steady pulse
}

// EXHALE — two gently falling notes (G5 → C5), triangle
// Feels like breath leaving, settles downward
function soundExhale() {
  tone(784.00, 0.00, 0.45, 0.16, 'triangle') // G5
  tone(523.25, 0.30, 0.55, 0.13, 'triangle') // C5 — falls
  vibrate([30, 20, 30])                        // two soft pulses
}

// TICK — tiny soft tap each second
function soundTick() {
  tone(440, 0, 0.05, 0.03, 'sine')
}

// COUNTDOWN — slightly brighter tick for 3,2,1 before phase change
function soundCountdown() {
  tone(587, 0, 0.07, 0.10, 'sine')
}

// COUNT-IN 3,2,1 before breathing starts — escalating
function soundCntIn(n) {
  const freqs = { 3: 440, 2: 523, 1: 659 }
  tone(freqs[n] || 440, 0, 0.12, 0.18, 'sine')
  vibrate([40])
}

// REST TIMER start — two quick ascending pings
function soundRestStart() {
  tone(880,  0.00, 0.10, 0.20, 'sine')
  tone(1100, 0.14, 0.13, 0.22, 'sine')
  vibrate([40])
}

// REST TIMER end — three note resolution
function soundRestEnd() {
  tone(523, 0.00, 0.16, 0.28, 'sine')
  tone(659, 0.18, 0.16, 0.28, 'sine')
  tone(784, 0.36, 0.24, 0.32, 'sine')
  vibrate([60, 30, 60])
}

// BREATHING DONE — soft descending resolution, calming
function soundBreathDone() {
  tone(659, 0.00, 0.40, 0.20, 'triangle')
  tone(523, 0.35, 0.45, 0.18, 'triangle')
  tone(392, 0.72, 0.60, 0.16, 'triangle')
  vibrate([80, 40, 80, 40, 80])
}

// ── Init — call on first user tap ────────────────────────
let initialised = false

export async function initAudio() {
  if (initialised) return
  initialised = true
  try {
    // Wake up AudioContext (required after user gesture)
    ctx()

    // Android lock screen: register MediaSession so audio keeps playing
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title:  'CircuitBreaker',
        artist: 'Breathing Timer',
      })
      navigator.mediaSession.setActionHandler('play',  () => {})
      navigator.mediaSession.setActionHandler('pause', () => {})
      navigator.mediaSession.playbackState = 'playing'
    }
  } catch(e) {}
}

// ── Public API ────────────────────────────────────────────
export const sounds = {
  inhale:     soundInhale,
  hold:       soundHold,
  exhale:     soundExhale,
  tick:       soundTick,
  countdown:  soundCountdown,
  cntIn:      soundCntIn,
  restStart:  soundRestStart,
  restEnd:    soundRestEnd,
  breathDone: soundBreathDone,
}
