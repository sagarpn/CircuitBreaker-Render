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

// ── Phase sounds — single clean sine tones, slow fade ────
// Simple is better: one note per phase, long smooth envelope
// Works cleanly on all devices, nothing harsh

// INHALE — single soft rising tone, slow fade in
// A4 (440Hz) — neutral, universally pleasant
function soundInhale() {
  try {
    const c    = ctx()
    const osc  = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain); gain.connect(c.destination)
    osc.type = 'sine'; osc.frequency.value = 440
    const t = c.currentTime
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.12, t + 0.3)  // slow breath-in attack
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2) // long fade
    osc.start(t); osc.stop(t + 1.3)
  } catch(e) {}
  vibrate([20])
}

// HOLD — very soft barely-there tone, D4 (294Hz) — low, calm
function soundHold() {
  try {
    const c    = ctx()
    const osc  = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain); gain.connect(c.destination)
    osc.type = 'sine'; osc.frequency.value = 294
    const t = c.currentTime
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.07, t + 0.1)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8)
    osc.start(t); osc.stop(t + 0.9)
  } catch(e) {}
  vibrate([40])
}

// EXHALE — single soft falling tone, E4 (330Hz), longer fade
function soundExhale() {
  try {
    const c    = ctx()
    const osc  = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain); gain.connect(c.destination)
    osc.type = 'sine'; osc.frequency.value = 330
    const t = c.currentTime
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.10, t + 0.1)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.5) // longest — feels like exhale
    osc.start(t); osc.stop(t + 1.6)
  } catch(e) {}
  vibrate([20])
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
  tone(659, 0.00, 0.40, 0.16, 'sine')
  tone(523, 0.35, 0.45, 0.14, 'sine')
  tone(392, 0.72, 0.60, 0.12, 'sine')
  vibrate([80, 40, 80, 40, 80])
}

// ── Init — call on first user tap ────────────────────────
let initialised = false

export async function initAudio() {
  if (initialised) return
  initialised = true
  try {
    const c = ctx()

    // Silent keepalive oscillator — keeps AudioContext alive on Android
    // when screen locks. Simple and lightweight — one inaudible node.
    const keepalive = c.createOscillator()
    const muteGain  = c.createGain()
    keepalive.connect(muteGain)
    muteGain.connect(c.destination)
    muteGain.gain.value = 0.0001  // effectively silent
    keepalive.start()
    // Note: iOS Safari still blocks audio on lock — Apple policy, not fixable in web apps

    // Android lock screen: MediaSession keeps audio session active
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title:  'Breathing Timer',
        artist: 'Take a Breather',
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
