import React, { useState } from 'react'
import styles from './Lucky7s.module.css'
import CoreTimer from './CoreTimerComp'

export default function Lucky7s({ data, onAddCore }) {
  const { rounds, six, burner } = data
  const [doneRounds, setDoneRounds] = useState(new Set())

  function markDone(i) {
    setDoneRounds(prev => new Set([...prev, i]))
  }

  function getRepsDisplay(ex) {
    return (ex.reps || '').replace(/^\d+\s+sets?\s*[x×]\s*/i, '').trim()
  }

  function isBurnerEx(ex) {
    const t = ex.tags || ''
    return t === 'burnout' || (typeof t==='string' && t.includes('burnout'))
  }

  function isTimedEx(ex) {
    return ex.format === 'timed' || isBurnerEx(ex) ||
      (ex.reps||'').toLowerCase().includes('second') ||
      (ex.name||'').toLowerCase().includes('hold')
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>🎯 Lucky 7s</span>
        <span className={styles.sub}>Drop one exercise each round · Burner always last</span>
      </div>

      <div className={styles.bodyNote}>
        Rest when you need it. Check in with your body every round.
      </div>

      <div className={styles.rounds}>
        {rounds.map((round, ri) => {
          const dropped = six.slice(0, ri).map(e => e.name)
          const isDone = doneRounds.has(ri)
          const dropNext = ri < 6 ? six[ri].name : null

          return (
            <div key={ri} className={`${styles.round} ${isDone ? styles.roundDone : ''}`}>
              <div className={styles.roundHeader}>
                <span className={styles.roundNum}>Round {ri + 1}</span>
                {dropNext && ri < 6 && (
                  <span className={styles.dropHint}>
                    {ri === 0 ? `Drops after this round: ${six[0].name}` : `Drop next: ${dropNext}`}
                  </span>
                )}
                {ri === 6 && <span className={styles.finalBadge}>Final Round 🔥</span>}
                <button
                  className={`${styles.doneBtn} ${isDone ? styles.doneBtnActive : ''}`}
                  onClick={() => markDone(ri)}>
                  {isDone ? '✓ Done' : 'Mark Done'}
                </button>
              </div>

              <div className={styles.exercises}>
                {round.map((ex, ei) => {
                  const isBurn = isBurnerEx(ex)
                  const isTimed = isTimedEx(ex)
                  return (
                    <div key={ex.id || ei} className={`${styles.exercise} ${isBurn ? styles.burnerEx : ''}`}>
                      <div className={styles.exLeft}>
                        <span className={styles.exNum}>{ei + 1}</span>
                        <div className={styles.exInfo}>
                          <span className={styles.exName}>{ex.name}</span>
                          {isBurn
                            ? <span className={styles.burnerReps}>🔥 MAX EFFORT</span>
                            : <span className={styles.exReps}>{getRepsDisplay(ex)}{ !isTimed && '+'}</span>
                          }
                        </div>
                      </div>
                      {ex.display_muscle && !isBurn && (
                        <span className={styles.muscleBadge}>{ex.display_muscle}</span>
                      )}
                      {isBurn && <span className={styles.burnerBadge}>BURNER</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {doneRounds.size === 7 && (
        <div className={styles.complete}>
          🏆 Lucky 7s Complete! Outstanding work.
        </div>
      )}

      {onAddCore && (
        <button className={styles.addCoreBtn} onClick={onAddCore}>
          💪 Add Core Round
        </button>
      )}
    </div>
  )
}
