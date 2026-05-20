/**
 * server.js — CircuitBreaker Backend
 *
 * Environment variables (set in Render dashboard):
 *   ADMIN_PASSWORD  — password to access the admin exercise editor
 *   DATABASE_URL    — PostgreSQL connection string (from Render PostgreSQL database)
 *   PORT            — set automatically by Render
 */

import express  from 'express'
import cors     from 'cors'
import path     from 'path'
import fs       from 'fs'
import pg       from 'pg'
import { fileURLToPath } from 'url'
import { generateWorkout } from './src/utils/workoutGenerator.js'

const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app  = express()
const PORT = process.env.PORT || 3001

// ── Security headers ─────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options',  'nosniff')
  res.setHeader('X-Frame-Options',         'DENY')
  res.setHeader('X-XSS-Protection',        '1; mode=block')
  res.setHeader('Referrer-Policy',         'no-referrer')
  res.setHeader('Permissions-Policy',      'camera=(), microphone=(), geolocation=()')
  res.removeHeader('X-Powered-By')
  next()
})

// ── Simple rate limiter ───────────────────────────────────
const rateLimitStore = new Map()
function makeRateLimiter(maxReqs, windowMs, message) {
  return (req, res, next) => {
    const ip  = req.ip || req.connection.remoteAddress || 'unknown'
    const key = `${ip}:${req.path}`
    const now = Date.now()
    const rec = rateLimitStore.get(key) || { count: 0, reset: now + windowMs }
    if (now > rec.reset) { rec.count = 0; rec.reset = now + windowMs }
    rec.count++
    rateLimitStore.set(key, rec)
    if (rec.count > maxReqs) return res.status(429).json({ error: message })
    next()
  }
}
setInterval(() => {
  const now = Date.now()
  for (const [k, r] of rateLimitStore.entries()) if (now > r.reset) rateLimitStore.delete(k)
}, 15 * 60 * 1000)

const generateLimiter = makeRateLimiter(60,  15*60*1000, 'Too many requests.')
const adminLimiter    = makeRateLimiter(20,  15*60*1000, 'Too many admin requests.')

app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin, Render domains, and no-origin (mobile/server requests)
    if (!origin) return cb(null, true)
    const allowed = (process.env.ALLOWED_ORIGIN || '').split(',').filter(Boolean)
    if (allowed.some(o => origin.startsWith(o))) return cb(null, true)
    if (origin.includes('onrender.com') || origin.includes('localhost')) return cb(null, true)
    cb(null, true) // permissive by default — set ALLOWED_ORIGIN env var to restrict
  },
  credentials: false
}))
app.use(express.json({ limit: '10kb' }))

// ── Serve built frontend ─────────────────────────────────
const distPath = path.join(__dirname, 'dist')
if (fs.existsSync(distPath)) app.use(express.static(distPath))

// ── Database connection ───────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
})

// ── DB init — create tables + seed exercises if empty ────
async function initDB() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS exercises (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        category    TEXT NOT NULL,
        equipment   JSONB NOT NULL DEFAULT '[]',
        reps        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        flagged     BOOLEAN NOT NULL DEFAULT false,
        tags        TEXT,
        format      TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    // Add new columns to existing DB safely
    for (const col of [
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS tags            TEXT',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS format          TEXT',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS muscle_group    TEXT',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS is_compound     BOOLEAN',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS ex_order        INTEGER',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS display_muscle  TEXT',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS intensity       INTEGER',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS system_flagged  BOOLEAN DEFAULT false',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS slot_order     INTEGER',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS amrap          TEXT',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS lucky7         TEXT',
    ]) { await client.query(col).catch(() => {}) }

    // ── Backup table — mirrors exercises exactly ──────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS exercises_backup (
        id            TEXT,
        name          TEXT,
        category      TEXT,
        equipment     JSONB,
        reps          TEXT,
        description   TEXT,
        flagged       BOOLEAN,
        tags          TEXT,
        format        TEXT,
        muscle_group  TEXT,
        is_compound   BOOLEAN,
        ex_order      INTEGER,
        display_muscle TEXT,
        intensity     INTEGER,
        system_flagged BOOLEAN,
        backed_up_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await client.query(`
      CREATE TABLE IF NOT EXISTS favourites (
        id          TEXT PRIMARY KEY,
        label       TEXT NOT NULL,
        focus       TEXT NOT NULL,
        style       TEXT NOT NULL,
        exercises   JSONB NOT NULL,
        circuit_num INTEGER,
        date        TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await client.query(`
      CREATE TABLE IF NOT EXISTS history (
        id           TEXT PRIMARY KEY,
        workout_name TEXT,
        focus        TEXT NOT NULL,
        style        TEXT NOT NULL,
        circuit1     JSONB NOT NULL,
        circuit2     JSONB,
        circuit3     JSONB,
        date         TEXT,
        time         TEXT,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // ── Seed sync — full upsert with tags/format, auto-flag removed exercises
    // Rules:
    //   1. INSERT new exercises (in seed but not in DB)
    //   2. UPDATE all fields for existing exercises (tags, format, reps, desc, equipment)
    //   3. NEVER update flagged=true → false (admin flags are sticky)
    //   4. Auto-flag exercises in DB but NOT in seed (removed from list)
    //      — they won't appear in workouts but are not deleted (safe)
    //   5. Never delete anything
    const seedPath = path.join(__dirname, 'exercises.seed.json')
    if (fs.existsSync(seedPath)) {
      const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
      const { rows: existing } = await client.query('SELECT name, id, flagged FROM exercises')
      const existingMap = new Map(existing.map(r => [r.name.toLowerCase().trim(), r]))

      // Build set of names in seed file
      const seedNames = new Set(seed.map(e => (e.name||'').toLowerCase().trim()))

      let added = 0, updated = 0, autoFlagged = 0
      for (const ex of seed) {
        if (!ex.name || !ex.name.trim()) continue
        const key = ex.name.toLowerCase().trim()
        const tags = ex.tags || ''
        const format = ex.format || ''

        if (existingMap.has(key)) {
          const dbRow = existingMap.get(key)
          try {
            await client.query(
              `UPDATE exercises SET category=$1, equipment=$2, reps=$3, description=$4, tags=$5, format=$6,
               muscle_group=$7, is_compound=$8, ex_order=$9, display_muscle=$10,
               intensity=$11, system_flagged=false WHERE id=$12`,
              [ex.category, JSON.stringify(ex.equipment || []), ex.reps || '',
               ex.description || '', tags, format,
               ex.muscle_group||null, ex.is_compound||false, ex.ex_order||null,
               ex.display_muscle||null, ex.intensity||null, dbRow.id]
            )
            updated++
          } catch (e) {
            console.warn(`   Seed sync: could not update "${ex.name}": ${e.message}`)
          }
        } else {
          try {
            const id = (Date.now() + added + updated).toString()
            await client.query(
              `INSERT INTO exercises (id, name, category, equipment, reps, description, flagged, tags, format, muscle_group, is_compound, ex_order, display_muscle)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
              [id, ex.name.trim(), ex.category, JSON.stringify(ex.equipment || []),
               ex.reps || '', ex.description || '', false, tags, format,
               ex.muscle_group||null, ex.is_compound||false, ex.ex_order||null,
               ex.display_muscle||null]
            )
            added++
          } catch (e) {
            console.warn(`   Seed sync: could not insert "${ex.name}": ${e.message}`)
          }
        }
      }

      // Auto-flag exercises that are in DB but NOT in seed (removed from list)
      // Only flag if not already flagged — never unflag
      for (const [key, dbRow] of existingMap.entries()) {
        if (!seedNames.has(key) && !dbRow.flagged) {
          try {
            await client.query('UPDATE exercises SET system_flagged=true WHERE id=$1', [dbRow.id])
            autoFlagged++
          } catch (e) {
            console.warn(`   Seed sync: could not auto-flag "${key}": ${e.message}`)
          }
        }
      }

      console.log(`   Seed sync: ${added} added, ${updated} updated, ${autoFlagged} auto-flagged (removed from list)`)
    }
        console.log('   Database ready')
  } catch (e) {
    console.error('DB init error:', e.message)
  } finally {
    client.release()
  }
}

// ── Helper: get all exercises from DB ────────────────────
async function getExercises() {
  const { rows } = await pool.query('SELECT * FROM exercises ORDER BY created_at ASC')
  return rows.map(r => ({
    id: r.id, name: r.name, category: r.category,
    equipment: r.equipment, reps: r.reps,
    description: r.description, flagged: r.flagged,
    tags: r.tags || '', format: r.format || '',
    muscle_group: r.muscle_group || '', is_compound: r.is_compound || false, ex_order: r.ex_order || 2,
    display_muscle: r.display_muscle || '',
    intensity: r.intensity || null,
    system_flagged: r.system_flagged || false,
    slot_order: r.slot_order || r.ex_order || null,
    amrap: r.amrap || '', lucky7: r.lucky7 || '',
  }))
}

// ── Request logging ──────────────────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown'
    console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${ip}`)
  }
  next()
})

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]] }
  return a
}
function isBurner(ex) {
  const t = ex.tags || ex.ex_tags || ''
  return t==='burnout'||(typeof t==='string'&&t.includes('burnout'))||(Array.isArray(t)&&t.includes('burnout'))
}

// ── Auth middleware ───────────────────────────────────────
function requireAdmin(req, res, next) {
  const password = process.env.ADMIN_PASSWORD
  if (!password) return next()
  if (req.headers['x-admin-password'] !== password) {
    // Artificial delay on wrong password — slows brute force attempts
    setTimeout(() => res.status(401).json({ error: 'Unauthorized' }), 500)
    return
  }
  next()
}

// ─────────────────────────────────────────────────────────
// PUBLIC ROUTES
// ─────────────────────────────────────────────────────────

app.get('/api/exercises', async (req, res) => {
  try { res.json(await getExercises()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/generate', generateLimiter, async (req, res) => {
  const { focus, style, hasDumbbells, hasPullupBar } = req.body
  const VALID_FOCUS = ['upper','lower','whole']
  const VALID_STYLE = ['strength','hiit','combo']
  if (!focus || !VALID_FOCUS.includes(focus)) return res.status(400).json({ error: 'Invalid focus' })
  if (!style || !VALID_STYLE.includes(style))  return res.status(400).json({ error: 'Invalid style' })
  try {
    const exercises = await getExercises()
    const { hasBench, hasKettlebell } = req.body
    const workout   = generateWorkout(exercises.filter(e => !e.flagged), {
      focus, style,
      hasDumbbells:   style === 'hiit' ? false : !!hasDumbbells,
      hasPullupBar:   style === 'hiit' ? false : !!hasPullupBar,
      hasBench:       style === 'hiit' ? false : !!hasBench,
      hasKettlebell:  style === 'hiit' ? false : !!hasKettlebell,
    })
    res.json(workout)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

app.post('/api/generate-circuit', generateLimiter, async (req, res) => {
  const { focus, style, hasDumbbells, usedIds, roundType = 'circuit3' } = req.body
  if (!style) return res.status(400).json({ error: 'style required' })
  try {
    const exercises  = await getExercises()
    const cleanEx    = exercises.filter(e => !e.flagged)
    const usedSet    = new Set(usedIds || [])
    const dbFlag     = style !== 'hiit' ? !!hasDumbbells : false

    if (roundType === 'circuit3') {
      const result = generateWorkout(cleanEx, { focus: focus||'whole', style, hasDumbbells: dbFlag, usedIds: usedSet })
      return res.json({ circuit: result.circuit1 })
    }

    // Burner round — 2 burners from same category
    if (roundType === 'burner') {
      const cats = focus === 'upper' ? ['upper'] : focus === 'lower' ? ['lower'] : ['upper','lower','hiit','core']
      const cat  = cats[Math.floor(Math.random() * cats.length)]
      const burners = shuffle(cleanEx.filter(e => e.category === cat && isBurner(e) && !usedSet.has(e.id)))
      return res.json({ circuit: burners.slice(0,2) })
    }

    // Core round — 2 core + 1 core burner
    if (roundType === 'core') {
      const cores   = shuffle(cleanEx.filter(e => e.category==='core' && !isBurner(e) && !usedSet.has(e.id)))
      const cBurner = shuffle(cleanEx.filter(e => e.category==='core' && isBurner(e) && !usedSet.has(e.id)))
      const circuit = [...cores.slice(0,2), ...(cBurner.slice(0,1))]
      return res.json({ circuit })
    }

    res.status(400).json({ error: 'unknown roundType' })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

app.post('/api/swap', async (req, res) => {
  const { exerciseId, focus, style, hasDumbbells, usedIds } = req.body
  try {
    const exercises = await getExercises()
    const original  = exercises.find(e => e.id === exerciseId)
    if (!original) return res.status(400).json({ error: 'Exercise not found' })

    const used = new Set([...(usedIds || []), exerciseId])

    // Swap must come from same category — strict rule
    const eligible = exercises.filter(ex => {
      if (used.has(ex.id) || ex.flagged) return false
      if (ex.category !== original.category) return false  // same category only
      if (isBurner(ex) !== isBurner(original)) return false // burner stays burner
      const eq = Array.isArray(ex.equipment) ? ex.equipment
        : (() => { try { return JSON.parse(ex.equipment||'[]') } catch { return [] }})()
      if (eq.includes('dumbbells')   && !hasDumbbells) return false
      if (eq.includes('bench'))      return false
      if (eq.includes('kettlebells'))return false
      if (style === 'hiit' && eq.length > 0) return false
      return true
    })

    if (!eligible.length) return res.status(400).json({ error: 'No suitable replacement found' })
    res.json({ replacement: eligible[Math.floor(Math.random() * eligible.length)] })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── FAVOURITES ───────────────────────────────────────────

app.get('/api/favourites', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM favourites ORDER BY created_at DESC')
    res.json(rows.map(r => {
      const data      = r.exercises
      const isWorkout = data && data.circuit1 !== undefined
      return {
        id: r.id, label: r.label, focus: r.focus, style: r.style,
        type:       isWorkout ? 'workout' : 'circuit',
        exercises:  isWorkout ? null : data,
        circuit1:   isWorkout ? data.circuit1 : null,
        circuit2:   isWorkout ? data.circuit2 : null,
        circuit3:   isWorkout ? data.circuit3 : null,
        circuitNum: r.circuit_num, date: r.date,
      }
    }))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/favourites', async (req, res) => {
  const { label, focus, style, exercises, circuitNum, date, circuit1, circuit2, circuit3, type } = req.body
  if (!label) return res.status(400).json({ error: 'label required' })
  const id = Date.now().toString()
  const d  = date || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  // type = 'workout' (full) or 'circuit' (single). Store exercises for circuits, circuit1/2/3 for workouts
  const exercisesData = type === 'workout'
    ? JSON.stringify({ circuit1, circuit2, circuit3: circuit3 || null })
    : JSON.stringify(exercises || [])
  try {
    await pool.query(
      `INSERT INTO favourites (id,label,focus,style,exercises,circuit_num,date) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, label, focus, style, exercisesData, circuitNum || null, d]
    )
    res.json({ ok: true, favourite: { id, label, focus, style,
      exercises: type === 'workout' ? null : (exercises || []),
      circuit1: type === 'workout' ? circuit1 : null,
      circuit2: type === 'workout' ? circuit2 : null,
      circuit3: type === 'workout' ? (circuit3 || null) : null,
      circuitNum, type: type || 'circuit', date: d } })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/favourites/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM favourites WHERE id=$1', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── HISTORY ──────────────────────────────────────────────

app.get('/api/history', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM history ORDER BY created_at DESC LIMIT 5')
    res.json(rows.map(r => ({
      id: r.id, workoutName: r.workout_name, focus: r.focus, style: r.style,
      circuit1: r.circuit1, circuit2: r.circuit2, circuit3: r.circuit3,
      date: r.date, time: r.time,
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/history', async (req, res) => {
  const { focus, style, workoutName, circuit1, circuit2, circuit3 } = req.body
  if (!focus || !circuit1) return res.status(400).json({ error: 'focus and circuit1 required' })
  const id   = Date.now().toString()
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  try {
    // Keep max 5 — delete oldest if needed
    const { rows } = await pool.query('SELECT COUNT(*) FROM history')
    if (parseInt(rows[0].count) >= 5) {
      await pool.query('DELETE FROM history WHERE id=(SELECT id FROM history ORDER BY created_at ASC LIMIT 1)')
    }
    await pool.query(
      `INSERT INTO history (id,workout_name,focus,style,circuit1,circuit2,circuit3,date,time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, workoutName, focus, style,
       JSON.stringify(circuit1), JSON.stringify(circuit2 || []),
       circuit3 ? JSON.stringify(circuit3) : null, date, time]
    )
    res.json({ ok: true, entry: { id, workoutName, focus, style, circuit1, circuit2, circuit3, date, time } })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─────────────────────────────────────────────────────────
// ADMIN ROUTES
// ─────────────────────────────────────────────────────────

app.get('/api/admin/verify', requireAdmin, (req, res) => res.json({ ok: true }))

// ── Input sanitiser — strips HTML tags ───────────────────
function sanitise(str) {
  if (typeof str !== 'string') return str
  return str.replace(/<[^>]*>/g, '').trim().slice(0, 500)
}

app.post('/api/admin/exercises', requireAdmin, async (req, res) => {
  const { name, category, equipment, reps, description,
          muscle_group, intensity, amrap, lucky7, compound, burner } = req.body
  if (!name || !category || !reps) return res.status(400).json({ error: 'name, category, reps required' })
  const id   = Date.now().toString()
  const tags = burner === 'yes' ? 'burnout' : ''
  const fmt  = burner === 'yes' ? 'timed' : 'reps'
  const disp = muscle_group ? muscle_group.charAt(0).toUpperCase()+muscle_group.slice(1) : null
  try {
    await pool.query(
      `INSERT INTO exercises (id,name,category,equipment,reps,description,tags,format,
       muscle_group,intensity,display_muscle,amrap,lucky7,is_compound,system_flagged)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [id, sanitise(name), category.toLowerCase(), JSON.stringify(equipment||[]),
       sanitise(reps), sanitise(description||''), tags, fmt,
       muscle_group||null, parseInt(intensity)||null, disp,
       amrap||null, lucky7||null, compound==='yes', false]
    )
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/admin/exercises/:id', requireAdmin, async (req, res) => {
  const { name, category, equipment, reps, description } = req.body
  try {
    await pool.query(
      `UPDATE exercises SET name=$1,category=$2,equipment=$3,reps=$4,description=$5 WHERE id=$6`,
      [sanitise(name), category, JSON.stringify(equipment||[]), sanitise(reps), sanitise(description||''), req.params.id]
    )
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/admin/exercises/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM exercises WHERE id=$1', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/admin/exercises/:id/flag', requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE exercises SET flagged = NOT flagged WHERE id=$1', [req.params.id])
    const { rows } = await pool.query('SELECT * FROM exercises WHERE id=$1', [req.params.id])
    res.json({ ok: true, exercise: rows[0] })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/admin/flagged', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM exercises WHERE flagged=true ORDER BY name')
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/admin/favourites', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM favourites ORDER BY created_at DESC')
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Admin: Download exercises as JSON (client converts to Excel) ──
app.get('/api/admin/download-exercises', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM exercises ORDER BY category, name ASC')
    // Write data to temp JSON, run Python to build xlsx, stream back
    const tmp  = path.join('/tmp', 'cb_exercises_' + Date.now() + '.json')
    const xlsx = tmp.replace('.json', '.xlsx')
    fs.writeFileSync(tmp, JSON.stringify(rows))

    const { execSync } = await import('child_process')
    execSync(`python3 ${path.join(__dirname, 'scripts/build_xlsx.py')} ${tmp} ${xlsx}`, { timeout: 15000 })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="circuitbreaker-exercises.xlsx"')
    const buf = fs.readFileSync(xlsx)
    res.send(buf)

    // Cleanup
    try { fs.unlinkSync(tmp); fs.unlinkSync(xlsx) } catch {}
  } catch(e) { console.error('Download error:', e.message); res.status(500).json({ error: e.message }) }
})


// ── Admin: Upload/replace exercises from JSON ─────────────
app.post('/api/admin/upload-exercises', requireAdmin, async (req, res) => {
  const { exercises } = req.body
  if (!exercises || !Array.isArray(exercises)) {
    return res.status(400).json({ error: 'Invalid data — expected exercises array' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ── Auto-backup first ─────────────────────────────────
    const { rows: current } = await client.query('SELECT * FROM exercises')
    await client.query('DELETE FROM exercises_backup')
    for (const ex of current) {
      await client.query(
        `INSERT INTO exercises_backup (id,name,category,equipment,reps,description,flagged,
         tags,format,muscle_group,is_compound,display_muscle,intensity,system_flagged)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [ex.id,ex.name,ex.category,ex.equipment,ex.reps,ex.description,
         ex.flagged,ex.tags,ex.format,ex.muscle_group,ex.is_compound,
         ex.display_muscle,ex.intensity,ex.system_flagged]
      )
    }

    const { rows: existing } = await client.query('SELECT name, id FROM exercises')
    const existingMap = new Map(existing.map(r => [r.name.toLowerCase().trim(), r.id]))

    let added=0, updated=0, skipped=0, unchanged=0
    const errors   = []
    const addedNames   = []
    const updatedNames = []

    for (const ex of exercises) {
      const name = (ex.name || '').trim()
      if (!name) { skipped++; continue }
      const key = name.toLowerCase()

      // Parse equipment
      const equipArr = typeof ex.equipment === 'string' && ex.equipment
        ? ex.equipment.split(',').map(e=>e.trim()).filter(Boolean)
        : []

      const tags      = ex.burner === 'yes' || ex.burner === true ? 'burnout' : (ex.tags || '')
      const format    = ex.timed === 'yes' || tags === 'burnout' ? 'timed' : 'reps'
      const flagged   = ex.flagged === 'yes' || ex.flagged === true
      const isComp    = ex.compound === 'yes' || ex.compound === true || ex.is_compound === 'yes'
      const intensity = parseInt(ex.intensity) || null
      const slotOrder = parseInt(ex.slot_order || ex.ex_order) || null

      // Rebuild reps string from reps + sets columns if both present
      let repsVal = ex.reps || ''
      if (ex.sets && ex.reps && !repsVal.includes('sets')) {
        repsVal = ex.sets + ' sets x ' + ex.reps + ' reps'
      } else if (ex.to_failure === 'yes') {
        repsVal = 'To failure / use timer below'
      }

      // Compute display_muscle if blank
      const mgRaw = ex.muscle_group || ''
      const dm    = ex.display_muscle || (mgRaw ? mgRaw.charAt(0).toUpperCase()+mgRaw.slice(1) : null)

      try {
        if (existingMap.has(key)) {
          await client.query(
            `UPDATE exercises SET category=$1,equipment=$2,reps=$3,description=$4,
             tags=$5,format=$6,muscle_group=$7,is_compound=$8,slot_order=$9,
             display_muscle=$10,intensity=$11,flagged=$12,amrap=$13,lucky7=$14
             WHERE id=$15`,
            [ex.category||'upper', JSON.stringify(equipArr), repsVal,
             ex.description||'', tags, format, mgRaw||null, isComp,
             slotOrder, dm, intensity, flagged,
             ex.amrap||null, ex.lucky7||null,
             existingMap.get(key)]
          )
          updated++; updatedNames.push(name)
        } else {
          const id = (Date.now() + added).toString()
          await client.query(
            `INSERT INTO exercises (id,name,category,equipment,reps,description,flagged,
             tags,format,muscle_group,is_compound,slot_order,display_muscle,intensity,
             system_flagged,amrap,lucky7)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
            [id, name, ex.category||'upper', JSON.stringify(equipArr), repsVal,
             ex.description||'', flagged, tags, format, mgRaw||null, isComp,
             slotOrder, dm, intensity, false, ex.amrap||null, ex.lucky7||null]
          )
          added++; addedNames.push(name)
        }
      } catch(err) { errors.push(name + ': ' + err.message) }
    }

    // Check all rows look valid
    const { rows: afterRows } = await client.query('SELECT COUNT(*) as cnt FROM exercises')
    const totalInDb = parseInt(afterRows[0].cnt)

    await client.query('COMMIT')

    res.json({
      ok: true,
      total_submitted: exercises.length,
      total_in_db:     totalInDb,
      added,
      updated,
      skipped,
      unchanged,
      errors,
      added_names:   addedNames.slice(0, 20),
      updated_names: updatedNames.slice(0, 20),
      summary: `${exercises.length} rows submitted → ${added} added, ${updated} updated, ${skipped} skipped${errors.length ? ', ' + errors.length + ' errors' : ''} — DB now has ${totalInDb} exercises`
    })
  } catch(e) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: e.message })
  } finally { client.release() }
})


// ── Admin: Manual backup ──────────────────────────────────
app.post('/api/admin/backup', requireAdmin, async (req, res) => {
  const client = await pool.connect()
  try {
    const { rows } = await client.query('SELECT * FROM exercises')
    await client.query('DELETE FROM exercises_backup')
    for (const ex of rows) {
      await client.query(
        `INSERT INTO exercises_backup (id,name,category,equipment,reps,description,flagged,
         tags,format,muscle_group,is_compound,display_muscle,intensity,system_flagged)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [ex.id,ex.name,ex.category,ex.equipment,ex.reps,ex.description,
         ex.flagged,ex.tags,ex.format,ex.muscle_group,ex.is_compound,
         ex.display_muscle,ex.intensity,ex.system_flagged]
      )
    }
    res.json({ ok:true, count: rows.length })
  } catch(e) { res.status(500).json({ error: e.message }) }
  finally { client.release() }
})

// ── Admin: Restore from backup ────────────────────────────
app.post('/api/admin/restore', requireAdmin, async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: backup } = await client.query('SELECT * FROM exercises_backup')
    if (!backup.length) return res.status(400).json({ error: 'No backup found' })
    await client.query('DELETE FROM exercises')
    for (const ex of backup) {
      await client.query(
        `INSERT INTO exercises (id,name,category,equipment,reps,description,flagged,
         tags,format,muscle_group,is_compound,display_muscle,intensity,system_flagged)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [ex.id,ex.name,ex.category,ex.equipment,ex.reps,ex.description,
         ex.flagged,ex.tags,ex.format,ex.muscle_group,ex.is_compound,
         ex.display_muscle,ex.intensity,ex.system_flagged]
      )
    }
    await client.query('COMMIT')
    res.json({ ok:true, restored: backup.length })
  } catch(e) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: e.message })
  } finally { client.release() }
})

// Catch-all: serve frontend
app.get('*', (req, res) => {
  const index = path.join(distPath, 'index.html')
  if (fs.existsSync(index)) res.sendFile(index)
  else res.json({ message: 'CircuitBreaker API running' })
})

// ── Start ────────────────────────────────────────────────
initDB().then(() => {
  // ── Global error handler — no stack traces to client ─────
app.use((err, req, res, next) => {
  console.error('Server error:', err.message)
  res.status(500).json({ error: 'Something went wrong. Please try again.' })
})

app.listen(PORT, () => {
    console.log(`\n✅  CircuitBreaker running on port ${PORT}`)
    console.log(`   Database: ${process.env.DATABASE_URL ? 'PostgreSQL connected' : 'not configured'}`)
    console.log(`   Admin:    ${process.env.ADMIN_PASSWORD ? 'password protected' : 'open'}\n`)
  })
}).catch(e => {
  console.error('Failed to init DB:', e.message)
  process.exit(1)
})
