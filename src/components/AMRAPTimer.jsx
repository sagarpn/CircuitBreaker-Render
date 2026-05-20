import React, { useState, useEffect, useRef } from 'react'
import styles from './AMRAPTimer.module.css'

const TOTAL_SECS = 12 * 60
const BEEP_AT    = [8 * 60, 4 * 60]

function playTone(freq, dur, vol = 0.25) {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = freq; osc.type = 'sine'
    gain.gain.setValueAtTime(vol, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    osc.start(); osc.stop(ctx.currentTime + dur)
  } catch(e) {}
}

function playMid()   { playTone(440,0.25); setTimeout(()=>playTone(440,0.25),300) }
function playDone()  { playTone(523,0.15); setTimeout(()=>playTone(659,0.15),200); setTimeout(()=>playTone(784,0.5),400) }

export default function AMRAPTimer({ data, onAddCore, onAnotherAMRAP, amrapCount = 0, amrapLoading = false }) {
  const { exercises = [] } = data
  const [phase,  setPhase]  = useState('idle')
  const [secs,   setSecs]   = useState(TOTAL_SECS)
  const [active, setActive] = useState(false)
  const intervalRef = useRef(null)
  const beeped      = useRef(new Set())

  function getReps(ex) {
    if ((ex.tags||'').includes('burnout')) return 'MAX REPS'
    return (ex.reps||'').replace(/^\d+\s+sets?\s*[x×]\s*/i,'').trim()
  }
  function isBurnerEx(ex) { return (ex.tags||'').includes('burnout') }
  function fmt(s) { return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0') }

  useEffect(() => {
    if (!active) { clearInterval(intervalRef.current); return }
    intervalRef.current = setInterval(() => {
      setSecs(prev => {
        const next = prev - 1
        if (BEEP_AT.includes(next) && !beeped.current.has(next)) {
          beeped.current.add(next); playMid()
        }
        if (next <= 0) {
          clearInterval(intervalRef.current)
          setActive(false); setPhase('done'); playDone()
          return 0
        }
        return next
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [active])

  function start() { if (phase==='idle') setPhase('running'); setActive(true) }
  function pause() { setActive(false) }
  function reset() { setActive(false); setPhase('idle'); setSecs(TOTAL_SECS); beeped.current.clear() }

  const pct  = ((TOTAL_SECS - secs) / TOTAL_SECS) * 100
  const done = phase === 'done'

  return (
    <div className={styles.container}>

      {/* Timer block — compact */}
      <div className={`${styles.timerBlock} ${done ? styles.timerDone : phase==='running' ? styles.timerRunning : ''}`}>
        <div className={styles.timerRow}>
          <div className={styles.phaseLabel}>
            {phase==='idle' && 'Ready'}
            {phase==='running' && 'GO'}
            {phase==='done' && '✓ Done'}
          </div>
          <div className={styles.clock}>{fmt(secs)}</div>
          <div className={styles.timerBtns}>
            {!done && !active && (
              <button className={styles.goBtn} onClick={start}>
                {phase==='idle' ? 'Go' : 'Resume'}
              </button>
            )}
            {!done && active && (
              <button className={styles.pauseBtn} onClick={pause}>Pause</button>
            )}
            {!done && phase !== 'idle' && (
              <button className={styles.resetBtn} onClick={reset}>↺</button>
            )}
          </div>
        </div>
        {/* Progress bar */}
        <div className={styles.bar}>
          <div className={styles.barFill} style={{width: pct + '%'}} />
        </div>
        <div className={styles.beepHint}>Beeps at 4 min and 8 min remaining</div>
      </div>

      {/* Exercise list — shown always */}
      <div className={styles.exercises}>
        <div className={styles.loopNote}>Complete top to bottom — loop until time ends</div>
        {exercises.map((ex, i) => {
          const burn = isBurnerEx(ex)
          return (
            <div key={ex.id||i} className={`${styles.exRow} ${burn?styles.burnerRow:''}`}>
              <span className={styles.exNum}>{i+1}</span>
              <div className={styles.exInfo}>
                <span className={styles.exName}>{ex.name}</span>
                <span className={`${styles.exReps} ${burn?styles.burnerReps:''}`}>{getReps(ex)}</span>
              </div>
              {ex.display_muscle && !burn && <span className={styles.badge}>{ex.display_muscle}</span>}
              {burn && <span className={styles.burnerBadge}>FINISHER</span>}
            </div>
          )
        })}
        <div className={styles.loopArrow}>↑ Back to top — go again</div>
      </div>

      {/* Add-ons — shown always below exercises */}
      {(onAnotherAMRAP || onAddCore) && (
        <div className={styles.addOns}>
          {amrapCount < 3 && (
            <button
              className={styles.addBtn}
              onClick={onAnotherAMRAP}
              disabled={!onAnotherAMRAP || amrapLoading}
              style={{ opacity: amrapLoading ? 0.6 : 1 }}>
              {amrapLoading ? 'Generating...' : amrapCount === 0 ? '🔁 One More AMRAP' : amrapCount === 1 ? '🔁 One More AMRAP (' + (3 - amrapCount) + ' left)' : '🔁 Last AMRAP'}
            </button>
          )}
          {amrapCount >= 3 && (
            <div className={styles.amrapDone}>You've done 3 AMRAPs. That's enough. Rest now.</div>
          )}
          {onAddCore && (
            <button className={styles.addBtn} onClick={onAddCore}>💪 Add Core Round</button>
          )}
        </div>
      )}
    </div>
  )
}
