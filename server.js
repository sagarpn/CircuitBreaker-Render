// CircuitBreaker v3.2
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
import * as XLSX from 'xlsx'
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
const dbUrl = process.env.DATABASE_URL || ''
const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes('supabase') || dbUrl.includes('ssl')
    ? { rejectUnauthorized: false }
    : (dbUrl ? { rejectUnauthorized: false } : false),
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
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS hiit_eligible  TEXT',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS bodyweight_tag TEXT',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS burner_tag     TEXT',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS core_burner    TEXT',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS hiit_burner    TEXT',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS timed_tag      TEXT',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS compound_tag   TEXT',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS unilateral_tag TEXT',
      'ALTER TABLE exercises ADD COLUMN IF NOT EXISTS plyometric_tag TEXT',
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
      ALTER TABLE favourites ALTER COLUMN focus DROP NOT NULL
    `).catch(()=>{})
    await client.query(`
      CREATE TABLE IF NOT EXISTS favourites (
        id          TEXT PRIMARY KEY,
        label       TEXT NOT NULL,
        focus       TEXT,
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

    // ── Nutrition tracker tables ──────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS nutrition_daily (
        id          TEXT PRIMARY KEY,
        date        TEXT UNIQUE NOT NULL,
        protein_g   INTEGER,
        vegetables  TEXT,
        workout_type TEXT,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await client.query(`
      CREATE TABLE IF NOT EXISTS nutrition_weekly (
        id           TEXT PRIMARY KEY,
        week_ending  TEXT UNIQUE NOT NULL,
        weight_lb    NUMERIC,
        beers_count  INTEGER,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await client.query(`
      CREATE TABLE IF NOT EXISTS nutrition_phase_checkin (
        id           TEXT PRIMARY KEY,
        phase_number INTEGER UNIQUE NOT NULL,
        weight_lb    NUMERIC,
        waist_in     NUMERIC,
        notes        TEXT,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await client.query(`
      CREATE TABLE IF NOT EXISTS nutrition_settings (
        id                 TEXT PRIMARY KEY DEFAULT 'default',
        protein_target_g   INTEGER DEFAULT 170,
        baseline_weight_lb NUMERIC DEFAULT 217
      )
    `)
    await client.query(`
      INSERT INTO nutrition_settings (id, protein_target_g, baseline_weight_lb)
      VALUES ('default', 170, 217)
      ON CONFLICT (id) DO NOTHING
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
               muscle_group=$7, is_compound=$8, slot_order=$9, display_muscle=$10,
               intensity=$11, system_flagged=false,
               amrap=$12, lucky7=$13, hiit_eligible=$14, bodyweight_tag=$15,
               burner_tag=$16, core_burner=$17, hiit_burner=$18, timed_tag=$19,
               compound_tag=$20, unilateral_tag=$21, plyometric_tag=$22
               WHERE id=$23`,
              [ex.category, JSON.stringify(ex.equipment||[]), ex.reps||'',
               ex.description||'', tags, format,
               ex.muscle_group||null, ex.is_compound||ex.compound==='yes'||false,
               ex.slot_order||null, ex.display_muscle||null, ex.intensity||null,
               ex.amrap||null, ex.lucky7||null, ex.hiit_eligible||null,
               ex.bodyweight||null, ex.burner||null, ex.core_burner||null,
               ex.hiit_burner||null, ex.timed||null, ex.compound||null,
               ex.unilateral||null, ex.plyometric||null, dbRow.id]
            )
            updated++
          } catch (e) {
            console.warn(`   Seed sync: could not update "${ex.name}": ${e.message}`)
          }
        } else {
          try {
            const { rows: maxRow } = await client.query("SELECT COALESCE(MAX(CAST(id AS BIGINT)), 0) + 1 as next_id FROM exercises WHERE id ~ '^\\d+$'")
            const id = maxRow[0].next_id.toString()
            await client.query(
              `INSERT INTO exercises (id,name,category,equipment,reps,description,flagged,tags,format,
               muscle_group,is_compound,slot_order,display_muscle,intensity,system_flagged,
               amrap,lucky7,hiit_eligible,bodyweight_tag,burner_tag,core_burner,hiit_burner,
               timed_tag,compound_tag,unilateral_tag,plyometric_tag)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
              [id, ex.name.trim(), ex.category, JSON.stringify(ex.equipment||[]),
               ex.reps||'', ex.description||'', false, tags, format,
               ex.muscle_group||null, ex.is_compound||ex.compound==='yes'||false,
               ex.slot_order||null, ex.display_muscle||null, ex.intensity||null, false,
               ex.amrap||null, ex.lucky7||null, ex.hiit_eligible||null,
               ex.bodyweight||null, ex.burner||null, ex.core_burner||null,
               ex.hiit_burner||null, ex.timed||null, ex.compound||null,
               ex.unilateral||null, ex.plyometric||null]
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
    hiit_eligible: r.hiit_eligible || '',
    bodyweight: r.bodyweight_tag || r.bodyweight || '',
    burner: r.burner_tag || '',
    core_burner: r.core_burner || '',
    hiit_burner: r.hiit_burner || '',
    timed: r.timed_tag || '',
    compound: r.compound_tag || '',
    unilateral: r.unilateral_tag || '',
    plyometric: r.plyometric_tag || '',
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

app.get('/api/version', (req, res) => res.json({ version: '3.2', built: '2026-06-06' }))

// ── Keepalive — write + delete unique row to keep Supabase active ──
app.get('/api/keepalive', async (req, res) => {
  try {
    const guid = 'ka_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)
    await pool.query(
      `INSERT INTO history (id, workout_name, focus, style, circuit1, circuit2, date, time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [guid, 'keepalive', 'whole', 'strength',
       JSON.stringify([]), JSON.stringify([]),
       new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short' }),
       new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })]
    )
    await pool.query('DELETE FROM history WHERE id=$1', [guid])
    res.json({ ok: true, guid, ts: new Date().toISOString() })
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

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
      // Mix: 1 rep-based + 1 timed/hold + 1 core burner
      function isTimed(e) {
        return e.format==='timed' || isBurner(e) ||
          (e.reps||'').toLowerCase().includes('second') ||
          (e.name||'').toLowerCase().includes('hold')
      }
      const coresReps  = shuffle(cleanEx.filter(e => e.category==='core' && !isBurner(e) && !isTimed(e) && !usedSet.has(e.id)))
      const coresTimed = shuffle(cleanEx.filter(e => e.category==='core' && !isBurner(e) && isTimed(e)  && !usedSet.has(e.id)))
      const cBurner    = shuffle(cleanEx.filter(e => e.category==='core' && isBurner(e) && !usedSet.has(e.id)))
      const coresAll   = shuffle(cleanEx.filter(e => e.category==='core' && !isBurner(e) && !usedSet.has(e.id)))
      // Slot 1: rep-based core
      const s1 = coresReps[0] || coresAll[0]
      // Slot 2: timed core (different from slot 1)
      const s2 = coresTimed.find(e => e.id !== s1?.id) || coresAll.find(e => e.id !== s1?.id)
      // Slot 3: core burner
      const s3 = cBurner[0]
      const circuit = [s1, s2, s3].filter(Boolean)
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
  const focusVal = focus || null
  const id = Date.now().toString()
  const d  = date || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  // type = 'workout' (full) or 'circuit' (single). Store exercises for circuits, circuit1/2/3 for workouts
  const exercisesData = type === 'workout'
    ? JSON.stringify({ circuit1, circuit2, circuit3: circuit3 || null })
    : JSON.stringify(exercises || [])
  try {
    await pool.query(
      `INSERT INTO favourites (id,label,focus,style,exercises,circuit_num,date) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, label, focusVal, style, exercisesData, circuitNum || null, d]
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
  const { rows: maxId } = await pool.query("SELECT COALESCE(MAX(CAST(id AS BIGINT)), 0) + 1 as next_id FROM exercises WHERE id ~ '^\\d+$'")
  const id   = maxId[0].next_id.toString()
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
    const { rows: allRows } = await pool.query('SELECT * FROM exercises ORDER BY category, name ASC')

    // Apply client-sent filters
    let rows = allRows
    try {
      const filtersParam = req.query.filters
      if (filtersParam) {
        const f = JSON.parse(decodeURIComponent(filtersParam))

        rows = allRows.filter(r => {
          const eq     = Array.isArray(r.equipment) ? r.equipment : []
          const tags   = r.tags || ''
          const isBurn = tags === 'burnout' || tags.includes('burnout')
          const reps   = r.reps || ''
          const nm     = (r.name||'').toLowerCase()
          const bw     = (!eq.length || eq.every(e=>!e||e==='none'))
          const checks = []

          if (f.category?.length)  checks.push(f.category.includes(r.category))
          if (f.type?.length) {
            const typeMap = {
              burner: isBurn, compound: r.is_compound,
              unilateral: /each side|each leg|each arm/i.test(reps),
              plyometric: ['jump','bound','hop'].some(k=>nm.includes(k))
            }
            checks.push(f.type.some(t => typeMap[t]))
          }
          if (f.eligible?.length)  checks.push(f.eligible.some(e => r[e]==='yes'||r[e]===true))
          if (f.equipment?.length) {
            const eqMap = { bodyweight:bw, dumbbells:eq.includes('dumbbells'), bench:eq.includes('bench') }
            checks.push(f.equipment.some(e => eqMap[e]))
          }
          if (f.repfmt?.length) {
            const rfMap = {
              has_reps: /\d+\s*reps?/i.test(reps), has_sets: /\d+\s*sets?/i.test(reps),
              to_failure: /to failure|max reps/i.test(reps), timed: r.format==='timed',
              has_max_timed: /\d+\s*sec/i.test(r.description||'')
            }
            checks.push(f.repfmt.some(rf => rfMap[rf]))
          }
          if (f.muscle?.length)    checks.push(f.muscle.includes(r.muscle_group))
          if (f.intensity?.length) checks.push(f.intensity.includes(String(r.intensity)))
          if (f.slot?.length)      checks.push(f.slot.includes(String(r.slot_order||r.ex_order)))
          if (f.status?.length) {
            const stMap = {
              flagged: r.flagged, system_flagged: r.system_flagged,
              missing_intensity: !r.intensity, missing_muscle: !r.muscle_group
            }
            checks.push(f.status.some(s => stMap[s]))
          }
          // hasFilters = at least one filter group is active
          const hasFilters = Object.values(f).some(v => Array.isArray(v) && v.length > 0)
          if (!hasFilters) return true
          return checks.length > 0 && checks.every(Boolean)
        })
      }
    } catch(fe) { /* ignore filter parse errors, use all rows */ }

    // ── Build Excel using SheetJS ─────────────────────────
    const COLS = [
      'id','name','description','category',
      'hiit','strength','core','amrap','lucky7',
      'compound','burner','core_burner','hiit_burner','unilateral','plyometric',
      'bodyweight','dumbbells','bench',
      'reps','sets','to_failure','timed','max_reps_timed',
      'muscle_group','display_muscle','intensity','slot_order',
      'flagged','system_flagged'
    ]

    // Helper functions
    function isBurnerRow(r) { const t=r.tags||''; return t==='burnout'||t.includes('burnout') }
    function isTimedRow(r)  { return r.format==='timed'||isBurnerRow(r)||(r.reps||'').toLowerCase().includes('second')||(r.name||'').toLowerCase().includes('hold') }
    function getEq(r)       { return Array.isArray(r.equipment)?r.equipment:[] }
    function getRepsOnly(s) {
      if (!s) return ''
      const m = s.match(/\d+\s+sets?\s*[x×]\s*(\d+)/i)
      if (m) return m[1]
      return s.replace(/^\d+\s+sets?\s*[x×]\s*/i,'').trim()
    }
    function getSets(s) { const m=(s||'').match(/^(\d+)\s+sets?/i); return m?m[1]:'' }

    // Build data rows
    const exData = rows.map(r => {
      const eq    = getEq(r)
      const burn  = isBurnerRow(r)
      const reps  = r.reps||''
      const nm    = (r.name||'').toLowerCase()
      const toFail= /to failure|max reps|max effort/i.test(reps) ? 'yes' : ''
      const tm    = (r.description||'').match(/(\d+)\s*(?:sec|second)/i)
      const bw    = (!eq.length||eq.every(e=>!e||e==='none')) ? 'yes' : ''
      return {
        id:             String(r.id||''),
        name:           r.name||'',
        description:    r.description||'',
        category:       r.category||'',
        hiit:           r.category==='hiit' ? 'yes' : '',
        strength:       (r.category==='upper'||r.category==='lower') ? 'yes' : '',
        core:           r.category==='core' ? 'yes' : '',
        amrap:          r.amrap||'',
        lucky7:         r.lucky7||'',
        compound:       r.is_compound ? 'yes' : '',
        burner:         burn ? 'yes' : '',
        core_burner:    (r.category==='core'&&burn) ? 'yes' : '',
        hiit_burner:    (r.category==='hiit'&&burn) ? 'yes' : '',
        unilateral:     /each side|each leg|each arm/i.test(reps) ? 'yes' : '',
        plyometric:     ['jump','bound','hop','tuck jump','star jump'].some(k=>nm.includes(k)) ? 'yes' : '',
        bodyweight:     bw,
        dumbbells:      eq.includes('dumbbells') ? 'yes' : '',
        bench:          eq.includes('bench') ? 'yes' : '',
        reps:           getRepsOnly(reps),
        sets:           getSets(reps),
        to_failure:     toFail,
        timed:          isTimedRow(r) ? 'yes' : '',
        max_reps_timed: tm ? tm[1] : '',
        muscle_group:   r.muscle_group||'',
        display_muscle: r.display_muscle||'',
        intensity:      r.intensity!=null ? String(r.intensity) : '',
        slot_order:     r.slot_order!=null ? String(r.slot_order) : '',
        flagged:        r.flagged ? 'yes' : '',
        system_flagged: r.system_flagged ? 'yes' : '',
      }
    })

    // Legend data
    const legendData = [
      { COLUMN:'action',         VALUES:'update / delete',                           NOTES:'update = add or update this row. delete = permanently remove from DB. Default is update.' },
      { COLUMN:'id',             VALUES:'Number 1-317',                              NOTES:'Do not change — used for matching' },
      { COLUMN:'name',           VALUES:'Text',                                      NOTES:'Exercise name — used for matching on upload' },
      { COLUMN:'description',    VALUES:'Text',                                      NOTES:'How to perform the exercise' },
      { COLUMN:'category',       VALUES:'upper / lower / core / hiit',               NOTES:'Primary category' },
      { COLUMN:'hiit',           VALUES:'yes / leave blank',                         NOTES:'Exercise is HIIT cardio' },
      { COLUMN:'strength',       VALUES:'yes / leave blank',                         NOTES:'Exercise is upper or lower strength' },
      { COLUMN:'core',           VALUES:'yes / leave blank',                         NOTES:'Exercise is a core exercise' },
      { COLUMN:'amrap',          VALUES:'yes / leave blank',                         NOTES:'Eligible for AMRAP format workouts' },
      { COLUMN:'lucky7',         VALUES:'yes / leave blank',                         NOTES:'Eligible for Lucky 7s format workouts' },
      { COLUMN:'compound',       VALUES:'yes / leave blank',                         NOTES:'Multi-joint movement (press, squat, row)' },
      { COLUMN:'burner',         VALUES:'yes / leave blank',                         NOTES:'Burnout finisher — always last in circuit' },
      { COLUMN:'core_burner',    VALUES:'yes / leave blank',                         NOTES:'Core burnout finisher' },
      { COLUMN:'hiit_burner',    VALUES:'yes / leave blank',                         NOTES:'HIIT burnout finisher' },
      { COLUMN:'unilateral',     VALUES:'yes / leave blank',                         NOTES:'Single side — each arm or each leg' },
      { COLUMN:'plyometric',     VALUES:'yes / leave blank',                         NOTES:'Jumping or explosive movement' },
      { COLUMN:'bodyweight',     VALUES:'yes / leave blank',                         NOTES:'No equipment needed' },
      { COLUMN:'dumbbells',      VALUES:'yes / leave blank',                         NOTES:'Requires dumbbells' },
      { COLUMN:'bench',          VALUES:'yes / leave blank',                         NOTES:'Requires bench' },
      { COLUMN:'reps',           VALUES:'Number only e.g. 12',                       NOTES:'Rep count only — no sets prefix' },
      { COLUMN:'sets',           VALUES:'Number only e.g. 3',                        NOTES:'Number of sets' },
      { COLUMN:'to_failure',     VALUES:'yes / leave blank',                         NOTES:'Do until failure — no fixed rep count' },
      { COLUMN:'timed',          VALUES:'yes / leave blank',                         NOTES:'Time-based exercise (hold or seconds)' },
      { COLUMN:'max_reps_timed', VALUES:'Seconds e.g. 30',                           NOTES:'Max reps in X seconds' },
      { COLUMN:'muscle_group',   VALUES:'chest/back/shoulders/biceps/triceps/quads/glutes/hamstrings/core', NOTES:'Primary muscle group' },
      { COLUMN:'display_muscle', VALUES:'Chest/Back/Shoulders/Biceps/Triceps/Quads/Glutes/Hamstrings/Stability/Abs/Obliques/Lower Abs/Full Body/Cardio/Agility/Power/Legs/Calves', NOTES:'Label shown on exercise card' },
      { COLUMN:'intensity',      VALUES:'1/2/3/4/5',                                 NOTES:'1=very easy  3=moderate  5=max effort' },
      { COLUMN:'slot_order',     VALUES:'1/2/3',                                     NOTES:'Upper only: 1=lead compound 2=secondary 3=isolation' },
      { COLUMN:'flagged',        VALUES:'yes / leave blank',                         NOTES:'Admin flagged — hidden from all workouts' },
      { COLUMN:'system_flagged', VALUES:'yes / leave blank',                         NOTES:'Auto-flagged by system — removed from seed' },
    ]

    // Create workbook
    const wb = XLSX.utils.book_new()

    // Sheet 1: Exercises
    const wsEx = XLSX.utils.json_to_sheet(exData, { header: COLS })
    // Set column widths
    wsEx['!cols'] = [
      {wch:8},{wch:6},{wch:35},{wch:50},{wch:10},
      {wch:6},{wch:9},{wch:6},{wch:7},{wch:8},
      {wch:10},{wch:8},{wch:12},{wch:12},{wch:11},{wch:11},
      {wch:11},{wch:11},{wch:7},
      {wch:8},{wch:6},{wch:10},{wch:7},{wch:14},
      {wch:14},{wch:15},{wch:10},{wch:11},
      {wch:8},{wch:13}
    ]
    XLSX.utils.book_append_sheet(wb, wsEx, 'Exercises')

    // Sheet 2: Legend
    const wsLeg = XLSX.utils.json_to_sheet(legendData, { header:['COLUMN','VALUES','NOTES'] })
    wsLeg['!cols'] = [{wch:18},{wch:60},{wch:45}]
    XLSX.utils.book_append_sheet(wb, wsLeg, 'How to Fill')

    // Write to buffer and send
    const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' })
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition','attachment; filename="circuitbreaker-exercises.xlsx"')
    res.send(Buffer.from(buf))

  } catch(e) { console.error('Download error:', e.message); res.status(500).json({ error: e.message }) }
})


// ── Admin: Upload/replace exercises from JSON ─────────────
// ── Admin: Manual backup ──────────────────────────────────
app.get('/api/admin/backup-info', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) as cnt, MAX(backed_up_at) as last FROM exercises_backup')
    res.json({ count: parseInt(rows[0].cnt)||0, last: rows[0].last||null })
  } catch(e) { res.status(500).json({ error: e.message }) }
})

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
        [ex.id,ex.name,ex.category,
         typeof ex.equipment==='string' ? ex.equipment : JSON.stringify(ex.equipment||[]),
         ex.reps,ex.description,ex.flagged,ex.tags,ex.format,ex.muscle_group,
         ex.is_compound,ex.display_muscle,ex.intensity,ex.system_flagged]
      )
    }
    await client.query('COMMIT')
    res.json({ ok:true, restored: backup.length })
  } catch(e) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: e.message })
  } finally { client.release() }
})

// ─────────────────────────────────────────────────────────
// NUTRITION ROUTES
// ─────────────────────────────────────────────────────────

function requireNutritionPin(req, res, next) {
  if (req.headers['x-nutrition-pin'] !== '2233') {
    setTimeout(() => res.status(401).json({ error: 'Invalid PIN' }), 400)
    return
  }
  next()
}

app.get('/api/nutrition/verify', requireNutritionPin, (req, res) => res.json({ ok: true }))

// ── Settings ──
app.get('/api/nutrition/settings', requireNutritionPin, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM nutrition_settings WHERE id='default'`)
    res.json(rows[0] || { protein_target_g: 170, baseline_weight_lb: 217 })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/nutrition/settings', requireNutritionPin, async (req, res) => {
  const { protein_target_g, baseline_weight_lb } = req.body
  try {
    await pool.query(
      `UPDATE nutrition_settings SET protein_target_g=$1, baseline_weight_lb=$2 WHERE id='default'`,
      [protein_target_g || 170, baseline_weight_lb || 217]
    )
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Daily log ──
app.get('/api/nutrition/daily', requireNutritionPin, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM nutrition_daily ORDER BY date DESC`)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/nutrition/daily', requireNutritionPin, async (req, res) => {
  const { date, protein_g, vegetables, workout_type } = req.body
  if (!date) return res.status(400).json({ error: 'date required' })
  const id = 'nd_' + date
  try {
    await pool.query(
      `INSERT INTO nutrition_daily (id, date, protein_g, vegetables, workout_type, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (date) DO UPDATE SET
         protein_g=$3, vegetables=$4, workout_type=$5, updated_at=NOW()`,
      [id, date, protein_g || null, vegetables || null, workout_type || null]
    )
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/nutrition/daily/:id', requireNutritionPin, async (req, res) => {
  try {
    await pool.query('DELETE FROM nutrition_daily WHERE id=$1', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Weekly weigh-in ──
app.get('/api/nutrition/weekly', requireNutritionPin, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM nutrition_weekly ORDER BY week_ending DESC`)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/nutrition/weekly', requireNutritionPin, async (req, res) => {
  const { week_ending, weight_lb, beers_count } = req.body
  if (!week_ending) return res.status(400).json({ error: 'week_ending required' })
  const id = 'nw_' + week_ending
  try {
    await pool.query(
      `INSERT INTO nutrition_weekly (id, week_ending, weight_lb, beers_count, updated_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (week_ending) DO UPDATE SET
         weight_lb=$3, beers_count=$4, updated_at=NOW()`,
      [id, week_ending, weight_lb || null, beers_count || null]
    )
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/nutrition/weekly/:id', requireNutritionPin, async (req, res) => {
  try {
    await pool.query('DELETE FROM nutrition_weekly WHERE id=$1', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── 30-day phase check-in ──
app.get('/api/nutrition/phases', requireNutritionPin, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM nutrition_phase_checkin ORDER BY phase_number ASC`)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/nutrition/phases', requireNutritionPin, async (req, res) => {
  const { phase_number, weight_lb, waist_in, notes } = req.body
  if (!phase_number) return res.status(400).json({ error: 'phase_number required' })
  const id = 'np_' + phase_number
  try {
    await pool.query(
      `INSERT INTO nutrition_phase_checkin (id, phase_number, weight_lb, waist_in, notes, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (phase_number) DO UPDATE SET
         weight_lb=$3, waist_in=$4, notes=$5, updated_at=NOW()`,
      [id, phase_number, weight_lb || null, waist_in || null, notes || '']
    )
    res.json({ ok: true })
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
