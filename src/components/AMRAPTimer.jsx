import React, { useState, useEffect, useRef } from 'react'
import { initAudio, sounds } from '../utils/audioEngine'
import styles from './AMRAPTimer.module.css'

const BLOCK_SECS   = 12 * 60  // 12 minutes
const REST_SECS    = 90
const BEEP_TIMES   = [8 * 60, 4 * 60, 0] // countdown remaining: 8min, 4min, done

export default function AMRAPTimer({ data, onAddCore, onAddCircuit3 }) {
  const { block1, block2 } = data
  const [phase, setPhase]   = useState('idle')  // idle|block1|rest|block2|done
  const [secs, setSecs]     = useState(BLOCK_SECS)
  const [active, setActive] = useState(false)
  const intervalRef         = useRef(null)
  const beepedRef           = useRef(new Set())

  function getReps(ex) {
    const r = (ex.reps||'').replace(/^\d+\s+sets?\s*[x×]\s*/i,'').trim()
    if (isBurner(ex)) return 'MAX REPS'
    return r + (r && !r.toLowerCase().includes('timed') ? '+' : '')
  }
  function isBurner(ex) { const t=ex.tags||''; return t==='burnout'||(typeof t==='string'&&t.includes('burnout')) }

  useEffect(() => {
    if (!active) { clearInterval(intervalRef.current); return }
    intervalRef.current = setInterval(() => {
      setSecs(prev => {
        const next = prev - 1

        // Beep at 8min remaining and 4min remaining
        if ((prev === BLOCK_SECS - 4*60 || prev === BLOCK_SECS - 8*60) && !beepedRef.current.has(prev)) {
          beepedRef.current.add(prev)
          sounds.restStart()
        }

        if (next <= 0) {
          clearInterval(intervalRef.current)
          setActive(false)
          sounds.restEnd()
          if (phase === 'block1') {
            setPhase('rest'); setSecs(REST_SECS); beepedRef.current.clear()
          } else if (phase === 'rest') {
            setPhase('block2'); setSecs(BLOCK_SECS); beepedRef.current.clear()
          } else if (phase === 'block2') {
            setPhase('done')
          }
          return 0
        }
        return next
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [active, phase])

  function start() {
    initAudio()
    if (phase === 'idle') { setPhase('block1'); setSecs(BLOCK_SECS) }
    setActive(true)
  }
  function pause() { setActive(false) }
  function reset() { setActive(false); setPhase('idle'); setSecs(BLOCK_SECS); beepedRef.current.clear() }

  function fmt(s) {
    const m = Math.floor(s/60), sec = s%60
    return `${m}:${String(sec).padStart(2,'0')}`
  }

  const currentBlock = phase === 'block2' ? block2 : block1
  const isRest = phase === 'rest'
  const isDone = phase === 'done'

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>⏱ AMRAP</span>
        <span className={styles.sub}>As Many Rounds As Possible</span>
      </div>

      {/* Timer */}
      <div className={`${styles.timerBlock} ${isRest ? styles.timerRest : ''} ${isDone ? styles.timerDone : ''}`}>
        <div className={styles.phaseLabel}>
          {phase==='idle' && 'Ready'}
          {phase==='block1' && 'Block 1 — 12 Minutes'}
          {phase==='rest' && '🧘 Rest — 90 Seconds'}
          {phase==='block2' && 'Block 2 — 12 Minutes'}
          {phase==='done' && '🏆 Session Complete!'}
        </div>
        {!isDone && (
          <div className={styles.clock}>{fmt(secs)}</div>
        )}
        {!isDone && (
          <div className={styles.timerControls}>
            {!active
              ? <button className={styles.startBtn} onClick={start}>{phase==='idle'?'Start':'Resume'}</button>
              : <button className={styles.pauseBtn} onClick={pause}>Pause</button>
            }
            <button className={styles.resetBtn} onClick={reset}>Reset</button>
          </div>
        )}
        {phase === 'block1' && !active && secs < BLOCK_SECS && (
          <div className={styles.beepNote}>Beeps at 4 min and 8 min remaining</div>
        )}
      </div>

      {/* Exercises */}
      {!isDone && (
        <div className={styles.exercises}>
          <div className={styles.blockLabel}>
            {isRest ? 'Up next — Block 2:' : `${phase==='block2'?'Block 2':'Block 1'} — Keep looping:`}
          </div>
          {(isRest ? block2 : currentBlock).map((ex, i) => {
            const burn = isBurner(ex)
            return (
              <div key={ex.id||i} className={`${styles.exercise} ${burn?styles.burnerEx:''}`}>
                <div className={styles.exLeft}>
                  <span className={styles.exNum}>{i+1}</span>
                  <div className={styles.exInfo}>
                    <span className={styles.exName}>{ex.name}</span>
                    <span className={`${styles.exReps} ${burn?styles.burnerReps:''}`}>{getReps(ex)}</span>
                  </div>
                </div>
                <div className={styles.exRight}>
                  {ex.display_muscle && !burn && <span className={styles.muscleBadge}>{ex.display_muscle}</span>}
                  {burn && <span className={styles.burnerBadge}>BURNER</span>}
                </div>
              </div>
            )
          })}
          <div className={styles.loopNote}>↑ Repeat until timer ends</div>
        </div>
      )}

      {isDone && (
        <div className={styles.doneSection}>
          <div className={styles.doneText}>You crushed it. Both blocks done.</div>
          <div className={styles.addOns}>
            {onAddCore && (
              <button className={styles.addBtn} onClick={onAddCore}>💪 Add Core Round</button>
            )}
            {onAddCircuit3 && (
              <button className={styles.addBtn} onClick={onAddCircuit3}>+ Add Circuit</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
