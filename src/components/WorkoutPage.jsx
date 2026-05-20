import React, { useState, useEffect, useRef } from 'react'
import Circuit      from './Circuit'
import FloatingTimer from './FloatingTimer'
import QuoteSplash  from './QuoteSplash'
import Lucky7s      from './Lucky7s'
import ResetSplash  from './ResetSplash'
import AMRAPTimer   from './AMRAPTimer'
import { generateWorkout, generateLucky7s, generateAMRAP } from '../utils/workoutGenerator'
import styles       from './WorkoutPage.module.css'

const HIIT_QUOTES = [
  "no equipment. no excuses.",
  "your lungs called. they said keep going.",
  "breathless is the goal.",
  "zero equipment. zero excuses.",
  "light work. heavy sweat.",
  "move fast. breathe hard. feel alive.",
  "bodyweight only. ego optional.",
  "if you can talk you can go harder.",
  "no bar. no bench. no mercy.",
  "the floor is your gym. the clock is your enemy.",
  "no weights. no problem. just suffering.",
  "rest is for after.",
  "explosions in the gym. that's just cardio.",
  "sweat is just fat crying.",
  "fast reps. deep breaths. bad ideas.",
]

const COMBO_QUOTES = [
  "no limits. no excuses.",
  "lift heavy. move fast. repeat.",
  "strength meets speed. chaos begins.",
  "gains and gasps. in that order.",
  "push. pull. sprint. repeat.",
  "no rest for the well-rounded.",
  "half strength. half cardio. full send.",
  "iron and cardio. the ultimate duo.",
  "you came for gains. you stayed for the burn.",
  "strong enough to lift. fit enough to run.",
  "the combo meal of pain.",
  "no slow days. no soft work.",
  "no easy sets. no wasted reps.",
  "when one workout isn't enough.",
  "dumbbell in one hand. dignity in the other.",
]

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
  upper_strength: ["The Press Conference","Arm Day Intervention","Deltoid Drama","Shoulder Season","The Chest Manifesto","Pushing My Luck","Arm Yourself Well","The Bicep Agenda","Chest To Impress","The Shoulder Situation","Upper Management","The Iron Session","Push Day Warrior","Upper Cut","Steel Arms","Chest Day Legend","The Builder","Arms Race","Chest Code","The Lat Awakening","Push Season","Iron Will Upper","Heavy Hitter","The Press Gang","Torso Boss","Chest Day Certified","Arm & Dangerous","Upper Limits","The Push Doctrine","Built From The Top","Pressing Matters","No Days Off Upper","The Chest Chronicles"],
  upper_hiit:     ["Flap Your Arms","The Sweaty Shoulder","Push Til It's Awkward","Arms Going Nowhere","The Arm Emergency","Chest Panic","Shoulder Chaos","Push And Pray","Burning From The Waist Up","The Flail Method","Sweat From The Neck Up","Arms On Fire","The Shoulder Shuffle","Push Hard Cry Later","Arm Yourself","No Shirt No Problem","Hot Arms Summer","Cardio With Attitude","Chest On The Run","The Flapping Falcon","Sweat Lodge Upper","Breathless Upper","Arms In A Hurry","Upper Chaos Theory","Chest Burner","Speed Arms","The Shoulder Sprint","Upper Body Alarm","Arms Like Whoa","Chest Scramble","Breathe Later"],
  upper_combo:    ["Push Pull Think","The Arm Situation","Chest Day Plot Twist","Shoulders Everywhere","Mixed Up Arms","The Confused Upper","Push Hard Think Later","Upper Body Chaos","Arms At War","Part One Of Many","The Upper Hand","Chest & Friends","All Arms Everything","Shaken Not Stirred","Push Pull Chaos","The Upper Remix","Strength Meets Speed Upper","Chest By Force","The Arm Experiment","Upper Hybrid","Push The Limit","Chest And Sweat","The Arm Mashup","Iron Cardio Upper","The Upper Fusion","Push Pull Ignite"],
  lower_strength: ["The Leg Situation","Glutes On Trial","Thigh Court","Quad Goals","The Great Squat Off","No Skipping Legs","Hamstring Theory","Lunge Or Die","The Glute Report","Squat Don't Stop","Leg Day Therapy","Squats & Thoughts","Thighs Like Thunder","Leg Season","Don't Skip This","The Squat Agenda","Below Average Day","Quadzilla","The Glute Gospel","Hamstring Highway","Thighmaster","Knee Bender","The Squat Chronicles","Leg Day Lore","The Lower Order","Hinge Nation","Quad Certified","The Glute Manifesto","Built From The Ground Up","No Skipping","Heavy Legs","The Leg Files"],
  lower_hiit:     ["Jump For Your Life","The Burning Legs","Thigh Emergency","Legs Why","Cardio From The Waist Down","Jump It Out","Leg Day Speed Run","Can't Feel My Legs","The Leg Sprint","Bounce Or Bust","Jump Around Jump Around","The Thigh Fry","Run Don't Walk","Legs Akimbo","Can't Sit Down","Jumping To Conclusions","Hot Legs Summer","Thighs On Fire","Bounce House","Squat Sprint","The Leg Alarm","Jump Or Regret","Cardio Legs","Speed Squats","The Burning Descent","Legs No Chill","Jump Season","Quad Scramble","The Lower Blitz","Legs In Flames","Sprint And Squat"],
  lower_combo:    ["The Leg Experience","Thighs Wide Shut","Squat Plot Twist","Legs With Attitude","The Full Leg Situation","Lower Body Chaos","Squat Hard Think Never","Jump Squat Repeat","The Glute Agenda","Leg Day Remix","Legs But Make It Spicy","Thighs & Vibes","Squat Goals","Leg Day Unplugged","Lower Your Standards For Rest","Legs Plus","The Glute Remix","Strength Meets Jump","The Lower Hybrid","Squat And Burn","Lunge And Launch","The Leg Fusion","Lower Body Ignite","Thigh High Effort","Jump Lift Repeat","The Leg Experiment","Squats By Force"],
  whole_strength: ["Top To Bottom","The Grand Tour","Muscle Conference","All Systems Lift","The Full Sweep","Nothing Left Out","The Complete Situation","Every Single Muscle","Muscles Everywhere","The Body Agenda","No Muscle Left Behind","Built Different","All Of It","The Complete Package","Every Muscle Meeting","Whole Lotta Gains","Top To Toe","The Full Package","Head To Heels","All Muscles Present","No Muscle Left Behind","The Grand Design","Full Body Certified","The Complete Grind","Built Everywhere","From Neck To Knee","Total Architecture","The Everything Session","Whole Lotta Work","All Systems Lift","The Body Project"],
  whole_hiit:     ["Full Panic Mode","Everything Is On Fire","The Complete Meltdown","Cardio Everything","The Total Chaos","No Part Left Unsweat","Burn The Whole Thing","Running From Nothing","Full Body Question Mark","The Everything Sprint","Everything Everywhere","Maximum Chaos","Body By Suffering","Sweat All Over","All Systems Go","Cardio Is Life Now","Full Meltdown","No Survivors","Everything Burns","Total Chaos","All Over Fire","The Full Alarm","Body By Sweat","Complete Destruction","Head To Toe Inferno","Full Panic","All Systems Burning","The Everything Sprint","Total Body Blitz","No Part Left Behind","Cardio All Day"],
  amrap_hiit:     ["The 12 Minute War","No Clock No Problem","AMRAP And Repeat","Round And Round","The Loop","12 Minutes Of Truth","Keep Moving","Non Stop","Go Until Done","The Endless Circuit","No Stopping Now","All Out AMRAP","The Repeater","Round Trip","Lap It Up","12 And Out","Grind The Clock","The Loop Hole","Keep The Pace","Rounds For Days"],
  lucky7_hiit:    ["Lucky 7s","The Magnificent 7","Seven And Done","The Drop Game","Down To One","Seven Rounds Of Fun","The Elimination","Drop It Low","Lucky Strike","Seven Deep","The Final 7","One By One","The Countdown","Seven Strong","Lucky Number Seven","Drop Zone","The 7 Drop","Last One Standing","Survive The Seven","The Lucky Circuit"],
  whole_combo:    ["The Full Chaos","Maximum Suffering In Style","The Grand Mess","All Of The Above","Nothing Makes Sense","Full Send No Return","The Complete Disaster","Every Muscle For Itself","The Whole Situation","Total Commitment","The Kitchen Sink","Chaos & Order","Full Body Panic","The Works","Maximum Effort","Full Send","The Big One","The Ultimate Mix","Full Body Remix","Strength Plus Speed","The Complete Experiment","Built And Burned","All Of It And More","The Full Fusion","Total Body Ignite","Every Muscle Every Gear","The Grand Hybrid","Complete The Mission","Full Send Full Build"],
  legs_shoulders_strength: ["Legs & Delts Day","The Boulder Shoulder Squat","Thighs And Tries","Below And Above","Quad Meets Shoulder","The Custom Job","Legs Up Shoulders Back","Delts And Squats United","Boulder Season","The Delt Gospel","Shoulders Certified","The Press Project","Shoulders By Design","Iron Delts","The Delt Agenda","Caps And Delts","Shoulder Day Lore","Raise The Bar"],
  legs_shoulders_hiit:     ["Legs And Shoulders On Fire","The Custom Burn","Thighs And Delts Inferno","Squat And Shoulder Chaos","The Personal Destroyer","Custom Cardio Chaos"],
  legs_shoulders_combo:    ["The Custom Session","Legs Shoulders Everything","The Personal Mix","Quad And Delt Combo","Your Workout Your Rules","The Tailored Chaos"],
  chest_strength:          ["Chest Day Therapy","The Pec Report","Push It Real Good","The Chest Agenda","All Chest Everything","The Press Manifesto","The Push Gospel","Chest Certified","Press Day","Pushing Boundaries","The Pec Project","Chest By Design","Iron Chest","The Push Agenda","Flat Is Not An Option","The Press Room"],
  chest_hiit:              ["Chest On Fire","The Push Panic","Pecs In Peril","Push Day Speed Run","Chest Chaos","The Pec Emergency"],
  chest_combo:             ["Chest Day Plot Twist","Push Hard Think Later","The Pec Situation","All Push Everything","Chest Meets Cardio"],
  back_strength:           ["Back Day Boss","The Pull Report","Row Till You Know","The Back Agenda","All Pull Everything","Lats Day Legend","The Pull Gospel","Back Certified","Row Day","Pulling It Together","The Lat Project","Back By Design","Iron Back","The Pull Agenda","The Row Room","Lats On Deck"],
  back_hiit:               ["Back On Fire","The Row Panic","Pulling For Your Life","Pull Day Speed Run","Back Chaos"],
  back_combo:              ["Back Day Plot Twist","Pull Hard Think Later","The Back Situation","All Pull Everything","Back Meets Cardio"],
  arms_strength:           ["Arm Day Intervention","The Bicep Report","Curl And Press","The Arm Agenda","All Arms Everything","Guns Out","Guns Out","Curl Season","The Arm Gospel","Arms Certified","The Bicep Project","Arms By Design","Iron Arms","The Curl Agenda","Both Barrels","The Gun Show"],
  arms_hiit:               ["Arms On Fire","The Curl Panic","Biceps In Peril","Arm Day Speed Run","Arms Chaos"],
  arms_combo:              ["Arm Day Plot Twist","Curl Hard Think Later","The Arm Situation","All Arms Everything","Arms Meet Cardio"],
  shoulders_strength:      ["Shoulder Day Therapy","The Delt Report","Press Till You Impress","The Shoulder Agenda","All Delts Everything","Boulder Shoulders","Boulder Season","The Delt Gospel","Shoulders Certified","The Press Project","Shoulders By Design","Iron Delts","The Delt Agenda","Caps And Delts","Shoulder Day Lore","Raise The Bar"],
  shoulders_hiit:          ["Shoulders On Fire","The Delt Panic","Delts In Peril","Shoulder Day Speed Run","Delt Chaos"],
  shoulders_combo:         ["Shoulder Day Plot Twist","Press Hard Think Later","The Delt Situation","All Delts Everything","Shoulders Meet Cardio"],
  legs_strength:           ["Leg Day Therapy","The Quad Report","Squat Till You Drop","The Leg Agenda","All Legs Everything","Leg Day Legend","Squat Season","The Quad Gospel","Legs Certified","The Glute Project","Legs By Design","Iron Legs","The Squat Agenda","Leg Day Lore","Heavy Quads","The Leg Room"],
  legs_hiit:               ["Legs On Fire","The Quad Panic","Quads In Peril","Leg Day Speed Run","Leg Chaos"],
  legs_combo:              ["Leg Day Plot Twist","Squat Hard Think Later","The Leg Situation","All Legs Everything","Legs Meet Cardio"],
  chest_back_strength:     ["Push Pull Balance","Chest Meets Back","The Push Pull Report","Agonist Antagonist Day","Chest Back Harmony","The Pull Gospel","Back Certified","Row Day","Pulling It Together","The Lat Project","Back By Design","Iron Back","The Pull Agenda","The Row Room","Lats On Deck"],
  chest_back_hiit:         ["Push Pull Fire","Chest Back Chaos","The Push Pull Panic","Push Pull Speed Run"],
  chest_back_combo:        ["Push Pull Everything","The Balanced Chaos","Chest Back Combo","Push Pull Plot Twist"],
  chest_shoulders_strength:["Push Day Deluxe","Chest And Delts","The Pressing Agenda","All Push Muscles","The Press Collective","Boulder Season","The Delt Gospel","Shoulders Certified","The Press Project","Shoulders By Design","Iron Delts","The Delt Agenda","Caps And Delts","Shoulder Day Lore","Raise The Bar"],
  chest_shoulders_hiit:    ["Push Day Fire","Chest Delt Chaos","The Pressing Panic","Push Muscles Speed Run"],
  chest_shoulders_combo:   ["Push Day Everything","Chest Shoulder Combo","The Press Situation","All Push Meets Cardio"],
  back_biceps_strength:    ["Pull Day Deluxe","Back And Biceps","The Pulling Agenda","All Pull Muscles","The Pull Collective"],
  back_biceps_hiit:        ["Pull Day Fire","Back Bicep Chaos","The Pulling Panic","Pull Muscles Speed Run"],
  back_biceps_combo:       ["Pull Day Everything","Back Bicep Combo","The Pull Situation","All Pull Meets Cardio"],
  chest_triceps_strength:  ["Push Isolation Day","Chest And Tris","The Press And Extend","Chest Tricep Day","The Push Isolation"],
  chest_triceps_hiit:      ["Chest Tri Fire","Push Isolation Chaos","Chest Tricep Panic","Push Isolation Speed Run"],
  chest_triceps_combo:     ["Chest Tri Everything","Push Isolation Combo","Chest Tricep Plot Twist","Push Isolation Meets Cardio"],
  legs_arms_strength:      ["Legs And Guns","Lower Body Upper Arms","The Squat And Curl","Quads And Biceps Day","Legs Meets Arms","Guns Out","Curl Season","The Arm Gospel","Arms Certified","The Bicep Project","Arms By Design","Iron Arms","The Curl Agenda","Both Barrels","The Gun Show"],
  legs_arms_hiit:          ["Legs Arms Fire","Quads And Guns Chaos","Legs Arms Speed Run","The Squat Curl Panic"],
  legs_arms_combo:         ["Legs Arms Everything","The Squat Curl Combo","Legs Arms Plot Twist","Quads Guns Meets Cardio"],
}

function pickName(focus, style, hiitFormat) {
  // HIIT has no focus — use format-specific names or whole_hiit
  let key = style === 'hiit'
    ? (hiitFormat === 'amrap'   ? 'amrap_hiit'   :
       hiitFormat === 'lucky7'  ? 'lucky7_hiit'  :
       'whole_hiit')
    : (focus + '_' + style)
  const list = WORKOUT_NAMES[key] || WORKOUT_NAMES['whole_hiit'] || ["The Grind Session"]
  return list[Math.floor(Math.random() * list.length)]
}
function pickQuote(style) {
  const pool = style === 'hiit'  ? HIIT_QUOTES  :
               style === 'combo' ? COMBO_QUOTES : QUOTES
  return pool[Math.floor(Math.random() * pool.length)]
}
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
  const [burnerRound, setBurnerRound] = useState(null)
  const [coreRound,   setCoreRound]   = useState(null)
  const [swapCounts,  setSwapCounts]  = useState({})
  const [flashMsg,    setFlashMsg]    = useState('')
  const [usedRounds,  setUsedRounds]  = useState(new Set())
  const [hiitFormat,  setHiitFormat]  = useState(null)  // 'circuit'|'amrap'|'lucky7'
  const [hiitData,    setHiitData]    = useState(null)
  const [amrapCount,  setAmrapCount]  = useState(0)
  const [resetSplash, setResetSplash] = useState(false)
  const [resetLabel,  setResetLabel]  = useState('')
  const [amrapLoading,setAmrapLoading]= useState(false)
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

  const delay = ms => new Promise(r => setTimeout(r, ms))

  function getWorkoutTypeLabel() {
    if (hiitData) {
      if (hiitData.type === 'amrap')   return 'HIIT AMRAP'
      if (hiitData.type === 'lucky7')  return 'HIIT Lucky 7s'
      return 'HIIT Circuit'
    }
    if (style === 'combo') return 'HIIT + Strength'
    if (style === 'hiit')  return 'HIIT Circuit'
    if (style === 'strength') {
      if (focus === 'upper') return 'Upper Strength'
      if (focus === 'lower') return 'Lower Strength'
      return 'Whole Body Strength'
    }
    return 'Workout'
  }

  async function handleGenerate() {
    const activeFocus = focus || 'whole'
    if (!style) return
    if (style === 'hiit' && !hiitFormat) return
    if (style === 'strength' && !focus) return

    setLoading(true); setError(null)
    const name = pickName(focus, style, hiitFormat)
    const q    = pickQuote(style)
    setQuote(q); setWorkoutName(name)

    try {
      // HIIT AMRAP — generate client-side from exercises API
      if (style === 'hiit' && hiitFormat === 'amrap') {
        const res    = await fetch('/api/exercises')
        const allEx  = await res.json()
        const result = generateAMRAP(allEx)
        pendingWorkout.current = { hiitResult: { type:'amrap', exercises: result.exercises }, name, q }
        setSplashing(true); setLoading(false)
        return
      }

      // HIIT Lucky 7s — generate client-side from exercises API
      if (style === 'hiit' && hiitFormat === 'lucky7') {
        const res    = await fetch('/api/exercises')
        const allEx  = await res.json()
        const result = generateLucky7s(allEx)
        pendingWorkout.current = { hiitResult: { type:'lucky7', rounds: result.rounds, six: result.six, burner: result.burner }, name, q }
        setSplashing(true); setLoading(false)
        return
      }

      // Standard circuit (HIIT circuit, strength, combo) — call /api/generate
      const res  = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ focus: activeFocus, style, hasDumbbells: style !== 'hiit' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate')
      pendingWorkout.current = { data, name, q }
      setSplashing(true)
    } catch (e) { setError(e.message); setLoading(false) }
  }

  async function onSplashDone() {
    if (!pendingWorkout.current) { setLoading(false); setSplashing(false); return }
    const { data, hiitResult, name } = pendingWorkout.current

    // AMRAP or Lucky 7s — already generated, just show it
    if (hiitResult) {
      setHiitData(hiitResult)
      setGenerated(true); setLoading(false); setSplashing(false)
      requestWakeLock()
      return
    }

    // Standard circuit
    if (!data) { setLoading(false); setSplashing(false); return }
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

  async function handleAddCircuit(type = 'circuit3') {
    setLoadingC3(type)
    try {
      const allUsedIds = [...workout.circuit1, ...workout.circuit2, ...(circuit3||[])].map(e => e.id)
      const res  = await fetch('/api/generate-circuit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          focus: focus || 'whole', style, hasDumbbells: style !== 'hiit',
          usedIds: allUsedIds, roundType: type
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUsedRounds(prev => new Set([...prev, type]))
      if (type === 'circuit3') setCircuit3(data.circuit)
      else if (type === 'burner') setBurnerRound(data.circuit)
      else if (type === 'core') setCoreRound(data.circuit)
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

  function showFlash(msg) {
    setFlashMsg(msg)
    setTimeout(() => setFlashMsg(''), 2800)
  }

  async function handleSwap(circuitKey, id, replacement) {
    // Enforce 5 swap limit per exercise
    setSwapCounts(prev => {
      const current = prev[id] || 0
      if (current >= 5) return prev
      return { ...prev, [id]: current + 1 }
    })
    if (circuitKey === 'circuit3') {
      setCircuit3(prev => prev.map(ex => ex.id === id ? replacement : ex))
    } else if (circuitKey === 'burner') {
      setBurnerRound(prev => prev.map(ex => ex.id === id ? replacement : ex))
    } else if (circuitKey === 'core') {
      setCoreRound(prev => prev.map(ex => ex.id === id ? replacement : ex))
    } else {
      setWorkout(prev => ({ ...prev, [circuitKey]: prev[circuitKey].map(ex => ex.id === id ? replacement : ex) }))
    }
  }

  function handleReset() {
    setWorkout(null); setGenerated(false); setQuote(null)
    setWorkoutName(null); setFocus(null); setStyle(null)
    setHiitFormat(null); setHiitData(null)
    setError(null); setCircuit3(null); setBurnerRound(null); setCoreRound(null)
    setSplashing(false); setSwapCounts({}); setUsedRounds(new Set())
    setWorkoutSaved(false); setSavedDate(null)
    setAmrapCount(0); setAmrapLoading(false)
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
      // Build circuit data for AMRAP / Lucky7s
      let c1 = null, c2 = null
      if (hiitData && hiitData.type === 'amrap') {
        c1 = hiitData.exercises || []
        c2 = []
      } else if (hiitData && hiitData.type === 'lucky7') {
        c1 = hiitData.six || []
        if (hiitData.burner) c1 = [...c1, hiitData.burner]
        c2 = []
      } else if (workout) {
        c1 = workout.circuit1
        c2 = workout.circuit2
      }
      if (!c1 || !c1.length) { alert('Nothing to save yet'); return }

      const res = await fetch('/api/favourites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: `${workoutName} · ${d}`,
          focus, style, type: 'workout',
          circuit1: c1,
          circuit2: c2,
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

      {/* ── Flash message ── */}
      {flashMsg && (
        <div className={styles.flashMsg}>{flashMsg}</div>
      )}

      {/* ── Landing ── */}
      {!generated && (
        <>
          <div className={`${styles.hero} fade-up`}>
            <h1 className={styles.heroTitle}>Your<br/>Workout</h1>
            <p className={styles.heroSub}>Show up. We'll handle the rest.</p>
          </div>

          {/* Questions */}
          <div className={`${styles.form} fade-up`} style={{animationDelay:'0.05s'}}>
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
            {/* HIIT format question */}
            {style === 'hiit' && (
              <div className={styles.question}>
                <div className={styles.questionLabel}>Pick your format</div>
                <div className={styles.options}>
                  {[
                    { value:'circuit', label:'🔁 Circuit',   sub:'Two circuits, rep based' },
                    { value:'amrap',   label:'⏰ AMRAP',      sub:'12 min, as many rounds as possible' },
                    { value:'lucky7',  label:'🎰 Lucky 7s',  sub:'7 exercises, drop one each round' },
                  ].map(o => (
                    <button key={o.value}
                      className={`${styles.option} ${hiitFormat===o.value?styles.selected:''}`}
                      onClick={() => setHiitFormat(o.value)}>
                      <span>{o.label}</span>
                      <span className={styles.optionSub}>{o.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Focus question — strength only */}
            {style === 'strength' && (
              <div className={styles.question}>
                <div className={styles.questionLabel}>What are you training?</div>
                <div className={styles.options}>
                  {FOCUS_OPTIONS.map(o => (
                    <button key={o.value} className={`${styles.option} ${focus===o.value?styles.selected:''}`} onClick={() => setFocus(o.value)}>{o.label}</button>
                  ))}
                </div>
              </div>
            )}
            {/* Dumbbells note */}
            {style && (
              <div className={styles.equipmentSection}>
                <div className={styles.dumbbellNote}>
                  {style === 'hiit'
                    ? '⚡ No equipment. No excuses.'
                    : style === 'combo'
                    ? '🔥 No limits. No excuses.'
                    : '🏋️ Dumbbells in. Excuses Out.'}
                </div>
              </div>
            )}

            {error && <div className={styles.error}>⚠️ {error}</div>}
            <button className={styles.generateBtn} onClick={handleGenerate} disabled={(!focus && style === 'strength') || (!hiitFormat && style === 'hiit') || !style || loading}>
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

      {/* Reset splash */}
      {resetSplash && (
        <ResetSplash
          workoutType={resetLabel}
          onDone={() => {
            setResetSplash(false)
            handleReset()
          }}
        />
      )}

      {/* Floating rest timer — only during workout */}
      <FloatingTimer />

      {/* Workout output */}
      {/* AMRAP and Lucky 7s renders */}
      {hiitData && generated && hiitData.type === 'lucky7' && (
        <div className={`${styles.workout} fade-up`}>
          <div className={styles.workoutHeader}>
            <div className={styles.workoutHeaderTop}>
              <h2 className={styles.workoutTitle}>{workoutName}</h2>
              <div className={styles.workoutActions}>

                <button className={styles.actionBtn} onClick={() => {
                  const lines = [`🏋️ ${workoutName}`, '', 'LUCKY 7s']
                  hiitData.six.forEach((e,i) => lines.push(`  ${i+1}. ${e.name} — ${(e.reps||'').replace(/^\d+\s+sets?\s*[x×]\s*/i,'').trim()}`))
                  if (hiitData.burner) lines.push(`  7. ${hiitData.burner.name} — BURNER`)
                  lines.push('', 'circuitbreaker.onrender.com')
                  navigator.clipboard?.writeText(lines.join('\n')).then(()=>alert('Copied!'))
                }} title="Copy">📋</button>
                <button className={`${styles.actionBtnSave} ${workoutSaved?styles.actionBtnSaved:''}`}
                  onClick={saveWorkout} disabled={workoutSaved} title="Save">
                  {workoutSaved ? '⭐' : '☆'}
                </button>
              </div>
            </div>
            <div className={styles.workoutTags}>
              <span className={styles.tag}>HIIT</span>
              <span className={styles.tag}>Lucky 7s</span>
            </div>
          </div>
          <div className={styles.workoutSummary}>
            <span className={styles.summaryMuscles}>7 rounds · {(hiitData.six||[]).length + 1} exercises</span>
            <span className={styles.summaryDot}>·</span>
            <span className={styles.summaryExtra}>one exercise drops each round</span>
          </div>
          <Lucky7s
            data={hiitData}
            onAddCore={() => handleAddCircuit('core')}
          />
          {coreRound && coreRound.length > 0 && (
            <div className="fade-up">
              <Circuit label="💪 Core Round" number={1} exercises={coreRound}
                focus="core" style="strength" hasDumbbells={false} hasPullupBar={false}
                usedIds={new Set()} onSwap={(id,r)=>handleSwap('core',id,r)}
                swapCounts={swapCounts}
                onTimerOpen={() => document.getElementById('breather-bar')?.click()}
              />
            </div>
          )}
          <div className={styles.footer}>
            <button className={styles.newWorkoutBtn} onClick={() => {
              setResetLabel(getWorkoutTypeLabel())
              setResetSplash(true)
            }}>↺ Generate Another Workout</button>
          </div>
        </div>
      )}

      {hiitData && generated && hiitData.type === 'amrap' && (
        <div className={`${styles.workout} fade-up`}>
          <div className={styles.workoutHeader}>
            <div className={styles.workoutHeaderTop}>
              <h2 className={styles.workoutTitle}>{workoutName}</h2>
              <div className={styles.workoutActions}>

                <button className={styles.actionBtn} onClick={() => {
                  const lines = [`🏋️ ${workoutName}`, '', 'AMRAP — 12 min, as many rounds as possible']
                  ;(hiitData.exercises||[]).forEach((e,i) => lines.push(`  ${i+1}. ${e.name} — ${(e.reps||'').replace(/^\d+\s+sets?\s*[x×]\s*/i,'').trim()}`))
                  lines.push('', 'circuitbreaker.onrender.com')
                  navigator.clipboard?.writeText(lines.join('\n')).then(()=>alert('Copied!'))
                }} title="Copy">📋</button>
                <button className={`${styles.actionBtnSave} ${workoutSaved?styles.actionBtnSaved:''}`}
                  onClick={saveWorkout} disabled={workoutSaved} title="Save">
                  {workoutSaved ? '⭐' : '☆'}
                </button>
              </div>
            </div>
            <div className={styles.workoutTags}>
              <span className={styles.tag}>HIIT</span>
              <span className={styles.tag}>AMRAP</span>
            </div>
          </div>
          <div className={styles.workoutSummary}>
            <span className={styles.summaryMuscles}>12 min · {(hiitData.exercises||[]).length} exercises</span>
            <span className={styles.summaryDot}>·</span>
            <span className={styles.summaryExtra}>loop as many rounds as you can</span>
          </div>
          <AMRAPTimer
            data={hiitData}
            onAddCore={() => handleAddCircuit('core')}
            onAddCircuit3={() => handleAddCircuit('circuit3')}
            onAnotherAMRAP={amrapCount < 3 && !amrapLoading ? async () => {
              setAmrapLoading(true)
              await delay(1500)
              const allEx = await fetch('/api/exercises').then(r=>r.json())
              const result = generateAMRAP(allEx)
              setHiitData({ type:'amrap', exercises: result.exercises })
              setAmrapCount(prev => prev + 1)
              setAmrapLoading(false)
            } : null}
            amrapCount={amrapCount}
            amrapLoading={amrapLoading}
          />
          {coreRound && coreRound.length > 0 && (
            <div className="fade-up">
              <Circuit label="💪 Core Round" number={1} exercises={coreRound}
                focus="core" style="strength" hasDumbbells={false} hasPullupBar={false}
                usedIds={new Set()} onSwap={(id,r)=>handleSwap('core',id,r)}
                swapCounts={swapCounts}
                onTimerOpen={() => document.getElementById('breather-bar')?.click()}
              />
            </div>
          )}
          <div className={styles.footer}>
            <button className={styles.newWorkoutBtn} onClick={() => {
              setResetLabel(getWorkoutTypeLabel())
              setResetSplash(true)
            }}>↺ Generate Another Workout</button>
          </div>
        </div>
      )}

      {workout && generated && !hiitData && (
        <div className={`${styles.workout} fade-up`}>
          <div className={styles.workoutHeader}>
            <div className={styles.workoutHeaderTop}>
                <h2 className={styles.workoutTitle}>{workoutName}</h2>
                <div className={styles.workoutActions}>
                  <button className={styles.actionBtn} onClick={() => {
                    const fmt = (exs) => (exs||[]).map(e =>
                      `  • ${e.name} — ${(e.reps||'').replace(/^\d+\s+sets?\s*[x×]\s*/i,'').trim()}`
                    ).join('\n')
                    const lines = [`🏋️ ${workoutName}`,'','CIRCUIT 1',fmt(workout.circuit1),'','CIRCUIT 2',fmt(workout.circuit2)]
                    if (circuit3) { lines.push('','CIRCUIT 3',fmt(circuit3)) }
                    lines.push('','circuitbreaker.onrender.com')
                    navigator.clipboard?.writeText(lines.join('\n'))
                      .then(()=>alert('Copied!')).catch(()=>alert('Could not copy'))
                  }} title="Copy workout">📋</button>
                  <button
                    className={`${styles.actionBtnSave} ${workoutSaved ? styles.actionBtnSaved : ''}`}
                    onClick={saveWorkout} disabled={workoutSaved}
                    title={workoutSaved ? 'Saved' : 'Save workout'}>
                    {workoutSaved ? '⭐' : '☆'}
                  </button>
                </div>
              </div>
              <div className={styles.workoutTags}>
                <span className={styles.tag}>{FOCUS_LABELS[focus]}</span>
                <span className={styles.tag}>{STYLE_LABELS[style]}</span>
              </div>
          </div>

          {/* Workout summary — one line */}
          {workout && (() => {
            const c1ex = workout.circuit1 || []
            const c2ex = workout.circuit2 || []
            const total = c1ex.length + c2ex.length
            const muscles = [...new Set([...c1ex,...c2ex]
              .filter(e => e.display_muscle)
              .map(e => e.display_muscle)
            )].slice(0,3).join(' · ') || (focus === 'upper' ? 'Upper Body' : focus === 'lower' ? 'Lower Body' : focus === 'whole' ? 'Full Body' : 'HIIT')
            return (
              <div className={styles.workoutSummary}>
                <span className={styles.summaryMuscles}>{muscles}</span>
                <span className={styles.summaryDot}>·</span>
                <span className={styles.summaryCount}>{total} exercises</span>
                <span className={styles.summaryExtra}> — add a Core or Burner round for extra results</span>
              </div>
            )
          })()}

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
          {/* Circuit 3 — shown when added */}
          {circuit3 && (
            <div className="fade-up"><Circuit label="Circuit 3" number={3} exercises={circuit3}
              focus={focus} style={style} hasDumbbells={style!=='hiit'} hasPullupBar={false}
              usedIds={usedIds} onSwap={(id,r) => handleSwap('circuit3',id,r)}
              onFavourite={() => saveToFavourites(`${workoutName} — C3`, circuit3, 3)}
              swapCounts={swapCounts}
              onTimerOpen={() => document.getElementById('breather-bar')?.click()}
            /></div>
          )}

          {/* Burner round */}
          {burnerRound && burnerRound.length > 0 && (
            <div className="fade-up">
            <Circuit label="🔥 Burner Round" number={4} exercises={burnerRound}
              focus={focus} style={style} hasDumbbells={style!=='hiit'} hasPullupBar={false}
              usedIds={usedIds} onSwap={(id,r) => handleSwap('burner',id,r)}
              swapCounts={swapCounts}
              onTimerOpen={() => document.getElementById('breather-bar')?.click()}
            />
            </div>
          )}

          {/* Core round */}
          {coreRound && coreRound.length > 0 && (
            <div className="fade-up">
            <Circuit label="💪 Core Round" number={5} exercises={coreRound}
              focus={focus} style={style} hasDumbbells={style!=='hiit'} hasPullupBar={false}
              usedIds={usedIds} onSwap={(id,r) => handleSwap('core',id,r)}
              swapCounts={swapCounts}
              onTimerOpen={() => document.getElementById('breather-bar')?.click()}
            />
            </div>
          )}

          {/* Extra rounds — each disappears once selected */}
          {usedRounds.size < 3 && (
            <div className={styles.extraRoundBtns}>
              {!usedRounds.has('circuit3') && (
                <button className={styles.addCircuitBtn}
                  onClick={() => handleAddCircuit('circuit3')}
                  disabled={!!loadingC3}>
                  {loadingC3==='circuit3' ? 'Building...' : '+ Add Circuit 3'}
                </button>
              )}
              {!usedRounds.has('burner') && (
                <button className={styles.burnerRoundBtn}
                  onClick={() => handleAddCircuit('burner')}
                  disabled={!!loadingC3}>
                  {loadingC3==='burner' ? 'Building...' : '🔥 Add Burner Round'}
                </button>
              )}
              {!usedRounds.has('core') && (
                <button className={styles.coreRoundBtn}
                  onClick={() => handleAddCircuit('core')}
                  disabled={!!loadingC3}>
                  {loadingC3==='core' ? 'Building...' : '💪 Add Core Round'}
                </button>
              )}
            </div>
          )}
          <div className={styles.footer}>
            <button className={styles.newWorkoutBtn} onClick={() => {
              setResetLabel(getWorkoutTypeLabel())
              setResetSplash(true)
            }}>↺ Generate Another Workout</button>
          </div>
        </div>
      )}
    </div>
  )
}
