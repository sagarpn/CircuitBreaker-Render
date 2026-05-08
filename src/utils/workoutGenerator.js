/**
 * workoutGenerator.js — V1.8
 *
 * CIRCUIT STRUCTURE:
 *
 * HIIT:
 *   C1: 1 HIIT + 1 HIIT burner + 1 lower burner
 *   C2: 1 HIIT + 1 HIIT + 1 HIIT burner + 1 core (last)
 *
 * UPPER STRENGTH:
 *   C1: compound → secondary → isolation (all same muscle group, 3 ex)
 *   C2: compound → secondary → isolation → upper burner (4 ex)
 *
 * LOWER STRENGTH:
 *   C1: squat → squat/lunge/hinge → filler (3 ex)
 *   C2: lunge → squat/lunge → hinge → lower burner (4 ex)
 *
 * WHOLE BODY:
 *   C1: lower + upper + upper burner + core (4 ex)
 *   C2: lower + upper + lower burner (3 ex)
 *
 * COMBO (HIIT+Strength):
 *   C1: strength compound + same-muscle burner + 1 HIIT (3 ex)
 *   C2: lower compound + same-muscle lower burner + jumping HIIT + timed core (4 ex)
 */

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Tag helpers ───────────────────────────────────────────
function isBurner(ex) {
  const t = ex.tags || ''
  return t === 'burnout' || (typeof t === 'string' && t.includes('burnout')) ||
    (Array.isArray(t) && t.includes('burnout'))
}

function isRegular(ex) { return !isBurner(ex) }

function isTimed(ex) {
  return ex.format === 'timed' || isBurner(ex) ||
    (ex.reps || '').toLowerCase().includes('second') ||
    (ex.name || '').toLowerCase().includes('hold')
}

function equipOk(ex, hasDumbbells) {
  const eq = Array.isArray(ex.equipment) ? ex.equipment
    : (() => { try { return JSON.parse(ex.equipment || '[]') } catch {
        const s = ex.equipment || ''
        return s === 'none' || !s ? [] : s.split(',').map(e=>e.trim())
      }})()
  if (eq.includes('dumbbells') && !hasDumbbells) return false
  return true
}

// ── Pool builders ─────────────────────────────────────────
function pool(exercises, category, { hasDumbbells = true, burner = false, usedIds = new Set() } = {}) {
  return shuffle(exercises.filter(ex => {
    if (ex.flagged) return false
    if (usedIds.has(ex.id)) return false
    if (ex.category !== category) return false
    if (!equipOk(ex, hasDumbbells)) return false
    if (burner && !isBurner(ex)) return false
    if (!burner && isBurner(ex)) return false
    return true
  }))
}

// ── Muscle group detection ────────────────────────────────
function muscleGroup(ex) {
  const name = (ex.name || '').toLowerCase()
  if (['chest','push-up','pushup','fly','press','dip','pullover','decline'].some(k=>name.includes(k))) return 'chest'
  if (['row','pull','lat','back','rear','pulldown','pullover'].some(k=>name.includes(k))) return 'back'
  if (['shoulder','lateral raise','front raise','arnold','upright row','overhead'].some(k=>name.includes(k))) return 'shoulder'
  if (['bicep','curl','hammer'].some(k=>name.includes(k))) return 'bicep'
  if (['tricep','dip','extension','kickback'].some(k=>name.includes(k))) return 'tricep'
  return 'general'
}

function isJumpingHiit(ex) {
  const name = (ex.name||'').toLowerCase()
  return ['jump','tuck','lunge jump','frog','bound','star jump','box jump'].some(k=>name.includes(k))
}

function isPureSquat(ex) {
  const name = (ex.name||'').toLowerCase()
  return (name.includes('squat') && !name.includes('lunge') && !name.includes('jump'))
}

function isLunge(ex) {
  return (ex.name||'').toLowerCase().includes('lunge')
}

function isHinge(ex) {
  const name = (ex.name||'').toLowerCase()
  return ['deadlift','rdl','hip hinge','good morning','hip thrust','glute bridge'].some(k=>name.includes(k))
}

// ── HIIT Circuits ─────────────────────────────────────────
function pickHiitC1(exercises, usedIds, hasDumbbells) {
  const hiit    = pool(exercises, 'hiit',  { hasDumbbells, burner:false, usedIds })
  const hBurner = pool(exercises, 'hiit',  { hasDumbbells, burner:true,  usedIds })
  const lBurner = pool(exercises, 'lower', { hasDumbbells, burner:true,  usedIds })
  const picked  = []

  const h1 = hiit[0]; if (h1) picked.push(h1)
  const hb = hBurner.find(e => !picked.find(p=>p.id===e.id))
  if (hb) picked.push(hb)
  const lb = lBurner[0]; if (lb) picked.push(lb)

  return picked
}

function pickHiitC2(exercises, usedIds, hasDumbbells) {
  const hiit    = pool(exercises, 'hiit', { hasDumbbells, burner:false, usedIds })
  const hBurner = pool(exercises, 'hiit', { hasDumbbells, burner:true,  usedIds })
  const cores   = pool(exercises, 'core', { hasDumbbells, burner:false, usedIds })
  const picked  = []

  const h1 = hiit[0]; if (h1) picked.push(h1)
  const h2 = hiit.find(e => !picked.find(p=>p.id===e.id))
  if (h2) picked.push(h2)
  const hb = hBurner.find(e => !picked.find(p=>p.id===e.id))
  if (hb) picked.push(hb)
  const core = cores[0]; if (core) picked.push(core)

  return picked
}

// ── Upper Strength Circuits ───────────────────────────────
// Pick a random muscle group, then fill slots from that group
function pickUpperC1(exercises, usedIds, hasDumbbells) {
  const upper = pool(exercises, 'upper', { hasDumbbells, burner:false, usedIds })
  const GROUPS = ['chest','back','shoulder','bicep','tricep']
  const chosenGroup = GROUPS[Math.floor(Math.random() * GROUPS.length)]

  const grouped = upper.filter(e => muscleGroup(e) === chosenGroup)
  const fallback = upper

  // Compound: prefer exercises that are not isolation
  const compPool = grouped.length >= 3 ? grouped : fallback
  const comp = compPool.find(e => {
    const n = (e.name||'').toLowerCase()
    return ['press','row','pull','fly','curl','raise','dip','push-up','pushup'].some(k=>n.includes(k))
  }) || compPool[0]
  const picked = [comp].filter(Boolean)

  // Secondary: same group if possible, different exercise
  const secPool = (grouped.length >= 2 ? grouped : fallback)
    .filter(e => !picked.find(p=>p.id===e.id))
  const sec = secPool[0]
  if (sec) picked.push(sec)

  // Isolation
  const isoPool = (grouped.length >= 3 ? grouped : fallback)
    .filter(e => !picked.find(p=>p.id===e.id))
  const iso = isoPool.find(e => {
    const n = (e.name||'').toLowerCase()
    return ['curl','raise','fly','extension','kickback','shrug','pullover'].some(k=>n.includes(k))
  }) || isoPool[0]
  if (iso) picked.push(iso)

  return picked
}

function pickUpperC2(exercises, usedIds, hasDumbbells) {
  const upper   = pool(exercises, 'upper',  { hasDumbbells, burner:false, usedIds })
  const uBurner = pool(exercises, 'upper',  { hasDumbbells, burner:true,  usedIds })
  const GROUPS  = ['chest','back','shoulder','bicep','tricep']
  const chosenGroup = GROUPS[Math.floor(Math.random() * GROUPS.length)]

  const grouped = upper.filter(e => muscleGroup(e) === chosenGroup)
  const pool2   = grouped.length >= 3 ? grouped : upper
  const picked  = []

  const comp = pool2.find(e => {
    const n = (e.name||'').toLowerCase()
    return ['press','row','pull','fly','curl','raise','dip','push-up','pushup'].some(k=>n.includes(k))
  }) || pool2[0]
  if (comp) picked.push(comp)

  const sec = pool2.find(e => !picked.find(p=>p.id===e.id))
  if (sec) picked.push(sec)

  const iso = pool2.find(e => {
    const n = (e.name||'').toLowerCase()
    return !picked.find(p=>p.id===e.id) &&
      ['curl','raise','fly','extension','kickback','shrug','pullover'].some(k=>n.includes(k))
  }) || pool2.find(e => !picked.find(p=>p.id===e.id))
  if (iso) picked.push(iso)

  // Upper burner last
  const burner = uBurner[0]
  if (burner) picked.push(burner)

  return picked
}

// ── Lower Strength Circuits ───────────────────────────────
function pickLowerC1(exercises, usedIds, hasDumbbells) {
  const lower  = pool(exercises, 'lower', { hasDumbbells, burner:false, usedIds })
  const picked = []

  // Slot 1: squat
  const sq = lower.find(isPureSquat) || lower[0]
  if (sq) picked.push(sq)

  // Slot 2: squat/lunge/hinge (not same as slot 1)
  const s2 = lower.find(e =>
    !picked.find(p=>p.id===e.id) && !isPureSquat(e)
  )
  if (s2) picked.push(s2)

  // Slot 3: filler — anything not already picked
  const s3 = lower.find(e => !picked.find(p=>p.id===e.id))
  if (s3) picked.push(s3)

  return picked
}

function pickLowerC2(exercises, usedIds, hasDumbbells) {
  const lower   = pool(exercises, 'lower', { hasDumbbells, burner:false, usedIds })
  const lBurner = pool(exercises, 'lower', { hasDumbbells, burner:true,  usedIds })
  const picked  = []

  // Slot 1: lunge
  const lu = lower.find(isLunge) || lower[0]
  if (lu) picked.push(lu)

  // Slot 2: squat or lunge (no repeats)
  const s2 = lower.find(e =>
    !picked.find(p=>p.id===e.id) &&
    (isPureSquat(e) || isLunge(e))
  )
  if (s2) picked.push(s2)

  // Slot 3: hinge
  const hi = lower.find(e =>
    !picked.find(p=>p.id===e.id) && isHinge(e)
  ) || lower.find(e => !picked.find(p=>p.id===e.id))
  if (hi) picked.push(hi)

  // Slot 4: lower burner
  const burner = lBurner[0]
  if (burner) picked.push(burner)

  return picked
}

// ── Whole Body Circuits ───────────────────────────────────
function pickWholeC1(exercises, usedIds, hasDumbbells) {
  const lower   = pool(exercises, 'lower', { hasDumbbells, burner:false, usedIds })
  const upper   = pool(exercises, 'upper', { hasDumbbells, burner:false, usedIds })
  const uBurner = pool(exercises, 'upper', { hasDumbbells, burner:true,  usedIds })
  const cores   = pool(exercises, 'core',  { hasDumbbells, burner:false, usedIds })
  const picked  = []

  const lo = lower[0]; if (lo) picked.push(lo)
  const up = upper[0]; if (up) picked.push(up)
  const ub = uBurner[0]; if (ub) picked.push(ub)
  const co = cores[0]; if (co) picked.push(co)

  return picked
}

function pickWholeC2(exercises, usedIds, hasDumbbells) {
  const lower   = pool(exercises, 'lower', { hasDumbbells, burner:false, usedIds })
  const upper   = pool(exercises, 'upper', { hasDumbbells, burner:false, usedIds })
  const lBurner = pool(exercises, 'lower', { hasDumbbells, burner:true,  usedIds })
  const picked  = []

  const lo = lower[0]; if (lo) picked.push(lo)
  const up = upper[0]; if (up) picked.push(up)
  const lb = lBurner[0]; if (lb) picked.push(lb)

  return picked
}

// ── Combo Circuits ────────────────────────────────────────
function pickComboC1(exercises, usedIds, hasDumbbells) {
  const upper   = pool(exercises, 'upper', { hasDumbbells, burner:false, usedIds })
  const lower   = pool(exercises, 'lower', { hasDumbbells, burner:false, usedIds })
  const allStr  = shuffle([...upper, ...lower])
  const hiit    = pool(exercises, 'hiit',  { hasDumbbells, burner:false, usedIds })
  const picked  = []

  // Slot 1: strength compound
  const comp = allStr.find(e => {
    const n = (e.name||'').toLowerCase()
    return ['press','squat','row','deadlift','lunge','pull'].some(k=>n.includes(k))
  }) || allStr[0]
  if (!comp) return picked
  picked.push(comp)

  // Slot 2: burner from same category as compound
  const sameCatBurner = pool(exercises, comp.category, { hasDumbbells, burner:true, usedIds })
  const burner = sameCatBurner[0]
  if (burner) picked.push(burner)

  // Slot 3: HIIT
  const h = hiit.find(e => !picked.find(p=>p.id===e.id))
  if (h) picked.push(h)

  return picked
}

function pickComboC2(exercises, usedIds, hasDumbbells) {
  const lower   = pool(exercises, 'lower', { hasDumbbells, burner:false, usedIds })
  const lBurner = pool(exercises, 'lower', { hasDumbbells, burner:true,  usedIds })
  const hiit    = pool(exercises, 'hiit',  { hasDumbbells, burner:false, usedIds })
  const cores   = pool(exercises, 'core',  { hasDumbbells, burner:false, usedIds })
  const cBurner = pool(exercises, 'core',  { hasDumbbells, burner:true,  usedIds })
  const picked  = []

  // Slot 1: lower compound
  const comp = lower.find(e => {
    const n = (e.name||'').toLowerCase()
    return ['squat','lunge','deadlift','rdl'].some(k=>n.includes(k))
  }) || lower[0]
  if (comp) picked.push(comp)

  // Slot 2: lower burner (same muscle group)
  const lb = lBurner[0]
  if (lb) picked.push(lb)

  // Slot 3: jumping HIIT
  const jump = hiit.find(e => isJumpingHiit(e) && !picked.find(p=>p.id===e.id))
    || hiit.find(e => !picked.find(p=>p.id===e.id))
  if (jump) picked.push(jump)

  // Slot 4: timed core
  const timedCore = cores.find(e => isTimed(e) && !picked.find(p=>p.id===e.id))
    || cBurner[0]
    || cores[0]
  if (timedCore) picked.push(timedCore)

  return picked
}

// ── Circuit 3 / Burner / Core rounds ─────────────────────
export function generateExtraRound(exercises, type, existingCircuits, hasDumbbells = true) {
  const usedIds = new Set(existingCircuits.flat().map(e=>e.id))

  if (type === 'circuit3') {
    // C1 rules based on what style was used — passed as focus in existingCircuits[2]
    const focus = existingCircuits[2] || 'upper'
    if (focus === 'upper') return pickUpperC1(exercises, usedIds, hasDumbbells)
    if (focus === 'lower') return pickLowerC1(exercises, usedIds, hasDumbbells)
    if (focus === 'whole') return pickWholeC1(exercises, usedIds, hasDumbbells)
    // HIIT/combo — use hiit C1
    return pickHiitC1(exercises, usedIds, hasDumbbells)
  }

  if (type === 'burner') {
    // 2 burners from same category
    const cats = ['upper','lower','hiit','core']
    const cat = cats[Math.floor(Math.random() * cats.length)]
    const burners = pool(exercises, cat, { hasDumbbells, burner:true, usedIds })
    return burners.slice(0, 2)
  }

  if (type === 'core') {
    // 2 core + 1 core burner
    const cores   = pool(exercises, 'core', { hasDumbbells, burner:false, usedIds })
    const cBurner = pool(exercises, 'core', { hasDumbbells, burner:true,  usedIds })
    const picked  = []
    if (cores[0]) picked.push(cores[0])
    if (cores[1]) picked.push(cores[1])
    if (cBurner[0]) picked.push(cBurner[0])
    return picked
  }

  return []
}

// ── Ensure minimum ────────────────────────────────────────
function ensure(circuit, min, exercises, usedIds, hasDumbbells) {
  if (circuit.length >= min) return circuit
  const all = shuffle(exercises.filter(e =>
    !e.flagged && !usedIds.has(e.id) &&
    !circuit.find(c=>c.id===e.id) &&
    equipOk(e, hasDumbbells)
  ))
  while (circuit.length < min && all.length > 0) circuit.push(all.shift())
  return circuit
}

// ── Main generator ────────────────────────────────────────
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
    circuit1.forEach(e=>usedIds.add(e.id))
    circuit2 = pickHiitC2(exercises, usedIds, hasDumbbells)

  } else if (style === 'combo') {
    circuit1 = pickComboC1(exercises, usedIds, hasDumbbells)
    circuit1.forEach(e=>usedIds.add(e.id))
    circuit2 = pickComboC2(exercises, usedIds, hasDumbbells)

  } else {
    // Strength
    if (focus === 'upper') {
      circuit1 = pickUpperC1(exercises, usedIds, hasDumbbells)
      circuit1.forEach(e=>usedIds.add(e.id))
      circuit2 = pickUpperC2(exercises, usedIds, hasDumbbells)

    } else if (focus === 'lower') {
      circuit1 = pickLowerC1(exercises, usedIds, hasDumbbells)
      circuit1.forEach(e=>usedIds.add(e.id))
      circuit2 = pickLowerC2(exercises, usedIds, hasDumbbells)

    } else {
      circuit1 = pickWholeC1(exercises, usedIds, hasDumbbells)
      circuit1.forEach(e=>usedIds.add(e.id))
      circuit2 = pickWholeC2(exercises, usedIds, hasDumbbells)
    }
  }

  circuit2.forEach(e=>usedIds.add(e.id))

  circuit1 = ensure(circuit1, 3, exercises, usedIds, hasDumbbells)
  circuit2 = ensure(circuit2, 3, exercises, usedIds, hasDumbbells)

  return { circuit1, circuit2, usedIds }
}
