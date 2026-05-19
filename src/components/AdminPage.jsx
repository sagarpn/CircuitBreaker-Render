import React, { useState, useEffect, useRef } from 'react'
import styles from './AdminPage.module.css'

const CATEGORIES = ['upper', 'lower', 'core', 'hiit']
const EQUIPMENT  = ['dumbbells', 'bench', 'kettlebell']
const EMPTY_FORM = { name: '', category: 'upper', equipment: [], reps: '', description: '' }

export default function AdminPage() {
  const [password,  setPassword]  = useState(localStorage.getItem('admin_pw') || '')
  const [authed,    setAuthed]    = useState(false)
  const [authError, setAuthError] = useState(false)
  const [exercises, setExercises] = useState([])
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [editId,    setEditId]    = useState(null)
  const [filter,    setFilter]    = useState('all')
  const [tab,       setTab]       = useState('library') // 'library' | 'flagged'
  const [saving,    setSaving]    = useState(false)
  const [msg,       setMsg]       = useState(null)
  const [favourites,setFavourites]= useState([])

  async function checkAuth() {
    const res = await fetch('/api/admin/verify', {
      headers: { 'x-admin-password': password }
    })
    if (res.ok) {
      setAuthed(true); setAuthError(false)
      localStorage.setItem('admin_pw', password)
      loadExercises()
      loadFavs()
    } else {
      setAuthError(true)
    }
  }

  // ── Download exercises as Excel ──────────────────────────
  async function downloadExercises() {
    try {
      const res  = await fetch('/api/admin/download-exercises', {
        headers: { 'x-admin-password': password }
      })
      const data = await res.json()
      if (!data.exercises) return alert('Download failed')
      const SEP = '\t'
      const EOL = '\n'
      const cols = ['id','name','category','equipment','reps','description',
        'flagged','system_flagged','tags','format','muscle_group','is_compound',
        'ex_order','display_muscle','intensity']
      const rows = [cols.join(SEP)]
      for (const ex of data.exercises) {
        rows.push(cols.map(c => String(ex[c] ?? '').replace(/\t/g, ' ')).join(SEP))
      }
      const blob = new Blob([rows.join(EOL)], { type: 'text/tab-separated-values' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = 'circuitbreaker-exercises-' + new Date().toISOString().slice(0,10) + '.xls'
      a.click()
      URL.revokeObjectURL(url)
    } catch(e) { alert('Download error: ' + e.message) }
  }

  // ── Upload exercises from Excel/TSV ───────────────────────
  async function handleFileUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true); setImportResult(null)
    try {
      const text = await file.text()
      const lines = text.split('
').filter(Boolean)
      const headers = lines[0].split('\t').map(h => h.trim())
      const exercises = lines.slice(1).map(line => {
        const vals = line.split('\t')
        const obj = {}
        headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim() })
        return obj
      }).filter(e => e.name)

      const res = await fetch('/api/admin/upload-exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
        body: JSON.stringify({ exercises })
      })
      const data = await res.json()
      setImportResult(data)
    } catch(err) { setImportResult({ error: err.message }) }
    setImporting(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    loadExercises()
  }

  // ── Backup / Restore ──────────────────────────────────────
  async function doBackup() {
    const res  = await fetch('/api/admin/backup', {
      method: 'POST', headers: { 'x-admin-password': password }
    })
    const data = await res.json()
    setBackupMsg(data.ok ? `✅ Backed up ${data.count} exercises` : `❌ ${data.error}`)
    setTimeout(() => setBackupMsg(''), 4000)
  }

  async function doRestore() {
    if (!confirm('Restore from backup? This will replace ALL current exercises.')) return
    const res  = await fetch('/api/admin/restore', {
      method: 'POST', headers: { 'x-admin-password': password }
    })
    const data = await res.json()
    setBackupMsg(data.ok ? `✅ Restored ${data.restored} exercises` : `❌ ${data.error}`)
    setTimeout(() => setBackupMsg(''), 4000)
    loadExercises()
  }

  async function loadExercises() {
    const res  = await fetch('/api/exercises')
    const data = await res.json()
    setExercises(data)
  }

  async function loadFavs() {
    try {
      const res  = await fetch('/api/favourites')
      const data = await res.json()
      setFavourites(Array.isArray(data) ? data : [])
    } catch { setFavourites([]) }
  }

  async function deleteFav(id) {
    await fetch(`/api/favourites/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': password },
    })
    setFavourites(prev => prev.filter(f => f.id !== id))
    showMsg('Favourite removed.')
  }

  useEffect(() => { if (password) checkAuth() }, [])

  function showMsg(text, isError = false) {
    setMsg({ text, isError })
    setTimeout(() => setMsg(null), 3000)
  }

  async function handleSave() {
    if (!form.name || !form.reps) return showMsg('Name and reps are required', true)
    setSaving(true)
    const method = editId ? 'PUT' : 'POST'
    const url    = editId ? `/api/admin/exercises/${editId}` : '/api/admin/exercises'
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Save failed')
      showMsg(editId ? 'Exercise updated!' : 'Exercise added!')
      setForm(EMPTY_FORM); setEditId(null)
      loadExercises()
    } catch (e) { showMsg(e.message, true) }
    finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this exercise? This cannot be undone.')) return
    await fetch(`/api/admin/exercises/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': password },
    })
    loadExercises()
    showMsg('Exercise deleted.')
  }

  async function handleFlag(id) {
    await fetch(`/api/admin/exercises/${id}/flag`, {
      method: 'PATCH',
      headers: { 'x-admin-password': password },
    })
    loadExercises()
  }

  function startEdit(ex) {
    setEditId(ex.id)
    setForm({ name: ex.name, category: ex.category, equipment: ex.equipment || [], reps: ex.reps, description: ex.description || '' })
    setTab('library')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function toggleEquipment(eq) {
    setForm(f => ({
      ...f,
      equipment: f.equipment.includes(eq)
        ? f.equipment.filter(e => e !== eq)
        : [...f.equipment, eq],
    }))
  }

  const flagged  = exercises.filter(e => e.flagged)
  const filtered = tab === 'flagged'
    ? flagged
    : (filter === 'all' ? exercises : exercises.filter(e => e.category === filter))

  // ── Login ──
  if (!authed) {
    return (
      <div className={styles.loginWrap}>
        <div className={styles.loginBox}>
          <h2 className={styles.loginTitle}>Admin Access</h2>
          <p className={styles.loginSub}>Enter your admin password to manage exercises.</p>
          <input
            className={styles.input}
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && checkAuth()}
          />
          {authError && <div className={styles.error}>Incorrect password.</div>}
          <button className={styles.loginBtn} onClick={checkAuth}>Enter →</button>
          <p className={styles.loginHint}>No password set? Leave blank and press Enter.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>Exercise Library</h2>
        <span className={styles.count}>{exercises.length} exercises</span>
      </div>

      {msg && (
        <div className={`${styles.msg} ${msg.isError ? styles.msgError : styles.msgOk}`}>
          {msg.text}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tabBtn} ${tab === 'library' ? styles.activeTab : ''}`}
          onClick={() => setTab('library')}
        >
          All Exercises
        </button>
        <button
          className={`${styles.tabBtn} ${tab === 'flagged' ? styles.activeTab : ''}`}
          onClick={() => setTab('flagged')}
        >
          🚩 Flagged for Review
          {flagged.length > 0 && <span className={styles.badge}>{flagged.length}</span>}
        </button>
        <button
          className={`${styles.tabBtn} ${tab === 'favourites' ? styles.activeTab : ''}`}
          onClick={() => { setTab('favourites'); loadFavs() }}
        >
          ⭐ Saved Circuits
          {favourites.length > 0 && <span className={styles.badge}>{favourites.length}</span>}
        </button>
      </div>

      {/* ── Add / Edit Form — only show on library tab ── */}
      {tab === 'library' && (
        <div className={styles.formPanel}>
          <div className={styles.formTitle}>{editId ? '✏️ Edit Exercise' : '+ Add New Exercise'}</div>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Exercise Name *</label>
              <input className={styles.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Push-Ups" />
            </div>
            <div className={styles.field}>
              <label>Category *</label>
              <select className={styles.input} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
              <label>Reps / Sets *</label>
              <input className={styles.input} value={form.reps} onChange={e => setForm(f => ({ ...f, reps: e.target.value }))} placeholder="e.g. 3 sets x 12 reps" />
            </div>
            <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
              <label>Description</label>
              <input className={styles.input} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short cue on how to do it" />
            </div>
            <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
              <label>Equipment needed</label>
              <div className={styles.checkRow}>
                {EQUIPMENT.map(eq => (
                  <label key={eq} className={styles.checkLabel}>
                    <input type="checkbox" checked={form.equipment.includes(eq)} onChange={() => toggleEquipment(eq)} />
                    {eq === 'dumbbells' ? '🏋️ Dumbbells' : eq === 'bench' ? '🪑 Bench' : '🫧 Kettlebell'}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className={styles.formActions}>
            <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editId ? 'Save Changes' : 'Add Exercise'}
            </button>
            {editId && <button className={styles.cancelBtn} onClick={() => { setEditId(null); setForm(EMPTY_FORM) }}>Cancel</button>}
          </div>
        </div>
      )}

      {/* ── Flagged tab info box ── */}
      {tab === 'flagged' && (
        <div className={styles.flaggedInfo}>
          {flagged.length === 0
            ? '✅ No exercises flagged for review. Users can flag exercises as too complex while using the app.'
            : `${flagged.length} exercise${flagged.length !== 1 ? 's' : ''} flagged as too complex. Review and delete or unflag each one.`
          }
        </div>
      )}

      {/* ── Filter tabs — only on library tab ── */}
      {tab === 'library' && tab !== 'favourites' && (
        <div className={styles.filters}>
          {['all', ...CATEGORIES].map(f => (
            <button
              key={f}
              className={`${styles.filterBtn} ${filter === f ? styles.activeFilter : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              <span className={styles.filterCount}>
                {f === 'all' ? exercises.length : exercises.filter(e => e.category === f).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Favourites tab ── */}
      {tab === 'favourites' && (
        <div className={styles.favAdmin}>
          {favourites.length === 0
            ? <div className={styles.flaggedInfo}>No saved circuits yet. Users can save circuits using the ⭐ button during a workout.</div>
            : favourites.map(fav => (
                <div key={fav.id} className={styles.favAdminRow}>
                  <div className={styles.favAdminMeta}>
                    <div className={styles.favAdminName}>{fav.label}</div>
                    <div className={styles.favAdminSub}>{fav.date} · {fav.focus} · {fav.style}</div>
                    <div className={styles.favAdminExercises}>
                      {fav.type === 'workout'
                        ? `Full workout · ${(fav.circuit1||[]).length + (fav.circuit2||[]).length} exercises`
                        : (fav.exercises||[]).map(e => e.name).join(', ')
                      }
                    </div>
                  </div>
                  <button className={styles.deleteBtn} onClick={() => deleteFav(fav.id)}>Delete</button>
                </div>
              ))
          }
        </div>
      )}

      {/* ── Exercise list ── */}
      {tab !== 'favourites' && <div className={styles.list}>
        {filtered.map(ex => (
          <div key={ex.id} className={`${styles.row} ${ex.flagged ? styles.flaggedRow : ''}`}>
            <div className={styles.rowBody}>
              <span className={`${styles.catDot} ${styles[ex.category]}`} />
              <div>
                <div className={styles.rowName}>
                  {ex.name}
                  {ex.flagged && <span className={styles.flagBadge}>🚩 Too Complex</span>}
                </div>
                <div className={styles.rowMeta}>
                  {ex.reps}
                  {ex.equipment.length > 0 && (
                    <span className={styles.rowEquip}>
                      · {ex.equipment.map(e => e === 'dumbbells' ? '🏋️' : '🔝').join(' ')}
                    </span>
                  )}
                </div>
                {ex.description && (
                  <div className={styles.rowDesc}>{ex.description}</div>
                )}
              </div>
            </div>
            <div className={styles.rowActions}>
              <button
                className={`${styles.flagBtn} ${ex.flagged ? styles.flaggedActive : ''}`}
                onClick={() => handleFlag(ex.id)}
                title={ex.flagged ? 'Remove flag' : 'Flag as too complex'}
              >
                {ex.flagged ? '🚩 Flagged' : '🚩'}
              </button>
              <button className={styles.editBtn} onClick={() => startEdit(ex)}>Edit</button>
              <button className={styles.deleteBtn} onClick={() => handleDelete(ex.id)}>Delete</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className={styles.empty}>
            {tab === 'flagged' ? 'No flagged exercises.' : 'No exercises in this category yet.'}
          </div>
        )}
      </div>}
    </div>
  )
}
