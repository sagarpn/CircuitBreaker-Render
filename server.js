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
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    // Add V2 columns safely — ignored if already exist
    for (const col of [
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS movement  TEXT',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS intensity INTEGER',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS skill     INTEGER',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS fatigue   INTEGER',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS format    TEXT',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS ex_tags   TEXT',
    ]) { await client.query(col).catch(() => {}) }
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

    // ── V2 Seed sync — upsert from exercises_v2.json ─────────
    const seedPath   = path.join(__dirname, 'exercises_v2.json')
    const legacyPath = path.join(__dirname, 'exercises.seed.json')
    const activeSeed = fs.existsSync(seedPath) ? seedPath : legacyPath

    if (fs.existsSync(activeSeed)) {
      const seed = JSON.parse(fs.readFileSync(activeSeed, 'utf8'))
      const { rows: existing } = await client.query('SELECT name, id FROM exercises')
      const existingMap = new Map(existing.map(r => [r.name.toLowerCase().trim(), r.id]))

      let added = 0, updated = 0, skipped = 0
      await client.query('BEGIN')
      try {
        for (const ex of seed) {
          const name = (ex.exercise || ex.name || '').trim()
          if (!name) { skipped++; continue }
          const key = name.toLowerCase()

          // Normalise equipment
          let equipArr = []
          if (Array.isArray(ex.equipment)) {
            equipArr = ex.equipment
          } else if (typeof ex.equipment === 'string' && ex.equipment !== 'none') {
            equipArr = ex.equipment.split(',').map(e => e.trim()).filter(Boolean)
          }

          // Normalise tags
          const tagsArr = typeof ex.tags === 'string'
            ? ex.tags.split(',').map(t => t.trim()).filter(Boolean)
            : (Array.isArray(ex.tags) ? ex.tags : [])

          const cat = ex.category || (ex.movement === 'core' ? 'core' :
            ['squat','lunge','hinge','explosive'].includes(ex.movement) ? 'lower' :
            ['horizontal_push','horizontal_pull','vertical_push'].includes(ex.movement) ? 'upper' :
            ex.movement === 'conditioning' ? 'hiit' : 'upper')

          if (existingMap.has(key)) {
            await client.query(
              `UPDATE exercises SET category=$1,equipment=$2,reps=$3,description=$4,
               movement=$5,intensity=$6,skill=$7,fatigue=$8,format=$9,ex_tags=$10
               WHERE id=$11`,
              [cat, JSON.stringify(equipArr), ex.reps||ex.format||'reps', ex.description||'',
               ex.movement||null, ex.intensity||null, ex.skill||null, ex.fatigue||null,
               ex.format||'reps', JSON.stringify(tagsArr), existingMap.get(key)]
            )
            updated++
          } else {
            const id = (Date.now() + added + updated).toString()
            await client.query(
              `INSERT INTO exercises
               (id,name,category,equipment,reps,description,flagged,movement,intensity,skill,fatigue,format,ex_tags)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
              [id, name, cat, JSON.stringify(equipArr), ex.reps||ex.format||'reps',
               ex.description||'', false, ex.movement||null, ex.intensity||null,
               ex.skill||null, ex.fatigue||null, ex.format||'reps', JSON.stringify(tagsArr)]
            )
            added++
          }
        }
        await client.query('COMMIT')
        console.log(`   Seed sync V2: ${added} added, ${updated} updated, ${skipped} skipped`)
      } catch (e) {
        await client.query('ROLLBACK')
        console.error(`   Seed sync FAILED — rolled back: ${e.message}`)
      }
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
  const { focus, style, hasDumbbells, hasPullupBar, usedIds } = req.body
  if (!focus || !style) return res.status(400).json({ error: 'focus and style required' })
  try {
    const exercises = await getExercises()
    const { hasBench: hb, hasKettlebell: hk } = req.body
    const result    = generateWorkout(exercises.filter(e => !e.flagged), {
      focus, style,
      hasDumbbells:  style === 'hiit' ? false : !!hasDumbbells,
      hasPullupBar:  style === 'hiit' ? false : !!hasPullupBar,
      hasBench:      style === 'hiit' ? false : !!hb,
      hasKettlebell: style === 'hiit' ? false : !!hk,
      usedIds: new Set(usedIds || []),
    })
    res.json({ circuit: result.circuit1 })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

app.post('/api/swap', async (req, res) => {
  const { exerciseId, focus, style, hasDumbbells, hasPullupBar, usedIds } = req.body
  try {
    const exercises = await getExercises()
    const used      = new Set([...(usedIds || []), exerciseId])
    const isHiit    = style === 'hiit'
    const eligible  = exercises.filter(ex => {
      if (used.has(ex.id) || ex.flagged)                                    return false
      const eq = Array.isArray(ex.equipment) ? ex.equipment : []
      if (isHiit  && eq.length > 0)                                          return false
      if (!isHiit && eq.includes('dumbbells')  && !hasDumbbells)             return false
      if (!isHiit && eq.includes('pullup_bar') && !hasPullupBar)             return false
      if (!isHiit && eq.includes('bench')      && !req.body.hasBench)        return false
      if (!isHiit && eq.includes('kettlebell') && !req.body.hasKettlebell)   return false
      if (style === 'hiit'     && !['hiit','core'].includes(ex.category))   return false
      if (style === 'strength' && ex.category === 'hiit')                   return false
      if (focus === 'upper') return ['upper','core','hiit'].includes(ex.category)
      if (focus === 'lower') return ['lower','core','hiit'].includes(ex.category)
      return true
    })
    if (!eligible.length) return res.status(400).json({ error: 'No suitable replacement found!' })
    const original     = exercises.find(e => e.id === exerciseId)
    const sameCategory = eligible.filter(e => e.category === original?.category)
    const pool2        = sameCategory.length ? sameCategory : eligible
    res.json({ replacement: pool2[Math.floor(Math.random() * pool2.length)] })
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
  const { name, category, equipment, reps, description } = req.body
  if (!name || !category || !reps) return res.status(400).json({ error: 'name, category, reps required' })
  const id = Date.now().toString()
  try {
    await pool.query(
      `INSERT INTO exercises (id,name,category,equipment,reps,description) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, sanitise(name), category.toLowerCase(), JSON.stringify(equipment||[]), sanitise(reps), sanitise(description||'')]
    )
    res.json({ ok: true, exercise: { id, name: name.trim(), category: category.toLowerCase(), equipment: equipment||[], reps: reps.trim(), description: description?.trim()||'', flagged: false } })
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
