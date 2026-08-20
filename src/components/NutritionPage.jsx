// CircuitBreaker v3.2 — Nutrition Tracker (90-day)
import React, { useState, useEffect, useMemo } from 'react'
import styles from './NutritionPage.module.css'
import foodDb from '../data/nutritionFoods.json'

const PHASES = [
  { number: 1, label: 'Day 30 Checkpoint', start: '2026-08-17', end: '2026-09-15' },
  { number: 2, label: 'Day 60 Checkpoint', start: '2026-09-16', end: '2026-10-15' },
  { number: 3, label: 'Day 90 Checkpoint', start: '2026-10-16', end: '2026-11-14' },
]
const PHASE_TARGETS = {
  1: { name: 'Foundation',    protein: 170, carbs: 225, calories: 2500, workouts: 3 },
  2: { name: 'Tightening',    protein: 175, carbs: 200, calories: 2300, workouts: 4 },
  3: { name: 'Optimization',  protein: 185, carbs: 175, calories: 2100, workouts: 5 },
}
const WORKOUT_INTENSITY = {
  'Rest day': 0,
  'Walk/light cardio': 1,
  'Other': 2,
  'Strength (extra)': 3,
  'Volleyball': 3,
  'Orangetheory': 4,
}
const INTENSITY_LABELS = ['None', 'Low', 'Normal', 'High', 'Very Intense']
const START_DATE = '2026-08-17'
const TOTAL_DAYS = 90
const WORKOUT_OPTIONS = ['', 'Orangetheory', 'Volleyball', 'Walk/light cardio', 'Strength (extra)', 'Rest day', 'Other']

function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth()+1).padStart(2,'0')
  const day = String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${day}`
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

// Compute averages for a date range [startIso, endIso] inclusive
function rangeAverages(entries, dailyLogs, startIso, endIso) {
  const byDate = {}
  entries.forEach(e => {
    if (e.date < startIso || e.date > endIso) return
    if (!byDate[e.date]) byDate[e.date] = { protein: 0, carbs: 0, extraCal: 0 }
    byDate[e.date].protein += parseFloat(e.protein_g||0)
    byDate[e.date].carbs += parseFloat(e.carbs_g||0)
    byDate[e.date].extraCal += parseFloat(e.extra_calories||0)
  })
  const dates = Object.keys(byDate)
  const days = dates.length
  const avgProtein = days ? round1(dates.reduce((s,d)=>s+byDate[d].protein,0)/days) : 0
  const avgCarbs = days ? round1(dates.reduce((s,d)=>s+byDate[d].carbs,0)/days) : 0
  const avgExtraCal = days ? round1(dates.reduce((s,d)=>s+byDate[d].extraCal,0)/days) : 0
  const avgCalories = round1(avgProtein*4 + avgCarbs*4 + avgExtraCal)

  const logsInRange = dailyLogs.filter(d => d.date >= startIso && d.date <= endIso)
  const workoutCount = logsInRange.filter(d => d.workout_type && d.workout_type !== 'Rest day').length

  const drinksCount = entries
    .filter(e => e.date >= startIso && e.date <= endIso && DRINK_IDS.has(e.food_id))
    .reduce((s,e)=> s + parseFloat(e.amount||0), 0)

  const intensityVals = logsInRange
    .map(d => WORKOUT_INTENSITY[d.workout_type])
    .filter(v => v !== undefined)
  const avgIntensity = intensityVals.length
    ? Math.round(intensityVals.reduce((a,b)=>a+b,0)/intensityVals.length)
    : null

  return { avgProtein, avgCarbs, avgCalories, workoutCount, drinksCount, avgIntensity, daysWithData: days }
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
function StreakCalendar({ loggedDates, phaseStart, phaseNumber }) {
  const today = todayStr()
  const days = useMemo(() => {
    const arr = []
    for (let i=0; i<30; i++) {
      const iso = addDays(phaseStart, i)
      arr.push({ iso, logged: loggedDates.has(iso), isToday: iso===today, isFuture: iso>today })
    }
    return arr
  }, [loggedDates, today, phaseStart])

  const loggedCount = days.filter(d=>d.logged).length

  return (
    <div className={styles.calendarWrap}>
      <div className={styles.calendarCount}>P{phaseNumber} · {loggedCount}/30</div>
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
const DRINKS_LIST = foodDb.drinks || []
const ALL_ENTRY_FOODS = [...PROTEIN_LIST, ...foodDb.carbs, ...DRINKS_LIST]
const DRINK_IDS = new Set(DRINKS_LIST.map(d => d.id))

function OatsBlock({ date, onAdded, alreadyLogged }) {
  const [saving, setSaving] = useState(false)

  async function toggle(e) {
    if (alreadyLogged || saving) return
    if (!e.target.checked) return
    setSaving(true)
    try {
      await api('/entries', { method:'POST', body: JSON.stringify({
        date, food_id: 'overnight_oats', food_name: OATS_FOOD.name,
        amount: 1, unit: 'unit',
        protein_g: OATS_FOOD.protein_per_unit, carbs_g: OATS_FOOD.carbs_per_unit,
        extra_calories: OATS_FOOD.extra_cal_per_unit || 0
      })})
      onAdded()
    } catch(e2) { alert(e2.message) }
    setSaving(false)
  }

  return (
    <div className={styles.oatsBlock}>
      <label className={`${styles.oatsCheck} ${alreadyLogged ? styles.oatsCheckLocked : ''}`}>
        <input type="checkbox" checked={alreadyLogged} disabled={alreadyLogged || saving} onChange={toggle} />
        <span>
          {alreadyLogged
            ? `✓ Logged for ${fmtDate(date)} — ${OATS_FOOD.protein_per_unit}g protein / ${OATS_FOOD.carbs_per_unit}g carbs / +${OATS_FOOD.extra_cal_per_unit} kcal fats`
            : saving ? 'Adding...' : `🥣 Overnight Oats (1 serving) — ${OATS_FOOD.protein_per_unit}g protein / ${OATS_FOOD.carbs_per_unit}g carbs / +${OATS_FOOD.extra_cal_per_unit} kcal fats`}
        </span>
      </label>
      {!alreadyLogged && <div className={styles.foodNote}>{OATS_FOOD.note}</div>}
    </div>
  )
}

function FoodSection({ date, onAdded, allEntries }) {
  const [foodId, setFoodId] = useState('')
  const [amount, setAmount] = useState('')
  const [manualOpen, setManualOpen] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualProtein, setManualProtein] = useState('')
  const [manualCarbs, setManualCarbs] = useState('')
  const [saving, setSaving] = useState(false)
  const [warn, setWarn] = useState('')
  const [quickSaving, setQuickSaving] = useState(null)

  const recentFoods = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const e of allEntries) {
      if (e.food_id === 'manual' || e.food_id === 'overnight_oats') continue
      if (seen.has(e.food_id)) continue
      seen.add(e.food_id)
      out.push(e)
      if (out.length >= 5) break
    }
    return out
  }, [allEntries])

  async function quickAdd(recent) {
    setQuickSaving(recent.id)
    try {
      const known = ALL_ENTRY_FOODS.find(f => f.id === recent.food_id)
      let protein = recent.protein_g, carbs = recent.carbs_g, extraCal = recent.extra_calories||0
      if (known) {
        if (known.unit === 'unit') {
          protein = round1(recent.amount * (known.protein_per_unit||0))
          carbs = round1(recent.amount * (known.carbs_per_unit||0))
          extraCal = round1(recent.amount * (known.extra_cal_per_unit||0))
        } else {
          protein = round1(recent.amount * (known.protein_per100||0) / 100)
          carbs = round1(recent.amount * (known.carbs_per100||0) / 100)
          extraCal = 0
        }
      }
      await api('/entries', { method:'POST', body: JSON.stringify({
        date, food_id: recent.food_id, food_name: recent.food_name,
        amount: recent.amount, unit: recent.unit, protein_g: protein, carbs_g: carbs, extra_calories: extraCal
      })})
      onAdded()
    } catch(e) { alert(e.message) }
    setQuickSaving(null)
  }

  const isManual = manualOpen
  const food = ALL_ENTRY_FOODS.find(f => f.id === foodId)
  const isUnitFood = food && food.unit === 'unit'

  const preview = useMemo(() => {
    if (isManual) return { protein: parseFloat(manualProtein)||0, carbs: parseFloat(manualCarbs)||0, extraCal: 0 }
    if (!food) return null
    if (isUnitFood) {
      const units = parseFloat(amount) || 0
      return {
        protein: round1(units * food.protein_per_unit),
        carbs: round1(units * (food.carbs_per_unit||0)),
        extraCal: round1(units * (food.extra_cal_per_unit||0))
      }
    }
    const g = parseFloat(amount) || 0
    return { protein: round1(g * (food.protein_per100||0) / 100), carbs: round1(g * (food.carbs_per100||0) / 100), extraCal: 0 }
  }, [food, amount, manualProtein, manualCarbs, isManual, isUnitFood])

  async function addEntry() {
    setWarn('')
    let name, amt, unit
    if (isManual) {
      if (!manualName.trim()) { setWarn('Enter a name for this food'); return }
      if (!manualProtein && !manualCarbs) { setWarn('Enter protein or carb grams'); return }
      name = manualName.trim(); amt = 1; unit = 'manual'
    } else {
      if (!food) { setWarn('Pick a food first'); return }
      if (!amount || parseFloat(amount) <= 0) { setWarn(`Add the amount for ${food.name}`); return }
      name = food.name; amt = parseFloat(amount); unit = food.unit
    }
    setSaving(true)
    try {
      await api('/entries', { method:'POST', body: JSON.stringify({
        date, food_id: isManual ? 'manual' : food.id,
        food_name: name, amount: amt, unit,
        protein_g: preview.protein, carbs_g: preview.carbs, extra_calories: preview.extraCal||0
      })})
      setFoodId(''); setAmount(''); setManualOpen(false); setManualName(''); setManualProtein(''); setManualCarbs('')
      onAdded()
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); addEntry() }
  }

  return (
    <div className={styles.foodSection}>
      {!isManual && recentFoods.length > 0 && (
        <div className={styles.recentRow}>
          {recentFoods.map(r => (
            <button key={r.food_id} className={styles.recentChip}
              onClick={()=>quickAdd(r)} disabled={quickSaving===r.id}>
              {quickSaving===r.id ? '...' : `${r.food_name} ${r.unit==='unit' ? `×${r.amount}` : `${r.amount}g`}`}
            </button>
          ))}
        </div>
      )}

      {!isManual && (
        <select value={foodId} onChange={e=>{setFoodId(e.target.value); setAmount(''); setWarn('')}} className={styles.input}>
          <option value="">— pick a food —</option>
          <optgroup label="Protein">
            {PROTEIN_LIST.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </optgroup>
          <optgroup label="Carbs">
            {foodDb.carbs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </optgroup>
          <optgroup label="Drinks">
            {DRINKS_LIST.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </optgroup>
        </select>
      )}

      <button className={styles.manualToggle} onClick={()=>{setManualOpen(v=>!v); setFoodId(''); setAmount(''); setWarn('')}}>
        {isManual ? '← back to food list' : '+ Manual entry (type grams directly)'}
      </button>

      {!isManual && food && food.note && <div className={styles.foodNote}>{food.note}</div>}

      {!isManual && (
        <label className={styles.field}>
          <span>{food && isUnitFood ? 'How many' : 'Amount (grams, cooked weight)'}</span>
          <input type="number" step={food && isUnitFood ? '1' : 'any'} className={styles.input}
            value={amount} disabled={!food} onKeyDown={onKeyDown}
            onChange={e=>{setAmount(e.target.value); setWarn('')}}
            placeholder={!food ? 'pick a food first' : (isUnitFood ? 'e.g. 1' : 'e.g. 200')} />
        </label>
      )}

      {!isManual && food && !isUnitFood && (
        <div className={styles.presetRow}>
          {[100, 150, 200].map(g => (
            <button key={g} className={`${styles.presetChip} ${String(amount)===String(g) ? styles.presetChipActive : ''}`}
              onClick={()=>{setAmount(String(g)); setWarn('')}}>
              {g}g
            </button>
          ))}
        </div>
      )}

      {isManual && (
        <div className={styles.manualBox}>
          <label className={styles.field}>
            <span>Food name</span>
            <input type="text" className={styles.input} value={manualName} onKeyDown={onKeyDown}
              onChange={e=>{setManualName(e.target.value); setWarn('')}} placeholder="e.g. Turkey burger" />
          </label>
          <div className={styles.formGrid2}>
            <label className={styles.field}>
              <span>Protein (g)</span>
              <input type="number" className={styles.input} value={manualProtein} onKeyDown={onKeyDown}
                onChange={e=>{setManualProtein(e.target.value); setWarn('')}} placeholder="e.g. 25" />
            </label>
            <label className={styles.field}>
              <span>Carbs (g)</span>
              <input type="number" className={styles.input} value={manualCarbs} onKeyDown={onKeyDown}
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
        {saving ? 'Adding...' : '+ Add Entry'}
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
  const [extraCal, setExtraCal] = useState(entry.extra_calories || 0)
  const [saving, setSaving] = useState(false)

  const origFood = ALL_ENTRY_FOODS.find(f => f.id === entry.food_id)

  useEffect(() => {
    if (!editing || !origFood || origFood.unit === 'manual') return
    const amt = parseFloat(amount) || 0
    if (origFood.unit === 'unit') {
      setProtein(round1(amt * (origFood.protein_per_unit||0)))
      setCarbs(round1(amt * (origFood.carbs_per_unit||0)))
      setExtraCal(round1(amt * (origFood.extra_cal_per_unit||0)))
    } else if (origFood.unit === 'g') {
      setProtein(round1(amt * (origFood.protein_per100||0) / 100))
      setCarbs(round1(amt * (origFood.carbs_per100||0) / 100))
      setExtraCal(0)
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
        protein_g: parseFloat(protein)||0, carbs_g: parseFloat(carbs)||0, extra_calories: parseFloat(extraCal)||0
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
          {entry.unit === 'unit' ? `× ${entry.amount}` : entry.unit === 'manual' ? 'manual' : `${entry.amount}g`} · {entry.protein_g}g P / {entry.carbs_g}g C{parseFloat(entry.extra_calories||0) > 0 ? ` / +${entry.extra_calories} kcal` : ''}
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
function DailyTab({ settings, dailyLogs, entries, water, refresh, today, phaseStart, phaseEnd, phaseNumber }) {
  const [date, setDate]   = useState(todayStr())
  const [veg, setVeg]     = useState('')
  const [workout, setWorkout] = useState('')
  const [waterOz, setWaterOz] = useState('')
  const [savingMeta, setSavingMeta] = useState(false)

  const target = PHASE_TARGETS[phaseNumber]?.protein || settings?.protein_target_g || 170
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
    const extraCal = dayEntries.reduce((s,e)=> s + parseFloat(e.extra_calories||0), 0)
    return { protein: round1(protein), carbs: round1(carbs), extraCal: round1(extraCal) }
  }, [dayEntries])

  async function saveDay() {
    if (!date) { alert('Pick a valid date first'); return }
    const wAmt = waterOz ? parseFloat(waterOz) : null
    if (wAmt !== null && (isNaN(wAmt) || wAmt <= 0)) { alert('Water amount must be a positive number'); return }

    const nothingNew = !veg && !workout && !waterOz
    const hadExisting = !!(existingDaily?.vegetables || existingDaily?.workout_type || existingWater)
    if (nothingNew && hadExisting) {
      alert(`Not overwriting — ${fmtDateFull(date)} already has data saved. Fill in a value to change it.`)
      return
    }

    setSavingMeta(true)
    try {
      await api('/daily', { method:'POST', body: JSON.stringify({
        date,
        protein_g: dayEntries.length ? Math.round(dayTotals.protein) : (existingDaily?.protein_g ?? null),
        vegetables: veg || existingDaily?.vegetables || null,
        workout_type: workout || existingDaily?.workout_type || null
      })})
      if (wAmt !== null) {
        await api('/water', { method:'POST', body: JSON.stringify({ date, ounces: wAmt }) })
      }
      refresh()
    } catch(e) { alert(e.message) }
    setSavingMeta(false)
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
      <StreakCalendar loggedDates={loggedDates} phaseStart={phaseStart} phaseNumber={phaseNumber} />

      {/* Date picker + edit indicator */}
      <div className={styles.dateCard}>
        <div className={styles.dateRow}>
          <label className={styles.field}>
            <span>Date</span>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} className={styles.input} />
          </label>
          {date !== today && (
            <button className={styles.todayChip} onClick={()=>setDate(today)}>Today</button>
          )}
        </div>
        {isEditingDay && (
          <div className={styles.editingBadge}>✎ Editing {fmtDateFull(date)} — already has data, changes will update it</div>
        )}
      </div>

      {/* Phase target + today's intake — merged into one progress card */}
      {(() => {
        const t = PHASE_TARGETS[phaseNumber]
        const estCalories = round1(dayTotals.protein*4 + dayTotals.carbs*4 + dayTotals.extraCal)
        const weekAvgs = rangeAverages(entries, dailyLogs, addDays(today, -6), today)
        const proteinLeft = round1(t.protein - dayTotals.protein)
        const carbsLeft = round1(t.carbs - dayTotals.carbs)
        const calLeft = round1(t.calories - estCalories)
        const workoutsLeft = t.workouts - weekAvgs.workoutCount
        return (
          <div className={styles.targetCard}>
            <div className={styles.targetHead}>
              <span className={styles.targetPhase}>Phase {phaseNumber} · {t.name}</span>
            </div>
            <div className={styles.targetGrid}>
              <div className={styles.targetItem}>
                <span className={styles.targetVal}>{dayTotals.protein}<small>/{t.protein}g</small></span>
                <span className={styles.targetLabel}>protein</span>
                {proteinLeft <= 0
                  ? <span className={styles.pillHit}>✓ hit</span>
                  : <span className={styles.pillMiss}>{proteinLeft}g to go</span>}
              </div>
              <div className={styles.targetItem}>
                <span className={styles.targetVal}>{dayTotals.carbs}<small>/{t.carbs}g</small></span>
                <span className={styles.targetLabel}>carbs</span>
                {carbsLeft >= 0
                  ? <span className={styles.pillHit}>{carbsLeft}g left</span>
                  : <span className={styles.pillMiss}>{Math.abs(carbsLeft)}g over</span>}
              </div>
              <div className={styles.targetItem}>
                <span className={styles.targetVal}>{estCalories}<small>/{t.calories}</small></span>
                <span className={styles.targetLabel}>kcal</span>
                <span className={styles.pillNeutral}>{Math.abs(calLeft)} {calLeft>=0?'left':'over'}</span>
              </div>
              <div className={styles.targetItem}>
                <span className={styles.targetVal}>{weekAvgs.workoutCount}<small>/{t.workouts}/wk</small></span>
                <span className={styles.targetLabel}>activity</span>
                {workoutsLeft <= 0
                  ? <span className={styles.pillHit}>✓ hit</span>
                  : <span className={styles.pillMiss}>{workoutsLeft} to go</span>}
              </div>
            </div>
            {dayTotals.extraCal > 0 && (
              <div className={styles.targetToday}>Includes +{dayTotals.extraCal} kcal from fats/oils not shown in protein/carbs</div>
            )}
          </div>
        )
      })()}

      {/* Day-status checklist — veg / workout / water for the selected day */}
      {(() => {
        const vegDone = veg !== ''
        const workoutDone = workout !== ''
        const waterDone = waterOz !== '' && parseFloat(waterOz) > 0
        return (
          <div className={styles.statusRow}>
            <div className={`${styles.statusItem} ${vegDone ? styles.statusDone : ''}`}>
              <span className={styles.statusIcon}>🥦</span>
              <span className={styles.statusLabel}>Veg</span>
            </div>
            <div className={`${styles.statusItem} ${workoutDone ? styles.statusDone : ''}`}>
              <span className={styles.statusIcon}>💪</span>
              <span className={styles.statusLabel}>Workout</span>
            </div>
            <div className={`${styles.statusItem} ${waterDone ? styles.statusDone : ''}`}>
              <span className={styles.statusIcon}>💧</span>
              <span className={styles.statusLabel}>Water</span>
            </div>
          </div>
        )
      })()}

      {/* History for selected day — editable, shown right after date so you see what you've logged */}
      {dayEntries.length > 0 && (
        <div className={styles.historyCard}>
          <h3 className={styles.formTitle}>History — {fmtDate(date)}</h3>
          <div className={styles.entryList}>
            {dayEntries.map(e => (
              <EntryRow key={e.id} entry={e} onDeleted={refresh} onSaved={refresh} />
            ))}
          </div>
        </div>
      )}

      {/* Food log */}
      <div className={styles.formCard}>
        <h3 className={styles.formTitle}>Add Food — {fmtDate(date)}</h3>
        <OatsBlock date={date} onAdded={refresh} alreadyLogged={dayEntries.some(e => e.food_id === 'overnight_oats')} />
        <div className={styles.foodDivider} />
        <FoodSection date={date} onAdded={refresh} allEntries={entries} />
      </div>

      {/* One card: water + veg + workout, one Save Day action */}
      <div className={styles.formCard}>
        <h3 className={styles.formTitle}>Day Summary — {fmtDate(date)}</h3>
        <div className={styles.formGrid2}>
          <label className={styles.field}>
            <span>Water (oz) · target {waterTarget}oz</span>
            <input type="number" className={styles.input} value={waterOz}
              onChange={e=>setWaterOz(e.target.value)} placeholder="e.g. 80" />
          </label>
          <div className={styles.field}>
            <span>Vegetables</span>
            <div className={styles.vegToggleRow}>
              <button
                className={`${styles.vegToggleBtn} ${veg==='satisfied' ? styles.vegToggleActiveGood : ''}`}
                onClick={()=>setVeg(veg==='satisfied' ? '' : 'satisfied')}>
                ✓ Satisfied
              </button>
              <button
                className={`${styles.vegToggleBtn} ${veg==='not_satisfied' ? styles.vegToggleActiveBad : ''}`}
                onClick={()=>setVeg(veg==='not_satisfied' ? '' : 'not_satisfied')}>
                ✗ Not satisfied
              </button>
            </div>
          </div>
        </div>
        <label className={styles.field}>
          <span>Workout</span>
          <select value={workout} onChange={e=>setWorkout(e.target.value)} className={styles.input}>
            {WORKOUT_OPTIONS.map(w => <option key={w} value={w}>{w || '— none logged —'}</option>)}
          </select>
        </label>
        <button className={styles.saveBtn} onClick={saveDay} disabled={savingMeta}>
          {savingMeta ? 'Saving...' : isEditingDay ? 'Update Day' : 'Save Day'}
        </button>
        <div className={styles.safetyNote}>Blank fields never erase saved data — only filled-in values are updated.</div>
      </div>
    </div>
  )
}

// ── Weekly Tab ────────────────────────────────────────────
function WeeklyTab({ weeklyLogs, entries, dailyLogs, refresh }) {
  const [weekEnding, setWeekEnding] = useState(todayStr())
  const [weight, setWeight] = useState('')
  const [saving, setSaving] = useState(false)

  const existing = weeklyLogs.find(w => w.week_ending === weekEnding)
  useEffect(() => {
    setWeight(existing?.weight_lb != null ? String(existing.weight_lb) : '')
  }, [weekEnding, existing])

  async function save() {
    setSaving(true)
    try {
      await api('/weekly', { method:'POST', body: JSON.stringify({
        week_ending: weekEnding, weight_lb: weight ? parseFloat(weight) : null
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
  const weekStart = addDays(weekEnding, -6)
  const avgs = rangeAverages(entries, dailyLogs, weekStart, weekEnding)

  return (
    <div>
      <div className={styles.formCard}>
        <h3 className={styles.formTitle}>This Week — {fmtDate(weekStart)} to {fmtDate(weekEnding)}</h3>
        <div className={styles.weekAvgGrid}>
          <div className={styles.targetItem}>
            <span className={styles.targetVal}>{avgs.avgProtein}g</span>
            <span className={styles.targetLabel}>avg protein</span>
          </div>
          <div className={styles.targetItem}>
            <span className={styles.targetVal}>{avgs.avgCarbs}g</span>
            <span className={styles.targetLabel}>avg carbs</span>
          </div>
          <div className={styles.targetItem}>
            <span className={styles.targetVal}>{avgs.avgCalories}</span>
            <span className={styles.targetLabel}>avg kcal</span>
          </div>
          <div className={styles.targetItem}>
            <span className={styles.targetVal}>{avgs.workoutCount}</span>
            <span className={styles.targetLabel}>workouts</span>
          </div>
          <div className={styles.targetItem}>
            <span className={styles.targetVal}>{avgs.drinksCount}</span>
            <span className={styles.targetLabel}>drinks</span>
          </div>
        </div>
        <div className={styles.safetyNote}>Based on {avgs.daysWithData} day{avgs.daysWithData===1?'':'s'} logged this week</div>
      </div>

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
        </div>
        <button className={styles.saveBtn} onClick={save} disabled={saving}>
          {saving ? 'Saving...' : existing ? 'Update Week' : 'Save Week'}
        </button>
      </div>

      <div className={styles.historyCard}>
        <h3 className={styles.formTitle}>History</h3>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Week ending</th><th>Weight</th><th>Δ</th><th></th></tr></thead>
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
function PhaseTab({ phases, settings, entries, dailyLogs, refresh }) {
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
            {(() => {
              const avgs = rangeAverages(entries, dailyLogs, p.start, p.end)
              const t = PHASE_TARGETS[p.number]
              return (
                <div className={styles.phaseAvgBox}>
                  <div className={styles.weekAvgGrid}>
                    <div className={styles.targetItem}>
                      <span className={styles.targetVal}>{avgs.avgProtein}g</span>
                      <span className={styles.targetLabel}>avg protein / {t.protein}g target</span>
                    </div>
                    <div className={styles.targetItem}>
                      <span className={styles.targetVal}>{avgs.avgCarbs}g</span>
                      <span className={styles.targetLabel}>avg carbs / {t.carbs}g target</span>
                    </div>
                    <div className={styles.targetItem}>
                      <span className={styles.targetVal}>{avgs.avgCalories}</span>
                      <span className={styles.targetLabel}>avg kcal / {t.calories} target</span>
                    </div>
                    <div className={styles.targetItem}>
                      <span className={styles.targetVal}>{avgs.workoutCount}</span>
                      <span className={styles.targetLabel}>workouts / {t.workouts}/wk target</span>
                    </div>
                  </div>
                  <div className={styles.safetyNote}>{avgs.drinksCount} total drinks this phase{avgs.avgIntensity !== null ? ` · Avg intensity: ${INTENSITY_LABELS[avgs.avgIntensity]}` : ''}</div>
                </div>
              )
            })()}
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
  const totalDrinks = entries
    .filter(e => DRINK_IDS.has(e.food_id))
    .reduce((s,e) => s + parseFloat(e.amount||0), 0)
  const daysTracked = new Set([...datesWithProtein, ...dailyLogs.map(d=>d.date), ...water.map(w=>w.date)]).size
  const avgWater = water.length ? round1(water.reduce((s,w)=>s+parseFloat(w.ounces||0),0) / water.length) : 0

  const carbsByDate = useMemo(() => {
    const m = {}
    entries.forEach(e => { m[e.date] = (m[e.date]||0) + parseFloat(e.carbs_g||0) })
    return m
  }, [entries])
  const extraCalByDate = useMemo(() => {
    const m = {}
    entries.forEach(e => { m[e.date] = (m[e.date]||0) + parseFloat(e.extra_calories||0) })
    return m
  }, [entries])
  const avgCalories = datesWithProtein.length
    ? round1(datesWithProtein.reduce((s,d)=> s + (proteinByDate[d]*4 + (carbsByDate[d]||0)*4 + (extraCalByDate[d]||0)), 0) / datesWithProtein.length)
    : 0

  const intensityVals = dailyLogs
    .map(d => WORKOUT_INTENSITY[d.workout_type])
    .filter(v => v !== undefined)
  const avgIntensity = intensityVals.length
    ? Math.round(intensityVals.reduce((a,b)=>a+b,0)/intensityVals.length)
    : null

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
    { label: 'Avg Calories', value: avgCalories ? `${avgCalories}` : '—' },
    { label: 'Workouts Logged', value: workoutCount },
    { label: 'Avg Intensity', value: avgIntensity !== null ? INTENSITY_LABELS[avgIntensity] : '—' },
    { label: 'Total Drinks', value: totalDrinks },
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
  const [initialLoaded, setInitialLoaded] = useState(false)
  const [error, setError]           = useState('')

  function onUnlock() {
    sessionStorage.setItem('nutrition_unlocked','1')
    setUnlocked(true)
  }

  async function loadAll() {
    if (!initialLoaded) setLoading(true)
    setError('')
    try {
      const [d, en, wt, w, p, s] = await Promise.all([
        api('/daily'), api('/entries'), api('/water'), api('/weekly'), api('/phases'), api('/settings')
      ])
      setDailyLogs(d); setEntries(en); setWater(wt); setWeeklyLogs(w); setPhases(p); setSettings(s)
      setInitialLoaded(true)
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
  const phaseIdx = PHASES.findIndex(p => p.number === phase.number)
  const dayInPhase = Math.min(Math.max(dayIndex(today) - phaseIdx*30 + 1, 1), 30)
  const phaseStart = PHASES[phaseIdx].start
  const phaseEnd = PHASES[phaseIdx].end

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerTag}>PERSONAL TRACKER · NOT SHARED</div>
        <h1 className={styles.title}>90-DAY NUTRITION</h1>
        <div className={styles.headerAccentLine} />
        <div className={styles.dayBadgeRow}>
          <span className={styles.phaseBadge}>Phase {phase.number} of 3</span>
          <span className={styles.dayBadge}>Day {dayInPhase} of 30</span>
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
        {!initialLoaded ? (
          <div className={styles.loading}>Loading...</div>
        ) : (
          <>
            {tab === 'daily'   && <DailyTab settings={settings} dailyLogs={dailyLogs} entries={entries} water={water} refresh={loadAll} today={today} phaseStart={phaseStart} phaseEnd={phaseEnd} phaseNumber={phase.number} />}
            {tab === 'weekly'  && <WeeklyTab weeklyLogs={weeklyLogs} entries={entries} dailyLogs={dailyLogs} refresh={loadAll} />}
            {tab === 'phases'  && <PhaseTab phases={phases} settings={settings} entries={entries} dailyLogs={dailyLogs} refresh={loadAll} />}
            {tab === 'summary' && <SummaryTab dailyLogs={dailyLogs} weeklyLogs={weeklyLogs} entries={entries} water={water} settings={settings} />}
          </>
        )}
      </div>
    </div>
  )
}
