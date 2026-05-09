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
    return true
  }))
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
  // Determine paired muscle group
  const pairFn  = MUSCLE_PAIRS[c1Muscle]
  const paired  = typeof pairFn === 'function' ? pairFn() : pairFn

  const all     = pool(exercises, 'upper', { hasDumbbells, burner:false, usedIds, muscle:paired })
  const burners = pool(exercises, 'upper', { hasDumbbells, burner:true,  usedIds, muscle:paired })

  // Push-up pool — different from what was used in C1
  const pushUps = pool(exercises, 'upper', {
    hasDumbbells, burner:false, usedIds, pushup:true,
  }).filter(e => !c1PushUps.includes(e.name))

  const picked = []

  // Slot 1: order 1 or 2 from paired group
  const s1 = all.find(e => e.ex_order <= 2)
    || all[0]
  if (s1) picked.push(s1)

  // Slot 2: order 2 or 3 from paired group
  const s2 = all.find(e =>
    !picked.find(p=>p.id===e.id) && (e.ex_order === 2 || e.ex_order === 3)
  ) || all.find(e => !picked.find(p=>p.id===e.id))
  if (s2) picked.push(s2)

  // Slot 3: push-up variation (different from C1)
  const pu = pushUps[0]
  if (pu) picked.push(pu)

  // Slot 4: burner from paired group
  const burn = burners[0]
    || pool(exercises, 'upper', { hasDumbbells, burner:true, usedIds })[0]
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
  const picked  = []

  if (hiit[0])    picked.push(hiit[0])
  const hb = hBurner.find(e => !picked.find(p=>p.id===e.id))
  if (hb)         picked.push(hb)
  if (lBurner[0]) picked.push(lBurner[0])
  return picked
}

function pickHiitC2(exercises, usedIds, hasDumbbells) {
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

// ── ENSURE MINIMUM ────────────────────────────────────────
function ensure(circuit, min, exercises, usedIds, hasDumbbells) {
  if (circuit.length >= min) return circuit
  const all = shuffle(exercises.filter(e =>
    !e.flagged && !usedIds.has(e.id) &&
    !circuit.find(c => c.id === e.id) &&
    equipOk(e, hasDumbbells)
  ))
  while (circuit.length < min && all.length > 0) circuit.push(all.shift())
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
  circuit1 = ensure(circuit1, 3, exercises, usedIds, hasDumbbells)
  circuit2 = ensure(circuit2, 3, exercises, usedIds, hasDumbbells)

  return { circuit1, circuit2, usedIds }
}
