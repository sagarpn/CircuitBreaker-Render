// CircuitBreaker v3.2 — Maintenance Circuit
import React, { useState } from 'react'
import styles from './MaintenanceCircuit.module.css'
import data from '../data/maintenanceCircuit.json'
import FloatingTimer from './FloatingTimer'

function pickQuote() {
  return data.quotes[Math.floor(Math.random() * data.quotes.length)]
}

function buildGroups(stations) {
  const pairMap = {}
  const soloStations = []

  stations.forEach(s => {
    if (s.pairing === 'solo') {
      soloStations.push(s)
    } else {
      if (!pairMap[s.pairId]) pairMap[s.pairId] = []
      pairMap[s.pairId].push(s)
    }
  })

  const groups = []
  let soloInserted = false

  Object.keys(pairMap).sort((a,b) => Number(a)-Number(b)).forEach(pairId => {
    groups.push({ type: 'pair', pairId: Number(pairId), stations: pairMap[pairId] })
    // Insert both solos after pair 1
    if (Number(pairId) === 1 && !soloInserted) {
      soloStations.forEach(s => groups.push({ type: 'solo', station: s }))
      soloInserted = true
    }
  })

  return groups
}

const GROUPS = buildGroups(data.stations)

export default function MaintenanceCircuit() {
  const [quote]    = useState(pickQuote)
  const [sets, setSets] = useState({}) // { stationId: completedSets (0-3) }

  function toggleSet(stationId, setIndex, totalSets) {
    setSets(prev => {
      const current = prev[stationId] || 0
      // tap completed set = undo, tap next = complete
      const next = setIndex < current ? setIndex : setIndex + 1
      return { ...prev, [stationId]: Math.min(next, totalSets) }
    })
  }

  function completedSets(id) { return sets[id] || 0 }
  function isDone(id, total) { return completedSets(id) >= total }

  return (
    <div className={styles.page}>
      <FloatingTimer />

      {/* ── Header ── */}
      <div className={styles.header}>
        <h1 className={styles.title}>MAINTENANCE CIRCUIT</h1>
        <div className={styles.headerAccentLine} />
        {quote && <div className={styles.quote}>"{quote}"</div>}
        <div className={styles.headerFadeLine} />
        <div className={styles.meta}>16 stations · 7 pairs · 2 solo</div>
        <div className={styles.metaSub}>10–15s rest within pairs · 45–60s between pairs</div>
      </div>

      {/* ── Groups ── */}
      <div className={styles.groups}>
        {GROUPS.map((group, gi) => {
          if (group.type === 'solo') {
            const s = group.station
            const done = isDone(s.id, s.sets)
            return (
              <div key={`solo-${s.id}`} className={`${styles.card} ${done ? styles.cardDone : ''}`}>
                <div className={styles.cardTag}>SOLO</div>
                <StationRow s={s} completed={completedSets(s.id)} onSetTap={toggleSet} done={done} />
              </div>
            )
          }

          const [s1, s2] = group.stations
          const bothDone = isDone(s1.id, s1.sets) && isDone(s2.id, s2.sets)
          return (
            <div key={`pair-${group.pairId}`} className={`${styles.card} ${bothDone ? styles.cardDone : ''}`}>
              <div className={styles.cardTag}>PAIR {group.pairId}</div>
              <StationRow s={s1} completed={completedSets(s1.id)} onSetTap={toggleSet} done={isDone(s1.id, s1.sets)} />
              <div className={styles.restDivider}><span>rest 10–15s</span></div>
              <StationRow s={s2} completed={completedSets(s2.id)} onSetTap={toggleSet} done={isDone(s2.id, s2.sets)} />
            </div>
          )
        })}
      </div>

      <div className={styles.footer}>
        Tap a set button to mark it done · Use the timer for timed holds
      </div>
    </div>
  )
}

function StationRow({ s, completed, onSetTap, done }) {
  return (
    <div className={`${styles.station} ${done ? styles.stationDone : ''}`}>
      {/* Top row */}
      <div className={styles.stationTop}>
        <div className={styles.stationNum}>{s.id}</div>
        <div className={styles.stationInfo}>
          <div className={styles.stationName}>{s.name}</div>
          <div className={styles.stationReps}>
            {s.reps}
            {s.perSide && <span className={styles.sideBadge}>each side</span>}
            {s.format === 'timed' && <span className={styles.timedBadge}>⏱</span>}
          </div>
        </div>
      </div>

      {/* Description — always visible */}
      <div className={styles.stationDesc}>{s.description}</div>

      {/* Set tracker */}
      <div className={styles.setRow}>
        {Array.from({ length: s.sets }, (_, i) => {
          const filled = i < completed
          return (
            <button
              key={i}
              className={`${styles.setBtn} ${filled ? styles.setBtnDone : ''}`}
              onClick={() => onSetTap(s.id, i, s.sets)}
            >
              SET {i + 1}
            </button>
          )
        })}
        {done && <span className={styles.doneCheck}>✓</span>}
      </div>
    </div>
  )
}
