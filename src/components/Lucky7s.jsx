import React, { useState } from 'react'
import styles from './Lucky7s.module.css'

export default function Lucky7s({ data, onAddCore }) {
  const { rounds = [], six = [], burner = null } = data
  const [doneRounds,     setDoneRounds]     = useState(new Set())
  const [collapsedRounds,setCollapsedRounds]= useState(new Set())

  function getReps(ex) {
    return (ex.reps||'').replace(/^\d+\s+sets?\s*[x×]\s*/i,'').trim()
  }
  function isBurnerEx(ex) { return (ex.tags||'').includes('burnout') }

  function toggleDone(ri) {
    setDoneRounds(prev => {
      const next = new Set(prev)
      if (next.has(ri)) { next.delete(ri) } else { next.add(ri) }
      return next
    })
    // Auto-collapse when marked done, auto-expand when unmarked
    setCollapsedRounds(prev => {
      const next = new Set(prev)
      if (!doneRounds.has(ri)) { next.add(ri) } else { next.delete(ri) }
      return next
    })
  }

  function toggleCollapse(ri) {
    setCollapsedRounds(prev => {
      const next = new Set(prev)
      if (next.has(ri)) { next.delete(ri) } else { next.add(ri) }
      return next
    })
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.intro}>
        <div className={styles.tagline}>🎰 7 exercises · drop one each round · burner always last</div>
        <div className={styles.bodyNote}>Rest when you need it — check in with your body every round</div>
      </div>

      {/* Rounds */}
      <div className={styles.rounds}>
        {rounds.map((round, ri) => {
          const isDone      = doneRounds.has(ri)
          const isCollapsed = collapsedRounds.has(ri)
          const dropNext    = ri < 6 ? six[ri] : null
          const isFinal     = ri === 6

          return (
            <div key={ri} className={`${styles.round} ${isDone ? styles.roundDone : ''} ${isFinal ? styles.roundFinal : ''}`}>
              {/* Round header — tappable to collapse/expand */}
              <div className={styles.roundHeader} onClick={() => toggleCollapse(ri)}>
                <div className={styles.roundLeft}>
                  <span className={styles.roundNum}>Round {ri + 1}</span>
                  {isFinal && <span className={styles.finalTag}>FINAL 🔥</span>}
                  {!isFinal && dropNext && !isDone && (
                    <span className={styles.dropHint}>drops after: {dropNext.name}</span>
                  )}
                  {isDone && !isFinal && (
                    <span className={styles.doneHint}>✓ completed — tap to expand</span>
                  )}
                </div>
                <div className={styles.roundRight}>
                  <span className={styles.collapseIcon}>{isCollapsed ? '▶' : '▼'}</span>
                  <button
                    className={`${styles.doneBtn} ${isDone ? styles.doneBtnDone : ''}`}
                    onClick={e => { e.stopPropagation(); toggleDone(ri) }}>
                    {isDone ? '✓' : 'Done'}
                  </button>
                </div>
              </div>

              {/* Exercise list — hidden when collapsed */}
              {!isCollapsed && (
                <div className={styles.exList}>
                  {/* Round 1 only: show description of what to expect */}
                  {ri === 0 && (
                    <div className={styles.round1Note}>
                      Complete all {round.length} exercises · finish with the burner · rest · repeat next round
                    </div>
                  )}
                  {round.map((ex, ei) => {
                    const burn = isBurnerEx(ex)
                    return (
                      <div key={ex.id||ei} className={`${styles.exRow} ${burn ? styles.burnerRow : ''}`}>
                        <span className={styles.exNum}>{ei + 1}</span>
                        <div className={styles.exDetails}>
                          <span className={styles.exName}>{ex.name}</span>
                          {ex.description && !burn && (
                            <span className={styles.exDesc}>{ex.description}</span>
                          )}
                        </div>
                        <span className={`${styles.exReps} ${burn ? styles.burnerReps : ''}`}>
                          {burn ? 'MAX REPS' : getReps(ex) + '+'}
                        </span>
                        {burn && <span className={styles.burnerBadge}>🔥</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Completion */}
      {doneRounds.size === 7 && (
        <div className={styles.complete}>🏆 All 7 rounds complete. Legendary.</div>
      )}

      {/* Add core */}
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
