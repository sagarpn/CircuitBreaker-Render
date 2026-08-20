import React, { useState, useEffect } from 'react'
import WorkoutPage         from './components/WorkoutPage'
import AdminPage           from './components/AdminPage'
import MaintenanceCircuit  from './components/MaintenanceCircuit'
import NutritionPage       from './components/NutritionPage'
import styles              from './App.module.css'

function getPage() {
  const hash = window.location.hash
  if (hash === '#admin')       return 'admin'
  if (hash === '#maintenance') return 'maintenance'
  if (hash === '#nutrition')   return 'nutrition'
  return 'workout'
}

export default function App() {
  const [page, setPage] = useState(getPage)

  useEffect(() => {
    function onHashChange() { setPage(getPage()) }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function goTo(p) {
    window.location.hash = p === 'admin' ? '#admin' : p === 'maintenance' ? '#maintenance' : ''
    setPage(p)
  }

  // Nutrition page renders standalone — no main nav shown
  if (page === 'nutrition') {
    return <NutritionPage />
  }

  return (
    <div className={styles.app}>
      <nav className={styles.nav}>
        <div className={styles.logoWrap}>
          <button className={styles.logo} onClick={() => goTo('workout')}>
            ⚡ CircuitBreaker <span className={styles.tagline}>· Break your limits</span>
          </button>
        </div>
        <div className={styles.navRight}>
          <a href="/terms.html" target="_blank" rel="noopener noreferrer"
            className={styles.termsNavLink}>Terms</a>
          <button
            className={`${styles.navLink} ${page === 'admin' ? styles.active : ''}`}
            onClick={() => goTo(page === 'admin' ? 'workout' : 'admin')}
          >
            {page === 'admin' ? '← Back' : 'Exercises'}
          </button>
        </div>
      </nav>

      <main className={styles.main}>
        {page === 'workout'      && <WorkoutPage />}
        {page === 'admin'        && <AdminPage />}
        {page === 'maintenance'  && <MaintenanceCircuit />}
      </main>
    </div>
  )
}
