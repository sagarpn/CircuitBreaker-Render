// CircuitBreaker v3.2 — Nutrition Tracker (90-day)
import React, { useState, useEffect, useMemo } from 'react'
import styles from './NutritionPage.module.css'
import foodDb from '../data/nutritionFoods.json'

const PHASES = [
  { number: 1, label: 'Day 30 Checkpoint', start: '2026-08-17', end: '2026-09-15' },
  { number: 2, label: 'Day 60 Checkpoint', start: '2026-09-16', end: '2026-10-15' },
  { number: 3, label: 'Day 90 Checkpoint', start: '2026-10-16', end: '2026-11-14' },
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
const OATS_FOOD = foodDb.proteins.find(f => f.id === 'overnight_oats')
const MANUAL_FOOD = foodDb.proteins.find(f => f.id === 'manual')
const PROTEIN_LIST = foodDb.proteins.filter(f => f.id !== 'overnight_oats' && f.id !== 'manual')

function FoodSection({ title, kind, foodList, date, onAdded }) {
  const [foodId, setFoodId] = useState('')
  const [amount, setAmount] = useState('')
  const [oatsChecked, setOatsChecked] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualProtein, setManualProtein] = useState('')
  const [manualCarbs, setManualCarbs] = useState('')
  const [saving, setSaving] = useState(false)
  const [warn, setWarn] = useState('')

  const food = foodList.find(f => f.id === foodId)
  const isUnitFood = food && food.unit === 'unit'

  const preview = useMemo(() => {
    if (manualOpen) return { protein: parseFloat(manualProtein)||0, carbs: parseFloat(manualCarbs)||0 }
    if (oatsChecked && kind==='protein') return { protein: OATS_FOOD.protein_per_unit, carbs: OATS_FOOD.carbs_per_unit }
    if (!food) return null
    if (isUnitFood) {
      const units = parseFloat(amount) || 0
      return { protein: round1(units * food.protein_per_unit), carbs: round1(units * (food.carbs_per_unit||0)) }
    }
    const g = parseFloat(amount) || 0
    return { protein: round1(g * (food.protein_per100||0) / 100), carbs: round1(g * (food.carbs_per100||0) / 100) }
  }, [food, amount, manualProtein, manualCarbs, manualOpen, oatsChecked, isUnitFood, kind])

  async function addEntry() {
    setWarn('')
    let name, amt, unit
    if (manualOpen) {
      if (!manualName.trim()) { setWarn('Enter a name for this food'); return }
      if (!manualProtein && !manualCarbs) { setWarn('Enter protein or carb grams'); return }
      name = manualName.trim(); amt = 1; unit = 'manual'
    } else if (oatsChecked) {
      name = OATS_FOOD.name; amt = 1; unit = 'unit'
    } else {
      if (!food) { setWarn('Pick a food first'); return }
      if (!amount || parseFloat(amount) <= 0) { setWarn(`Add the amount for ${food.name}`); return }
      name = food.name; amt = parseFloat(amount); unit = food.unit
    }
    setSaving(true)
    try {
      await api('/entries', { method:'POST', body: JSON.stringify({
        date, food_id: manualOpen ? 'manual' : (oatsChecked ? 'overnight_oats' : food.id),
        food_name: name, amount: amt, unit,
        protein_g: preview.protein, carbs_g: preview.carbs
      })})
      setFoodId(''); setAmount(''); setOatsChecked(false)
      setManualOpen(false); setManualName(''); setManualProtein(''); setManualCarbs('')
      onAdded()
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  return (
    <div className={styles.foodSection}>
      <h4 className={styles.foodSectionTitle}>{title}</h4>

      {kind === 'protein' && (
        <label className={styles.oatsCheck}>
          <input type="checkbox" checked={oatsChecked}
            onChange={e => { setOatsChecked(e.target.checked); if(e.target.checked){ setFoodId(''); setManualOpen(false) } }} />
          <span>🥣 Overnight Oats (1 serving) — auto-calculated</span>
        </label>
      )}
      {oatsChecked && <div className={styles.foodNote}>{OATS_FOOD.note}</div>}

      {!oatsChecked && !manualOpen && (
        <>
          <select value={foodId} onChange={e=>{setFoodId(e.target.value); setAmount(''); setWarn('')}} className={styles.input}>
            <option value="">— pick a {kind} —</option>
            {foodList.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>

          {food && isUnitFood && (
            <label className={styles.field}>
              <span>How many</span>
              <input type="number" step="1" className={styles.input} value={amount}
                onChange={e=>{setAmount(e.target.value); setWarn('')}} placeholder="e.g. 1" />
            </label>
          )}
          {food && !isUnitFood && (
            <label className={styles.field}>
              <span>Amount (grams, cooked weight)</span>
              <input type="number" className={styles.input} value={amount}
                onChange={e=>{setAmount(e.target.value); setWarn('')}} placeholder="e.g. 200" />
            </label>
          )}
        </>
      )}

      {!oatsChecked && (
        <button className={styles.manualToggle} onClick={()=>{setManualOpen(v=>!v); setFoodId(''); setWarn('')}}>
          {manualOpen ? '← back to food list' : '+ Manual entry (type grams directly)'}
        </button>
      )}

      {manualOpen && (
        <div className={styles.manualBox}>
          <label className={styles.field}>
            <span>Food name</span>
            <input type="text" className={styles.input} value={manualName}
              onChange={e=>{setManualName(e.target.value); setWarn('')}} placeholder="e.g. Turkey burger" />
          </label>
          <div className={styles.formGrid2}>
            <label className={styles.field}>
              <span>Protein (g)</span>
              <input type="number" className={styles.input} value={manualProtein}
                onChange={e=>{setManualProtein(e.target.value); setWarn('')}} placeholder="e.g. 25" />
            </label>
            <label className={styles.field}>
              <span>Carbs (g)</span>
              <input type="number" className={styles.input} value={manualCarbs}
                onChange={e=>{setManualCarbs(e.target.value); setWarn('')}} placeholder="e.g. 10" />
            </label>
          </div>
        </div>
      )}

      {preview && (preview.protein > 0 || preview.carbs > 0) && (
        <div className={styles.previewRow}>
          <span className={styles.previewPill}>{preview.protein}g protein</span>
          <span className={styles.previewPillCarb}>{preview.carbs}g carbs</span>
        </div>
      )}

      {warn && <div className={styles.warnText}>⚠ {warn}</div>}

      <button className={styles.addBtn} onClick={addEntry} disabled={saving}>
        {saving ? 'Adding...' : `+ Add ${kind === 'protein' ? 'Protein' : 'Carb'}`}
      </button>
    </div>
  )
}

// ── Entry row with inline edit ────────────────────────────
function EntryRow({ entry, onDeleted, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(entry.amount)
  const [protein, setProtein] = useState(entry.protein_g)
  const [carbs, setCarbs] = useState(entry.carbs_g)
  const [saving, setSaving] = useState(false)

  const origFood = ALL_FOODS.find(f => f.id === entry.food_id)

  useEffect(() => {
    if (!editing || !origFood || origFood.unit === 'manual') return
    const amt = parseFloat(amount) || 0
    if (origFood.unit === 'unit') {
      setProtein(round1(amt * (origFood.protein_per_unit||0)))
      setCarbs(round1(amt * (origFood.carbs_per_unit||0)))
    } else if (origFood.unit === 'g') {
      setProtein(round1(amt * (origFood.protein_per100||0) / 100))
      setCarbs(round1(amt * (origFood.carbs_per100||0) / 100))
    }
  }, [amount, editing])

  async function del() {
    await api('/entries/'+entry.id, { method:'DELETE' })
    onDeleted()
  }

  async function save() {
    setSaving(true)
    try {
      await api('/entries/'+entry.id, { method:'DELETE' })
      await api('/entries', { method:'POST', body: JSON.stringify({
        date: entry.date, food_id: entry.food_id, food_name: entry.food_name,
        amount: parseFloat(amount)||0, unit: entry.unit,
        protein_g: parseFloat(protein)||0, carbs_g: parseFloat(carbs)||0
      })})
      setEditing(false)
      onSaved()
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  if (editing) {
    return (
      <div className={styles.entryEditBox}>
        <span className={styles.entryName}>{entry.food_name}</span>
        {entry.unit !== 'manual' && (
          <label className={styles.field}>
            <span>{entry.unit === 'unit' ? 'How many' : 'Grams'}</span>
            <input type="number" className={styles.input} value={amount} onChange={e=>setAmount(e.target.value)} />
          </label>
        )}
        <div className={styles.formGrid2}>
          <label className={styles.field}>
            <span>Protein (g)</span>
            <input type="number" className={styles.input} value={protein} onChange={e=>setProtein(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Carbs (g)</span>
            <input type="number" className={styles.input} value={carbs} onChange={e=>setCarbs(e.target.value)} />
          </label>
        </div>
        <div className={styles.entryEditBtns}>
          <button className={styles.saveBtnSmall} onClick={save} disabled={saving}>{saving?'Saving...':'Save'}</button>
          <button className={styles.cancelBtn} onClick={()=>setEditing(false)}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.entryRow}>
      <div className={styles.entryInfo}>
        <span className={styles.entryName}>{entry.food_name}</span>
        <span className={styles.entryAmount}>
          {entry.unit === 'unit' ? `× ${entry.amount}` : entry.unit === 'manual' ? 'manual' : `${entry.amount}g`} · {entry.protein_g}g P / {entry.carbs_g}g C
        </span>
      </div>
      <div className={styles.entryBtns}>
        <button className={styles.editBtn} onClick={()=>setEditing(true)}>✎</button>
        <button className={styles.delBtn} onClick={del}>✕</button>
      </div>
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

      {/* Food log — split protein / carbs */}
      <div className={styles.formCard}>
        <h3 className={styles.formTitle}>Add Food — {fmtDate(date)}</h3>
        <FoodSection title="Protein" kind="protein" foodList={PROTEIN_LIST} date={date} onAdded={refresh} />
        <div className={styles.foodDivider} />
        <FoodSection title="Carbs" kind="carb" foodList={foodDb.carbs} date={date} onAdded={refresh} />
      </div>

      {/* History for selected day — editable */}
      {dayEntries.length > 0 && (
        <div className={styles.historyCard}>
          <h3 className={styles.formTitle}>History — {fmtDate(date)}</h3>
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
              <EntryRow key={e.id} entry={e} onDeleted={refresh} onSaved={refresh} />
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
          {k:'phases', label:'Checkpoints'},
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
