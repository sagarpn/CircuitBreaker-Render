/**
 * workoutGenerator.js — V1.8
 *
 * Upper Strength:
 *   C1: 4 exercises from same muscle group (compound leads, isolation last)
 *   C2: 2 exercises from paired group + push-up variation + burner from paired group
 *   Pairings: chest→triceps | back→biceps | shoulders→biceps or triceps (random)
 *
 * Lower Strength:
 *   C1: squat → squat/lunge/hinge → filler (3)
 *   C2: lunge → squat/lunge → hinge → lower burner (4)
 *
 * Whole Body:
 *   C1: lower + upper + upper burner + core (4)
 *   C2: lower + upper + lower burner (3)
 *
 * HIIT:
 *   C1: 1 HIIT + 1 HIIT burner + 1 lower burner (3)
 *   C2: 1 HIIT + 1 HIIT + 1 HIIT burner + 1 core (4)
 *
 * Combo:
 *   C1: strength compound + same-muscle burner + 1 HIIT (3)
 *   C2: lower compound + same-muscle lower burner + jumping HIIT + timed core (4)
 */

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Helpers ───────────────────────────────────────────────
function isBurner(ex) {
  const t = ex.tags || ''
  return t === 'burnout' ||
    (typeof t === 'string' && t.includes('burnout')) ||
    (Array.isArray(t) && t.includes('burnout'))
}

function isTimedEx(ex) {
  const t = ex.tags || ''
  const isBurn = t === 'burnout' || (typeof t==='string' && t.includes('burnout')) || (Array.isArray(t) && t.includes('burnout'))
  return ex.format === 'timed' || isBurn ||
    (ex.reps||'').toLowerCase().includes('second') ||
    (ex.name||'').toLowerCase().includes('hold')
}

function isPushUp(ex) {
  return (ex.name || '').toLowerCase().includes('push-up') ||
         (ex.name || '').toLowerCase().includes('pushup')
}

function isJumpingHiit(ex) {
  const n = (ex.name || '').toLowerCase()
  return ['jump','tuck','lunge jump','frog','bound','star jump'].some(k => n.includes(k))
}

function isTimed(ex) {
  return ex.format === 'timed' || isBurner(ex) ||
    (ex.reps || '').toLowerCase().includes('second') ||
    (ex.name || '').toLowerCase().includes('hold')
}

function isPureSquat(ex) {
  const n = (ex.name || '').toLowerCase()
  return n.includes('squat') && !n.includes('lunge') && !n.includes('jump')
}

function isLunge(ex) {
  return (ex.name || '').toLowerCase().includes('lunge')
}

function isHinge(ex) {
  const n = (ex.name || '').toLowerCase()
  return ['deadlift','rdl','hip hinge','good morning','hip thrust','glute bridge'].some(k => n.includes(k))
}

function equipOk(ex, hasDumbbells) {
  const eq = Array.isArray(ex.equipment) ? ex.equipment
    : (() => { try { return JSON.parse(ex.equipment || '[]') } catch {
        const s = ex.equipment || ''
        return s === 'none' || !s ? [] : s.split(',').map(e => e.trim()).filter(Boolean)
      }})()
  if (eq.includes('dumbbells') && !hasDumbbells) return false
  if (eq.includes('bench')) return false       // bench removed
  if (eq.includes('kettlebells')) return false // KB removed
  return true
}

// ── Pool builder ──────────────────────────────────────────
function pool(exercises, category, {
  hasDumbbells = true,
  burner       = false,
  usedIds      = new Set(),
  muscle       = null,
  compound     = null,
  order        = null,
  pushup       = null,
  excludeTimed = false,
} = {}) {
  return shuffle(exercises.filter(ex => {
    if (ex.flagged)           return false
    if (usedIds.has(ex.id))   return false
    if (ex.category !== category) return false
    if (!equipOk(ex, hasDumbbells)) return false
    if (burner  && !isBurner(ex))  return false
    if (!burner && isBurner(ex))   return false
    if (muscle  && ex.muscle_group !== muscle) return false
    if (compound !== null && ex.is_compound !== compound) return false
    if (order   && ex.ex_order !== order) return false
    if (pushup === true  && !isPushUp(ex)) return false
    if (pushup === false && isPushUp(ex))  return false
    if (excludeTimed && isTimedEx(ex))     return false
    return true
  }))
}

// ── Timed limit enforcement ──────────────────────────────
// After picking a circuit, ensure max timed exercises
function enforcedTimedLimit(circuit, max) {
  let timedCount = 0
  return circuit.filter(ex => {
    if (isTimedEx(ex)) {
      timedCount++
      return timedCount <= max
    }
    return true
  })
}

// ── UPPER STRENGTH ────────────────────────────────────────
const MUSCLE_PAIRS = {
  chest:     'triceps',
  back:      'biceps',
  shoulders: () => Math.random() < 0.5 ? 'biceps' : 'triceps',
}

const MUSCLE_GROUPS = ['chest','back','shoulders']

function pickUpperC1(exercises, usedIds, hasDumbbells) {
  // Pick random muscle group
  const muscle = MUSCLE_GROUPS[Math.floor(Math.random() * MUSCLE_GROUPS.length)]
  
  // Get all exercises for this muscle group, sorted by ex_order
  const all = pool(exercises, 'upper', { hasDumbbells, burner:false, usedIds, muscle })
  
  const compounds = all.filter(e => e.is_compound).sort((a,b) => (a.ex_order||2)-(b.ex_order||2))
  const nonComp   = all.filter(e => !e.is_compound).sort((a,b) => (a.ex_order||2)-(b.ex_order||2))
  
  const picked = []
  const pushUpsUsed = []

  // Slot 1: lead compound (order 1, no push-up preferred if push-ups will be saved for C2)
  const lead = compounds[0]
  if (lead) {
    picked.push(lead)
    if (isPushUp(lead)) pushUpsUsed.push(lead.name)
  }

  // Slot 2: secondary compound or high-order non-compound
  const sec = compounds.find(e => !picked.find(p=>p.id===e.id))
    || nonComp[0]
  if (sec) {
    picked.push(sec)
    if (isPushUp(sec)) pushUpsUsed.push(sec.name)
  }

  // Slot 3: non-compound
  const third = nonComp.find(e => !picked.find(p=>p.id===e.id))
    || all.find(e => !picked.find(p=>p.id===e.id))
  if (third) picked.push(third)

  // Slot 4: isolation (order 3 preferred)
  const iso = all.filter(e => e.ex_order === 3)
    .find(e => !picked.find(p=>p.id===e.id))
    || all.find(e => !picked.find(p=>p.id===e.id))
  if (iso && picked.length < 4) picked.push(iso)

  // Tag which muscle group was picked so C2 knows
  picked._muscle    = muscle
  picked._pushUps   = pushUpsUsed

  return picked
}

function pickUpperC2(exercises, usedIds, hasDumbbells, c1Muscle, c1PushUps) {
  const pairFn = MUSCLE_PAIRS[c1Muscle]
  const paired = typeof pairFn === 'function' ? pairFn() : pairFn

  // Slots 1+2: non-push-up exercises from paired muscle group
  const nonPU  = pool(exercises, 'upper', { hasDumbbells, burner:false, usedIds, muscle:paired, pushup:false })
  const allPU  = pool(exercises, 'upper', { hasDumbbells, burner:false, usedIds, muscle:paired })

  // Burner strictly from paired muscle — no cross-muscle fallback
  const burners = pool(exercises, 'upper', { hasDumbbells, burner:true, usedIds, muscle:paired })

  // Slot 3: exactly 1 push-up, different from anything used in C1
  const pushUps = pool(exercises, 'upper', { hasDumbbells:false, burner:false, usedIds, pushup:true })
    .filter(e => !c1PushUps.includes(e.name))

  const picked = []

  // Slot 1: non-push-up, order 1 or 2
  const s1 = nonPU.find(e => e.ex_order <= 2) || nonPU[0] || allPU[0]
  if (s1) picked.push(s1)

  // Slot 2: non-push-up, order 2 or 3, not already picked
  const s2 = nonPU.find(e => !picked.find(p=>p.id===e.id))
    || allPU.find(e => !picked.find(p=>p.id===e.id) && !isPushUp(e))
  if (s2) picked.push(s2)

  // Slot 3: exactly 1 push-up variation
  const pu = pushUps[0]
  if (pu) picked.push(pu)

  // Slot 4: burner from paired muscle only
  const burn = burners[0]
  if (burn) picked.push(burn)

  return picked
}

// ── LOWER STRENGTH ────────────────────────────────────────
function pickLowerC1(exercises, usedIds, hasDumbbells) {
  const lower  = pool(exercises, 'lower', { hasDumbbells, burner:false, usedIds })
  const picked = []

  const sq = lower.find(isPureSquat) || lower[0]
  if (sq) picked.push(sq)

  const s2 = lower.find(e => !picked.find(p=>p.id===e.id) && !isPureSquat(e))
  if (s2) picked.push(s2)

  const s3 = lower.find(e => !picked.find(p=>p.id===e.id))
  if (s3) picked.push(s3)

  return picked
}

function pickLowerC2(exercises, usedIds, hasDumbbells) {
  const lower   = pool(exercises, 'lower', { hasDumbbells, burner:false, usedIds })
  const lBurner = pool(exercises, 'lower', { hasDumbbells, burner:true,  usedIds })
  const picked  = []

  const lu = lower.find(isLunge) || lower[0]
  if (lu) picked.push(lu)

  const s2 = lower.find(e =>
    !picked.find(p=>p.id===e.id) && (isPureSquat(e) || isLunge(e))
  )
  if (s2) picked.push(s2)

  const hi = lower.find(e =>
    !picked.find(p=>p.id===e.id) && isHinge(e)
  ) || lower.find(e => !picked.find(p=>p.id===e.id))
  if (hi) picked.push(hi)

  const burn = lBurner[0]
  if (burn) picked.push(burn)

  return picked
}

// ── WHOLE BODY ────────────────────────────────────────────
function pickWholeC1(exercises, usedIds, hasDumbbells) {
  const lower   = pool(exercises, 'lower', { hasDumbbells, burner:false, usedIds })
  const upper   = pool(exercises, 'upper', { hasDumbbells, burner:false, usedIds })
  const uBurner = pool(exercises, 'upper', { hasDumbbells, burner:true,  usedIds })
  const cores   = pool(exercises, 'core',  { hasDumbbells, burner:false, usedIds })
  const picked  = []

  if (lower[0])   picked.push(lower[0])
  if (upper[0])   picked.push(upper[0])
  if (uBurner[0]) picked.push(uBurner[0])
  if (cores[0])   picked.push(cores[0])
  return picked
}

function pickWholeC2(exercises, usedIds, hasDumbbells) {
  const lower   = pool(exercises, 'lower', { hasDumbbells, burner:false, usedIds })
  const upper   = pool(exercises, 'upper', { hasDumbbells, burner:false, usedIds })
  const lBurner = pool(exercises, 'lower', { hasDumbbells, burner:true,  usedIds })
  const picked  = []

  if (lower[0])   picked.push(lower[0])
  if (upper[0])   picked.push(upper[0])
  if (lBurner[0]) picked.push(lBurner[0])
  return picked
}

// ── HIIT ──────────────────────────────────────────────────
function pickHiitC1(exercises, usedIds, hasDumbbells) {
  const hiit    = pool(exercises, 'hiit',  { hasDumbbells:false, burner:false, usedIds })
  const hBurner = pool(exercises, 'hiit',  { hasDumbbells:false, burner:true,  usedIds })
  const lBurner = pool(exercises, 'lower', { hasDumbbells,       burner:true,  usedIds })
  const anyBurner = pool(exercises, 'hiit', { hasDumbbells:false, burner:true, usedIds })
  const picked  = []

  // Slot 1: HIIT exercise
  const h1 = hiit[0]; if (h1) picked.push(h1)
  // Slot 2: HIIT burner
  const hb = hBurner.find(e => !picked.find(p=>p.id===e.id))
  if (hb) picked.push(hb)
  // Slot 3: lower burner preferred, fall back to any burner or HIIT exercise
  const lb = lBurner[0]
    || anyBurner.find(e => !picked.find(p=>p.id===e.id))
    || hiit.find(e => !picked.find(p=>p.id===e.id))
  if (lb) picked.push(lb)
  return picked
}

function pickHiitC2(exercises, usedIds, hasDumbbells) { // max 2 timed
  const hiit    = pool(exercises, 'hiit', { hasDumbbells:false, burner:false, usedIds })
  const hBurner = pool(exercises, 'hiit', { hasDumbbells:false, burner:true,  usedIds })
  const cores   = pool(exercises, 'core', { hasDumbbells,       burner:false, usedIds })
  const picked  = []

  const h1 = hiit[0]; if (h1) picked.push(h1)
  const h2 = hiit.find(e => !picked.find(p=>p.id===e.id)); if (h2) picked.push(h2)
  const hb = hBurner.find(e => !picked.find(p=>p.id===e.id)); if (hb) picked.push(hb)
  if (cores[0]) picked.push(cores[0])
  return picked
}

// ── COMBO ─────────────────────────────────────────────────
function pickComboC1(exercises, usedIds, hasDumbbells) {
  const upper  = pool(exercises, 'upper', { hasDumbbells, burner:false, usedIds })
  const lower  = pool(exercises, 'lower', { hasDumbbells, burner:false, usedIds })
  const allStr = shuffle([...upper, ...lower])
  const hiit   = pool(exercises, 'hiit',  { hasDumbbells:false, burner:false, usedIds })
  const picked = []

  const comp = allStr.find(e => e.is_compound) || allStr[0]
  if (!comp) return picked
  picked.push(comp)

  const sameCatBurner = pool(exercises, comp.category, { hasDumbbells, burner:true, usedIds })
  const burn = sameCatBurner[0]
  if (burn) picked.push(burn)

  const h = hiit.find(e => !picked.find(p=>p.id===e.id))
    || allStr.find(e => !picked.find(p=>p.id===e.id) && !isBurner(e))
  if (h) picked.push(h)
  return picked
}

function pickComboC2(exercises, usedIds, hasDumbbells) {
  const lower   = pool(exercises, 'lower', { hasDumbbells, burner:false, usedIds })
  const lBurner = pool(exercises, 'lower', { hasDumbbells, burner:true,  usedIds })
  const hiit    = pool(exercises, 'hiit',  { hasDumbbells:false, burner:false, usedIds })
  const cores   = pool(exercises, 'core',  { hasDumbbells, burner:false, usedIds })
  const cBurner = pool(exercises, 'core',  { hasDumbbells, burner:true,  usedIds })
  const picked  = []

  const comp = lower.find(e => e.is_compound || isPureSquat(e) || isLunge(e)) || lower[0]
  if (comp) picked.push(comp)

  const lb = lBurner[0]; if (lb) picked.push(lb)

  const jump = hiit.find(e => isJumpingHiit(e) && !picked.find(p=>p.id===e.id))
    || hiit.find(e => !picked.find(p=>p.id===e.id))
  if (jump) picked.push(jump)

  const timedCore = cores.find(e => isTimed(e) && !picked.find(p=>p.id===e.id))
    || cBurner[0] || cores[0]
  if (timedCore) picked.push(timedCore)
  return picked
}

// ── EXTRA ROUNDS ──────────────────────────────────────────
export function generateExtraRound(exercises, type, existingCircuits, hasDumbbells = true, focus = 'upper') {
  const usedIds = new Set(existingCircuits.flat().filter(Boolean).map(e => e.id))

  if (type === 'circuit3') {
    if (focus === 'upper') {
      const c1 = pickUpperC1(exercises, usedIds, hasDumbbells)
      return c1
    }
    if (focus === 'lower') return pickLowerC1(exercises, usedIds, hasDumbbells)
    if (focus === 'whole') return pickWholeC1(exercises, usedIds, hasDumbbells)
    return pickHiitC1(exercises, usedIds, hasDumbbells)
  }

  if (type === 'burner') {
    const catMap = { upper:'upper', lower:'lower', hiit:'hiit', whole:'lower' }
    const cat = catMap[focus] || 'upper'
    return pool(exercises, cat, { hasDumbbells, burner:true, usedIds }).slice(0, 2)
  }

  if (type === 'core') {
    const cores   = pool(exercises, 'core', { hasDumbbells, burner:false, usedIds })
    const cBurner = pool(exercises, 'core', { hasDumbbells, burner:true,  usedIds })
    return [...cores.slice(0,2), ...cBurner.slice(0,1)]
  }

  return []
}

// ── ENSURE MINIMUM 3 ─────────────────────────────────────
// Only exclude exercises already in THIS circuit, not global usedIds
// This prevents empty circuits when the pool is exhausted
function ensure(circuit, min, exercises, usedIds, hasDumbbells) {
  if (circuit.length >= min) return circuit
  const circuitIds = new Set(circuit.map(e => e.id))
  const cats = [...new Set(circuit.map(e => e.category).filter(Boolean))]

  // Try same category non-burners first
  const preferred = shuffle(exercises.filter(e =>
    !e.flagged && !circuitIds.has(e.id) &&
    equipOk(e, hasDumbbells) && !isBurner(e) &&
    (cats.length === 0 || cats.includes(e.category))
  ))
  // Fallback: any non-burner exercise not already in this circuit
  const fallback = shuffle(exercises.filter(e =>
    !e.flagged && !circuitIds.has(e.id) &&
    equipOk(e, hasDumbbells) && !isBurner(e)
  ))
  const toAdd = [...preferred, ...fallback.filter(e => !preferred.find(p=>p.id===e.id))]

  while (circuit.length < min && toAdd.length > 0) {
    const next = toAdd.shift()
    if (!circuitIds.has(next.id)) {
      circuit.push(next)
      circuitIds.add(next.id)
      usedIds.add(next.id)
    }
  }
  return circuit
}

// ── MAIN GENERATOR ────────────────────────────────────────
export function generateWorkout(exercises, answers) {
  const {
    focus        = 'upper',
    style        = 'strength',
    hasDumbbells = true,
    usedIds: existingIds = new Set()
  } = answers

  const usedIds = new Set(existingIds)
  let circuit1 = [], circuit2 = []

  if (style === 'hiit') {
    circuit1 = pickHiitC1(exercises, usedIds, hasDumbbells)
    circuit1.forEach(e => usedIds.add(e.id))
    circuit2 = pickHiitC2(exercises, usedIds, hasDumbbells)

  } else if (style === 'combo') {
    circuit1 = pickComboC1(exercises, usedIds, hasDumbbells)
    circuit1.forEach(e => usedIds.add(e.id))
    circuit2 = pickComboC2(exercises, usedIds, hasDumbbells)

  } else {
    if (focus === 'upper') {
      circuit1 = pickUpperC1(exercises, usedIds, hasDumbbells)
      const c1Muscle = circuit1._muscle || 'chest'
      const c1PushUps = circuit1._pushUps || []
      circuit1.forEach(e => usedIds.add(e.id))
      circuit2 = pickUpperC2(exercises, usedIds, hasDumbbells, c1Muscle, c1PushUps)

    } else if (focus === 'lower') {
      circuit1 = pickLowerC1(exercises, usedIds, hasDumbbells)
      circuit1.forEach(e => usedIds.add(e.id))
      circuit2 = pickLowerC2(exercises, usedIds, hasDumbbells)

    } else {
      circuit1 = pickWholeC1(exercises, usedIds, hasDumbbells)
      circuit1.forEach(e => usedIds.add(e.id))
      circuit2 = pickWholeC2(exercises, usedIds, hasDumbbells)
    }
  }

  circuit2.forEach(e => usedIds.add(e.id))

  // Step 1: ensure minimum 3 exercises
  circuit1 = ensure(circuit1, 3, exercises, usedIds, hasDumbbells)
  circuit2 = ensure(circuit2, 3, exercises, usedIds, hasDumbbells)

  // Step 2: enforce timed limits — but never go below 3
  const timedMax = style === 'hiit' ? 2 : 1
  const limitedC1 = enforcedTimedLimit(circuit1, timedMax)
  const limitedC2 = enforcedTimedLimit(circuit2, timedMax)
  // Only apply timed limit if circuit still has 3+ exercises after
  if (limitedC1.length >= 3) circuit1 = limitedC1
  if (limitedC2.length >= 3) circuit2 = limitedC2

  return { circuit1, circuit2, usedIds }
}
