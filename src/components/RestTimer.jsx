import React, { useState, useEffect, useRef } from 'react'
import styles from './RestTimer.module.css'

const PRESETS = [
  { label: '30s', secs: 30  },
  { label: '45s', secs: 45  },
  { label: '60s', secs: 60  },
  { label: '2m',  secs: 120 },
  { label: '3m',  secs: 180 },
  { label: '5m',  secs: 300 },
]

function beep(freq, duration, volume = 0.3) {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = freq; osc.type = 'sine'
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + duration)
  } catch (e) {}
}

function playStartSound() {
  beep(880, 0.12, 0.25)
  setTimeout(() => beep(1100, 0.15, 0.3), 160)
}

function playEndSound() {
  beep(523, 0.18, 0.35)
  setTimeout(() => beep(659, 0.18, 0.35), 210)
  setTimeout(() => beep(784, 0.28, 0.4),  420)
}

export default function RestTimer() {
  const [open,     setOpen]     = useState(false)
  const [duration, setDuration] = useState(60)
  const [timeLeft, setTimeLeft] = useState(60)
  const [running,  setRunning]  = useState(false)
  const [done,     setDone]     = useState(false)
  const [showHint, setShowHint] = useState(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            clearInterval(intervalRef.current)
            setRunning(false); setDone(true)
            playEndSound(); return 0
          }
          return t - 1
        })
      }, 1000)
    } else { clearInterval(intervalRef.current) }
    return () => clearInterval(intervalRef.current)
  }, [running])

  function handlePreset(secs) {
    setDuration(secs); setTimeLeft(secs)
    setRunning(false); setDone(false)
  }

  function handleStartStop() {
    if (done) { setTimeLeft(duration); setDone(false); setRunning(false) }
    else { if (!running) playStartSound(); setRunning(r => !r) }
  }

  function handleReset() {
    clearInterval(intervalRef.current)
    setTimeLeft(duration); setRunning(false); setDone(false)
  }

  const pct          = (timeLeft / duration) * 100
  const mins         = Math.floor(timeLeft / 60)
  const secs         = timeLeft % 60
  const display      = mins > 0 ? `${mins}:${secs.toString().padStart(2,'0')}` : `${secs}s`
  const colour       = pct > 60 ? 'var(--green)' : pct > 30 ? 'var(--amber)' : 'var(--red)'
  const circumference = 2 * Math.PI * 36

  return (
    <>
      {/* ── Floating button ── */}
      <button
        className={`${styles.floatBtn} ${running ? styles.floatBtnRunning : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        {running && <span className={styles.pulse} />}
        ⏱ Need a Breather?
      </button>

      {/* ── Backdrop ── */}
      {open && <div className={styles.backdrop} onClick={() => setOpen(false)} />}

      {/* ── Slide-up sheet ── */}
      <div className={`${styles.sheet} ${open ? styles.sheetOpen : ''}`}>
        <div className={styles.sheetHeader}>
          <span className={styles.sheetTitle}>⏱ Rest Timer</span>
          <div className={styles.sheetHeaderRight}>
            <button className={styles.hintBtn} onClick={() => setShowHint(h => !h)}>😅</button>
            <button className={styles.closeBtn} onClick={() => setOpen(false)}>✕</button>
          </div>
        </div>

        {showHint && (
          <div className={styles.hint}>
            Use between sets or circuits · Short for HIIT · Longer for heavy lifts · Or don't rest and cry later
          </div>
        )}

        <div className={styles.ring}>
          <svg viewBox="0 0 80 80" className={styles.svg}>
            <circle cx="40" cy="40" r="36" className={styles.track} />
            <circle cx="40" cy="40" r="36" className={styles.progress}
              style={{
                stroke: colour,
                strokeDasharray: circumference,
                strokeDashoffset: circumference * (1 - pct / 100),
                transition: running ? 'stroke-dashoffset 0.9s linear, stroke 0.5s' : 'none',
              }}
            />
          </svg>
          <button className={styles.timeDisplay} onClick={handleStartStop} style={{ color: done ? 'var(--green)' : colour }}>
            {done ? '✓' : display}
          </button>
        </div>

        <div className={styles.controls}>
          <button className={`${styles.btn} ${running ? styles.stop : styles.start}`} onClick={handleStartStop}>
            {done ? '▶ Again' : running ? '⏸ Pause' : '▶ Start'}
          </button>
          <button className={styles.resetBtn} onClick={handleReset}>↺ Reset</button>
        </div>

        <div className={styles.presets}>
          {PRESETS.map(p => (
            <button key={p.secs}
              className={`${styles.preset} ${duration === p.secs ? styles.activePreset : ''}`}
              onClick={() => handlePreset(p.secs)}
            >{p.label}</button>
          ))}
        </div>
      </div>
    </>
  )
}
