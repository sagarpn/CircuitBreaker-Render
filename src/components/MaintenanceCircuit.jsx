import React, { useState, useEffect } from 'react'
import styles from './MaintenanceCircuit.module.css'
import data from '../data/maintenanceCircuit.json'
import FloatingTimer from './FloatingTimer'

function pickQuote() {
  return data.quotes[Math.floor(Math.random() * data.quotes.length)]
}

// Group stations into pairs and solos
function buildGroups(stations) {
  const groups = []
  const pairMap = {}

  stations.forEach(s => {
    if (s.pairing === 'solo') {
      groups.push({ type: 'solo', station: s })
    } else {
      if (!pairMap[s.pairId]) pairMap[s.pairId] = []
      pairMap[s.pairId].push(s)
    }
  })

  // Insert pairs in correct order
  const allGroups = []
  let soloIdx = 0
  const soloStations = stations.filter(s => s.pairing === 'solo')
  const insertSoloAfter = [1, 2] // insert solos after station ids 2 and 3

  stations.forEach(s => {
    if (s.pairing === 'pair' && s.pairPosition === 1) {
      const pair = pairMap[s.pairId]
      allGroups.push({ type: 'pair', pairId: s.pairId, stations: pair })
      // After pair 1, insert both solos
      if (s.pairId === 1) {
        soloStations.forEach(solo => {
          allGroups.push({ type: 'solo', station: solo })
        })
      }
    }
  })

  return allGroups
}

const GROUPS = buildGroups(data.stations)

export default function MaintenanceCircuit() {
  const [quote] = useState(pickQuote)
  const [done, setDone]   = useState({}) // { stationId: { set: n } }
  const [expanded, setExpanded] = useState({})

  function toggleExpand(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function markSet(stationId, totalSets) {
    setDone(prev => {
      const current = prev[stationId] || 0
      const next = current < totalSets ? current + 1 : 0
      return { ...prev, [stationId]: next }
    })
  }

  function allDone(stationId, totalSets) {
    return (done[stationId] || 0) >= totalSets
  }

  function setCount(stationId) {
    return done[stationId] || 0
  }

  return (
    <div className={styles.page}>
      <FloatingTimer />

      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>MAINTENANCE CIRCUIT</h1>
        <div className={styles.headerLine} />
        {quote && <div className={styles.quote}>"{quote}"</div>}
        <div className={styles.headerFadeLine} />
        <div className={styles.meta}>
          16 stations · 7 pairs · 2 solo · 3 sets each
        </div>
        <div className={styles.restNote}>
          10-15s rest within pairs · 45-60s rest between pairs
        </div>
      </div>

      {/* Groups */}
      <div className={styles.groups}>
        {GROUPS.map((group, gi) => {
          if (group.type === 'solo') {
            const s = group.station
            const done_count = setCount(s.id)
            const is_done = allDone(s.id, s.sets)
            return (
              <div key={`solo-${s.id}`} className={`${styles.card} ${styles.soloCard} ${is_done ? styles.cardDone : ''}`}>
                <div className={styles.cardLabel}>SOLO</div>
                <StationRow
                  station={s}
                  doneCount={done_count}
                  isDone={is_done}
                  expanded={expanded[s.id]}
                  onToggle={() => toggleExpand(s.id)}
                  onSetClick={() => markSet(s.id, s.sets)}
                />
              </div>
            )
          }

          // Pair
          const [s1, s2] = group.stations
          const done1 = setCount(s1.id)
          const done2 = setCount(s2.id)
          const bothDone = allDone(s1.id, s1.sets) && allDone(s2.id, s2.sets)

          return (
            <div key={`pair-${group.pairId}`} className={`${styles.card} ${bothDone ? styles.cardDone : ''}`}>
              <div className={styles.cardLabel}>PAIR {group.pairId}</div>
              <StationRow
                station={s1}
                doneCount={done1}
                isDone={allDone(s1.id, s1.sets)}
                expanded={expanded[s1.id]}
                onToggle={() => toggleExpand(s1.id)}
                onSetClick={() => markSet(s1.id, s1.sets)}
              />
              <div className={styles.pairDivider}>
                <span>10-15s rest</span>
              </div>
              <StationRow
                station={s2}
                doneCount={done2}
                isDone={allDone(s2.id, s2.sets)}
                expanded={expanded[s2.id]}
                onToggle={() => toggleExpand(s2.id)}
                onSetClick={() => markSet(s2.id, s2.sets)}
              />
            </div>
          )
        })}
      </div>

      {/* Bottom note */}
      <div className={styles.footer}>
        <p className={styles.footerNote}>
          Tap the set counter to track progress · Use the timer for timed holds
        </p>
      </div>
    </div>
  )
}

function StationRow({ station, doneCount, isDone, expanded, onToggle, onSetClick }) {
  const sets_arr = Array.from({ length: station.sets }, (_, i) => i < doneCount)

  return (
    <div className={`${styles.station} ${isDone ? styles.stationDone : ''}`}>
      <div className={styles.stationHead} onClick={onToggle}>
        <div className={styles.stationNum}>{station.id}</div>
        <div className={styles.stationInfo}>
          <div className={styles.stationName}>{station.name}</div>
          <div className={styles.stationMeta}>
            {station.reps}
            {station.perSide && <span className={styles.perSideBadge}>each side</span>}
            {station.format === 'timed' && <span className={styles.timedBadge}>⏱ timed</span>}
          </div>
        </div>
        <div className={styles.setDots} onClick={e => { e.stopPropagation(); onSetClick() }}>
          {sets_arr.map((done, i) => (
            <div key={i} className={`${styles.setDot} ${done ? styles.setDotDone : ''}`} />
          ))}
        </div>
        <span className={styles.chevron}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div className={styles.stationBody}>
          <p className={styles.stationDesc}>{station.description}</p>
          <div className={styles.setTracker}>
            <span className={styles.setTrackerLabel}>Sets:</span>
            {sets_arr.map((d, i) => (
              <button
                key={i}
                className={`${styles.setBtn} ${d ? styles.setBtnDone : ''}`}
                onClick={onSetClick}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
