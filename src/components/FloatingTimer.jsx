import React, { useState, useEffect, useRef } from 'react'
import styles from './FloatingTimer.module.css'
import { initAudio, sounds } from '../utils/audioEngine'

const PRESETS = [
  { label: '30s', secs: 30  },
  { label: '45s', secs: 45  },
  { label: '60s', secs: 60  },
  { label: '2m',  secs: 120 },
  { label: '3m',  secs: 180 },
  { label: '5m',  secs: 300 },
]

const DEEP_SEQ = [
  { phase: 'Inhale', secs: 4, sound: () => sounds.inhale() },
  { phase: 'Hold',   secs: 6, sound: () => sounds.hold()   },
  { phase: 'Exhale', secs: 4, sound: () => sounds.exhale() },
]
const BOX_SEQ = [
  { phase: 'Inhale', secs: 5, sound: () => sounds.inhale() },
  { phase: 'Hold',   secs: 5, sound: () => sounds.hold()   },
  { phase: 'Exhale', secs: 5, sound: () => sounds.exhale() },
  { phase: 'Hold',   secs: 5, sound: () => sounds.hold()   },
]
// Voice cues replace the old tone-based phase sounds above
// sounds.inhale/hold/exhale now use speech synthesis
const DEFAULT_CYCLES = 5
const CYCLE_STEP     = 5

const PHASE_COACH = {
  Inhale: 'breathe in slowly',
  Hold:   'stay still',
  Exhale: 'release slowly',
}
const PHASE_COLOR = {
  Inhale: 'var(--green)',
  Hold:   'var(--amber)',
  Exhale: 'var(--blue, #4fa8e8)',
}

// ── REST TIMER ────────────────────────────────────────────
function RestTimer({ onFirstTap }) {
  const [duration, setDuration] = useState(60)
  const [timeLeft, setTimeLeft] = useState(60)
  const [running,  setRunning]  = useState(false)
  const [done,     setDone]     = useState(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            clearInterval(intervalRef.current)
            setRunning(false); setDone(true); sounds.restEnd(); return 0
          }
          return t - 1
        })
      }, 1000)
    } else { clearInterval(intervalRef.current) }
    return () => clearInterval(intervalRef.current)
  }, [running])

  function handlePreset(secs) { setDuration(secs); setTimeLeft(secs); setRunning(false); setDone(false) }

  function handleStartStop() {
    onFirstTap()
    if (done) { setTimeLeft(duration); setDone(false); setRunning(false) }
    else { if (!running) sounds.restStart(); setRunning(r => !r) }
  }

  function handleReset() {
    clearInterval(intervalRef.current)
    setTimeLeft(duration); setRunning(false); setDone(false)
  }

  const pct     = (timeLeft / duration) * 100
  const mins    = Math.floor(timeLeft / 60)
  const secs    = timeLeft % 60
  const display = mins > 0 ? `${mins}:${secs.toString().padStart(2,'0')}` : `${timeLeft}s`
  const colour  = pct > 60 ? 'var(--green)' : pct > 30 ? 'var(--amber)' : 'var(--red)'
  const circ    = 2 * Math.PI * 36

  return (
    <div className={styles.modeContent}>
      <div className={styles.hint}>
        💡 Short breaks for HIIT · Longer for heavy lifts · Or don't and cry later
      </div>
      <div className={styles.timerRow}>
        <div className={styles.ring}>
          <svg viewBox="0 0 80 80" className={styles.svg}>
            <circle cx="40" cy="40" r="36" className={styles.track}/>
            <circle cx="40" cy="40" r="36" className={styles.progress}
              style={{ stroke: colour, strokeDasharray: circ,
                strokeDashoffset: circ * (1 - pct / 100),
                transition: running ? 'stroke-dashoffset 0.9s linear, stroke 0.5s' : 'none' }}/>
          </svg>
          <button className={styles.timeDisplay} onClick={handleStartStop}
            style={{ color: done ? 'var(--green)' : colour }}>
            {done ? '✓' : display}
          </button>
        </div>
        <div className={styles.rightCol}>
          <div className={styles.controls}>
            <button className={`${styles.btn} ${running ? styles.stop : styles.start}`} onClick={handleStartStop}>
              {done ? '▶ Again' : running ? '⏸ Pause' : '▶ Start'}
            </button>
            <button className={styles.resetBtn} onClick={handleReset}>↺</button>
          </div>
          <div className={styles.presets}>
            {PRESETS.map(p => (
              <button key={p.secs}
                className={`${styles.preset} ${duration === p.secs ? styles.activePreset : ''}`}
                onClick={() => handlePreset(p.secs)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── BREATHING TIMER ───────────────────────────────────────
function BreathTimer({ sequence, onFirstTap }) {
  const [totalCycles, setTotalCycles] = useState(DEFAULT_CYCLES)
  const [countdown,   setCountdown]   = useState(null)
  const [running,     setRunning]     = useState(false)
  const [done,        setDone]        = useState(false)
  const [cycle,       setCycle]       = useState(1)
  const [phaseIdx,    setPhaseIdx]    = useState(0)
  const [phaseLeft,   setPhaseLeft]   = useState(sequence[0].secs)
  const intervalRef = useRef(null)
  const stateRef    = useRef({ cycle: 1, phaseIdx: 0, phaseLeft: sequence[0].secs })

  useEffect(() => { stateRef.current = { cycle, phaseIdx, phaseLeft } }, [cycle, phaseIdx, phaseLeft])
  useEffect(() => () => clearInterval(intervalRef.current), [])

  function doReset() {
    clearInterval(intervalRef.current)
    setCountdown(null); setRunning(false); setDone(false)
    setCycle(1); setPhaseIdx(0); setPhaseLeft(sequence[0].secs)
    stateRef.current = { cycle: 1, phaseIdx: 0, phaseLeft: sequence[0].secs }
  }

  function handleCycles(delta) {
    const next = Math.max(CYCLE_STEP, totalCycles + delta)
    setTotalCycles(next); doReset()
  }

  function beginBreathing(cycles) {
    setRunning(true); setDone(false); setCountdown(null)
    setCycle(1); setPhaseIdx(0); setPhaseLeft(sequence[0].secs)
    stateRef.current = { cycle: 1, phaseIdx: 0, phaseLeft: sequence[0].secs }
    sequence[0].sound()

    clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      const s = stateRef.current
      const newLeft = s.phaseLeft - 1

      if (newLeft <= 0) {
        const nextPhase = s.phaseIdx + 1
        if (nextPhase < sequence.length) {
          const np = { ...s, phaseIdx: nextPhase, phaseLeft: sequence[nextPhase].secs }
          stateRef.current = np
          setPhaseIdx(nextPhase); setPhaseLeft(sequence[nextPhase].secs)
          sequence[nextPhase].sound()
        } else {
          const nextCycle = s.cycle + 1
          if (nextCycle <= cycles) {
            const np = { cycle: nextCycle, phaseIdx: 0, phaseLeft: sequence[0].secs }
            stateRef.current = np
            setCycle(nextCycle); setPhaseIdx(0); setPhaseLeft(sequence[0].secs)
            sequence[0].sound()
          } else {
            clearInterval(intervalRef.current)
            setRunning(false); setDone(true); sounds.breathDone()
          }
        }
      } else {
        stateRef.current = { ...s, phaseLeft: newLeft }
        setPhaseLeft(newLeft)
        if (newLeft <= 3) sounds.countdown()
        else sounds.tick()
      }
    }, 1000)
  }

  function startCountIn() {
    onFirstTap()
    setCountdown(3); sounds.cntIn(3)
    let n = 3
    clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      n--
      if (n > 0) { setCountdown(n); sounds.cntIn(n) }
      else { clearInterval(intervalRef.current); setCountdown(null); beginBreathing(totalCycles) }
    }, 1000)
  }

  function handlePause() { clearInterval(intervalRef.current); setRunning(false) }

  const phase  = sequence[phaseIdx]
  const pct    = ((phase.secs - phaseLeft) / phase.secs) * 100
  const colour = PHASE_COLOR[phase.phase] || 'var(--accent)'
  const circ   = 2 * Math.PI * 36
  const isReady = !running && !done && countdown === null

  return (
    <div className={styles.modeContent}>
      <div className={styles.breathHeader}>
        <div className={styles.breathHint}>
          {sequence.map((p, i) => (
            <span key={i} style={{ color: PHASE_COLOR[p.phase] }} className={styles.breathStep}>
              {p.phase} {p.secs}s{i < sequence.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </div>
        <div className={styles.cyclePicker}>
          <button className={styles.cycleBtn} onClick={() => handleCycles(-CYCLE_STEP)}
            disabled={totalCycles <= CYCLE_STEP}>−</button>
          <span className={styles.cycleNum}>{totalCycles}</span>
          <button className={styles.cycleBtn} onClick={() => handleCycles(+CYCLE_STEP)}>+</button>
          <span className={styles.cycleLabel}>cycles</span>
        </div>
      </div>

      <div className={styles.timerRow}>
        <div className={styles.ring}>
          <svg viewBox="0 0 80 80" className={styles.svg}>
            <circle cx="40" cy="40" r="36" className={styles.track}/>
            {!isReady && !done && (
              <circle cx="40" cy="40" r="36" className={styles.progress}
                style={{ stroke: colour, strokeDasharray: circ,
                  strokeDashoffset: circ * (pct / 100),
                  transition: running ? 'stroke-dashoffset 1s linear, stroke 0.3s' : 'none' }}/>
            )}
          </svg>
          <div className={styles.breathCenter}>
            {countdown !== null ? (
              <>
                <div className={styles.breathPhase} style={{ color: 'var(--accent)' }}>Ready</div>
                <div className={styles.breathCount} style={{ color: 'var(--accent)' }}>{countdown}</div>
              </>
            ) : done ? (
              <div className={styles.breathCount} style={{ color: 'var(--green)' }}>✓</div>
            ) : (
              <>
                <div className={styles.breathPhase} style={{ color: colour }}>{phase.phase}</div>
                <div className={styles.breathCount} style={{ color: colour }}>
                  {isReady ? phase.secs : phaseLeft}s
                </div>
              </>
            )}
          </div>
        </div>

        <div className={styles.rightCol}>
          {!done && (
            <div className={styles.cycleBadge}>
              {isReady ? `${totalCycles} cycles` : `Cycle ${cycle} / ${totalCycles}`}
            </div>
          )}
          <div className={styles.controls}>
            {isReady && (
              <button className={`${styles.btn} ${styles.start}`} onClick={startCountIn}>▶ Start</button>
            )}
            {countdown !== null && (
              <button className={`${styles.btn} ${styles.stop}`} onClick={doReset}>✕</button>
            )}
            {running && (
              <button className={`${styles.btn} ${styles.stop}`} onClick={handlePause}>⏸ Pause</button>
            )}
            {!running && !isReady && countdown === null && !done && (
              <button className={`${styles.btn} ${styles.start}`} onClick={() => beginBreathing(totalCycles)}>▶ Resume</button>
            )}
            {done && (
              <button className={`${styles.btn} ${styles.start}`} onClick={startCountIn}>▶ Again</button>
            )}
            <button className={styles.resetBtn} onClick={doReset}>↺</button>
          </div>
          {running && <div className={styles.coachText}>{PHASE_COACH[phase.phase]}</div>}
          {done && <div className={styles.doneMsg}>Done 🎉</div>}
        </div>
      </div>
    </div>
  )
}

// ── MAIN FLOATING BAR ─────────────────────────────────────
export default function FloatingTimer() {
  const [open,         setOpen]         = useState(false)
  const [mode,         setMode]         = useState('rest')
  const [audioReady,   setAudioReady]   = useState(false)

  // Init audio on first real user tap — required by iOS
  async function handleFirstTap() {
    if (audioReady) return
    await initAudio()
    setAudioReady(true)
  }

  function handleOpen() {
    handleFirstTap()
    setOpen(o => !o)
  }

  return (
    <div className={styles.bar}>
      <button className={styles.trigger} onClick={handleOpen}>
        <div className={styles.triggerLeft}>
          <span className={styles.triggerIcon}>⏱</span>
          <span className={styles.triggerLabel}>Need a Breather?</span>
        </div>
        <span className={styles.triggerArrow}>{open ? '▲' : '▼'}</span>
      </button>

      <div className={`${styles.body} ${open ? styles.bodyOpen : ''}`}>
        <div className={styles.bodyInner}>
          <div className={styles.modeTabs}>
            <button className={`${styles.modeTab} ${mode==='rest' ? styles.modeActive : ''}`}
              onClick={() => setMode('rest')}>⏱ Rest</button>
            <button className={`${styles.modeTab} ${mode==='deep' ? styles.modeActive : ''}`}
              onClick={() => setMode('deep')}>🫁 Deep</button>
            <button className={`${styles.modeTab} ${mode==='box' ? styles.modeActive : ''}`}
              onClick={() => setMode('box')}>📦 Box</button>
          </div>
          {mode === 'rest' && <RestTimer onFirstTap={handleFirstTap} />}
          {mode === 'deep' && <BreathTimer key="deep" sequence={DEEP_SEQ} onFirstTap={handleFirstTap} />}
          {mode === 'box'  && <BreathTimer key="box"  sequence={BOX_SEQ}  onFirstTap={handleFirstTap} />}
        </div>
      </div>
    </div>
  )
}
