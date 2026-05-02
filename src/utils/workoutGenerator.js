/**
 * workoutGenerator.js
 *
 * Fixed circuit rules:
 *  UPPER    → 4 exercises, core LAST, both circuits
 *  LOWER    → 4 exercises, min 1 squat + 1 hinge, no core
 *  WHOLE    → 4 exercises, core LAST, both circuits, upper + lower mix
 *  HIIT     → Circuit 1 = 3 exercises, Circuit 2 = 4 exercises
 *  COMBO    → 4 exercises, core LAST, both circuits, 1 HIIT move per circuit
 */

const SQUAT_KEYWORDS  = ['squat', 'lunge', 'goblet', 'curtsy lunge']
// Pure squat patterns (no lunges)
const PURE_SQUAT_KW   = ['squat', 'goblet', 'front hold squat', 'sumo squat', 'narrow goblet', 'suitcase squat', 'duck walk', 'box squat', 'wall sit']
const HINGE_KEYWORDS  = ['hinge', 'rdl', 'deadlift', 'dead lift', 'good morning', 'romanian', 'stiff leg']
const LUNGE_KEYWORDS  = [
  'lunge', 'curtsy lunge', 'curtsy', 'split squat', 'step up',
  'step-up', 'reverse lunge', 'forward lunge', 'lateral lunge',
  'angled lunge', 'front rack lunge', 'front rack curtsy',
  'curtsy lunge to knee'
]

function isSQuat(ex) {
  const n = ex.name.toLowerCase()
  return SQUAT_KEYWORDS.some(k => n.includes(k))
}

function isPureSquat(ex) {
  const n = ex.name.toLowerCase()
  return PURE_SQUAT_KW.some(k => n.includes(k))
}

function isHinge(ex) {
  const n = ex.name.toLowerCase()
  return HINGE_KEYWORDS.some(k => n.includes(k))
}

/** Returns true if the exercise is a lunge-pattern movement */
function isLunge(ex) {
  const n = ex.name.toLowerCase()
  return LUNGE_KEYWORDS.some(k => n.includes(k))
}

/** Returns true if the exercise is a push-up variation */
function isPushUp(ex) {
  const n = ex.name.toLowerCase()
  return n.includes('push-up') || n.includes('push up') || n.includes('pushup')
}

// ── Push / Pull classification ──────────────────────────
const PUSH_KEYWORDS = ['press','push','fly','flye','dip','chest','tricep','lateral raise','front raise','around the world','overhead','skull','arnold','halo']
const PULL_KEYWORDS = ['row','curl','pull','shrug','rear delt','reverse fly','face pull','upright row','lawnmower','renegade','pullover','hammer curl','drag curl','concentration','seated bicep','incline curl']

function isPush(ex) {
  if (ex.category !== 'upper') return false
  const n = ex.name.toLowerCase()
  const pushScore = PUSH_KEYWORDS.filter(k => n.includes(k)).length
  const pullScore = PULL_KEYWORDS.filter(k => n.includes(k)).length
  return pushScore >= pullScore && pushScore > 0
}

function isPull(ex) {
  if (ex.category !== 'upper') return false
  const n = ex.name.toLowerCase()
  const pushScore = PUSH_KEYWORDS.filter(k => n.includes(k)).length
  const pullScore = PULL_KEYWORDS.filter(k => n.includes(k)).length
  return pullScore > pushScore
}

// Big compound moves — should go first in circuit
const BIG_PUSH = ['chest press','bench press','db press','push press','incline','flat bench','thruster','chest fly','flat bench db']
const BIG_PULL = ['bent over row','single arm row','renegade row','db row','lawnmower','gorilla','pullover','incline db row']

function isBigPush(ex) { const n = ex.name.toLowerCase(); return BIG_PUSH.some(k => n.includes(k)) }
function isBigPull(ex) { const n = ex.name.toLowerCase(); return BIG_PULL.some(k => n.includes(k)) }

/** Returns true if a HIIT exercise is lower-body dominant — excluded from upper HIIT focus */
const LOWER_HIIT_KEYWORDS = [
  'squat', 'lunge', 'jump squat', 'bound', 'broad jump', 'vertical jump',
  'ice skater', 'skater', 'tuck jump', 'star jump', 'high knee', 'high knees',
  'lunge jump', 'jump lunge', 'box jump', 'step up'
]
function isLowerDominantHiit(ex) {
  if (ex.category !== 'hiit') return false
  const n = ex.name.toLowerCase()
  return LOWER_HIIT_KEYWORDS.some(k => n.includes(k))
}

/** Filters a candidate list to avoid a second lunge if one already picked */
function filterLunges(candidates, picked) {
  const hasLunge = picked.some(isLunge)
  if (!hasLunge) return candidates
  return candidates.filter(e => !isLunge(e))
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Build available pool ─────────────────────────────────────
function buildPool(exercises, { focus, style, hasDumbbells, hasPullupBar, hasBench, hasKettlebell }) {
  return exercises.filter(ex => {
    // HIIT = bodyweight only
    if (style === 'hiit' && ex.equipment.length > 0) return false

    // Equipment
    const eq = Array.isArray(ex.equipment) ? ex.equipment : []
    if (eq.includes('dumbbells')  && !hasDumbbells)  return false
    if (eq.includes('pullup_bar') && !hasPullupBar)  return false
    if (eq.includes('bench')      && !hasBench)      return false
    if (eq.includes('kettlebell') && !hasKettlebell) return false

    // Style → category
    if (style === 'hiit')     { if (!['hiit', 'core'].includes(ex.category)) return false }
    if (style === 'strength') { if (ex.category === 'hiit') return false }
    // combo = everything

    // Focus — for HIIT style, always allow hiit category regardless of focus
    if (style === 'hiit') {
      if (focus === 'upper') {
        if (!['hiit', 'core', 'upper'].includes(ex.category)) return false
        if (isLowerDominantHiit(ex)) return false  // exclude leg-heavy HIIT from upper
        return true
      }
      if (focus === 'lower') return ['hiit', 'lower'].includes(ex.category)
      if (focus === 'legs_shoulders') return ['hiit', 'lower', 'core'].includes(ex.category)
      return true // whole
    }
    if (focus === 'upper') return ['upper', 'core'].includes(ex.category)
    if (focus === 'lower') return ['lower'].includes(ex.category) // no core for lower
    if (focus === 'legs_shoulders') {
      // Lower body exercises + shoulder exercises from upper + core
      if (ex.category === 'lower') return true
      if (ex.category === 'core')  return true
      if (ex.category === 'upper') return isShoulder(ex)
      return false
    }
    return true // whole = all
  })
}

// ── UPPER circuit: 4 exercises, core last ────────────────────
// Rules: no dup push-ups, no dup lunges, exactly 1 core always last
function pickUpperCircuit(pool, usedIds) {
  const available = shuffle(pool.filter(e => !usedIds.has(e.id)))
  const cores     = available.filter(e => e.category === 'core')
  const nonCore   = available.filter(e => e.category !== 'core')
  const picked    = []

  for (const ex of nonCore) {
    if (picked.length >= 3) break
    if (isLunge(ex)  && picked.some(isLunge))  continue
    if (isPushUp(ex) && picked.some(isPushUp)) continue
    picked.push(ex)
  }

  // Exactly 1 core last
  const core = cores.find(c => !picked.find(p => p.id === c.id))
  if (core) picked.push(core)

  return picked
}

// ── PUSH circuit: big push first, no dup push-ups, 1 core last ─
function pickPushCircuit(pool, usedIds) {
  const available = shuffle(pool.filter(e => !usedIds.has(e.id)))
  const cores     = available.filter(e => e.category === 'core')
  const pushExs   = shuffle(available.filter(e => isPush(e)))
  const bigPushes = pushExs.filter(isBigPush)
  const picked    = []
  const big = bigPushes[0] || pushExs[0]
  if (big) picked.push(big)
  for (const ex of pushExs) {
    if (picked.length >= 3) break
    if (picked.find(p => p.id === ex.id)) continue
    if (isPushUp(ex) && picked.some(isPushUp)) continue
    picked.push(ex)
  }
  const core = cores.find(c => !picked.find(p => p.id === c.id))
  if (core) picked.push(core)
  return picked
}

// ── PULL circuit: big pull first, 1 core last ─────────────
function pickPullCircuit(pool, usedIds) {
  const available = shuffle(pool.filter(e => !usedIds.has(e.id)))
  const cores     = available.filter(e => e.category === 'core')
  const pullExs   = shuffle(available.filter(e => isPull(e)))
  const bigPulls  = pullExs.filter(isBigPull)
  const picked    = []
  const big = bigPulls[0] || pullExs[0]
  if (big) picked.push(big)
  for (const ex of pullExs) {
    if (picked.length >= 3) break
    if (picked.find(p => p.id === ex.id)) continue
    picked.push(ex)
  }
  const core = cores.find(c => !picked.find(p => p.id === c.id))
  if (core) picked.push(core)
  return picked
}

// ── LOWER circuit: 3 or 4 exercises, 1 squat + 1 hinge min, no core
function pickLowerCircuit(pool, usedIds, count = 4, circuitNum = 1) {
  const available = shuffle(pool.filter(e => !usedIds.has(e.id)))
  const squats = available.filter(isPureSquat)
  const lunges = available.filter(e => isLunge(e) && !isPureSquat(e))
  const hinges = available.filter(isHinge)
  const others = available.filter(e => !isSQuat(e) && !isHinge(e))
  const picked = []

  // Circuit 1: lead with squat | Circuit 2: lead with lunge
  if (circuitNum === 1) {
    if (squats[0]) picked.push(squats[0])
    const hinge = hinges.find(h => !picked.find(p => p.id === h.id))
    if (hinge) picked.push(hinge)
  } else {
    const lunge = lunges[0] || squats[0]
    if (lunge) picked.push(lunge)
    const hinge = hinges.find(h => !picked.find(p => p.id === h.id))
    if (hinge) picked.push(hinge)
  }

  // Fill remaining — no dup squats or lunges per circuit
  const fillers = shuffle([
    ...squats.filter(s => !picked.find(p => p.id === s.id)),
    ...lunges.filter(l => !picked.find(p => p.id === l.id)),
    ...hinges.filter(h => !picked.find(p => p.id === h.id)),
    ...others
  ])
  for (const ex of fillers) {
    if (picked.length >= count) break
    if (picked.find(p => p.id === ex.id)) continue
    if (isPureSquat(ex) && picked.some(isPureSquat)) continue
    if (isLunge(ex)     && picked.some(isLunge))     continue
    if (isPushUp(ex)    && picked.some(isPushUp))    continue
    picked.push(ex)
  }

  return picked
}

// ── WHOLE BODY circuit: 4 exercises — 40-50% legs, 1 upper, 1 core last
// Layout: Lower → Upper → Lower (hinge) → Core
function pickWholeCircuit(pool, usedIds, style) {
  const available = shuffle(pool.filter(e => !usedIds.has(e.id)))
  const cores     = available.filter(e => e.category === 'core')
  const uppers    = available.filter(e => e.category === 'upper')
  const lowers    = available.filter(e => e.category === 'lower')
  const hiits     = available.filter(e => e.category === 'hiit')
  const picked    = []

  // Combo: 1 HIIT move first
  if (style === 'combo' && hiits.length) {
    picked.push(hiits[0])
  }

  // Slot 1: Lower — squat or lunge
  const lower1 = lowers.find(l =>
    !picked.find(p => p.id === l.id) &&
    !(isPureSquat(l) && picked.some(isPureSquat)) &&
    !(isLunge(l) && picked.some(isLunge))
  )
  if (lower1) picked.push(lower1)

  // Slot 2: Upper — no dup push-ups
  const upper1 = uppers.find(u =>
    !picked.find(p => p.id === u.id) &&
    !(isPushUp(u) && picked.some(isPushUp))
  )
  if (upper1) picked.push(upper1)

  // Slot 3: Second lower — prefer hinge for balance
  const hinges    = lowers.filter(isHinge).filter(h => !picked.find(p => p.id === h.id))
  const moreLower = lowers.filter(l =>
    !picked.find(p => p.id === l.id) &&
    !(isPureSquat(l) && picked.some(isPureSquat)) &&
    !(isLunge(l) && picked.some(isLunge))
  )
  const lower2 = hinges[0] || moreLower[0]
  if (lower2 && picked.length < 3) picked.push(lower2)

  // Slot 4: Core last
  const core = cores.find(c => !picked.find(p => p.id === c.id))
  if (core) picked.push(core)

  return picked
}

// ── HIIT circuit ─────────────────────────────────────────────
// Guarantees at least 50% true HIIT moves per circuit
function pickHiitCircuit(pool, usedIds, count) {
  const available = shuffle(pool.filter(e => !usedIds.has(e.id)))
  const hiits     = available.filter(e => e.category === 'hiit')
  const cores     = available.filter(e => e.category === 'core')
  const picked    = []

  // Minimum HIIT slots = ceil(count/2) guarantees 50%+
  const minHiit = Math.ceil(count / 2)

  // Fill HIIT slots first
  for (const ex of hiits) {
    if (picked.length >= minHiit) break
    if (isPushUp(ex) && picked.some(isPushUp)) continue
    if (isLunge(ex)  && picked.some(isLunge))  continue
    picked.push(ex)
  }

  // Fill remaining with more HIIT then core
  const fillers = shuffle([
    ...hiits.filter(h => !picked.find(p => p.id === h.id)),
    ...cores
  ])
  for (const ex of fillers) {
    if (picked.length >= count - 1) break
    if (!picked.find(p => p.id === ex.id)) {
      if (isPushUp(ex) && picked.some(isPushUp)) continue
      picked.push(ex)
    }
  }

  // Last slot = core
  const hasCoreAlready = picked.some(e => e.category === 'core')
  if (!hasCoreAlready && picked.length < count) {
    const core = cores.find(c => !picked.find(p => p.id === c.id))
    if (core) picked.push(core)
  }

  return picked.slice(0, count)
}

/**
 * Main generator
 * @param {Array}  exercises
 * @param {Object} answers  { focus, style, hasDumbbells, hasPullupBar }
 */
export function generateWorkout(exercises, answers) {
  const { focus, style } = answers
  // Allow passing in already-used IDs to avoid repeats in third circuit

  const opts = {
    ...answers,
    hasDumbbells:   style === 'hiit' ? false : answers.hasDumbbells,
    hasPullupBar:   style === 'hiit' ? false : answers.hasPullupBar,
    hasBench:       style === 'hiit' ? false : (answers.hasBench || false),
    hasKettlebell:  style === 'hiit' ? false : (answers.hasKettlebell || false),
  }

  const pool = buildPool(exercises, opts)

  if (pool.length < 8) {
    throw new Error('Not enough exercises for this combination. Add more in the admin panel!')
  }

  const usedIds = answers.usedIds instanceof Set
    ? new Set(answers.usedIds)
    : new Set(answers.usedIds || [])
  let circuit1, circuit2

  if (style === 'hiit') {
    // Circuit 1 = 3, Circuit 2 = 4
    circuit1 = pickHiitCircuit(pool, usedIds, 3)
    circuit1.forEach(e => usedIds.add(e.id))
    circuit2 = pickHiitCircuit(pool, usedIds, 4)

  } else if (focus === 'lower') {
    // Randomly assign which circuit gets 4 exercises
    const lowerSizes = Math.random() < 0.5 ? [3, 4] : [4, 3]
    circuit1 = pickLowerCircuit(pool, usedIds, lowerSizes[0], 1)
    circuit1.forEach(e => usedIds.add(e.id))
    circuit2 = pickLowerCircuit(pool, usedIds, lowerSizes[1], 2)

  } else if (focus === 'upper') {
    if (style === 'strength' || style === 'combo') {
      // Push/Pull split — randomly assign which goes first
      const pushFirst = Math.random() < 0.5
      circuit1 = pushFirst ? pickPushCircuit(pool, usedIds) : pickPullCircuit(pool, usedIds)
      circuit1.forEach(e => usedIds.add(e.id))
      circuit2 = pushFirst ? pickPullCircuit(pool, usedIds) : pickPushCircuit(pool, usedIds)
    } else {
      circuit1 = pickUpperCircuit(pool, usedIds)
      circuit1.forEach(e => usedIds.add(e.id))
      circuit2 = pickUpperCircuit(pool, usedIds)
    }

  } else {
    // whole body or combo
    circuit1 = pickWholeCircuit(pool, usedIds, style)
    circuit1.forEach(e => usedIds.add(e.id))
    circuit2 = pickWholeCircuit(pool, usedIds, style)
  }

  return { circuit1, circuit2 }
}
