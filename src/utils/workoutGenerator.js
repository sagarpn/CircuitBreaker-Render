/**
 * workoutGenerator.js — V2.1
 *
 * Correct exercise placement uses BOTH movement field AND muscle group tags.
 * 'conditioning' movement = isolation/accessory — placed by muscle group tags.
 *
 * CIRCUIT STRUCTURE:
 *   Circuit 1 = Foundation  — controlled, lower intensity, compound focus
 *   Circuit 2 = Push        — higher intensity, more fatigue, athletic feel
 *   Burnout   = Finisher    — 1-2 exercises, always shown
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
function getTags(ex) {
  if (!ex.ex_tags && !ex.tags) return []
  const raw = ex.ex_tags || ex.tags
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch {
    return typeof raw === 'string' ? raw.split(',').map(t => t.trim()).filter(Boolean) : []
  }
}

function hasTag(ex, tag) { return getTags(ex).includes(tag) }
function getMovement(ex)  { return ex.movement || '' }
function getIntensity(ex) { return ex.intensity || 2 }
function getSkill(ex)     { return ex.skill || 2 }
function getFatigue(ex)   { return ex.fatigue || 2 }

// ── Determine exercise focus from movement + tags ─────────
// This is the key fix — 'conditioning' exercises are placed by muscle group tags
const UPPER_MUSCLES = new Set(['chest','back','shoulders','biceps','triceps'])
const LOWER_MUSCLES = new Set(['quads','hamstrings','glutes','knee_load'])
const UPPER_MOVEMENTS = new Set(['horizontal_push','horizontal_pull','vertical_push'])
const LOWER_MOVEMENTS = new Set(['squat','lunge','hinge','explosive'])

function getExerciseFocus(ex) {
  const mv   = getMovement(ex)
  const tags = getTags(ex)
  const cat  = ex.category || ''
  const name = (ex.name || ex.exercise || '').toLowerCase()

  if (mv === 'core' || cat === 'core') return 'core'

  // Combo exercises with lower movement in name → lower
  const lowerKeywords = ['squat','lunge','deadlift','hinge','rdl','split squat','curtsy','goblet squat']
  const upperKeywords = ['press','curl','row','fly','raise','extension','pull','push-up']
  const isCombo = lowerKeywords.some(k => name.includes(k)) && upperKeywords.some(k => name.includes(k))
  if (isCombo && lowerKeywords.some(k => name.includes(k))) return 'lower'

  if (LOWER_MOVEMENTS.has(mv)) return 'lower'
  if (UPPER_MOVEMENTS.has(mv)) return 'upper'

  // conditioning movement — determine by muscle group tags
  if (mv === 'conditioning' || !mv) {
    if (tags.includes('hiit')) return 'hiit'
    const hasUpper = tags.some(t => UPPER_MUSCLES.has(t))
    const hasLower = tags.some(t => LOWER_MUSCLES.has(t)) && !hasUpper
    if (hasUpper) return 'upper'
    if (hasLower) return 'lower'
    if (cat === 'upper') return 'upper'
    if (cat === 'lower') return 'lower'
    if (cat === 'hiit')  return 'hiit'
  }

  return 'upper'
}

function isHiitExercise(ex) {
  const tags = getTags(ex)
  return tags.includes('hiit') || ex.category === 'hiit'
}

// ── Safety — no stacking back-to-back + session load caps ──
// knee_load cap applied dynamically — higher for lower body focus
const SESSION_LOAD_CAPS = {
  shoulder_load:  2,   // max 2 shoulder-load exercises per full workout
  wrist_load:     3,   // max 3 wrist-load exercises per full workout
  low_back_load:  2,   // max 2 low-back-load exercises per full workout
  // knee_load cap set per focus in buildPools
}

function getLoadCaps(focus) {
  return {
    shoulder_load: 2,
    wrist_load:    3,
    low_back_load: 2,
    knee_load:     focus === 'lower' ? 6 : 3, // lower body = lots of knee work, that's fine
  }
}

function countLoad(allPicked, loadTag) {
  return allPicked.filter(e => hasTag(e, loadTag)).length
}

// picked     = exercises in current circuit
// allSession = all exercises across all circuits so far (for load caps)
// focus      = workout focus (affects knee_load cap)
function wouldStack(picked, candidate, allSession = [], focus = 'upper') {
  if (picked.length === 0 && allSession.length === 0) return false

  // Back-to-back checks within circuit
  if (picked.length > 0) {
    const last = picked[picked.length - 1]
    if (getFatigue(last) >= 4 && getFatigue(candidate) >= 4) return true
    if (getSkill(last)   >= 4 && getSkill(candidate)   >= 4) return true
    if (hasTag(last, 'shoulder_load') && hasTag(candidate, 'shoulder_load')) return true
    if (hasTag(last, 'wrist_load')    && hasTag(candidate, 'wrist_load'))    return true
    if (hasTag(last, 'knee_load')     && hasTag(candidate, 'knee_load'))     return true
  }

  // Session-wide load caps
  const caps = getLoadCaps(focus)
  const session = [...allSession, ...picked]
  for (const [loadTag, cap] of Object.entries(caps)) {
    if (hasTag(candidate, loadTag) && countLoad(session, loadTag) >= cap) return true
  }

  return false
}

function dupMovement(picked, candidate) {
  const mv = getMovement(candidate)
  if (!mv || mv === 'conditioning') return false // conditioning = isolation, allow multiple
  return picked.some(p => getMovement(p) === mv && getMovement(p) !== 'conditioning')
}

// ── Equipment filter ──────────────────────────────────────
function equipOk(ex, { hasDumbbells, hasBench, hasKettlebell, isHiit }) {
  const eq = Array.isArray(ex.equipment)
    ? ex.equipment
    : (() => { try { return JSON.parse(ex.equipment || '[]') } catch {
        const s = (ex.equipment || '')
        if (s === 'none' || !s) return []
        return s.split(',').map(e => e.trim()).filter(Boolean)
      }
    })()

  if (isHiit && eq.length > 0) return false
  if (eq.includes('dumbbells')   && !hasDumbbells)  return false
  if (eq.includes('bench')       && !hasBench)       return false
  if (eq.includes('kettlebells') && !hasKettlebell)  return false
  if (eq.includes('dumbbells, bench') && (!hasDumbbells || !hasBench)) return false
  if (eq.includes('dumbbells, kettlebells') && (!hasDumbbells || !hasKettlebell)) return false
  return true
}

// ── Build focused pools ───────────────────────────────────
function buildPools(exercises, opts) {
  const { focus = 'upper', style, hasDumbbells, hasBench, hasKettlebell, usedIds = new Set() } = opts
  const isHiit = style === 'hiit'

  const filtered = exercises.filter(ex => {
    if (ex.flagged || usedIds.has(ex.id)) return false
    return equipOk(ex, { hasDumbbells, hasBench, hasKettlebell, isHiit })
  })

  const isStr = style === 'strength' || style === 'combo'

  // upper/lower pools: exclude hiit-tagged exercises when building strength circuits
  // HIIT exercises belong in the hiit pool only
  const upper   = filtered.filter(e =>
    getExerciseFocus(e) === 'upper' && !(isStr && isHiitExercise(e))
  )
  const lower   = filtered.filter(e =>
    getExerciseFocus(e) === 'lower' && !(isStr && isHiitExercise(e))
  )
  const core    = filtered.filter(e =>
    getExerciseFocus(e) === 'core' && !(isStr && isHiitExercise(e))
  )
  const hiit    = filtered.filter(e => isHiitExercise(e) && (!isHiit || equipOk(e, {hasDumbbells:false,hasBench:false,hasKettlebell:false,isHiit:true})))
  const all     = filtered

  return { upper, lower, core, hiit, all }
}

// ── Upper Strength ────────────────────────────────────────
// Circuit 1: compound push → secondary → isolation (no core)
// Circuit 2: compound pull → secondary → isolation → core
function pickUpperStrength(pools, usedIds, isCircuit1, allSession = []) {
  const { upper, core } = pools
  const available = shuffle(upper.filter(e => !usedIds.has(e.id)))
  const picked = []

  const pushMvs = ['horizontal_push']
  const pullMvs = ['horizontal_pull', 'vertical_push']
  const ws = (p, c) => wouldStack(p, c, allSession, 'upper')

  if (isCircuit1) {
    const compPush = available.find(e =>
      pushMvs.includes(getMovement(e)) &&
      (hasTag(e, 'compound') || hasTag(e, 'anchor')) && !ws(picked, e)
    ) || available.find(e => pushMvs.includes(getMovement(e)) && !ws(picked, e))
    if (compPush) picked.push(compPush)

    const sec = available.find(e =>
      !picked.find(p => p.id === e.id) && !dupMovement(picked, e) && !ws(picked, e)
    )
    if (sec) picked.push(sec)

    const iso = available.find(e =>
      !picked.find(p => p.id === e.id) && hasTag(e, 'isolation') && !ws(picked, e)
    ) || available.find(e => !picked.find(p => p.id === e.id) && !ws(picked, e))
    if (iso) picked.push(iso)

  } else {
    const compPull = available.find(e =>
      pullMvs.includes(getMovement(e)) &&
      (hasTag(e, 'compound') || hasTag(e, 'anchor')) && !ws(picked, e)
    ) || available.find(e => pullMvs.includes(getMovement(e)) && !ws(picked, e))
    if (compPull) picked.push(compPull)

    const sec = available.find(e =>
      !picked.find(p => p.id === e.id) && !dupMovement(picked, e) && !ws(picked, e)
    )
    if (sec) picked.push(sec)

    const iso = available.find(e =>
      !picked.find(p => p.id === e.id) && hasTag(e, 'isolation') && !ws(picked, e)
    ) || available.find(e => !picked.find(p => p.id === e.id) && !ws(picked, e))
    if (iso) picked.push(iso)

    const coreEx = shuffle(core.filter(e => !usedIds.has(e.id)))[0]
    if (coreEx) picked.push(coreEx)
  }

  return picked
}

// ── Lower Strength ────────────────────────────────────────
// Circuit 1: squat + hinge + unilateral/accessory (3 exercises)
// Circuit 2: lunge + hinge/hamstring + explosive + glute (4 exercises)
function pickLowerStrength(pools, usedIds, isCircuit1, allSession = []) {
  const { lower } = pools
  const available = shuffle(lower.filter(e => !usedIds.has(e.id)))
  const picked = []
  const ws = (p, c) => wouldStack(p, c, allSession, 'lower')

  const squats    = available.filter(e => getMovement(e) === 'squat')
  const lunges    = available.filter(e => getMovement(e) === 'lunge')
  const hinges    = available.filter(e => getMovement(e) === 'hinge')
  const explosive = available.filter(e => getMovement(e) === 'explosive' || hasTag(e,'plyometric'))
  const glutes    = available.filter(e => hasTag(e,'glutes') && getMovement(e) !== 'lunge')

  if (isCircuit1) {
    const sq = squats.find(e => getSkill(e) <= 3 && !ws(picked,e)) || squats.find(e => !ws(picked,e))
    if (sq) picked.push(sq)
    const hi = hinges.find(e => !picked.find(p=>p.id===e.id) && !ws(picked,e))
    if (hi) picked.push(hi)
    const uni = available.find(e =>
      !picked.find(p=>p.id===e.id) && !ws(picked,e) &&
      (hasTag(e,'unilateral') || hasTag(e,'accessory'))
    )
    if (uni) picked.push(uni)
  } else {
    const lu = lunges.find(e => !ws(picked,e))
    if (lu) picked.push(lu)
    const hi = hinges.find(e => !picked.find(p=>p.id===e.id) && !ws(picked,e))
    if (hi) picked.push(hi)
    const exp = explosive.find(e =>
      !picked.find(p=>p.id===e.id) && !ws(picked,e) && getSkill(e) <= 3
    ) || available.find(e => !picked.find(p=>p.id===e.id) && !ws(picked,e) && !dupMovement(picked,e))
    if (exp) picked.push(exp)
    const gl = glutes.find(e => !picked.find(p=>p.id===e.id) && !ws(picked,e))
    if (gl) picked.push(gl)
  }

  return picked
}

// ── Whole Body Strength ───────────────────────────────────
// Each circuit: lower compound + upper + secondary lower + core
function pickWholeStrength(pools, usedIds, allSession = []) {
  const { upper, lower, core } = pools
  const availLower = shuffle(lower.filter(e => !usedIds.has(e.id)))
  const availUpper = shuffle(upper.filter(e => !usedIds.has(e.id)))
  const availCore  = shuffle(core.filter(e => !usedIds.has(e.id)))
  const picked = []
  const ws = (p, c) => wouldStack(p, c, allSession, 'whole')

  const l1 = availLower.find(e => (hasTag(e,'compound') || hasTag(e,'anchor')) && !ws(picked,e)) || availLower.find(e => !ws(picked,e))
  if (l1) picked.push(l1)

  const u1 = availUpper.find(e => !ws(picked,e))
  if (u1) picked.push(u1)

  const l2 = availLower.find(e =>
    !picked.find(p=>p.id===e.id) && !dupMovement(picked,e) && !ws(picked,e)
  )
  if (l2) picked.push(l2)

  const c1 = availCore[0]
  if (c1) picked.push(c1)

  return picked
}

// ── HIIT circuits ─────────────────────────────────────────
function pickHiitCircuit(pools, usedIds, count, focus, allSession = []) {
  const { hiit, core, upper, lower } = pools
  const availHiit = shuffle(hiit.filter(e => !usedIds.has(e.id)))
  const availCore = shuffle(core.filter(e => !usedIds.has(e.id)))
  const picked = []
  const ws = (p, c) => wouldStack(p, c, allSession, 'whole')
  const minHiit = Math.ceil(count * 0.6)

  // Filter hiit by focus
  let focusedHiit = availHiit
  if (focus === 'upper') {
    focusedHiit = availHiit.filter(e => {
      const tags = getTags(e)
      return !['squat','lunge','hinge'].includes(getMovement(e)) ||
             tags.includes('chest') || tags.includes('shoulders') || tags.includes('back')
    })
  }
  if (focus === 'lower') {
    focusedHiit = availHiit.filter(e => {
      const mv = getMovement(e)
      return ['squat','lunge','hinge','explosive','conditioning'].includes(mv) ||
             getTags(e).some(t => LOWER_MUSCLES.has(t))
    })
  }

  // Fill HIIT slots
  for (const ex of focusedHiit) {
    if (picked.length >= minHiit) break
    if (dupMovement(picked, ex)) continue
    if (ws(picked, ex)) continue
    picked.push(ex)
  }

  // Fill remaining
  const fillers = shuffle([
    ...focusedHiit.filter(h => !picked.find(p=>p.id===h.id)),
    ...availCore
  ])
  for (const ex of fillers) {
    if (picked.length >= count - 1) break
    if (picked.find(p=>p.id===ex.id)) continue
    if (dupMovement(picked, ex)) continue
    if (ws(picked, ex)) continue
    picked.push(ex)
  }

  // Core last
  if (!picked.some(e => getExerciseFocus(e) === 'core')) {
    const c = availCore.find(e => !picked.find(p=>p.id===e.id))
    if (c && picked.length < count) picked.push(c)
  }

  return picked.slice(0, count)
}

// ── Combo circuits ────────────────────────────────────────
function pickComboCircuit(pools, usedIds, circuitNum, allSession = []) {
  const { upper, lower, hiit, core } = pools
  const allStrength = shuffle([...upper, ...lower].filter(e => !usedIds.has(e.id) && !isHiitExercise(e)))
  const availHiit   = shuffle(hiit.filter(e => !usedIds.has(e.id)))
  const availCore   = shuffle(core.filter(e => !usedIds.has(e.id)))
  const picked = []

  // Slot 1: strength compound
  const comp = allStrength.find(e => hasTag(e,'compound') || hasTag(e,'anchor')) || allStrength[0]
  if (comp) picked.push(comp)

  // Slot 2: HIIT
  const hiitEx = availHiit.find(e =>
    !picked.find(p=>p.id===e.id) && !dupMovement(picked,e) && !wouldStack(picked,e)
  )
  if (hiitEx) picked.push(hiitEx)

  // Slot 3: accessory strength
  const acc = allStrength.find(e =>
    !picked.find(p=>p.id===e.id) && hasTag(e,'accessory') && !wouldStack(picked,e)
  ) || allStrength.find(e => !picked.find(p=>p.id===e.id) && !wouldStack(picked,e))
  if (acc) picked.push(acc)

  // Slot 4: core (c1) or jump (c2)
  const jumpExs = availHiit.filter(e => hasTag(e,'plyometric'))
  const last = circuitNum === 2
    ? (jumpExs.find(e => !picked.find(p=>p.id===e.id) && !wouldStack(picked,e)) || availCore[0])
    : availCore[0]
  if (last) picked.push(last)

  return picked
}

// ── Burnout ───────────────────────────────────────────────
function pickBurnout(pools, usedIds) {
  const { all } = pools
  const available = shuffle(all.filter(e => !usedIds.has(e.id)))

  // burnout or finisher tagged, prefer timed
  const tagged = available.filter(e => hasTag(e,'burnout') || hasTag(e,'finisher'))
  const timed  = tagged.filter(e => e.format === 'timed')
  const pool   = timed.length > 0 ? [...timed, ...tagged] : (tagged.length > 0 ? tagged : available)

  const picked = []
  for (const ex of pool) {
    if (picked.length >= 2) break
    if (picked.find(p=>p.id===ex.id)) continue
    if (wouldStack(picked, ex)) continue
    picked.push(ex)
  }

  return picked
}

// ── Ensure minimum 3 ─────────────────────────────────────
function ensure3(circuit, pools, usedIds) {
  if (circuit.length >= 3) return circuit
  const ids = new Set(circuit.map(e => e.id))
  const fillers = shuffle(pools.all.filter(e => !usedIds.has(e.id) && !ids.has(e.id)))
  while (circuit.length < 3 && fillers.length > 0) {
    circuit.push(fillers.shift())
  }
  return circuit
}

// ── Main generator ────────────────────────────────────────
export function generateWorkout(exercises, answers) {
  const {
    focus        = 'upper',
    style        = 'strength',
    hasDumbbells = false,
    hasBench     = false,
    hasKettlebell= false,
    usedIds: existingIds = new Set()
  } = answers

  const usedIds = new Set(existingIds)
  const opts = { focus, style, hasDumbbells, hasBench, hasKettlebell }
  const pools = buildPools(exercises, { ...opts, usedIds })

  let circuit1 = [], circuit2 = [], burnout = []

  if (style === 'hiit') {
    circuit1 = pickHiitCircuit(pools, usedIds, 3, focus)
    circuit1.forEach(e => usedIds.add(e.id))
    circuit2 = pickHiitCircuit(pools, usedIds, 4, focus, circuit1)
    circuit2.forEach(e => usedIds.add(e.id))

  } else if (style === 'combo') {
    circuit1 = pickComboCircuit(pools, usedIds, 1)
    circuit1.forEach(e => usedIds.add(e.id))
    circuit2 = pickComboCircuit(pools, usedIds, 2, circuit1)
    circuit2.forEach(e => usedIds.add(e.id))

  } else {
    // Strength
    if (focus === 'upper') {
      const pushFirst = Math.random() < 0.5
      circuit1 = pickUpperStrength(pools, usedIds, pushFirst)
      circuit1.forEach(e => usedIds.add(e.id))
      circuit2 = pickUpperStrength(pools, usedIds, !pushFirst, circuit1)
      circuit2.forEach(e => usedIds.add(e.id))

    } else if (focus === 'lower') {
      circuit1 = pickLowerStrength(pools, usedIds, true)
      circuit1.forEach(e => usedIds.add(e.id))
      circuit2 = pickLowerStrength(pools, usedIds, false, circuit1)
      circuit2.forEach(e => usedIds.add(e.id))

    } else {
      // Whole body
      circuit1 = pickWholeStrength(pools, usedIds)
      circuit1.forEach(e => usedIds.add(e.id))
      circuit2 = pickWholeStrength(pools, usedIds, circuit1)
      circuit2.forEach(e => usedIds.add(e.id))
    }
  }

  circuit2.forEach(e => usedIds.add(e.id))

  // Burnout — always shown
  burnout = pickBurnout(pools, usedIds)

  // Safety net
  circuit1 = ensure3(circuit1, pools, usedIds)
  circuit2 = ensure3(circuit2, pools, usedIds)

  return { circuit1, circuit2, burnout, usedIds }
}
