import React, { useState, useEffect, useRef } from 'react'
import styles from './Circuit.module.css'
import { sounds, initAudio } from '../utils/audioEngine'

const CAT_LABEL = { upper:'Upper', lower:'Lower', core:'Core', hiit:'HIIT' }
const CAT_COLOR = {
  upper: 'var(--upper)',
  lower: 'var(--lower)',
  core:  'var(--core)',
  hiit:  'var(--hiit)',
}

// Shared timer durations — remembered across cards until page refresh
const timerDurations = {}

// ── Core timer sounds via shared audio engine ────────────
function playCoreStart() { initAudio().then(() => sounds.restStart()) }
function playCoreEnd()   { initAudio().then(() => sounds.breathDone()) }

function CoreTimer({ exerciseId }) {
  const DEFAULT = 45
  const [duration, setDuration] = useState(() => timerDurations[exerciseId] ?? DEFAULT)
  const [timeLeft,  setTimeLeft]  = useState(() => timerDurations[exerciseId] ?? DEFAULT)
  const [running,   setRunning]   = useState(false)
  const [done,      setDone]      = useState(false)
  const intervalRef = useRef(null)

  // Keep shared store in sync
  useEffect(() => {
    timerDurations[exerciseId] = duration
    setTimeLeft(duration)
    setDone(false)
    setRunning(false)
    clearInterval(intervalRef.current)
  }, [duration, exerciseId])

  // Countdown
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            clearInterval(intervalRef.current)
            setRunning(false)
            setDone(true)
            playCoreEnd()
            return 0
          }
          return t - 1
        })
      }, 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [running])

  function handleStartStop(e) {
    e.stopPropagation()
    if (done) {
      setTimeLeft(duration)
      setDone(false)
      setRunning(false)
    } else {
      if (!running) playCoreStart()
      setRunning(r => !r)
    }
  }

  function handleAdd(e) {
    e.stopPropagation()
    const next = duration + 15
    setDuration(next)
    timerDurations[exerciseId] = next
  }

  const pct     = (timeLeft / duration) * 100
  const mins    = Math.floor(timeLeft / 60)
  const secs    = timeLeft % 60
  const display = mins > 0
    ? `${mins}:${secs.toString().padStart(2, '0')}`
    : `${timeLeft}s`

  return (
    <div className={styles.timerWrap} onClick={e => e.stopPropagation()}>
      {/* Progress ring */}
      <div className={styles.timerRing}>
        <svg viewBox="0 0 44 44" className={styles.timerSvg}>
          <circle cx="22" cy="22" r="18" className={styles.timerTrack} />
          <circle
            cx="22" cy="22" r="18"
            className={`${styles.timerProgress} ${done ? styles.timerDone : ''}`}
            strokeDasharray={`${2 * Math.PI * 18}`}
            strokeDashoffset={`${2 * Math.PI * 18 * (1 - pct / 100)}`}
          />
        </svg>
        <button className={styles.timerDisplay} onClick={handleStartStop}>
          {done ? '↺' : display}
        </button>
      </div>

      {/* Controls */}
      <div className={styles.timerControls}>
        <button
          className={`${styles.timerBtn} ${running ? styles.timerStop : styles.timerStart}`}
          onClick={handleStartStop}
        >
          {done ? 'Reset' : running ? '⏸' : '▶'}
        </button>
        <button className={styles.timerPlus} onClick={handleAdd}>
          +15s
        </button>
      </div>
    </div>
  )
}

function ExerciseCard({ exercise, index, focus, style, hasDumbbells, hasPullupBar, usedIds, onSwap }) {
  const [swapping, setSwapping] = useState(false)
  const [flagged,  setFlagged]  = useState(false)
  const isCore = exercise.category === 'core'

  async function handleFlag(e) {
    e.stopPropagation()
    try {
      await fetch(`/api/admin/exercises/${exercise.id}/flag`, { method: 'PATCH' })
      setFlagged(true)
      setTimeout(() => setFlagged(false), 3000)
    } catch {}
  }

  async function handleSwap(e) {
    e.stopPropagation()
    setSwapping(true)
    try {
      const res  = await fetch('/api/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId: exercise.id, focus, style, hasDumbbells, hasPullupBar, usedIds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onSwap(exercise.id, data.replacement)
    } catch (e) { alert(e.message) }
    finally     { setSwapping(false) }
  }

  const color = CAT_COLOR[exercise.category] || 'var(--muted)'

  return (
    <div
      className={`${styles.card} ${isCore ? styles.coreCard : ''}`}
      style={{ animationDelay: `${index * 0.05}s` }}

    >
      <div className={styles.number}>{index + 1}</div>

      <div className={styles.cardBody}>
        <div className={styles.exerciseName}>{exercise.name}</div>

        {/* Core gets timer, everything else gets reps text */}
        {isCore
          ? <CoreTimer exerciseId={exercise.id} />
          : <div className={styles.reps}>{exercise.reps}</div>
        }

        {exercise.description && (
          <div className={styles.description}>{exercise.description}</div>
        )}
      </div>

      <div className={styles.cardRight}>
        <span
          className={styles.categoryBadge}
          style={{ color, borderColor: color, background: `${color}14` }}
        >
          {CAT_LABEL[exercise.category] || exercise.category}
        </span>
        <button
          className={`${styles.flagUserBtn} ${flagged ? styles.flagUserActive : ''}`}
          onClick={handleFlag}
          title="Flag as too complex"
        >
          {flagged ? '🚩' : '⚑'}
        </button>
        <button
          className={styles.swapBtn}
          onClick={handleSwap}
          disabled={swapping}
        >
          {swapping ? '...' : '↻'}
        </button>
      </div>
    </div>
  )
}

export default function Circuit({ label, number, exercises, focus, style, hasDumbbells, hasPullupBar, usedIds, onSwap, onFavourite }) {
  const [saved, setSaved] = React.useState(false)
  return (
    <div className={styles.circuit}>
      <div className={styles.circuitHeader}>
        <span className={styles.circuitLabel}>{label}</span>
        <div className={styles.circuitMeta}>
          <span className={styles.circuitCount}>{exercises.length} exercises</span>
          <span className={styles.circuitRounds}>×2–3 rounds</span>
          {onFavourite && (
            <button
              className={`${styles.favBtn} ${saved ? styles.favBtnSaved : ''}`}
              onClick={() => { onFavourite(); setSaved(true) }}
              disabled={saved}
              title={saved ? 'Circuit saved!' : 'Save circuit to favourites'}
            >
              {saved ? '✓ Saved' : '⭐ Save Circuit'}
            </button>
          )}
        </div>
      </div>

      {exercises.map((ex, i) => (
        <ExerciseCard
          key={ex.id}
          exercise={ex}
          index={i}
          focus={focus}
          style={style}
          hasDumbbells={hasDumbbells}
          hasPullupBar={hasPullupBar}
          usedIds={usedIds}
          onSwap={onSwap}
        />
      ))}

      <div className={styles.circuitFooter}>
        ↻ to swap any exercise you don't like
      </div>
    </div>
  )
}
