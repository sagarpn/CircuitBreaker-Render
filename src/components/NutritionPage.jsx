// CircuitBreaker v3.2 — Nutrition Tracker (90-day)
import React, { useState, useEffect, useMemo } from 'react'
import styles from './NutritionPage.module.css'

const PHASES = [
  { number: 1, label: 'Phase 1', start: '2026-08-17', end: '2026-09-15' },
  { number: 2, label: 'Phase 2', start: '2026-09-16', end: '2026-10-15' },
  { number: 3, label: 'Phase 3', start: '2026-10-16', end: '2026-11-14' },
]
const START_DATE = '2026-08-17'
const TOTAL_DAYS = 90

const WORKOUT_OPTIONS = ['', 'Orangetheory', 'Volleyball', 'Walk/light cardio', 'Strength (extra)', 'Rest day', 'Other']

function todayStr() {
  const d = new Date()
  return d.toISOString().slice(0,10)
}
function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric' })
}
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate()+n)
  return d.toISOString().slice(0,10)
}
function dayIndex(iso) {
  const start = new Date(START_DATE + 'T00:00:00')
  const d = new Date(iso + 'T00:00:00')
  return Math.floor((d-start)/86400000)
}
function currentPhase(iso) {
  const idx = dayIndex(iso)
  const day = idx + 1
  if (day <= 30) return PHASES[0]
  if (day <= 60) return PHASES[1]
  return PHASES[2]
}

async function api(path, opts={}) {
  const res = await fetch('/api/nutrition' + path, {
    ...opts,
    headers: { 'Content-Type':'application/json', 'x-nutrition-pin':'2233', ...(opts.headers||{}) }
  })
  if (!res.ok) { const e = await res.json().catch(()=>({error:'Request failed'})); throw new Error(e.error||'Request failed') }
  return res.json()
}

// ── PIN Gate ──────────────────────────────────────────────
function PinGate({ onUnlock }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  function submit(e) {
    e.preventDefault()
    if (pin === '2233') { onUnlock() }
    else { setError('Wrong PIN'); setPin('') }
  }

  return (
    <div className={styles.pinPage}>
      <div className={styles.pinCard}>
        <div className={styles.pinIcon}>🔒</div>
        <h2 className={styles.pinTitle}>NUTRITION TRACKER</h2>
        <p className={styles.pinSub}>Enter PIN to continue</p>
        <form onSubmit={submit}>
          <input
            type="password" inputMode="numeric" maxLength={4} autoFocus
            className={styles.pinInput}
            value={pin}
            onChange={e => { setPin(e.target.value.replace(/\D/g,'')); setError('') }}
            placeholder="••••"
          />
          {error && <div className={styles.pinError}>{error}</div>}
          <button type="submit" className={styles.pinBtn}>Unlock</button>
        </form>
      </div>
    </div>
  )
}

// ── Streak Calendar ──────────────────────────────────────
function StreakCalendar({ loggedDates }) {
  const days = useMemo(() => {
    const arr = []
    for (let i=0; i<TOTAL_DAYS; i++) {
      const iso = addDays(START_DATE, i)
      arr.push({ iso, logged: loggedDates.has(iso), isToday: iso === todayStr(), isFuture: iso > todayStr() })
    }
    return arr
  }, [loggedDates])

  const today = todayStr()
  const idx = Math.min(Math.max(dayIndex(today), 0), TOTAL_DAYS-1)

  return (
    <div className={styles.calendarWrap}>
      <div className={styles.calendarLegend}>
        <span><i className={styles.dotLogged}/> logged</span>
        <span><i className={styles.dotEmpty}/> not logged</span>
        <span><i className={styles.dotToday}/> today</span>
      </div>
      <div className={styles.calendarGrid}>
        {days.map((d, i) => (
          <div
            key={d.iso}
            className={`${styles.calDay}
              ${d.logged ? styles.calDayLogged : ''}
              ${d.isToday ? styles.calDayToday : ''}
              ${d.isFuture ? styles.calDayFuture : ''}`}
            title={`${fmtDate(d.iso)}${d.logged ? ' — logged' : ''}`}
          />
        ))}
      </div>
    </div>
  )
}

// ── Daily Tab ─────────────────────────────────────────────
function DailyTab({ settings, dailyLogs, refresh }) {
  const [date, setDate]   = useState(todayStr())
  const [protein, setProtein] = useState('')
  const [veg, setVeg]     = useState('')
  const [workout, setWorkout] = useState('')
  const [saving, setSaving] = useState(false)

  const target = settings?.protein_target_g || 170

  async function save() {
    setSaving(true)
    try {
      await api('/daily', { method:'POST', body: JSON.stringify({
        date, protein_g: protein ? parseInt(protein) : null,
        vegetables: veg || null, workout_type: workout || null
      })})
      setProtein(''); setVeg(''); setWorkout(''); setDate(todayStr())
      refresh()
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  async function del(id) {
    if (!confirm('Delete this entry?')) return
    await api('/daily/'+id, { method:'DELETE' })
    refresh()
  }

  const loggedDates = useMemo(() => new Set(
    dailyLogs.filter(d => d.protein_g && d.vegetables && d.workout_type).map(d => d.date)
  ), [dailyLogs])

  return (
    <div>
      <StreakCalendar loggedDates={loggedDates} />

      <div className={styles.formCard}>
        <h3 className={styles.formTitle}>Log Today</h3>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Date</span>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} className={styles.input} />
          </label>
          <label className={styles.field}>
            <span>Protein (g) · target {target}g</span>
            <input type="number" value={protein} onChange={e=>setProtein(e.target.value)} className={styles.input} placeholder="e.g. 175" />
            {protein && (
              <span className={parseInt(protein)>=target ? styles.pillHit : styles.pillMiss}>
                {parseInt(protein)>=target ? '✓ hit target' : `${target-parseInt(protein)}g under`}
              </span>
            )}
          </label>
          <label className={styles.field}>
            <span>Vegetables</span>
            <select value={veg} onChange={e=>setVeg(e.target.value)} className={styles.input}>
              <option value="">— not logged —</option>
              <option value="satisfied">Satisfied</option>
              <option value="not_satisfied">Not satisfied</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Workout</span>
            <select value={workout} onChange={e=>setWorkout(e.target.value)} className={styles.input}>
              {WORKOUT_OPTIONS.map(w => <option key={w} value={w}>{w || '— none logged —'}</option>)}
            </select>
          </label>
        </div>
        <button className={styles.saveBtn} onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save Day'}
        </button>
      </div>

      <div className={styles.historyCard}>
        <h3 className={styles.formTitle}>History</h3>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Date</th><th>Protein</th><th>Veg</th><th>Workout</th><th></th></tr>
            </thead>
            <tbody>
              {dailyLogs.map(d => (
                <tr key={d.id}>
                  <td>{fmtDate(d.date)}</td>
                  <td>
                    {d.protein_g ? `${d.protein_g}g` : '—'}
                    {d.protein_g && (
                      <span className={d.protein_g>=target ? styles.tagHit : styles.tagMiss}>
                        {d.protein_g>=target ? 'hit' : 'under'}
                      </span>
                    )}
                  </td>
                  <td>{d.vegetables === 'satisfied' ? '✓' : d.vegetables === 'not_satisfied' ? '✗' : '—'}</td>
                  <td>{d.workout_type || '—'}</td>
                  <td><button className={styles.delBtn} onClick={()=>del(d.id)}>✕</button></td>
                </tr>
              ))}
              {!dailyLogs.length && <tr><td colSpan={5} className={styles.emptyRow}>No entries yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Weekly Tab ────────────────────────────────────────────
function WeeklyTab({ weeklyLogs, refresh }) {
  const [weekEnding, setWeekEnding] = useState(todayStr())
  const [weight, setWeight] = useState('')
  const [beers, setBeers] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await api('/weekly', { method:'POST', body: JSON.stringify({
        week_ending: weekEnding, weight_lb: weight ? parseFloat(weight) : null,
        beers_count: beers ? parseInt(beers) : null
      })})
      setWeight(''); setBeers('')
      refresh()
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  async function del(id) {
    if (!confirm('Delete this entry?')) return
    await api('/weekly/'+id, { method:'DELETE' })
    refresh()
  }

  const sorted = [...weeklyLogs].sort((a,b)=> a.week_ending < b.week_ending ? -1 : 1)

  return (
    <div>
      <div className={styles.formCard}>
        <h3 className={styles.formTitle}>Weekly Weigh-In</h3>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Week ending</span>
            <input type="date" value={weekEnding} onChange={e=>setWeekEnding(e.target.value)} className={styles.input} />
          </label>
          <label className={styles.field}>
            <span>Weight (lb)</span>
            <input type="number" step="0.1" value={weight} onChange={e=>setWeight(e.target.value)} className={styles.input} placeholder="e.g. 214.5" />
          </label>
          <label className={styles.field}>
            <span>Beers this week</span>
            <input type="number" value={beers} onChange={e=>setBeers(e.target.value)} className={styles.input} placeholder="e.g. 3" />
          </label>
        </div>
        <button className={styles.saveBtn} onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save Week'}
        </button>
      </div>

      <div className={styles.historyCard}>
        <h3 className={styles.formTitle}>History</h3>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Week ending</th><th>Weight</th><th>Δ</th><th>Beers</th><th></th></tr></thead>
            <tbody>
              {weeklyLogs.map((w, i) => {
                const prevInSorted = sorted.findIndex(x=>x.id===w.id)
                const prev = sorted[prevInSorted-1]
                const delta = (prev && w.weight_lb && prev.weight_lb) ? (w.weight_lb - prev.weight_lb).toFixed(1) : null
                return (
                  <tr key={w.id}>
                    <td>{fmtDate(w.week_ending)}</td>
                    <td>{w.weight_lb ? `${w.weight_lb} lb` : '—'}</td>
                    <td>
                      {delta !== null ? (
                        <span className={delta<0 ? styles.tagHit : delta>0 ? styles.tagMiss : ''}>
                          {delta>0?'+':''}{delta} lb
                        </span>
                      ) : '—'}
                    </td>
                    <td>{w.beers_count ?? '—'}</td>
                    <td><button className={styles.delBtn} onClick={()=>del(w.id)}>✕</button></td>
                  </tr>
                )
              })}
              {!weeklyLogs.length && <tr><td colSpan={5} className={styles.emptyRow}>No entries yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── 30-Day Check-in Tab ──────────────────────────────────
function PhaseTab({ phases, settings, refresh }) {
  const [editing, setEditing] = useState({})
  const [saving, setSaving] = useState({})

  function getPhase(n) {
    return phases.find(p => p.phase_number === n) || {}
  }

  function fieldVal(n, key, fallback) {
    if (editing[n]?.[key] !== undefined) return editing[n][key]
    return getPhase(n)[key] ?? fallback ?? ''
  }

  function setField(n, key, val) {
    setEditing(prev => ({ ...prev, [n]: { ...prev[n], [key]: val } }))
  }

  async function save(n) {
    setSaving(prev => ({ ...prev, [n]: true }))
    try {
      await api('/phases', { method:'POST', body: JSON.stringify({
        phase_number: n,
        weight_lb: fieldVal(n,'weight_lb') ? parseFloat(fieldVal(n,'weight_lb')) : null,
        waist_in: fieldVal(n,'waist_in') ? parseFloat(fieldVal(n,'waist_in')) : null,
        notes: fieldVal(n,'notes','')
      })})
      setEditing(prev => ({ ...prev, [n]: undefined }))
      refresh()
    } catch(e) { alert(e.message) }
    setSaving(prev => ({ ...prev, [n]: false }))
  }

  const baseline = settings?.baseline_weight_lb || 217

  return (
    <div className={styles.phaseGrid}>
      {PHASES.map(p => {
        const w = fieldVal(p.number, 'weight_lb')
        const delta = w ? (parseFloat(w) - baseline).toFixed(1) : null
        return (
          <div key={p.number} className={styles.phaseCard}>
            <div className={styles.phaseHead}>
              <span className={styles.phaseLabel}>{p.label}</span>
              <span className={styles.phaseDates}>{fmtDate(p.start)} – {fmtDate(p.end)}</span>
            </div>
            <label className={styles.field}>
              <span>Weight (lb)</span>
              <input type="number" step="0.1" className={styles.input}
                value={w} onChange={e=>setField(p.number,'weight_lb',e.target.value)} placeholder="—" />
              {delta !== null && (
                <span className={delta<0 ? styles.pillHit : styles.pillMiss}>
                  {delta>0?'+':''}{delta} lb vs baseline
                </span>
              )}
            </label>
            <label className={styles.field}>
              <span>Waist (in)</span>
              <input type="number" step="0.1" className={styles.input}
                value={fieldVal(p.number,'waist_in')} onChange={e=>setField(p.number,'waist_in',e.target.value)} placeholder="—" />
            </label>
            <label className={styles.field}>
              <span>How this phase went</span>
              <textarea className={styles.textarea} rows={4}
                value={fieldVal(p.number,'notes')} onChange={e=>setField(p.number,'notes',e.target.value)}
                placeholder="Notes..." />
            </label>
            <button className={styles.saveBtn} onClick={()=>save(p.number)} disabled={saving[p.number]}>
              {saving[p.number] ? 'Saving...' : 'Save Phase'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ── Summary Tab ───────────────────────────────────────────
function SummaryTab({ dailyLogs, weeklyLogs, settings }) {
  const [reflection, setReflection] = useState(() => localStorage.getItem('nutrition_reflection') || '')

  const baseline = settings?.baseline_weight_lb || 217
  const sortedWeekly = [...weeklyLogs].sort((a,b)=> a.week_ending < b.week_ending ? -1 : 1)
  const latestWeight = sortedWeekly.length ? sortedWeekly[sortedWeekly.length-1].weight_lb : null
  const weightChange = latestWeight ? (latestWeight - baseline).toFixed(1) : null

  const proteinTarget = settings?.protein_target_g || 170
  const withProtein = dailyLogs.filter(d => d.protein_g)
  const proteinHitRate = withProtein.length ? Math.round(100 * withProtein.filter(d=>d.protein_g>=proteinTarget).length / withProtein.length) : 0

  const withVeg = dailyLogs.filter(d => d.vegetables)
  const vegRate = withVeg.length ? Math.round(100 * withVeg.filter(d=>d.vegetables==='satisfied').length / withVeg.length) : 0

  const workoutCount = dailyLogs.filter(d => d.workout_type && d.workout_type !== 'Rest day').length
  const totalBeers = weeklyLogs.reduce((s,w) => s + (w.beers_count||0), 0)
  const daysTracked = dailyLogs.length

  function saveReflection(v) {
    setReflection(v)
    localStorage.setItem('nutrition_reflection', v)
  }

  const stats = [
    { label: 'Weight Change', value: weightChange !== null ? `${weightChange>0?'+':''}${weightChange} lb` : '—', accent: weightChange < 0 },
    { label: 'Latest Weight', value: latestWeight ? `${latestWeight} lb` : '—' },
    { label: 'Protein Hit Rate', value: `${proteinHitRate}%`, accent: proteinHitRate >= 70 },
    { label: 'Veg Satisfied', value: `${vegRate}%`, accent: vegRate >= 70 },
    { label: 'Workouts Logged', value: workoutCount },
    { label: 'Total Beers', value: totalBeers },
    { label: 'Days Tracked', value: `${daysTracked} / ${TOTAL_DAYS}` },
  ]

  return (
    <div>
      <div className={styles.statsGrid}>
        {stats.map(s => (
          <div key={s.label} className={styles.statCard}>
            <div className={`${styles.statValue} ${s.accent ? styles.statAccent : ''}`}>{s.value}</div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>
      <div className={styles.formCard}>
        <h3 className={styles.formTitle}>Reflection</h3>
        <textarea
          className={styles.textarea} rows={6}
          value={reflection} onChange={e=>saveReflection(e.target.value)}
          placeholder="How's the 90 days going? What's working, what's not..."
        />
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────
export default function NutritionPage() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('nutrition_unlocked') === '1')
  const [tab, setTab] = useState('daily')
  const [dailyLogs, setDailyLogs]   = useState([])
  const [weeklyLogs, setWeeklyLogs] = useState([])
  const [phases, setPhases]         = useState([])
  const [settings, setSettings]     = useState(null)
  const [loading, setLoading]       = useState(true)

  function onUnlock() {
    sessionStorage.setItem('nutrition_unlocked','1')
    setUnlocked(true)
  }

  async function loadAll() {
    setLoading(true)
    try {
      const [d, w, p, s] = await Promise.all([
        api('/daily'), api('/weekly'), api('/phases'), api('/settings')
      ])
      setDailyLogs(d); setWeeklyLogs(w); setPhases(p); setSettings(s)
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { if (unlocked) loadAll() }, [unlocked])

  if (!unlocked) return <PinGate onUnlock={onUnlock} />

  const today = todayStr()
  const dayNum = Math.min(Math.max(dayIndex(today)+1, 1), TOTAL_DAYS)
  const phase = currentPhase(today)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerTag}>PERSONAL TRACKER · NOT SHARED</div>
        <h1 className={styles.title}>90-DAY NUTRITION</h1>
        <div className={styles.headerAccentLine} />
        <div className={styles.dayBadgeRow}>
          <span className={styles.dayBadge}>Day {dayNum} of {TOTAL_DAYS}</span>
          <span className={styles.phaseBadge}>{phase.label}</span>
        </div>
      </div>

      <div className={styles.tabs}>
        {[
          {k:'daily', label:'Daily'},
          {k:'weekly', label:'Weekly'},
          {k:'phases', label:'30-Day'},
          {k:'summary', label:'Summary'},
        ].map(t => (
          <button key={t.k}
            className={`${styles.tab} ${tab===t.k ? styles.tabActive : ''}`}
            onClick={()=>setTab(t.k)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {loading ? (
          <div className={styles.loading}>Loading...</div>
        ) : (
          <>
            {tab === 'daily'   && <DailyTab settings={settings} dailyLogs={dailyLogs} refresh={loadAll} />}
            {tab === 'weekly'  && <WeeklyTab weeklyLogs={weeklyLogs} refresh={loadAll} />}
            {tab === 'phases'  && <PhaseTab phases={phases} settings={settings} refresh={loadAll} />}
            {tab === 'summary' && <SummaryTab dailyLogs={dailyLogs} weeklyLogs={weeklyLogs} settings={settings} />}
          </>
        )}
      </div>
    </div>
  )
}
