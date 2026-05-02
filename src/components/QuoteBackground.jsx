import React, { useState } from 'react'
import styles from './QuoteBackground.module.css'

const QUOTES = [
  "sweat now, shine later",
  "your only competition is yesterday's you",
  "one more rep",
  "make it hurt so it can heal",
  "progress, not perfection",
  "earn it",
  "stronger every single day",
  "show up. do the work. repeat",
  "the body achieves what the mind believes",
  "no shortcuts. no excuses",
  "pain is temporary. results are permanent",
  "every rep counts",
  "be the hardest worker in the room",
  "discipline beats motivation every time",
  "you don't find the will, you build it",
  "rest when you're done",
  "the burn means it's working",
  "push past the voice that says stop",
  "results don't care about your feelings",
  "move your body. change your life",
  "you've done hard things before",
  "suffer the pain of discipline or the pain of regret",
  "get comfortable being uncomfortable",
  "champions train, legends grind",
  "your future self is watching",
  "fall seven times, get up eight",
  "do it for the version of you who gave up",
  "make your body your strongest asset",
  "the only bad workout is the one that didn't happen",
  "consistency is the secret weapon",
  "breathe. grind. repeat",
  "today's effort is tomorrow's result",
  "be proud of every drop of sweat",
  "train hard or go home",
  "no pain no gain",
  "you are stronger than you think",
]

export default function QuoteBackground() {
  // Pick once on load — stays for the entire session
  const [quote] = useState(() => {
    const last = Number(sessionStorage.getItem('lastQuote') ?? -1)
    let idx
    do { idx = Math.floor(Math.random() * QUOTES.length) } while (idx === last)
    sessionStorage.setItem('lastQuote', idx)
    return QUOTES[idx]
  })

  return (
    <div className={styles.bg}>
      <div className={styles.quote}>{quote}</div>
    </div>
  )
}
