import React, { useState } from 'react'
import WorkoutPage from './components/WorkoutPage'
import AdminPage   from './components/AdminPage'
import styles      from './App.module.css'

export default function App() {
  const [page, setPage] = useState(
    window.location.hash === '#admin' ? 'admin' : 'workout'
  )

  function goTo(p) {
    window.location.hash = p === 'admin' ? '#admin' : ''
    setPage(p)
  }

  function handleLogoClick() {
    goTo('workout')
  }

  return (
    <div className={styles.app}>
      <nav className={styles.nav}>
        <div className={styles.logoWrap}>
          <button
            className={styles.logo}
            onClick={handleLogoClick}
          >
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
        {page === 'workout'
          ? <WorkoutPage />
          : <AdminPage />
        }
      </main>
    </div>
  )
}
