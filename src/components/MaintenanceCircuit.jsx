// CircuitBreaker v3.2 — Maintenance Circuit
import React, { useState } from 'react'
import styles from './MaintenanceCircuit.module.css'
import data from '../data/maintenanceCircuit.json'
import FloatingTimer from './FloatingTimer'

function pickQuote() {
  return data.quotes[Math.floor(Math.random() * data.quotes.length)]
}

// ── Exercise classification ────────────────────────────────
const NO_EQUIPMENT = new Set([1,2,3,4,8,9,10,11,12,13,14,15,17])
const EQUIPMENT    = new Set([5,6,7,16])

const EQUIPMENT_NOTES = {
  5:  'chair or wall for balance',
  6:  'pull-up bar',
  7:  'wall or chair for balance',
  16: 'pull-up bar',
}

// Build pair groups from stations
function buildGroups(stations) {
  const pairMap = {}
  const soloMap = {}

  stations.forEach(s => {
    if (s.pairing === 'solo') {
      soloMap[s.id] = s
    } else {
      if (!pairMap[s.pairId]) pairMap[s.pairId] = []
      pairMap[s.pairId].push(s)
    }
  })

  const groups = []
  let soloInserted = false

  Object.keys(pairMap).sort((a,b)=>Number(a)-Number(b)).forEach(pid => {
    groups.push({ type:'pair', pairId:Number(pid), stations:pairMap[pid] })
    if (Number(pid)===1 && !soloInserted) {
      // insert stations 3 & 4 (solo) after pair 1
      [3,4].forEach(id => {
        if (soloMap[id]) groups.push({ type:'solo', station:soloMap[id] })
      })
      soloInserted = true
    }
  })

  return groups
}

// Split all stations into two lists maintaining pair/solo grouping
function buildSection(stations, idSet) {
  const sectionStations = stations.filter(s => idSet.has(s.id))

  // Rebuild pairs within this section
  const pairMap = {}
  const soloList = []

  sectionStations.forEach(s => {
    if (s.pairing === 'solo') {
      soloList.push({ type:'solo', station:s })
    } else {
      if (!pairMap[s.pairId]) pairMap[s.pairId] = []
      pairMap[s.pairId].push(s)
    }
  })

  const groups = []
  let soloInserted = false

  Object.keys(pairMap).sort((a,b)=>Number(a)-Number(b)).forEach(pid => {
    const pair = pairMap[pid]
    // only add pair if both stations are in this section
    if (pair.length === 2) {
      groups.push({ type:'pair', pairId:Number(pid), stations:pair })
    } else {
      // one station of the pair is in another section — show as solo
      pair.forEach(s => groups.push({ type:'solo', station:s }))
    }
    // insert solos after pair 1
    if (Number(pid)===1 && !soloInserted) {
      soloList.filter(g => [3,4].includes(g.station.id))
        .forEach(g => groups.push(g))
      soloInserted = true
    }
  })

  // Add remaining solos (not inserted above)
  soloList.filter(g => ![3,4].includes(g.station.id))
    .forEach(g => groups.push(g))

  return groups
}

const ALL_GROUPS_NO_EQ = buildSection(data.stations, NO_EQUIPMENT)
const ALL_GROUPS_EQ    = buildSection(data.stations, EQUIPMENT)

export default function MaintenanceCircuit() {
  const [quote]    = useState(pickQuote)
  const [sets, setSets] = useState({})
  const [activeTab, setActiveTab] = useState('noequip')

  function toggleSet(stationId, setIndex, totalSets) {
    setSets(prev => {
      const current = prev[stationId] || 0
      const next = setIndex < current ? setIndex : setIndex + 1
      return { ...prev, [stationId]: Math.min(next, totalSets) }
    })
  }

  function completedSets(id) { return sets[id] || 0 }
  function isDone(id, total) { return completedSets(id) >= total }

  const groups = activeTab === 'noequip' ? ALL_GROUPS_NO_EQ : ALL_GROUPS_EQ

  return (
    <div className={styles.page}>
      <FloatingTimer />

      {/* ── Header ── */}
      <div className={styles.header}>
        <h1 className={styles.title}>MAINTENANCE CIRCUIT</h1>
        <div className={styles.headerAccentLine} />
        {quote && <div className={styles.quote}>"{quote}"</div>}
        <div className={styles.headerFadeLine} />
        <div className={styles.meta}>17 stations · prehab · mobility · stability</div>
        <div className={styles.metaSub}>10–15s rest within pairs · 45–60s between pairs</div>
      </div>

      {/* ── Tabs ── */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab==='noequip' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('noequip')}
        >
          🟢 No Equipment
          <span className={styles.tabCount}>{NO_EQUIPMENT.size}</span>
        </button>
        <button
          className={`${styles.tab} ${activeTab==='equip' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('equip')}
        >
          🟡 With Equipment
          <span className={styles.tabCount}>{EQUIPMENT.size}</span>
        </button>
      </div>

      {/* ── Equipment note ── */}
      {activeTab === 'equip' && (
        <div className={styles.equipNote}>
          Needs: pull-up bar for #6 and #16 · chair or wall for #5 and #7
        </div>
      )}

      {/* ── Groups ── */}
      <div className={styles.groups}>
        {groups.map((group, gi) => {
          if (group.type === 'solo') {
            const s = group.station
            const done = isDone(s.id, s.sets)
            return (
              <div key={`solo-${s.id}`} className={`${styles.card} ${done ? styles.cardDone : ''}`}>
                <div className={styles.cardTag}>SOLO</div>
                <StationRow
                  s={s}
                  completed={completedSets(s.id)}
                  onSetTap={toggleSet}
                  done={done}
                  equipNote={EQUIPMENT_NOTES[s.id]}
                />
              </div>
            )
          }

          const [s1, s2] = group.stations
          const bothDone = isDone(s1.id, s1.sets) && isDone(s2.id, s2.sets)
          return (
            <div key={`pair-${group.pairId}`} className={`${styles.card} ${bothDone ? styles.cardDone : ''}`}>
              <div className={styles.cardTag}>PAIR {group.pairId}</div>
              <StationRow
                s={s1}
                completed={completedSets(s1.id)}
                onSetTap={toggleSet}
                done={isDone(s1.id, s1.sets)}
                equipNote={EQUIPMENT_NOTES[s1.id]}
              />
              <div className={styles.restDivider}><span>rest 10–15s</span></div>
              <StationRow
                s={s2}
                completed={completedSets(s2.id)}
                onSetTap={toggleSet}
                done={isDone(s2.id, s2.sets)}
                equipNote={EQUIPMENT_NOTES[s2.id]}
              />
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

function StationRow({ s, completed, onSetTap, done, equipNote }) {
  return (
    <div className={`${styles.station} ${done ? styles.stationDone : ''}`}>
      <div className={styles.stationTop}>
        <div className={styles.stationNum}>{s.id}</div>
        <div className={styles.stationInfo}>
          <div className={styles.stationName}>{s.name}</div>
          <div className={styles.stationReps}>
            {s.reps}
            {s.perSide && <span className={styles.sideBadge}>each side</span>}
            {s.format === 'timed' && <span className={styles.timedBadge}>⏱</span>}
            {equipNote && <span className={styles.equipBadge}>🪑 {equipNote}</span>}
          </div>
        </div>
      </div>
      <div className={styles.stationDesc}>{s.description}</div>
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
