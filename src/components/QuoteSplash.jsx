import React, { useEffect, useState } from 'react'
import styles from './QuoteSplash.module.css'

export default function QuoteSplash({ quote, workoutName, onDone }) {
  const [phase, setPhase] = useState('in') // 'in' | 'hold' | 'out'

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 400)
    const t2 = setTimeout(() => setPhase('out'),  3600)
    const t3 = setTimeout(() => onDone(),         4200)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  return (
    <div className={`${styles.overlay} ${styles[phase]}`}>
      <div className={styles.inner}>
        <div className={styles.workoutName}>{workoutName}</div>
        <div className={styles.divider} />
        <div className={styles.quote}>"{quote}"</div>
        <div className={styles.dots}>
          <span /><span /><span />
        </div>
      </div>
    </div>
  )
}
