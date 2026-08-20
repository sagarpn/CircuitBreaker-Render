// CircuitBreaker v3.2 — Nutrition Tracker (90-day)
import React, { useState, useEffect, useMemo } from 'react'
import styles from './NutritionPage.module.css'
import foodDb from '../data/nutritionFoods.json'

const PHASES = [
  { number: 1, label: 'Phase 1', start: '2026-08-17', end: '2026-09-15' },
  { number: 2, label: 'Phase 2', start: '2026-09-16', end: '2026-10-15' },
  { number: 3, label: 'Phase 3', start: '2026-10-16', end: '2026-11-14' },
]
const START_DATE = '2026-08-17'
const TOTAL_DAYS = 90
const WORKOUT_OPTIONS = ['', 'Orangetheory', 'Volleyball', 'Walk/light cardio', 'Strength (extra)', 'Rest day', 'Other']

function todayStr() {
  return new Date().toISOString().slice(0,10)
}
function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric' })
}
function fmtDateFull(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })
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
  const day = dayIndex(iso) + 1
  if (day <= 30) return PHASES[0]
  if (day <= 60) return PHASES[1]
  return PHASES[2]
}
function round1(n) { return Math.round(n*10)/10 }

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
    if (pin === '2233') onUnlock()
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

// ── Compact streak calendar — small dot grid ──────────────
function StreakCalendar({ loggedDates }) {
  const today = todayStr()
  const days = useMemo(() => {
    const arr = []
    for (let i=0; i<TOTAL_DAYS; i++) {
      const iso = addDays(START_DATE, i)
      arr.push({ iso, logged: loggedDates.has(iso), isToday: iso===today, isFuture: iso>today })
    }
    return arr
  }, [loggedDates, today])

  const loggedCount = days.filter(d=>d.logged).length

  return (
    <div className={styles.calendarWrap}>
      <div className={styles.calendarCount}>{loggedCount}/{TOTAL_DAYS}</div>
      <div className={styles.calendarGrid}>
        {days.map(d => (
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

// ── Food entry picker ─────────────────────────────────────
const ALL_FOODS = [...foodDb.proteins, ...foodDb.carbs]

function FoodEntryForm({ date, onAdded }) {
  const [foodId, setFoodId] = useState('')
  const [amount, setAmount] = useState('')
  const [manualProtein, setManualProtein] = useState('')
  const [manualCarbs, setManualCarbs] = useState('')
  const [saving, setSaving] = useState(false)

  const food = ALL_FOODS.find(f => f.id === foodId)
  const isManual = foodId === 'manual'
  const isUnitFood = food && food.unit === 'unit'

  const preview = useMemo(() => {
    if (!food) return null
    if (isManual) {
      return { protein: parseFloat(manualProtein)||0, carbs: parseFloat(manualCarbs)||0 }
    }
    if (isUnitFood) {
      const units = parseFloat(amount) || 0
      return { protein: round1(units * food.protein_per_unit), carbs: round1(units * (food.carbs_per_unit||0)) }
    }
    const g = parseFloat(amount) || 0
    return {
      protein: round1(g * (food.protein_per100||0) / 100),
      carbs: round1(g * (food.carbs_per100||0) / 100)
    }
  }, [food, amount, manualProtein, manualCarbs, isManual, isUnitFood])

  async function addEntry() {
    if (!food) return
    setSaving(true)
    try {
      const amt = isManual ? 1 : (parseFloat(amount)||0)
      await api('/entries', { method:'POST', body: JSON.stringify({
        date,
        food_id: food.id,
        food_name: food.name,
        amount: amt,
        unit: food.unit,
        protein_g: preview.protein,
        carbs_g: preview.carbs
      })})
      setFoodId(''); setAmount(''); setManualProtein(''); setManualCarbs('')
      onAdded()
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  return (
    <div className={styles.foodEntryForm}>
      <label className={styles.field}>
        <span>Food</span>
        <select value={foodId} onChange={e=>{setFoodId(e.target.value); setAmount('')}} className={styles.input}>
          <option value="">— pick a food —</option>
          <optgroup label="Protein">
            {foodDb.proteins.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </optgroup>
          <optgroup label="Carbs">
            {foodDb.carbs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </optgroup>
        </select>
      </label>

      {food && food.note && <div className={styles.foodNote}>{food.note}</div>}

      {food && isManual && (
        <div className={styles.formGrid2}>
          <label className={styles.field}>
            <span>Protein (g)</span>
            <input type="number" className={styles.input} value={manualProtein}
              onChange={e=>setManualProtein(e.target.value)} placeholder="e.g. 25" />
          </label>
          <label className={styles.field}>
            <span>Carbs (g)</span>
            <input type="number" className={styles.input} value={manualCarbs}
              onChange={e=>setManualCarbs(e.target.value)} placeholder="e.g. 10" />
          </label>
        </div>
      )}

      {food && isUnitFood && (
        <label className={styles.field}>
          <span>How many {food.unit === 'unit' ? '(units)' : ''}</span>
          <input type="number" step="1" className={styles.input} value={amount}
            onChange={e=>setAmount(e.target.value)} placeholder="e.g. 1" />
        </label>
      )}

      {food && !isManual && !isUnitFood && (
        <label className={styles.field}>
          <span>Amount (grams, cooked weight)</span>
          <input type="number" className={styles.input} value={amount}
            onChange={e=>setAmount(e.target.value)} placeholder="e.g. 200" />
        </label>
      )}

      {food && preview && (preview.protein > 0 || preview.carbs > 0) && (
        <div className={styles.previewRow}>
          <span className={styles.previewPill}>{preview.protein}g protein</span>
          <span className={styles.previewPillCarb}>{preview.carbs}g carbs</span>
        </div>
      )}

      <button className={styles.addBtn} onClick={addEntry} disabled={!food || saving}>
        {saving ? 'Adding...' : '+ Add Entry'}
      </button>
    </div>
  )
}

// ── Daily tab ──────────────────────────────────────────────
function DailyTab({ settings, dailyLogs, entries, water, refresh }) {
  const [date, setDate]   = useState(todayStr())
  const [veg, setVeg]     = useState('')
  const [workout, setWorkout] = useState('')
  const [waterOz, setWaterOz] = useState('')
  const [savingMeta, setSavingMeta] = useState(false)
  const [savingWater, setSavingWater] = useState(false)

  const target = settings?.protein_target_g || 170
  const waterTarget = settings?.water_target_oz || 100

  const existingDaily = dailyLogs.find(d => d.date === date)
  const existingWater = water.find(w => w.date === date)
  const isEditingDay = !!existingDaily || !!existingWater

  // Load existing values into form when date changes
  useEffect(() => {
    setVeg(existingDaily?.vegetables || '')
    setWorkout(existingDaily?.workout_type || '')
    setWaterOz(existingWater?.ounces != null ? String(existingWater.ounces) : '')
  }, [date, existingDaily, existingWater])

  const dayEntries = useMemo(() =>
    entries.filter(e => e.date === date).sort((a,b)=> new Date(b.created_at)-new Date(a.created_at))
  , [entries, date])

  const dayTotals = useMemo(() => {
    const protein = dayEntries.reduce((s,e)=> s + parseFloat(e.protein_g||0), 0)
    const carbs   = dayEntries.reduce((s,e)=> s + parseFloat(e.carbs_g||0), 0)
    return { protein: round1(protein), carbs: round1(carbs) }
  }, [dayEntries])

  async function saveMeta() {
    setSavingMeta(true)
    try {
      await api('/daily', { method:'POST', body: JSON.stringify({
        date, protein_g: Math.round(dayTotals.protein) || null,
        vegetables: veg || null, workout_type: workout || null
      })})
      refresh()
    } catch(e) { alert(e.message) }
    setSavingMeta(false)
  }

  async function saveWater() {
    setSavingWater(true)
    try {
      await api('/water', { method:'POST', body: JSON.stringify({ date, ounces: parseFloat(waterOz)||0 })})
      refresh()
    } catch(e) { alert(e.message) }
    setSavingWater(false)
  }

  async function delEntry(id) {
    await api('/entries/'+id, { method:'DELETE' })
    refresh()
  }

  const loggedDates = useMemo(() => {
    const set = new Set()
    const byDate = {}
    entries.forEach(e => {
      if (!byDate[e.date]) byDate[e.date] = { protein:0 }
      byDate[e.date].protein += parseFloat(e.protein_g||0)
    })
    dailyLogs.forEach(d => {
      const hasProtein = (byDate[d.date]?.protein || 0) > 0
      if (hasProtein && d.vegetables && d.workout_type) set.add(d.date)
    })
    return set
  }, [entries, dailyLogs])

  return (
    <div>
      <StreakCalendar loggedDates={loggedDates} />

      {/* Date picker + edit indicator */}
      <div className={styles.dateCard}>
        <label className={styles.field}>
          <span>Date</span>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} className={styles.input} />
        </label>
        {isEditingDay && (
          <div className={styles.editingBadge}>✎ Editing {fmtDateFull(date)} — already has data, changes will update it</div>
        )}
      </div>

      {/* Food log */}
      <div className={styles.formCard}>
        <h3 className={styles.formTitle}>Add Food — {fmtDate(date)}</h3>
        <FoodEntryForm date={date} onAdded={refresh} />
      </div>

      {/* Today's entries list */}
      {dayEntries.length > 0 && (
        <div className={styles.historyCard}>
          <div className={styles.dayTotalsRow}>
            <div className={styles.dayTotal}>
              <span className={styles.dayTotalVal}>{dayTotals.protein}g</span>
              <span className={styles.dayTotalLabel}>protein</span>
              {dayTotals.protein >= target
                ? <span className={styles.pillHit}>✓ hit {target}g</span>
                : <span className={styles.pillMiss}>{round1(target-dayTotals.protein)}g to go</span>}
            </div>
            <div className={styles.dayTotal}>
              <span className={styles.dayTotalVal}>{dayTotals.carbs}g</span>
              <span className={styles.dayTotalLabel}>carbs</span>
            </div>
          </div>
          <div className={styles.entryList}>
            {dayEntries.map(e => (
              <div key={e.id} className={styles.entryRow}>
                <div className={styles.entryInfo}>
                  <span className={styles.entryName}>{e.food_name}</span>
                  <span className={styles.entryAmount}>
                    {e.unit === 'unit' ? `× ${e.amount}` : `${e.amount}g`} · {e.protein_g}g P / {e.carbs_g}g C
                  </span>
                </div>
                <button className={styles.delBtn} onClick={()=>delEntry(e.id)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Water */}
      <div className={styles.formCard}>
        <h3 className={styles.formTitle}>Water — {fmtDate(date)}</h3>
        <div className={styles.formGrid2}>
          <label className={styles.field}>
            <span>Ounces · target {waterTarget}oz</span>
            <input type="number" className={styles.input} value={waterOz}
              onChange={e=>setWaterOz(e.target.value)} placeholder="e.g. 80" />
          </label>
          <button className={styles.saveBtnSmall} onClick={saveWater} disabled={savingWater}>
            {savingWater ? 'Saving...' : existingWater ? 'Update Water' : 'Save Water'}
          </button>
        </div>
      </div>

      {/* Veg + workout */}
      <div className={styles.formCard}>
        <h3 className={styles.formTitle}>Vegetables &amp; Workout</h3>
        <div className={styles.formGrid2}>
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
        <button className={styles.saveBtn} onClick={saveMeta} disabled={savingMeta}>
          {savingMeta ? 'Saving...' : isEditingDay ? 'Update Day' : 'Save Day'}
        </button>
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

  const existing = weeklyLogs.find(w => w.week_ending === weekEnding)
  useEffect(() => {
    setWeight(existing?.weight_lb != null ? String(existing.weight_lb) : '')
    setBeers(existing?.beers_count != null ? String(existing.beers_count) : '')
  }, [weekEnding, existing])

  async function save() {
    setSaving(true)
    try {
      await api('/weekly', { method:'POST', body: JSON.stringify({
        week_ending: weekEnding, weight_lb: weight ? parseFloat(weight) : null,
        beers_count: beers ? parseInt(beers) : null
      })})
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
        {existing && <div className={styles.editingBadge}>✎ Editing week of {fmtDateFull(weekEnding)}</div>}
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
          {saving ? 'Saving...' : existing ? 'Update Week' : 'Save Week'}
        </button>
      </div>

      <div className={styles.historyCard}>
        <h3 className={styles.formTitle}>History</h3>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Week ending</th><th>Weight</th><th>Δ</th><th>Beers</th><th></th></tr></thead>
            <tbody>
              {weeklyLogs.map(w => {
                const idx = sorted.findIndex(x=>x.id===w.id)
                const prev = sorted[idx-1]
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

  function getPhase(n) { return phases.find(p => p.phase_number === n) || {} }
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
        const hasData = !!getPhase(p.number).id
        return (
          <div key={p.number} className={styles.phaseCard}>
            <div className={styles.phaseHead}>
              <span className={styles.phaseLabel}>{p.label}</span>
              <span className={styles.phaseDates}>{fmtDate(p.start)} – {fmtDate(p.end)}</span>
            </div>
            {hasData && <div className={styles.editingBadge}>✎ Has saved data — editing will update it</div>}
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
              {saving[p.number] ? 'Saving...' : hasData ? 'Update Phase' : 'Save Phase'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ── Summary Tab ───────────────────────────────────────────
function SummaryTab({ dailyLogs, weeklyLogs, entries, water, settings }) {
  const [reflection, setReflection] = useState(() => localStorage.getItem('nutrition_reflection') || '')

  const baseline = settings?.baseline_weight_lb || 217
  const sortedWeekly = [...weeklyLogs].sort((a,b)=> a.week_ending < b.week_ending ? -1 : 1)
  const latestWeight = sortedWeekly.length ? sortedWeekly[sortedWeekly.length-1].weight_lb : null
  const weightChange = latestWeight ? (latestWeight - baseline).toFixed(1) : null

  const proteinTarget = settings?.protein_target_g || 170
  const proteinByDate = useMemo(() => {
    const m = {}
    entries.forEach(e => { m[e.date] = (m[e.date]||0) + parseFloat(e.protein_g||0) })
    return m
  }, [entries])
  const datesWithProtein = Object.keys(proteinByDate)
  const proteinHitRate = datesWithProtein.length
    ? Math.round(100 * datesWithProtein.filter(d=>proteinByDate[d]>=proteinTarget).length / datesWithProtein.length)
    : 0

  const withVeg = dailyLogs.filter(d => d.vegetables)
  const vegRate = withVeg.length ? Math.round(100 * withVeg.filter(d=>d.vegetables==='satisfied').length / withVeg.length) : 0

  const workoutCount = dailyLogs.filter(d => d.workout_type && d.workout_type !== 'Rest day').length
  const totalBeers = weeklyLogs.reduce((s,w) => s + (w.beers_count||0), 0)
  const daysTracked = new Set([...datesWithProtein, ...dailyLogs.map(d=>d.date), ...water.map(w=>w.date)]).size
  const avgWater = water.length ? round1(water.reduce((s,w)=>s+parseFloat(w.ounces||0),0) / water.length) : 0

  function saveReflection(v) {
    setReflection(v)
    localStorage.setItem('nutrition_reflection', v)
  }

  const stats = [
    { label: 'Weight Change', value: weightChange !== null ? `${weightChange>0?'+':''}${weightChange} lb` : '—', accent: weightChange < 0 },
    { label: 'Latest Weight', value: latestWeight ? `${latestWeight} lb` : '—' },
    { label: 'Protein Hit Rate', value: `${proteinHitRate}%`, accent: proteinHitRate >= 70 },
    { label: 'Veg Satisfied', value: `${vegRate}%`, accent: vegRate >= 70 },
    { label: 'Avg Water', value: `${avgWater}oz` },
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
  const [entries, setEntries]       = useState([])
  const [water, setWater]           = useState([])
  const [weeklyLogs, setWeeklyLogs] = useState([])
  const [phases, setPhases]         = useState([])
  const [settings, setSettings]     = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')

  function onUnlock() {
    sessionStorage.setItem('nutrition_unlocked','1')
    setUnlocked(true)
  }

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const [d, en, wt, w, p, s] = await Promise.all([
        api('/daily'), api('/entries'), api('/water'), api('/weekly'), api('/phases'), api('/settings')
      ])
      setDailyLogs(d); setEntries(en); setWater(wt); setWeeklyLogs(w); setPhases(p); setSettings(s)
    } catch(e) {
      setError('Could not load data. Your saved entries are safe — check your connection and reload.')
      console.error(e)
    }
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
        {error && <div className={styles.errorBanner}>{error} <button onClick={loadAll} className={styles.retryBtn}>Retry</button></div>}
        {loading ? (
          <div className={styles.loading}>Loading...</div>
        ) : (
          <>
            {tab === 'daily'   && <DailyTab settings={settings} dailyLogs={dailyLogs} entries={entries} water={water} refresh={loadAll} />}
            {tab === 'weekly'  && <WeeklyTab weeklyLogs={weeklyLogs} refresh={loadAll} />}
            {tab === 'phases'  && <PhaseTab phases={phases} settings={settings} refresh={loadAll} />}
            {tab === 'summary' && <SummaryTab dailyLogs={dailyLogs} weeklyLogs={weeklyLogs} entries={entries} water={water} settings={settings} />}
          </>
        )}
      </div>
    </div>
  )
}
