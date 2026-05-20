import React, { useEffect, useState } from 'react'
import styles from './ResetSplash.module.css'

export default function ResetSplash({ workoutType, onDone }) {
  const [phase, setPhase] = useState('in')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 300)
    const t2 = setTimeout(() => setPhase('out'),  3500)
    const t3 = setTimeout(() => onDone(),          4000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  return (
    <div className={`${styles.overlay} ${styles[phase]}`}>
      <div className={styles.inner}>
        <div className={styles.workoutType}>{workoutType}</div>
        <div className={styles.completed}>WORKOUT COMPLETED</div>
        <div className={styles.divider} />
        <div className={styles.message}>
          Previous session is saved in Recents.
          <br />Now let's build the next one.
        </div>
        <div className={styles.dots}>
          <span /><span /><span />
        </div>
      </div>
    </div>
  )
}
