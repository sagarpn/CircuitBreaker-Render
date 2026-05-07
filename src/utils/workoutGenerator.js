/**
 * workoutGenerator.js — V2.0
 *
 * Uses exercise tags (movement, intensity, skill, fatigue, ex_tags array)
 * to build structured circuits with burnout finisher.
 *
 * CIRCUIT STRUCTURE:
 *   Circuit 1 = Foundation  — controlled, lower intensity, compound focus
 *   Circuit 2 = Push        — higher intensity, more fatigue, athletic feel
 *   Burnout   = Finisher    — 1-2 exercises, timed/AMRAP, always shown
 *
 * GLOBAL RULES:
 *   - no duplicate exercises
 *   - no duplicate movement patterns in same circuit
 *   - no back-to-back high fatigue (fatigue >= 4)
 *   - no back-to-back high skill (skill >= 4)
 *   - no back-to-back shoulder_load exercises
 *   - no back-to-back wrist_load exercises
 *   - no consecutive plyometrics
 *   - core last
 */

// ── Helpers ───────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getTags(ex) {
  if (!ex.ex_tags) return []
  if (Array.isArray(ex.ex_tags)) return ex.ex_tags
  try { return JSON.parse(ex.ex_tags) } catch { return [] }
}

function hasTag(ex, tag) { return getTags(ex).includes(tag) }
function getMovement(ex) { return ex.movement || '' }
function getIntensity(ex) { return ex.intensity || 2 }
function getSkill(ex)     { return ex.skill     || 2 }
function getFatigue(ex)   { return ex.fatigue   || 2 }

// Safety checks for stacking
function wouldStack(picked, candidate) {
  if (picked.length === 0) return false
  const last = picked[picked.length - 1]
  if (getFatigue(last) >= 4 && getFatigue(candidate) >= 4) return true
  if (getSkill(last)   >= 4 && getSkill(candidate)   >= 4) return true
  if (hasTag(last, 'shoulder_load') && hasTag(candidate, 'shoulder_load')) return true
  if (hasTag(last, 'wrist_load')    && hasTag(candidate, 'wrist_load'))    return true
  if (hasTag(last, 'plyometric')    && hasTag(candidate, 'plyometric'))    return true
  return false
}

function dupMovement(picked, candidate) {
  const mv = getMovement(candidate)
  return mv && picked.some(p => getMovement(p) === mv)
}

// ── Equipment filter ──────────────────────────────────────
function equipOk(ex, { hasDumbbells, hasBench, hasKettlebell, isHiit }) {
  const eq = Array.isArray(ex.equipment)
    ? ex.equipment
    : (() => { try { return JSON.parse(ex.equipment || '[]') } catch { return [] } })()

  if (isHiit && eq.length > 0) return false
  if (eq.includes('dumbbells')  && !hasDumbbells)  return false
  if (eq.includes('bench')      && !hasBench)       return false
  if (eq.includes('kettlebells')&& !hasKettlebell)  return false
  if (eq.includes('dumbbells, bench') && (!hasDumbbells || !hasBench)) return false
  if (eq.includes('dumbbells, kettlebells') && (!hasDumbbells || !hasKettlebell)) return false
  return true
}

// ── Build pool ────────────────────────────────────────────
function buildPool(exercises, opts) {
  const { focus, style, usedIds = new Set() } = opts
  const isHiit = style === 'hiit'

  return exercises.filter(ex => {
    if (ex.flagged || usedIds.has(ex.id)) return false
    if (!equipOk(ex, { ...opts, isHiit })) return false

    const tags = getTags(ex)
    const hasV2Tags = tags.length > 0       // V2 exercise with full tags
    const mv = getMovement(ex)
    // Legacy category fallback for exercises without V2 tags
    const legacyCat = ex.category || ''

    if (style === 'hiit') {
      // V2: filter by hiit/conditioning tag. Legacy: use category === 'hiit'
      if (hasV2Tags) {
        if (!tags.includes('hiit') && !tags.includes('conditioning') && mv !== 'core') return false
      } else {
        if (legacyCat !== 'hiit' && legacyCat !== 'core') return false
      }
      if (focus === 'upper') {
        if (hasV2Tags && ['squat','lunge','hinge'].includes(mv)) return false
        if (!hasV2Tags && legacyCat === 'lower') return false
      }
      if (focus === 'lower') {
        if (hasV2Tags && ['horizontal_push','horizontal_pull','vertical_push'].includes(mv)) return false
        if (!hasV2Tags && legacyCat === 'upper') return false
      }
      return true
    }

    // Strength/combo — filter by focus
    // V2: use movement field. Legacy: use category field
    if (hasV2Tags || mv) {
      if (focus === 'upper') return ['horizontal_push','horizontal_pull','vertical_push','core'].includes(mv) || (!mv && legacyCat === 'upper')
      if (focus === 'lower') return ['squat','lunge','hinge','explosive'].includes(mv) || (!mv && legacyCat === 'lower')
      return true
    }
    // Legacy fallback
    if (focus === 'upper') return ['upper','core'].includes(legacyCat)
    if (focus === 'lower') return ['lower'].includes(legacyCat)
    return true // whole body
  })
}

// ── Circuit 1: Foundation ─────────────────────────────────
// Controlled, compound, lower intensity, anchor exercises preferred
function pickFoundationCircuit(pool, usedIds, slots) {
  const available = shuffle(pool.filter(e => !usedIds.has(e.id)))
  const picked = []
  const coreExs = available.filter(e => e.movement === 'core')
  const nonCore = available.filter(e => e.movement !== 'core')

  // Prefer anchor tagged, intensity 1-3, skill 1-3
  const preferred = nonCore.filter(e =>
    hasTag(e, 'anchor') && getIntensity(e) <= 3 && getSkill(e) <= 3
  )
  const fallback = nonCore.filter(e => getIntensity(e) <= 3)
  const pool1 = [...preferred, ...fallback.filter(e => !preferred.includes(e))]

  for (const ex of pool1) {
    if (picked.length >= slots - 1) break
    if (picked.find(p => p.id === ex.id)) continue
    if (dupMovement(picked, ex)) continue
    if (wouldStack(picked, ex)) continue
    picked.push(ex)
  }

  // Core last
  const core = coreExs.find(c => !picked.find(p => p.id === c.id))
  if (core && picked.length < slots) picked.push(core)

  return picked
}

// ── Circuit 2: Push ───────────────────────────────────────
// Higher intensity, more athletic, finisher eligible
function pickPushCircuit(pool, usedIds, slots) {
  const available = shuffle(pool.filter(e => !usedIds.has(e.id)))
  const picked = []
  const coreExs = available.filter(e => e.movement === 'core')
  const nonCore = available.filter(e => e.movement !== 'core')

  // Prefer higher intensity (3-5), finisher tagged
  const preferred = nonCore.filter(e => getIntensity(e) >= 3)
  const fallback  = nonCore

  const pool2 = [...shuffle(preferred), ...fallback.filter(e => !preferred.includes(e))]

  for (const ex of pool2) {
    if (picked.length >= slots - 1) break
    if (picked.find(p => p.id === ex.id)) continue
    if (dupMovement(picked, ex)) continue
    if (wouldStack(picked, ex)) continue
    picked.push(ex)
  }

  const core = coreExs.find(c => !picked.find(p => p.id === c.id))
  if (core && picked.length < slots) picked.push(core)

  return picked
}

// ── Upper Strength: Push/Pull split ──────────────────────
function pickUpperFoundation(pool, usedIds) {
  // Circuit 1: compound push → secondary upper → isolation
  const available = shuffle(pool.filter(e => !usedIds.has(e.id) && e.movement !== 'core'))
  const pushExs = available.filter(e =>
    e.movement === 'horizontal_push' ||
    (!e.movement && (e.category === 'upper') && getTags(e).some(t => ['chest','triceps'].includes(t)))
  )
  const pullExs = available.filter(e =>
    e.movement === 'horizontal_pull' || e.movement === 'vertical_push' ||
    (!e.movement && e.category === 'upper' && getTags(e).some(t => ['back','biceps'].includes(t)))
  )
  const isoExs  = available.filter(e => hasTag(e, 'isolation'))
  const picked  = []

  // Slot 1: compound push
  const compPush = pushExs.find(e => hasTag(e, 'compound') || hasTag(e, 'anchor'))
  if (compPush) picked.push(compPush)

  // Slot 2: secondary upper (not same movement)
  const sec = available.find(e =>
    !picked.find(p => p.id === e.id) &&
    !dupMovement(picked, e) &&
    !wouldStack(picked, e)
  )
  if (sec) picked.push(sec)

  // Slot 3: isolation
  const iso = isoExs.find(e =>
    !picked.find(p => p.id === e.id) &&
    !wouldStack(picked, e)
  )
  if (iso) picked.push(iso)
  else {
    const filler = available.find(e => !picked.find(p => p.id === e.id) && !dupMovement(picked, e))
    if (filler) picked.push(filler)
  }

  return picked
}

function pickUpperPush(pool, usedIds) {
  // Circuit 2: compound pull → secondary → isolation → core
  const available = shuffle(pool.filter(e => !usedIds.has(e.id)))
  const coreExs = available.filter(e => e.movement === 'core')
  const pullExs = available.filter(e =>
    (e.movement === 'horizontal_pull' || e.movement === 'vertical_push') &&
    e.movement !== 'core'
  )
  const picked  = []

  // Slot 1: compound pull
  const compPull = pullExs.find(e => hasTag(e, 'compound') || hasTag(e, 'anchor'))
  if (compPull) picked.push(compPull)

  // Slot 2: secondary upper
  const nonCore = available.filter(e => e.movement !== 'core')
  const sec = nonCore.find(e =>
    !picked.find(p => p.id === e.id) &&
    !dupMovement(picked, e) &&
    !wouldStack(picked, e)
  )
  if (sec) picked.push(sec)

  // Slot 3: isolation
  const iso = available.filter(e => hasTag(e, 'isolation')).find(e =>
    !picked.find(p => p.id === e.id) && !wouldStack(picked, e)
  )
  if (iso) picked.push(iso)
  else {
    const filler = nonCore.find(e => !picked.find(p => p.id === e.id) && !dupMovement(picked, e))
    if (filler) picked.push(filler)
  }

  // Slot 4: core
  const core = coreExs[0]
  if (core) picked.push(core)

  return picked
}

// ── Lower Strength ────────────────────────────────────────
function pickLowerFoundation(pool, usedIds) {
  // Circuit 1: squat + hinge + unilateral/accessory
  const available = shuffle(pool.filter(e => !usedIds.has(e.id)))
  const squats  = available.filter(e =>
    e.movement === 'squat' || (!e.movement && e.category === 'lower' &&
      ['squat','goblet','sumo squat'].some(k => (e.name||'').toLowerCase().includes(k)))
  )
  const hinges  = available.filter(e =>
    e.movement === 'hinge' || (!e.movement && e.category === 'lower' &&
      ['deadlift','rdl','hinge','hip thrust','glute bridge'].some(k => (e.name||'').toLowerCase().includes(k)))
  )
  const picked  = []

  const squat = squats.find(e => getSkill(e) <= 3 && getIntensity(e) <= 3)
    || squats[0]
  if (squat) picked.push(squat)

  const hinge = hinges.find(e =>
    !picked.find(p => p.id === e.id) && !wouldStack(picked, e)
  )
  if (hinge) picked.push(hinge)

  // Slot 3: unilateral or accessory lower
  const uni = available.find(e =>
    !picked.find(p => p.id === e.id) &&
    (hasTag(e, 'unilateral') || hasTag(e, 'accessory')) &&
    !wouldStack(picked, e) &&
    !dupMovement(picked, e)
  )
  if (uni) picked.push(uni)
  else {
    const filler = available.find(e => !picked.find(p => p.id === e.id) && !wouldStack(picked, e))
    if (filler) picked.push(filler)
  }

  return picked
}

function pickLowerPush(pool, usedIds) {
  // Circuit 2: lunge + hinge/hamstring + explosive lower + glute
  const available = shuffle(pool.filter(e => !usedIds.has(e.id)))
  const lunges    = available.filter(e =>
    e.movement === 'lunge' || (!e.movement && e.category === 'lower' &&
      ['lunge','split squat','curtsy','step up'].some(k => (e.name||'').toLowerCase().includes(k)))
  )
  const hinges    = available.filter(e =>
    e.movement === 'hinge' || (!e.movement && e.category === 'lower' &&
      ['deadlift','rdl','hip thrust','glute bridge'].some(k => (e.name||'').toLowerCase().includes(k)))
  )
  const explosive = available.filter(e =>
    e.movement === 'explosive' || hasTag(e, 'plyometric') ||
    (!e.movement && e.category === 'hiit')
  )
  const glute     = available.filter(e =>
    (hasTag(e, 'glutes') || (e.name||'').toLowerCase().includes('glute')) && e.movement !== 'lunge'
  )
  const picked    = []

  const lunge = lunges[0]
  if (lunge) picked.push(lunge)

  const hinge = hinges.find(e =>
    !picked.find(p => p.id === e.id) && !wouldStack(picked, e)
  )
  if (hinge) picked.push(hinge)

  const exp = explosive.find(e =>
    !picked.find(p => p.id === e.id) &&
    !wouldStack(picked, e) &&
    getSkill(e) <= 3
  )
  if (exp) picked.push(exp)
  else {
    const filler = available.find(e =>
      !picked.find(p => p.id === e.id) && !dupMovement(picked, e) && !wouldStack(picked, e)
    )
    if (filler) picked.push(filler)
  }

  const gl = glute.find(e =>
    !picked.find(p => p.id === e.id) && !wouldStack(picked, e)
  )
  if (gl) picked.push(gl)

  return picked
}

// ── Whole Body ────────────────────────────────────────────
function pickWholeFoundation(pool, usedIds) {
  // lower compound + upper + secondary lower + core
  const available = shuffle(pool.filter(e => !usedIds.has(e.id)))
  const lowers    = available.filter(e => ['squat','lunge','hinge'].includes(e.movement))
  const uppers    = available.filter(e => ['horizontal_push','horizontal_pull','vertical_push'].includes(e.movement))
  const coreExs   = available.filter(e => e.movement === 'core')
  const picked    = []

  const lower1 = lowers.find(e => hasTag(e, 'compound') || hasTag(e, 'anchor'))
    || lowers[0]
  if (lower1) picked.push(lower1)

  const upper1 = uppers.find(e =>
    !picked.find(p => p.id === e.id) && !wouldStack(picked, e)
  )
  if (upper1) picked.push(upper1)

  const lower2 = lowers.find(e =>
    !picked.find(p => p.id === e.id) &&
    !dupMovement(picked, e) &&
    !wouldStack(picked, e)
  )
  if (lower2) picked.push(lower2)
  else {
    const filler = available.find(e =>
      !picked.find(p => p.id === e.id) && !wouldStack(picked, e) && e.movement !== 'core'
    )
    if (filler) picked.push(filler)
  }

  const core = coreExs[0]
  if (core) picked.push(core)

  return picked
}

// ── HIIT circuits ─────────────────────────────────────────
function pickHiitCircuit(pool, usedIds, count) {
  const available  = shuffle(pool.filter(e => !usedIds.has(e.id)))
  const hiitExs    = available.filter(e => hasTag(e, 'hiit') || hasTag(e, 'conditioning'))
  const coreExs    = available.filter(e => e.movement === 'core')
  const picked     = []
  const minHiit    = Math.ceil(count * 0.6) // 60% minimum

  // Fill HIIT slots first
  for (const ex of hiitExs) {
    if (picked.length >= minHiit) break
    if (dupMovement(picked, ex)) continue
    if (wouldStack(picked, ex)) continue
    picked.push(ex)
  }

  // Fill remaining slots
  const fillers = shuffle([
    ...hiitExs.filter(h => !picked.find(p => p.id === h.id)),
    ...coreExs
  ])
  for (const ex of fillers) {
    if (picked.length >= count - 1) break
    if (picked.find(p => p.id === ex.id)) continue
    if (dupMovement(picked, ex)) continue
    if (wouldStack(picked, ex)) continue
    picked.push(ex)
  }

  // Core last
  if (!picked.some(e => e.movement === 'core')) {
    const core = coreExs.find(c => !picked.find(p => p.id === c.id))
    if (core && picked.length < count) picked.push(core)
  }

  return picked.slice(0, count)
}

// ── Combo circuits ────────────────────────────────────────
function pickComboCircuit(pool, usedIds, circuitNum) {
  // strength compound + HIIT + accessory strength + core/jump
  const available = shuffle(pool.filter(e => !usedIds.has(e.id)))
  const strength  = available.filter(e => hasTag(e, 'strength') && !hasTag(e, 'hiit') && e.movement !== 'core')
  const hiitExs   = available.filter(e => hasTag(e, 'hiit'))
  const coreExs   = available.filter(e => e.movement === 'core')
  const jumpExs   = available.filter(e => hasTag(e, 'plyometric') || e.movement === 'explosive')
  const picked    = []

  // Slot 1: strength compound
  const comp = strength.find(e => hasTag(e, 'compound') || hasTag(e, 'anchor'))
    || strength[0]
  if (comp) picked.push(comp)

  // Slot 2: HIIT movement
  const hiit = hiitExs.find(e =>
    !picked.find(p => p.id === e.id) &&
    !dupMovement(picked, e) &&
    !wouldStack(picked, e)
  )
  if (hiit) picked.push(hiit)

  // Slot 3: accessory strength
  const acc = strength.find(e =>
    !picked.find(p => p.id === e.id) &&
    hasTag(e, 'accessory') &&
    !wouldStack(picked, e)
  )
  if (acc) picked.push(acc)
  else {
    const filler = strength.find(e => !picked.find(p => p.id === e.id) && !wouldStack(picked, e))
    if (filler) picked.push(filler)
  }

  // Slot 4: core or jump
  const last = circuitNum === 2
    ? (jumpExs.find(e => !picked.find(p => p.id === e.id) && !wouldStack(picked, e)) || coreExs[0])
    : coreExs[0]
  if (last) picked.push(last)

  return picked
}

// ── Burnout Circuit ───────────────────────────────────────
function pickBurnout(pool, usedIds, focus) {
  // 1-2 exercises: burnout or finisher tagged, timed preferred, targets muscles worked
  const available = shuffle(pool.filter(e => !usedIds.has(e.id)))
  const candidates = available.filter(e =>
    hasTag(e, 'burnout') || hasTag(e, 'finisher')
  )
  // Fallback if no tagged burnout exercises (e.g. old DB)
  const fallbackBurnout = candidates.length === 0
    ? shuffle(available).slice(0, 2)
    : candidates

  // Prefer timed format
  const timed   = candidates.filter(e => e.format === 'timed')
  const untimed = candidates.filter(e => e.format !== 'timed')
  const pool_   = candidates.length > 0 ? [...timed, ...untimed] : fallbackBurnout

  const picked = []

  for (const ex of pool_) {
    if (picked.length >= 2) break
    if (picked.find(p => p.id === ex.id)) continue
    if (wouldStack(picked, ex)) continue
    picked.push(ex)
  }

  return picked
}

// ── Main Generator ────────────────────────────────────────
export function generateWorkout(exercises, answers) {
  const {
    focus, style,
    hasDumbbells = false,
    hasBench     = false,
    hasKettlebell= false,
    usedIds      = new Set()
  } = answers

  const opts = { focus, style, hasDumbbells, hasBench, hasKettlebell, isHiit: style === 'hiit' }
  const pool = buildPool(exercises, { ...opts, usedIds })

  let circuit1 = [], circuit2 = [], burnout = []

  if (style === 'hiit') {
    circuit1 = pickHiitCircuit(pool, usedIds, 3)
    circuit1.forEach(e => usedIds.add(e.id))
    circuit2 = pickHiitCircuit(pool, usedIds, 4)
    circuit2.forEach(e => usedIds.add(e.id))

  } else if (style === 'combo') {
    circuit1 = pickComboCircuit(pool, usedIds, 1)
    circuit1.forEach(e => usedIds.add(e.id))
    circuit2 = pickComboCircuit(pool, usedIds, 2)
    circuit2.forEach(e => usedIds.add(e.id))

  } else {
    // Strength
    if (focus === 'upper') {
      const pushFirst = Math.random() < 0.5
      circuit1 = pushFirst ? pickUpperFoundation(pool, usedIds) : pickUpperPush(pool, usedIds)
      circuit1.forEach(e => usedIds.add(e.id))
      circuit2 = pushFirst ? pickUpperPush(pool, usedIds)       : pickUpperFoundation(pool, usedIds)
    } else if (focus === 'lower') {
      circuit1 = pickLowerFoundation(pool, usedIds)
      circuit1.forEach(e => usedIds.add(e.id))
      circuit2 = pickLowerPush(pool, usedIds)
    } else {
      // Whole body
      circuit1 = pickWholeFoundation(pool, usedIds)
      circuit1.forEach(e => usedIds.add(e.id))
      circuit2 = pickFoundationCircuit(pool, usedIds, 4)
    }
    circuit2.forEach(e => usedIds.add(e.id))
  }

  // Burnout always shown
  burnout = pickBurnout(pool, usedIds, focus)

  // Ensure minimum 3 exercises per circuit
  const ensure3 = (c, p) => {
    if (c.length >= 3) return c
    const fillers = shuffle(p.filter(e => !usedIds.has(e.id) && !c.find(x => x.id === e.id)))
    while (c.length < 3 && fillers.length > 0) c.push(fillers.shift())
    // Last resort: pull from all exercises if pool is too small
    if (c.length < 3) {
      const lastResort = shuffle(exercises.filter(e =>
        !e.flagged && !usedIds.has(e.id) && !c.find(x => x.id === e.id)
      ))
      while (c.length < 3 && lastResort.length > 0) c.push(lastResort.shift())
    }
    return c
  }

  circuit1 = ensure3(circuit1, pool)
  circuit2 = ensure3(circuit2, pool)

  return { circuit1, circuit2, burnout, usedIds }
}
