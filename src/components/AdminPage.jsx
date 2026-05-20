import React, { useState, useEffect, useRef } from 'react'
import styles from './AdminPage.module.css'

const CATEGORIES = ['upper', 'lower', 'core', 'hiit']
const EQUIPMENT  = ['dumbbells', 'bench', 'kettlebell']
const EMPTY_FORM = { name: '', category: 'upper', equipment: [], reps: '', description: '', muscle_group: '', intensity: '', hiit: '', strength: '', core: '', amrap: '', lucky7: '', compound: '', burner: '', unilateral: '', plyometric: '', bodyweight: '', slot_order: '' }

export default function AdminPage() {
  const [password,    setPassword]    = useState(localStorage.getItem('admin_pw') || '')
  const [authed,      setAuthed]      = useState(false)
  const [authError,   setAuthError]   = useState(false)
  const [exercises,   setExercises]   = useState([])
  const [form,        setForm]        = useState(EMPTY_FORM)
  const [editId,      setEditId]      = useState(null)
  const [filter,      setFilter]      = useState('all')
  const [tab,         setTab]         = useState('library')
  const [saving,      setSaving]      = useState(false)
  const [msg,         setMsg]         = useState(null)
  const [favourites,  setFavourites]  = useState([])
  const [importing,   setImporting]   = useState(false)
  const [importResult,setImportResult]= useState(null)
  const [backupMsg,   setBackupMsg]   = useState('')
  const fileInputRef = useRef(null)

  async function checkAuth() {
    const res = await fetch('/api/admin/verify', { headers: { 'x-admin-password': password } })
    if (res.ok) {
      setAuthed(true); setAuthError(false)
      localStorage.setItem('admin_pw', password)
      loadExercises(); loadFavs()
    } else { setAuthError(true) }
  }

  async function downloadExercises() {
    try {
      const res  = await fetch('/api/admin/download-exercises', { headers: { 'x-admin-password': password } })
      const data = await res.json()
      if (!data.exercises) return alert('Download failed')

      const SEP = '\t'
      const EOL = '\n'

      // ── Main sheet columns
      const cols = [
        'id','name','description','category',
        'hiit','strength','core',
        'amrap','lucky7',
        'compound','burner','core_burner','hiit_burner','unilateral','plyometric',
        'bodyweight','dumbbells','bench',
        'reps','sets','to_failure','timed','max_reps_timed',
        'muscle_group','display_muscle','intensity','slot_order',
        'flagged','system_flagged'
      ]
      const mainLines = [cols.join(SEP)]
      for (const ex of data.exercises) {
        mainLines.push(cols.map(c => String(ex[c] == null ? '' : ex[c]).replace(/\t/g,' ')).join(SEP))
      }

      // ── Legend sheet
      const legend = [
        ['COLUMN','ACCEPTED VALUES','NOTES'],
        ['id','1-317 (number)','Do not change'],
        ['name','Text','Exercise name'],
        ['description','Text','How to perform it'],
        ['category','upper / lower / core / hiit','Primary category'],
        ['hiit','yes / blank','Is a HIIT exercise'],
        ['strength','yes / blank','Is a strength exercise (upper or lower)'],
        ['core','yes / blank','Is a core exercise'],
        ['amrap','yes / blank','Eligible for AMRAP format'],
        ['lucky7','yes / blank','Eligible for Lucky 7s format'],
        ['compound','yes / blank','Multi-joint movement (bench press, squat, row)'],
        ['burner','yes / blank','Burnout/finisher exercise — goes last in circuit'],
        ['core_burner','yes / blank','Core burnout exercise'],
        ['hiit_burner','yes / blank','HIIT burnout exercise'],
        ['unilateral','yes / blank','Single side — exercise done each side'],
        ['plyometric','yes / blank','Jumping or explosive movement'],
        ['bodyweight','yes / blank','No equipment needed'],
        ['dumbbells','yes / blank','Requires dumbbells'],
        ['bench','yes / blank','Requires bench'],
        ['reps','Number only e.g. 12','Rep count only — no sets prefix'],
        ['sets','Number only e.g. 3','Number of sets'],
        ['to_failure','yes / blank','Do until failure (no fixed rep count)'],
        ['timed','yes / blank','Time-based exercise (hold, seconds)'],
        ['max_reps_timed','Seconds e.g. 30','Max reps in X seconds'],
        ['muscle_group','chest / back / shoulders / biceps / triceps / quads / glutes / hamstrings / core','Primary muscle'],
        ['display_muscle','Chest / Back / Shoulders / Biceps / Triceps / Quads / Glutes / Hamstrings / Stability / Abs / Obliques / Lower Abs / Full Body / Cardio / Agility / Power / Legs / Calves','Label shown on card'],
        ['intensity','1 / 2 / 3 / 4 / 5','1=easy 2=low 3=moderate 4=hard 5=max effort'],
        ['slot_order','1 / 2 / 3','Upper body only: 1=lead compound 2=secondary 3=isolation'],
        ['flagged','yes / blank','Admin flagged — hidden from workouts'],
        ['system_flagged','yes / blank','Auto-flagged — removed from seed file'],
      ]
      const legendLines = legend.map(row => row.join(SEP))

      // Write two sheets as separate sections in the TSV with a blank row between
      const fullContent = [
        '=== EXERCISES ===',
        ...mainLines,
        '',
        '=== LEGEND ===',
        ...legendLines
      ].join(EOL)

      const blob = new Blob([fullContent], { type: 'text/tab-separated-values' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = 'circuitbreaker-exercises-' + new Date().toISOString().slice(0,10) + '.tsv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) { alert('Download error: ' + e.message) }
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true); setImportResult(null)
    try {
      const text    = await file.text()
      const SEP     = '\t'
      const allRows = text.split('\n').filter(Boolean)
      const headers = allRows[0].split(SEP).map(h => h.trim())
      const exList  = allRows.slice(1).map(line => {
        const vals = line.split(SEP)
        const obj  = {}
        headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim() })
        return obj
      }).filter(ex => ex.name)
      const res    = await fetch('/api/admin/upload-exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
        body: JSON.stringify({ exercises: exList })
      })
      const result = await res.json()
      setImportResult(result)
    } catch (err) { setImportResult({ error: err.message }) }
    setImporting(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    loadExercises()
  }

  async function doBackup() {
    const res  = await fetch('/api/admin/backup', { method: 'POST', headers: { 'x-admin-password': password } })
    const data = await res.json()
    setBackupMsg(data.ok ? ('Backed up ' + data.count + ' exercises') : ('Error: ' + data.error))
    setTimeout(() => setBackupMsg(''), 4000)
  }

  async function doRestore() {
    if (!confirm('Restore from backup? This will replace ALL current exercises.')) return
    const res  = await fetch('/api/admin/restore', { method: 'POST', headers: { 'x-admin-password': password } })
    const data = await res.json()
    setBackupMsg(data.ok ? ('Restored ' + data.restored + ' exercises') : ('Error: ' + data.error))
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
    await fetch('/api/favourites/' + id, { method: 'DELETE', headers: { 'x-admin-password': password } })
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
    const url    = editId ? ('/api/admin/exercises/' + editId) : '/api/admin/exercises'
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'x-admin-password': password }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error('Save failed')
      showMsg(editId ? 'Exercise updated!' : 'Exercise added!')
      setForm(EMPTY_FORM); setEditId(null); loadExercises()
    } catch (e) { showMsg(e.message, true) }
    finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this exercise?')) return
    await fetch('/api/admin/exercises/' + id, { method: 'DELETE', headers: { 'x-admin-password': password } })
    loadExercises(); showMsg('Exercise deleted.')
  }

  async function handleFlag(id) {
    await fetch('/api/admin/exercises/' + id + '/flag', { method: 'PATCH', headers: { 'x-admin-password': password } })
    loadExercises()
  }

  function startEdit(ex) {
    setEditId(ex.id)
    setForm({ name: ex.name, category: ex.category, equipment: ex.equipment || [], reps: ex.reps, description: ex.description || '' })
    setTab('library')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function toggleEquipment(eq) {
    setForm(f => ({ ...f, equipment: f.equipment.includes(eq) ? f.equipment.filter(e => e !== eq) : [...f.equipment, eq] }))
  }

  const flagged  = exercises.filter(e => e.flagged)
  const filtered = tab === 'flagged' ? flagged : (filter === 'all' ? exercises : exercises.filter(e => e.category === filter))

  if (!authed) {
    return (
      <div className={styles.loginWrap}>
        <div className={styles.loginBox}>
          <h2 className={styles.loginTitle}>Admin Access</h2>
          <p className={styles.loginSub}>Enter your admin password to manage exercises.</p>
          <input className={styles.input} type="password" placeholder="Admin password" value={password}
            onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && checkAuth()} />
          {authError && <div className={styles.error}>Incorrect password.</div>}
          <button className={styles.loginBtn} onClick={checkAuth}>Enter</button>
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

      {msg && <div className={styles.msg + ' ' + (msg.isError ? styles.msgError : styles.msgOk)}>{msg.text}</div>}

      <div className={styles.toolsBar}>
        <button className={styles.toolBtn} onClick={downloadExercises}>Download</button>
        <label className={styles.toolBtn} style={{ cursor: 'pointer' }}>
          {importing ? 'Importing...' : 'Upload'}
          <input ref={fileInputRef} type="file" accept=".xls,.xlsx,.tsv,.txt" onChange={handleFileUpload} style={{ display: 'none' }} />
        </label>
        <button className={styles.toolBtn} onClick={doBackup}>Backup</button>
        <button className={styles.toolBtn + ' ' + styles.restoreBtn} onClick={doRestore}>Restore</button>
        {backupMsg && <span className={styles.backupMsg}>{backupMsg}</span>}
      </div>

      {importResult && (
        <div className={importResult.error ? styles.importError : styles.importSuccess}>
          {importResult.error
            ? 'Import failed: ' + importResult.error
            : 'Import done: ' + importResult.added + ' added, ' + importResult.updated + ' updated'
          }
        </div>
      )}

      <div className={styles.tabs}>
        <button className={styles.tabBtn + ' ' + (tab === 'library'    ? styles.activeTab : '')} onClick={() => setTab('library')}>All Exercises</button>
        <button className={styles.tabBtn + ' ' + (tab === 'flagged'    ? styles.activeTab : '')} onClick={() => setTab('flagged')}>
          Flagged {flagged.length > 0 && <span className={styles.badge}>{flagged.length}</span>}
        </button>
        <button className={styles.tabBtn + ' ' + (tab === 'favourites' ? styles.activeTab : '')} onClick={() => { setTab('favourites'); loadFavs() }}>
          Saved {favourites.length > 0 && <span className={styles.badge}>{favourites.length}</span>}
        </button>
      </div>

      {tab === 'library' && (
        <div className={styles.formPanel}>
          <div className={styles.formTitle}>{editId ? 'Edit Exercise' : '+ Add New Exercise'}</div>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Name *</label>
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
              <input className={styles.input} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short cue" />
            </div>
            <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
              <label>Equipment</label>
              <div className={styles.checkRow}>
                {EQUIPMENT.map(eq => (
                  <label key={eq} className={styles.checkLabel}>
                    <input type="checkbox" checked={form.equipment.includes(eq)} onChange={() => toggleEquipment(eq)} />
                    {eq.charAt(0).toUpperCase() + eq.slice(1)}
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
              <label>Category Tags</label>
              <div className={styles.checkRow}>
                {['hiit','strength','core'].map(t => (
                  <label key={t} className={styles.checkLabel}>
                    <input type="checkbox" checked={form[t]==='yes'} onChange={e => setForm(f=>({...f,[t]:e.target.checked?'yes':''}))} />
                    {t.charAt(0).toUpperCase()+t.slice(1)}
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
              <label>Format Tags</label>
              <div className={styles.checkRow}>
                {['amrap','lucky7','compound','burner','unilateral','plyometric','bodyweight'].map(t => (
                  <label key={t} className={styles.checkLabel}>
                    <input type="checkbox" checked={form[t]==='yes'} onChange={e => setForm(f=>({...f,[t]:e.target.checked?'yes':''}))} />
                    {t.charAt(0).toUpperCase()+t.slice(1)}
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.field}>
              <label>Muscle Group</label>
              <select className={styles.input} value={form.muscle_group} onChange={e=>setForm(f=>({...f,muscle_group:e.target.value}))}>
                <option value="">— none —</option>
                {['chest','back','shoulders','biceps','triceps','quads','glutes','hamstrings','core'].map(m=>(
                  <option key={m} value={m}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label>Intensity (1-5)</label>
              <select className={styles.input} value={form.intensity} onChange={e=>setForm(f=>({...f,intensity:e.target.value}))}>
                <option value="">— none —</option>
                {[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.formActions}>
            <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editId ? 'Save Changes' : 'Add Exercise'}</button>
            {editId && <button className={styles.cancelBtn} onClick={() => { setEditId(null); setForm(EMPTY_FORM) }}>Cancel</button>}
          </div>
        </div>
      )}

      {tab === 'flagged' && (
        <div className={styles.flaggedInfo}>
          {flagged.length === 0 ? 'No exercises flagged.' : flagged.length + ' exercises flagged.'}
        </div>
      )}

      {tab === 'library' && (
        <div className={styles.filters}>
          {['all', ...CATEGORIES].map(f => (
            <button key={f} className={styles.filterBtn + ' ' + (filter === f ? styles.activeFilter : '')} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              <span className={styles.filterCount}>{f === 'all' ? exercises.length : exercises.filter(e => e.category === f).length}</span>
            </button>
          ))}
        </div>
      )}

      {tab === 'favourites' && (
        <div className={styles.favAdmin}>
          {favourites.length === 0
            ? <div className={styles.flaggedInfo}>No saved workouts yet.</div>
            : favourites.map(fav => (
              <div key={fav.id} className={styles.favAdminRow}>
                <div className={styles.favAdminMeta}>
                  <div className={styles.favAdminName}>{fav.label}</div>
                  <div className={styles.favAdminSub}>{fav.date}</div>
                </div>
                <button className={styles.deleteBtn} onClick={() => deleteFav(fav.id)}>Delete</button>
              </div>
            ))
          }
        </div>
      )}

      {tab !== 'favourites' && (
        <div className={styles.list}>
          {filtered.map(ex => (
            <div key={ex.id} className={styles.row + ' ' + (ex.flagged ? styles.flaggedRow : '')}>
              <div className={styles.rowBody}>
                <span className={styles.catDot + ' ' + styles[ex.category]} />
                <div>
                  <div className={styles.rowName}>
                    {ex.name}
                    {ex.flagged && <span className={styles.flagBadge}>Flagged</span>}
                    {ex.system_flagged && <span className={styles.sysFlagBadge}>Removed</span>}
                  </div>
                  <div className={styles.rowMeta}>{ex.reps}{ex.intensity ? ' · i:' + ex.intensity : ''}</div>
                  {ex.description && <div className={styles.rowDesc}>{ex.description}</div>}
                </div>
              </div>
              <div className={styles.rowActions}>
                <button className={styles.flagBtn + ' ' + (ex.flagged ? styles.flaggedActive : '')} onClick={() => handleFlag(ex.id)}>
                  {ex.flagged ? 'Unflag' : 'Flag'}
                </button>
                <button className={styles.editBtn} onClick={() => startEdit(ex)}>Edit</button>
                <button className={styles.deleteBtn} onClick={() => handleDelete(ex.id)}>Delete</button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className={styles.empty}>No exercises found.</div>}
        </div>
      )}
    </div>
  )
}
