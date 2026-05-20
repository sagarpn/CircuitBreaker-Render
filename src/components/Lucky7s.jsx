import React, { useState } from 'react'
import styles from './Lucky7s.module.css'

export default function Lucky7s({ data, onAddCore }) {
  const { rounds = [], six = [], burner = null } = data
  const [doneRounds, setDoneRounds] = useState(new Set())

  function getReps(ex) {
    return (ex.reps||'').replace(/^\d+\s+sets?\s*[x×]\s*/i,'').trim()
  }
  function isBurnerEx(ex) { return (ex.tags||'').includes('burnout') }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.intro}>
        <div className={styles.lucky777}>7️⃣7️⃣7️⃣</div>
        <div className={styles.tagline}>7 exercises · drop one each round · burner always last</div>
        <div className={styles.bodyNote}>Rest when you need it — check in with your body every round</div>
      </div>

      {/* Rounds */}
      <div className={styles.rounds}>
        {rounds.map((round, ri) => {
          const isDone    = doneRounds.has(ri)
          const dropNext  = ri < 6 ? six[ri] : null
          const isFinal   = ri === 6

          return (
            <div key={ri} className={`${styles.round} ${isDone ? styles.roundDone : ''} ${isFinal ? styles.roundFinal : ''}`}>
              {/* Round header */}
              <div className={styles.roundHeader}>
                <div className={styles.roundLeft}>
                  <span className={styles.roundNum}>Round {ri + 1}</span>
                  {isFinal && <span className={styles.finalTag}>FINAL 🔥</span>}
                  {dropNext && !isFinal && (
                    <span className={styles.dropHint}>drops after: {dropNext.name}</span>
                  )}
                </div>
                <button
                  className={`${styles.doneBtn} ${isDone ? styles.doneBtnDone : ''}`}
                  onClick={() => setDoneRounds(prev => new Set([...prev, ri]))}>
                  {isDone ? '✓' : 'Done'}
                </button>
              </div>

              {/* Exercise list */}
              <div className={styles.exList}>
                {round.map((ex, ei) => {
                  const burn = isBurnerEx(ex)
                  return (
                    <div key={ex.id||ei} className={`${styles.exRow} ${burn ? styles.burnerRow : ''}`}>
                      <span className={styles.exNum}>{ei + 1}</span>
                      <span className={styles.exName}>{ex.name}</span>
                      <span className={`${styles.exReps} ${burn ? styles.burnerReps : ''}`}>
                        {burn ? 'MAX REPS' : getReps(ex) + '+'}
                      </span>
                      {burn && <span className={styles.burnerBadge}>🔥</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Completion */}
      {doneRounds.size === 7 && (
        <div className={styles.complete}>🏆 All 7 rounds complete. Legendary.</div>
      )}

      {/* Add core — always shown at bottom */}
      {onAddCore && (
        <div className={styles.addSection}>
          <button className={styles.addCoreBtn} onClick={onAddCore}>
            💪 Add Core Round
          </button>
        </div>
      )}
    </div>
  )
}
