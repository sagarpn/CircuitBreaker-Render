import React, { useState, useEffect, useRef } from 'react'
import Circuit      from './Circuit'
import FloatingTimer from './FloatingTimer'
import QuoteSplash  from './QuoteSplash'
import styles       from './WorkoutPage.module.css'

const QUOTES = [
  "sweat now, shine later","your only competition is yesterday's you",
  "one more rep — always one more rep","earn it","stronger every single day",
  "show up. do the work. repeat","the body achieves what the mind believes",
  "no shortcuts. no excuses","pain is temporary. results are permanent",
  "be the hardest worker in the room","discipline beats motivation every time",
  "the burn means it's working","push past the voice that says stop",
  "move your body. change your life","you've done hard things before",
  "get comfortable being uncomfortable","your future self is watching",
  "fall seven times, get up eight","the only bad workout is the one that didn't happen",
  "consistency is the secret weapon","breathe. grind. repeat",
  "today's effort is tomorrow's result","train hard or go home",
  "you are stronger than you think","make your body your strongest asset",
  "suffering today, stronger tomorrow","champions aren't born, they're built",
  "do it for the version of you who gave up",
  "the pain you feel today is the strength you feel tomorrow","outwork everyone",
]

const WORKOUT_NAMES = {
  upper_strength: ["The Press Conference","Arm Day Intervention","Deltoid Drama","Shoulder Season","The Chest Manifesto","Pushing My Luck","Arm Yourself Well","The Bicep Agenda","Chest To Impress","The Shoulder Situation","Upper Management","The Iron Session","Push Day Warrior","Upper Cut","Steel Arms","Chest Day Legend","The Builder","Arms Race"],
  upper_hiit:     ["Flap Your Arms","The Sweaty Shoulder","Push Til It's Awkward","Arms Going Nowhere","The Arm Emergency","Chest Panic","Shoulder Chaos","Push And Pray","Burning From The Waist Up","The Flail Method","Sweat From The Neck Up","Arms On Fire","The Shoulder Shuffle","Push Hard Cry Later","Arm Yourself","No Shirt No Problem"],
  upper_combo:    ["Push Pull Think","The Arm Situation","Chest Day Plot Twist","Shoulders Everywhere","Mixed Up Arms","The Confused Upper","Push Hard Think Later","Upper Body Chaos","Arms At War","Part One Of Many","The Upper Hand","Chest & Friends","All Arms Everything","Shaken Not Stirred"],
  lower_strength: ["The Leg Situation","Glutes On Trial","Thigh Court","Quad Goals","The Great Squat Off","No Skipping Legs","Hamstring Theory","Lunge Or Die","The Glute Report","Squat Don't Stop","Leg Day Therapy","Squats & Thoughts","Thighs Like Thunder","Leg Season","Don't Skip This","The Squat Agenda","Below Average Day"],
  lower_hiit:     ["Jump For Your Life","The Burning Legs","Thigh Emergency","Legs Why","Cardio From The Waist Down","Jump It Out","Leg Day Speed Run","Can't Feel My Legs","The Leg Sprint","Bounce Or Bust","Jump Around Jump Around","The Thigh Fry","Run Don't Walk","Legs Akimbo","Can't Sit Down","Jumping To Conclusions"],
  lower_combo:    ["The Leg Experience","Thighs Wide Shut","Squat Plot Twist","Legs With Attitude","The Full Leg Situation","Lower Body Chaos","Squat Hard Think Never","Jump Squat Repeat","The Glute Agenda","Leg Day Remix","Legs But Make It Spicy","Thighs & Vibes","Squat Goals","Leg Day Unplugged","Lower Your Standards For Rest"],
  whole_strength: ["Top To Bottom","The Grand Tour","Muscle Conference","All Systems Lift","The Full Sweep","Nothing Left Out","The Complete Situation","Every Single Muscle","Muscles Everywhere","The Body Agenda","No Muscle Left Behind","Built Different","All Of It","The Complete Package","Every Muscle Meeting","Whole Lotta Gains"],
  whole_hiit:     ["Full Panic Mode","Everything Is On Fire","The Complete Meltdown","Cardio Everything","The Total Chaos","No Part Left Unsweat","Burn The Whole Thing","Running From Nothing","Full Body Question Mark","The Everything Sprint","Everything Everywhere","Maximum Chaos","Body By Suffering","Sweat All Over","All Systems Go","Cardio Is Life Now"],
  whole_combo:    ["The Full Chaos","Maximum Suffering In Style","The Grand Mess","All Of The Above","Nothing Makes Sense","Full Send No Return","The Complete Disaster","Every Muscle For Itself","The Whole Situation","Total Commitment","The Kitchen Sink","Chaos & Order","Full Body Panic","The Works","Maximum Effort","Full Send","The Big One"],
  legs_shoulders_strength: ["Legs & Delts Day","The Boulder Shoulder Squat","Thighs And Tries","Below And Above","Quad Meets Shoulder","The Custom Job","Legs Up Shoulders Back","Delts And Squats United"],
  legs_shoulders_hiit:     ["Legs And Shoulders On Fire","The Custom Burn","Thighs And Delts Inferno","Squat And Shoulder Chaos","The Personal Destroyer","Custom Cardio Chaos"],
  legs_shoulders_combo:    ["The Custom Session","Legs Shoulders Everything","The Personal Mix","Quad And Delt Combo","Your Workout Your Rules","The Tailored Chaos"],
  chest_strength:          ["Chest Day Therapy","The Pec Report","Push It Real Good","The Chest Agenda","All Chest Everything","The Press Manifesto"],
  chest_hiit:              ["Chest On Fire","The Push Panic","Pecs In Peril","Push Day Speed Run","Chest Chaos","The Pec Emergency"],
  chest_combo:             ["Chest Day Plot Twist","Push Hard Think Later","The Pec Situation","All Push Everything","Chest Meets Cardio"],
  back_strength:           ["Back Day Boss","The Pull Report","Row Till You Know","The Back Agenda","All Pull Everything","Lats Day Legend"],
  back_hiit:               ["Back On Fire","The Row Panic","Pulling For Your Life","Pull Day Speed Run","Back Chaos"],
  back_combo:              ["Back Day Plot Twist","Pull Hard Think Later","The Back Situation","All Pull Everything","Back Meets Cardio"],
  arms_strength:           ["Arm Day Intervention","The Bicep Report","Curl And Press","The Arm Agenda","All Arms Everything","Guns Out"],
  arms_hiit:               ["Arms On Fire","The Curl Panic","Biceps In Peril","Arm Day Speed Run","Arms Chaos"],
  arms_combo:              ["Arm Day Plot Twist","Curl Hard Think Later","The Arm Situation","All Arms Everything","Arms Meet Cardio"],
  shoulders_strength:      ["Shoulder Day Therapy","The Delt Report","Press Till You Impress","The Shoulder Agenda","All Delts Everything","Boulder Shoulders"],
  shoulders_hiit:          ["Shoulders On Fire","The Delt Panic","Delts In Peril","Shoulder Day Speed Run","Delt Chaos"],
  shoulders_combo:         ["Shoulder Day Plot Twist","Press Hard Think Later","The Delt Situation","All Delts Everything","Shoulders Meet Cardio"],
  legs_strength:           ["Leg Day Therapy","The Quad Report","Squat Till You Drop","The Leg Agenda","All Legs Everything","Leg Day Legend"],
  legs_hiit:               ["Legs On Fire","The Quad Panic","Quads In Peril","Leg Day Speed Run","Leg Chaos"],
  legs_combo:              ["Leg Day Plot Twist","Squat Hard Think Later","The Leg Situation","All Legs Everything","Legs Meet Cardio"],
  chest_back_strength:     ["Push Pull Balance","Chest Meets Back","The Push Pull Report","Agonist Antagonist Day","Chest Back Harmony"],
  chest_back_hiit:         ["Push Pull Fire","Chest Back Chaos","The Push Pull Panic","Push Pull Speed Run"],
  chest_back_combo:        ["Push Pull Everything","The Balanced Chaos","Chest Back Combo","Push Pull Plot Twist"],
  chest_shoulders_strength:["Push Day Deluxe","Chest And Delts","The Pressing Agenda","All Push Muscles","The Press Collective"],
  chest_shoulders_hiit:    ["Push Day Fire","Chest Delt Chaos","The Pressing Panic","Push Muscles Speed Run"],
  chest_shoulders_combo:   ["Push Day Everything","Chest Shoulder Combo","The Press Situation","All Push Meets Cardio"],
  back_biceps_strength:    ["Pull Day Deluxe","Back And Biceps","The Pulling Agenda","All Pull Muscles","The Pull Collective"],
  back_biceps_hiit:        ["Pull Day Fire","Back Bicep Chaos","The Pulling Panic","Pull Muscles Speed Run"],
  back_biceps_combo:       ["Pull Day Everything","Back Bicep Combo","The Pull Situation","All Pull Meets Cardio"],
  chest_triceps_strength:  ["Push Isolation Day","Chest And Tris","The Press And Extend","Chest Tricep Day","The Push Isolation"],
  chest_triceps_hiit:      ["Chest Tri Fire","Push Isolation Chaos","Chest Tricep Panic","Push Isolation Speed Run"],
  chest_triceps_combo:     ["Chest Tri Everything","Push Isolation Combo","Chest Tricep Plot Twist","Push Isolation Meets Cardio"],
  legs_arms_strength:      ["Legs And Guns","Lower Body Upper Arms","The Squat And Curl","Quads And Biceps Day","Legs Meets Arms"],
  legs_arms_hiit:          ["Legs Arms Fire","Quads And Guns Chaos","Legs Arms Speed Run","The Squat Curl Panic"],
  legs_arms_combo:         ["Legs Arms Everything","The Squat Curl Combo","Legs Arms Plot Twist","Quads Guns Meets Cardio"],
}

function pickName(focus, style) {
  const key  = `${focus}_${style}`
  const list = WORKOUT_NAMES[key] || ["The Grind Session"]
  return list[Math.floor(Math.random() * list.length)]
}
function pickQuote() { return QUOTES[Math.floor(Math.random() * QUOTES.length)] }
function todayStr()  { return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }

const FOCUS_OPTIONS = [
  { value: 'upper', label: '💪 Upper Body' },
  { value: 'lower', label: '🦵 Lower Body' },
  { value: 'whole', label: '🌀 Whole Body' },
]
const STYLE_OPTIONS = [
  { value: 'strength', label: '🏋️ Strength',       sub: 'Dumbbells · Controlled reps' },
  { value: 'hiit',     label: '⚡ HIIT',            sub: 'Bodyweight · Fast circuits' },
  { value: 'combo',    label: '🔥 HIIT + Strength', sub: 'Mixed · Best of both' },
]
const FOCUS_LABELS = { upper: '💪 Upper', lower: '🦵 Lower', whole: '🌀 Whole Body' }
const STYLE_LABELS = { strength: '🏋️ Strength', hiit: '⚡ HIIT', combo: '🔥 HIIT + Strength' }

export default function WorkoutPage({ onGenerate }) {
  const [focus,       setFocus]       = useState(null)
  const [style,       setStyle]       = useState(null)
  const [workout,     setWorkout]     = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [generated,   setGenerated]   = useState(false)
  const [splashing,   setSplashing]   = useState(false)
  const [quote,       setQuote]       = useState(null)
  const [workoutName, setWorkoutName] = useState(null)
  const [circuit3,    setCircuit3]    = useState(null)
  const [hasBench,    setHasBench]    = useState(false)
  const [hasKettlebell,setHasKettlebell] = useState(false)
  const [loadingC3,   setLoadingC3]   = useState(false)
  const [history,     setHistory]     = useState([])
  const [favourites,  setFavourites]  = useState([])
  const [expandedH,   setExpandedH]   = useState(null)
  const [historyTab,  setHistoryTab]  = useState('saved')
  const [favMsg,      setFavMsg]      = useState(null)
  const [workoutSaved,setWorkoutSaved]= useState(false)
  const [savedDate,   setSavedDate]   = useState(null)
  const [dataLoading, setDataLoading] = useState(true)
  const wakeLockRef    = useRef(null)
  const pendingWorkout = useRef(null)

  // ── Load server data on mount ────────────────────────────
  useEffect(() => {
    async function fetchData() {
      try {
        const [favRes, histRes] = await Promise.all([
          fetch('/api/favourites'),
          fetch('/api/history'),
        ])
        const favData  = await favRes.json()
        const histData = await histRes.json()
        setFavourites(Array.isArray(favData)  ? favData  : [])
        setHistory(Array.isArray(histData) ? histData : [])
      } catch (e) { console.error('Failed to load data', e) }
      finally { setDataLoading(false) }
    }
    fetchData()
  }, [])

  async function requestWakeLock() {
    try { if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen') } catch {}
  }
  function releaseWakeLock() {
    try { wakeLockRef.current?.release(); wakeLockRef.current = null } catch {}
  }
  useEffect(() => {
    const onVisible = () => { if (generated && document.visibilityState === 'visible') requestWakeLock() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [generated])

  async function handleGenerate() {
    if (!focus || !style) return
    setLoading(true); setError(null)
    try {
      const res  = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ focus, style, hasDumbbells: style !== 'hiit', hasPullupBar: false, hasBench: style !== 'hiit' && hasBench, hasKettlebell: style !== 'hiit' && hasKettlebell }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate')
      const name = pickName(focus, style)
      const q    = pickQuote()
      pendingWorkout.current = { data, name, q }
      setQuote(q); setWorkoutName(name); setSplashing(true)
      onGenerate?.()
    } catch (e) { setError(e.message); setLoading(false) }
  }

  async function onSplashDone() {
    const { data, name } = pendingWorkout.current
    setWorkout(data); setGenerated(true); setLoading(false); setSplashing(false)
    requestWakeLock()
    // Save to server history
    try {
      const res = await fetch('/api/history', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ focus, style, workoutName: name, circuit1: data.circuit1, circuit2: data.circuit2 }),
      })
      const saved = await res.json()
      if (saved.ok) setHistory(prev => [saved.entry, ...prev].slice(0, 5))
    } catch {}
  }

  async function handleAddCircuit() {
    setLoadingC3(true)
    try {
      const allUsedIds = [...workout.circuit1, ...workout.circuit2, ...(circuit3||[])].map(e => e.id)
      const res  = await fetch('/api/generate-circuit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ focus, style, hasDumbbells: style !== 'hiit', hasPullupBar: false, hasBench: style !== 'hiit' && hasBench, hasKettlebell: style !== 'hiit' && hasKettlebell, usedIds: allUsedIds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCircuit3(data.circuit)
      // Update history with circuit3
      try {
        await fetch('/api/history', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ focus, style, workoutName, circuit1: workout.circuit1, circuit2: workout.circuit2, circuit3: data.circuit }),
        })
        const histRes = await fetch('/api/history')
        setHistory(await histRes.json())
      } catch {}
    } catch (e) { alert(e.message) }
    finally { setLoadingC3(false) }
  }

  function handleSwap(circuitKey, id, replacement) {
    if (circuitKey === 'circuit3') {
      setCircuit3(prev => prev.map(ex => ex.id === id ? replacement : ex))
    } else {
      setWorkout(prev => ({ ...prev, [circuitKey]: prev[circuitKey].map(ex => ex.id === id ? replacement : ex) }))
    }
  }

  function handleReset() {
    setWorkout(null); setGenerated(false); setQuote(null)
    setWorkoutName(null); setFocus(null); setStyle(null)
    setError(null); setCircuit3(null); setSplashing(false)
    setWorkoutSaved(false); setSavedDate(null)
    setHasBench(false); setHasKettlebell(false)
    releaseWakeLock()
  }

  function loadHistoryWorkout(entry) {
    setFocus(entry.focus); setStyle(entry.style)
    setWorkout({ circuit1: entry.circuit1, circuit2: entry.circuit2 })
    setCircuit3(entry.circuit3 || null)
    setWorkoutName(entry.workoutName)
    setQuote(pickQuote()); setGenerated(true)
    requestWakeLock()
  }

  async function saveToFavourites(baseName, exercises, circuitNum) {
    const label = `${baseName} · ${todayStr()}`
    try {
      const res = await fetch('/api/favourites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, focus, style, exercises, circuitNum, date: todayStr() }),
      })
      const data = await res.json()
      if (data.ok) {
        setFavourites(prev => [data.favourite, ...prev])
        setFavMsg(`Circuit ${circuitNum} saved ⭐`)
        setTimeout(() => setFavMsg(null), 2500)
      }
    } catch { setFavMsg('Failed to save — try again') }
  }

  async function saveWorkout() {
    const d = todayStr()
    try {
      const res = await fetch('/api/favourites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: `${workoutName} · ${d}`,
          hasBench, hasKettlebell,
          focus, style, type: 'workout',
          circuit1: workout.circuit1,
          circuit2: workout.circuit2,
          circuit3: circuit3 || null,
          date: d,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setFavourites(prev => [data.favourite, ...prev])
        setWorkoutSaved(true)
        setSavedDate(d)
        setFavMsg('Workout saved ⭐')
        setTimeout(() => setFavMsg(null), 2500)
      }
    } catch { setFavMsg('Failed to save — try again') }
  }

  function loadFavourite(fav) {
    setFocus(fav.focus); setStyle(fav.style)
    if (fav.type === 'workout') {
      setWorkout({ circuit1: fav.circuit1, circuit2: fav.circuit2 })
      setCircuit3(fav.circuit3 || null)
    } else {
      // Single circuit — show as circuit1, generate fresh circuit2
      setWorkout({ circuit1: fav.exercises, circuit2: fav.exercises })
      setCircuit3(null)
    }
    setWorkoutName(`⭐ ${fav.label}`)
    setWorkoutSaved(true); setSavedDate(fav.date)
    setQuote(pickQuote()); setGenerated(true)
    requestWakeLock()
  }

  const usedIds = workout
    ? [...workout.circuit1, ...workout.circuit2, ...(circuit3||[])].map(e => e.id)
    : []

  return (
    <div className={styles.page}>
      {splashing && <QuoteSplash quote={quote} workoutName={workoutName} onDone={onSplashDone} />}
      {favMsg && <div className={styles.favMsg}>{favMsg}</div>}

      {/* ── Landing ── */}
      {!generated && (
        <>
          <div className={`${styles.hero} fade-up`}>
            <h1 className={styles.heroTitle}>Your<br/>Workout</h1>
            <p className={styles.heroSub}>Two choices. Two circuits. Let's go.</p>
          </div>

          {/* Questions */}
          <div className={`${styles.form} fade-up`} style={{animationDelay:'0.05s'}}>
            <div className={styles.question}>
              <div className={styles.questionLabel}>What are you training?</div>
              <div className={styles.options}>
                {FOCUS_OPTIONS.map(o => (
                  <button key={o.value} className={`${styles.option} ${focus===o.value?styles.selected:''}`} onClick={() => setFocus(o.value)}>{o.label}</button>
                ))}
              </div>
            </div>
            <div className={styles.question}>
              <div className={styles.questionLabel}>What's your style?</div>
              <div className={styles.styleOptions}>
                {STYLE_OPTIONS.map(o => (
                  <button key={o.value} className={`${styles.styleOption} ${style===o.value?styles.selected:''}`} onClick={() => setStyle(o.value)}>
                    <span className={styles.styleLabel}>{o.label}</span>
                    <span className={styles.styleSub}>{o.sub}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* Equipment toggles — strength only */}
            {style && style !== 'hiit' && (
              <div className={styles.equipmentSection}>
                <div className={styles.equipmentLabel}>⚙️ Additional Equipment <span className={styles.equipmentHint}>(Strength only)</span></div>
                <div className={styles.equipmentToggles}>
                  <label className={`${styles.equipToggle} ${hasBench ? styles.equipActive : ''}`}>
                    <input type="checkbox" checked={hasBench} onChange={e => setHasBench(e.target.checked)} />
                    <span className={styles.equipName}>Bench</span>
                  </label>
                  <label className={`${styles.equipToggle} ${hasKettlebell ? styles.equipActive : ''}`}>
                    <input type="checkbox" checked={hasKettlebell} onChange={e => setHasKettlebell(e.target.checked)} />
                    <span className={styles.equipName}>Kettlebell</span>
                  </label>
                </div>
              </div>
            )}

            {error && <div className={styles.error}>⚠️ {error}</div>}
            <button className={styles.generateBtn} onClick={handleGenerate} disabled={!focus || !style || loading}>
              {loading ? 'Building...' : 'Generate Workout →'}
            </button>
            <p className={styles.termsNote}>
              For Adults 18+ only. Use this service at your own risk. By using this service, you agree to the{' '}
              <a href="/terms.html" target="_blank" rel="noopener noreferrer" className={styles.termsNoteLink}>Terms &amp; Conditions</a>.
            </p>
          </div>

          {/* My Workouts */}
          {!dataLoading && (favourites.length > 0 || history.length > 0) && (
            <div className={`${styles.myWorkouts} fade-up`} style={{animationDelay:'0.1s'}}>
              <div className={styles.myWorkoutsHeader}>
                <span className={styles.myWorkoutsTitle}>📋 My Workouts</span>
                <div className={styles.myWorkoutsTabs}>
                  <button className={`${styles.mwTab} ${historyTab==='saved'?styles.mwTabActive:''}`} onClick={() => setHistoryTab('saved')}>
                    ⭐ Saved {favourites.length > 0 && <span className={styles.mwBadge}>{favourites.length}</span>}
                  </button>
                  <button className={`${styles.mwTab} ${historyTab==='recent'?styles.mwTabActive:''}`} onClick={() => setHistoryTab('recent')}>
                    🕐 Recent 5 {history.length > 0 && <span className={styles.mwBadge}>{history.length}</span>}
                  </button>
                </div>
              </div>

              {historyTab === 'saved' && (
                <div className={styles.mwList}>
                  {favourites.length === 0
                    ? <div className={styles.mwEmpty}>No saved circuits yet. Tap ⭐ on any circuit during a workout to save it.</div>
                    : favourites.map(fav => (
                        <div key={fav.id} className={styles.mwItem}>
                          <div className={styles.mwMeta}>
                            <div className={styles.mwName}>
                              {fav.label}
                              <span className={`${styles.mwTypeBadge} ${fav.type === 'workout' ? styles.mwTypeFull : styles.mwTypeCircuit}`}>
                                {fav.type === 'workout' ? 'Full Workout' : 'Circuit'}
                              </span>
                            </div>
                            <div className={styles.mwSub}>{FOCUS_LABELS[fav.focus]} · {STYLE_LABELS[fav.style]}</div>
                            <div className={styles.mwExercises}>
                              {fav.type === 'workout'
                                ? `${fav.circuit1?.length || 0} + ${fav.circuit2?.length || 0} exercises${fav.circuit3 ? ' + circuit 3' : ''}`
                                : (fav.exercises || []).map(e => e.name).join(' · ')
                              }
                            </div>
                          </div>
                          <button className={styles.mwLoadBtn} onClick={() => loadFavourite(fav)}>Load ▶</button>
                        </div>
                      ))
                  }
                </div>
              )}

              {historyTab === 'recent' && (
                <div className={styles.mwList}>
                  {history.length === 0
                    ? <div className={styles.mwEmpty}>No recent workouts yet.</div>
                    : history.map(h => (
                        <div key={h.id} className={styles.mwItem}>
                          <div className={styles.mwMeta}>
                            <div className={styles.mwName}>{h.workoutName}</div>
                            <div className={styles.mwSub}>{FOCUS_LABELS[h.focus]} · {STYLE_LABELS[h.style]}</div>
                          </div>
                          <div className={styles.mwActions}>
                            <button className={styles.mwExpandBtn} onClick={() => setExpandedH(expandedH===h.id?null:h.id)}>
                              {expandedH===h.id?'▲':'▼'}
                            </button>
                            <button className={styles.mwLoadBtn} onClick={() => loadHistoryWorkout(h)}>Do Again</button>
                          </div>
                        </div>
                      ))
                  }
                  {expandedH && (() => {
                    const h = history.find(x => x.id === expandedH)
                    if (!h) return null
                    return (
                      <div className={styles.mwExpanded}>
                        {[{label:'Circuit 1',exs:h.circuit1},{label:'Circuit 2',exs:h.circuit2},h.circuit3?{label:'Circuit 3',exs:h.circuit3}:null].filter(Boolean).map(c => (
                          <div key={c.label} className={styles.mwCircuit}>
                            <div className={styles.mwCircuitLabel}>{c.label}</div>
                            {c.exs.map(e => (
                              <div key={e.id} className={styles.mwExerciseRow}>
                                <span>{e.name}</span>
                                <span className={styles.mwReps}>{e.reps}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Floating rest timer — only during workout */}
      <FloatingTimer />

      {/* Workout output */}
      {workout && generated && (
        <div className={`${styles.workout} fade-up`}>
          <div className={styles.workoutHeader}>
            <div className={styles.workoutTitleRow}>
              <h2 className={styles.workoutTitle}>{workoutName}</h2>
              <button
                className={`${styles.saveWorkoutBtn} ${workoutSaved ? styles.saveWorkoutSaved : ''}`}
                onClick={saveWorkout}
                disabled={workoutSaved}
                title={workoutSaved ? 'Saved' : 'Save this workout'}
              >
                {workoutSaved ? '⭐ Saved' : '⭐ Save'}
              </button>
            </div>
            <div className={styles.workoutMeta}>
              <span className={styles.tag}>{FOCUS_LABELS[focus]}</span>
              <span className={styles.tag}>{STYLE_LABELS[style]}</span>
            </div>
            <button className={styles.resetBtn} onClick={handleReset}>New ↺</button>
          </div>

          <Circuit label="Circuit 1" number={1} exercises={workout.circuit1}
            focus={focus} style={style} hasDumbbells={style!=='hiit'} hasPullupBar={false}
            usedIds={usedIds} onSwap={(id,r) => handleSwap('circuit1',id,r)}
            onFavourite={() => saveToFavourites(`${workoutName} — C1`, workout.circuit1, 1)}
          />
          <Circuit label="Circuit 2" number={2} exercises={workout.circuit2}
            focus={focus} style={style} hasDumbbells={style!=='hiit'} hasPullupBar={false}
            usedIds={usedIds} onSwap={(id,r) => handleSwap('circuit2',id,r)}
            onFavourite={() => saveToFavourites(`${workoutName} — C2`, workout.circuit2, 2)}
          />
          {circuit3 && (
            <>
              <Circuit label="Circuit 3" number={3} exercises={circuit3}
                focus={focus} style={style} hasDumbbells={style!=='hiit'} hasPullupBar={false}
                usedIds={usedIds} onSwap={(id,r) => handleSwap('circuit3',id,r)}
                onFavourite={() => saveToFavourites(`${workoutName} — C3`, circuit3, 3)}
              />
            </>
          )}
          {!circuit3 && (
            <button className={styles.addCircuitBtn} onClick={handleAddCircuit} disabled={loadingC3}>
              {loadingC3 ? 'Building...' : '+ Add a Third Circuit'}
            </button>
          )}
          <div className={styles.footer}>
            Repeat each circuit <strong>2–3 times</strong> · Rest 60–90 sec between rounds
            <button className={styles.newWorkoutBtn} onClick={handleReset}>↺ Generate Another Workout</button>
          </div>
        </div>
      )}
    </div>
  )
}
