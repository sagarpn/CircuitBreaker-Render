import React, { useState, useEffect, useRef } from 'react'
import styles from './AdminPage.module.css'

const CATEGORIES = ['upper', 'lower', 'core', 'hiit']
const EQUIPMENT  = ['dumbbells', 'bench', 'kettlebell']
const EMPTY_FORM = {
  name:'', category:'upper', equipment:[], reps:'', description:'',
  muscle_group:'', intensity:'', hiit:'', strength:'', core:'',
  amrap:'', lucky7:'', compound:'', burner:'', unilateral:'',
  plyometric:'', bodyweight:'', slot_order:''
}

// ── Filter config ─────────────────────────────────────────
const FILTER_GROUPS = [
  { key:'category',  label:'Category',      type:'or',
    opts:['upper','lower','core','hiit'] },
  { key:'type',      label:'Type',           type:'or',
    opts:['burner','compound','unilateral','plyometric'] },
  { key:'eligible',  label:'Format Eligible',type:'or',
    opts:['amrap','lucky7'] },
  { key:'equipment', label:'Equipment',      type:'or',
    opts:['bodyweight','dumbbells','bench'] },
  { key:'repfmt',    label:'Rep Format',     type:'or',
    opts:['has_reps','has_sets','to_failure','timed','has_max_timed'] },
  { key:'muscle',    label:'Muscle Group',   type:'or',
    opts:['chest','back','shoulders','biceps','triceps','quads','glutes','hamstrings','core'] },
  { key:'intensity', label:'Intensity',      type:'or',
    opts:['1','2','3','4','5'] },
  { key:'slot',      label:'Slot Order',     type:'or',
    opts:['1','2','3'] },
  { key:'status',    label:'Status',         type:'or',
    opts:['flagged','system_flagged','missing_intensity','missing_muscle'] },
]

const REPFMT_LABELS = {
  has_reps:'Has reps', has_sets:'Has sets', to_failure:'To failure',
  timed:'Timed', has_max_timed:'Has max timed'
}

export default function AdminPage() {
  const [password,     setPassword]     = useState(localStorage.getItem('admin_pw') || '')
  const [authed,       setAuthed]       = useState(false)
  const [authError,    setAuthError]    = useState(false)
  const [exercises,    setExercises]    = useState([])
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [editId,       setEditId]       = useState(null)
  const [filter,       setFilter]       = useState('all')
  const [tab,          setTab]          = useState('library')
  const [saving,       setSaving]       = useState(false)
  const [msg,          setMsg]          = useState(null)
  const [favourites,   setFavourites]   = useState([])

  // Vault state
  const [dlOpen,       setDlOpen]       = useState(false)
  const [dlFilters,    setDlFilters]    = useState({})
  const [dlCount,      setDlCount]      = useState(0)
  const [uploadFile,   setUploadFile]   = useState(null)
  const [uploadParsed, setUploadParsed] = useState(null)
  const [validateRes,  setValidateRes]  = useState(null)
  const [validating,   setValidating]   = useState(false)
  const [uploading,    setUploading]    = useState(false)
  const [uploadDone,   setUploadDone]   = useState(null)
  const [backupInfo,   setBackupInfo]   = useState(null)
  const [backupMsg,    setBackupMsg]    = useState('')
  const fileInputRef = useRef(null)

  async function checkAuth() {
    const res = await fetch('/api/admin/verify', { headers: { 'x-admin-password': password } })
    if (res.ok) {
      setAuthed(true); setAuthError(false)
      localStorage.setItem('admin_pw', password)
      loadExercises(); loadFavs(); loadBackupInfo()
    } else { setAuthError(true) }
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

  async function loadBackupInfo() {
    try {
      const res  = await fetch('/api/admin/backup-info', { headers: { 'x-admin-password': password } })
      const data = await res.json()
      setBackupInfo(data)
    } catch {}
  }

  useEffect(() => { if (password) checkAuth() }, [])

  // ── Download with filters ─────────────────────────────────
  function matchesFilters(ex) {
    const checks = []
    const f = dlFilters

    if (f.category?.length) {
      checks.push(f.category.includes(ex.category))
    }
    if (f.type?.length) {
      const tags = ex.tags || ''
      const isBurn = tags.includes('burnout')
      const typeMap = {
        burner: isBurn,
        compound: ex.is_compound,
        unilateral: /each side|each leg|each arm/i.test(ex.reps||''),
        plyometric: ['jump','bound','hop'].some(k=>(ex.name||'').toLowerCase().includes(k))
      }
      checks.push(f.type.some(t => typeMap[t]))
    }
    if (f.eligible?.length) {
      checks.push(f.eligible.some(e => ex[e] === 'yes' || ex[e] === true))
    }
    if (f.equipment?.length) {
      const eq = Array.isArray(ex.equipment) ? ex.equipment : []
      const bw = !eq.length || eq.every(e => !e || e === 'none')
      const eqMap = { bodyweight: bw, dumbbells: eq.includes('dumbbells'), bench: eq.includes('bench') }
      checks.push(f.equipment.some(e => eqMap[e]))
    }
    if (f.repfmt?.length) {
      const r = ex.reps || ''
      const rfMap = {
        has_reps: /\d+\s*reps?/i.test(r),
        has_sets: /\d+\s*sets?/i.test(r),
        to_failure: /to failure|max reps/i.test(r),
        timed: ex.format === 'timed',
        has_max_timed: /\d+\s*sec/i.test(ex.description||'')
      }
      checks.push(f.repfmt.some(rf => rfMap[rf]))
    }
    if (f.muscle?.length) {
      checks.push(f.muscle.includes(ex.muscle_group))
    }
    if (f.intensity?.length) {
      checks.push(f.intensity.includes(String(ex.intensity)))
    }
    if (f.slot?.length) {
      checks.push(f.slot.includes(String(ex.slot_order || ex.ex_order)))
    }
    if (f.status?.length) {
      const stMap = {
        flagged: ex.flagged,
        system_flagged: ex.system_flagged,
        missing_intensity: !ex.intensity,
        missing_muscle: !ex.muscle_group
      }
      checks.push(f.status.some(s => stMap[s]))
    }
    return checks.length === 0 || checks.every(Boolean)
  }

  // Recount when filters change
  useEffect(() => {
    const count = exercises.filter(matchesFilters).length
    setDlCount(count)
  }, [dlFilters, exercises])

  function toggleFilter(group, val) {
    setDlFilters(prev => {
      const current = prev[group] || []
      const next = current.includes(val) ? current.filter(v=>v!==val) : [...current, val]
      return { ...prev, [group]: next }
    })
  }

  function clearFilters() { setDlFilters({}) }

  async function doDownload() {
    try {
      const url = '/api/admin/download-exercises?' + new Date().getTime()
      const res = await fetch(url, { headers: { 'x-admin-password': password } })
      if (!res.ok) { const e = await res.json(); return alert('Download failed: ' + e.error) }
      // Get all exercises, filter client-side, re-download with filter param
      // Simpler: send filter to server
      const filterParam = encodeURIComponent(JSON.stringify(dlFilters))
      const res2 = await fetch('/api/admin/download-exercises?filters=' + filterParam, {
        headers: { 'x-admin-password': password }
      })
      if (!res2.ok) return alert('Download failed')
      const blob = await res2.blob()
      const a    = document.createElement('a')
      a.href     = URL.createObjectURL(blob)
      const suffix = Object.keys(dlFilters).filter(k=>(dlFilters[k]||[]).length).join('_') || 'all'
      a.download = 'exercises-' + suffix + '-' + new Date().toISOString().slice(0,10) + '.xlsx'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch(e) { alert('Download error: ' + e.message) }
  }

  // ── Upload flow ───────────────────────────────────────────
  async function handleFileSelect(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploadFile(file); setValidateRes(null); setUploadDone(null)

    // Parse TSV/Excel
    try {
      const text    = await file.text()
      const SEP     = '\t'
      const allRows = text.split('\n').filter(Boolean)
      // Skip section headers like "=== EXERCISES ==="
      const dataRows = allRows.filter(r => !r.startsWith('==='))
      const headers  = dataRows[0].split(SEP).map(h => h.trim())
      const exList   = dataRows.slice(1).map(line => {
        const vals = line.split(SEP)
        const obj  = {}
        headers.forEach((h, i) => { obj[h] = (vals[i]||'').trim() })
        return obj
      }).filter(ex => ex.name)
      setUploadParsed(exList)

      // Auto-validate
      setValidating(true)
      const res  = await fetch('/api/admin/validate-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
        body: JSON.stringify({ exercises: exList })
      })
      const data = await res.json()
      setValidateRes(data)
      setValidating(false)
    } catch(err) {
      setValidating(false)
      setValidateRes({ error: 'Could not parse file: ' + err.message })
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function confirmUpload() {
    if (!uploadParsed) return
    setUploading(true)
    try {
      const res  = await fetch('/api/admin/upload-exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
        body: JSON.stringify({ exercises: uploadParsed })
      })
      const data = await res.json()
      setUploadDone(data)
      setValidateRes(null); setUploadFile(null); setUploadParsed(null)
      loadExercises()
    } catch(err) { alert('Upload error: ' + err.message) }
    setUploading(false)
  }

  function cancelUpload() {
    setUploadFile(null); setUploadParsed(null); setValidateRes(null)
  }

  // ── Backup / Restore ──────────────────────────────────────
  async function doBackup() {
    const res  = await fetch('/api/admin/backup', { method:'POST', headers:{'x-admin-password':password} })
    const data = await res.json()
    setBackupMsg(data.ok ? ('Backed up ' + data.count + ' exercises') : ('Error: ' + data.error))
    setTimeout(() => setBackupMsg(''), 4000)
    loadBackupInfo()
  }

  async function doRestore() {
    if (!confirm('Restore from backup? This will replace ALL current exercises.')) return
    const res  = await fetch('/api/admin/restore', { method:'POST', headers:{'x-admin-password':password} })
    const data = await res.json()
    setBackupMsg(data.ok ? ('Restored ' + data.restored + ' exercises') : ('Error: ' + data.error))
    setTimeout(() => setBackupMsg(''), 4000)
    loadExercises()
  }

  // ── Library functions ─────────────────────────────────────
  function showMsg(text, isError=false) {
    setMsg({ text, isError }); setTimeout(() => setMsg(null), 3000)
  }

  async function handleSave() {
    if (!form.name || !form.reps) return showMsg('Name and reps are required', true)
    setSaving(true)
    const method = editId ? 'PUT' : 'POST'
    const url    = editId ? ('/api/admin/exercises/' + editId) : '/api/admin/exercises'
    try {
      const res = await fetch(url, { method, headers:{'Content-Type':'application/json','x-admin-password':password}, body:JSON.stringify(form) })
      if (!res.ok) throw new Error('Save failed')
      showMsg(editId ? 'Exercise updated!' : 'Exercise added!')
      setForm(EMPTY_FORM); setEditId(null); loadExercises()
    } catch(e) { showMsg(e.message, true) }
    finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this exercise?')) return
    await fetch('/api/admin/exercises/' + id, { method:'DELETE', headers:{'x-admin-password':password} })
    loadExercises(); showMsg('Exercise deleted.')
  }

  async function handleFlag(id) {
    await fetch('/api/admin/exercises/' + id + '/flag', { method:'PATCH', headers:{'x-admin-password':password} })
    loadExercises()
  }

  async function deleteFav(id) {
    await fetch('/api/favourites/' + id, { method:'DELETE', headers:{'x-admin-password':password} })
    setFavourites(prev => prev.filter(f => f.id !== id))
    showMsg('Favourite removed.')
  }

  function startEdit(ex) {
    setEditId(ex.id)
    setForm({ name:ex.name, category:ex.category, equipment:ex.equipment||[], reps:ex.reps, description:ex.description||'' })
    setTab('library')
    window.scrollTo({ top:0, behavior:'smooth' })
  }

  function toggleEquipment(eq) {
    setForm(f => ({ ...f, equipment: f.equipment.includes(eq) ? f.equipment.filter(e=>e!==eq) : [...f.equipment,eq] }))
  }

  const flagged  = exercises.filter(e => e.flagged)
  const filtered = tab === 'flagged' ? flagged : (filter === 'all' ? exercises : exercises.filter(e => e.category === filter))

  // ── Login ──────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className={styles.loginWrap}>
        <div className={styles.loginBox}>
          <h2 className={styles.loginTitle}>Admin Access</h2>
          <p className={styles.loginSub}>Enter your admin password to manage exercises.</p>
          <input className={styles.input} type="password" placeholder="Admin password" value={password}
            onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&checkAuth()} />
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
        <h2 className={styles.pageTitle}>Admin</h2>
        <span className={styles.count}>{exercises.length} exercises</span>
      </div>

      {msg && <div className={styles.msg + ' ' + (msg.isError ? styles.msgError : styles.msgOk)}>{msg.text}</div>}

      {/* ── Top tabs ── */}
      <div className={styles.topTabs}>
        <button className={styles.topTab + ' ' + (tab==='library'||tab==='flagged'||tab==='favourites' ? styles.topTabActive : '')}
          onClick={() => setTab('library')}>Exercise Library</button>
        <button className={styles.topTab + ' ' + (tab==='vault' ? styles.topTabActive : '')}
          onClick={() => setTab('vault')}>🔒 Exercise Vault</button>
      </div>

      {/* ════════════════════════════════════════════════════ */}
      {/* EXERCISE VAULT TAB                                  */}
      {/* ════════════════════════════════════════════════════ */}
      {tab === 'vault' && (
        <div className={styles.vault}>

          {/* ── DOWNLOAD section ── */}
          <div className={styles.vaultSection}>
            <div className={styles.vaultSectionHeader} onClick={() => setDlOpen(o => !o)}>
              <div className={styles.vaultSectionTitle}>
                <span className={styles.vaultIcon}>⬇</span>
                <span>Download Exercises</span>
              </div>
              <span className={styles.vaultChevron}>{dlOpen ? '▲' : '▼'}</span>
            </div>

            {dlOpen && (
              <div className={styles.dlPanel}>
                <div className={styles.dlFiltersLabel}>
                  Filter exercises to download
                  {Object.values(dlFilters).some(v=>v?.length) && (
                    <button className={styles.clearFilters} onClick={clearFilters}>Clear all</button>
                  )}
                </div>

                {FILTER_GROUPS.map(group => (
                  <div key={group.key} className={styles.filterGroup}>
                    <div className={styles.filterGroupLabel}>{group.label}</div>
                    <div className={styles.filterOpts}>
                      {group.opts.map(opt => {
                        const active = (dlFilters[group.key]||[]).includes(opt)
                        const label  = group.key==='repfmt' ? REPFMT_LABELS[opt] : opt.replace(/_/g,' ')
                        return (
                          <button key={opt}
                            className={styles.filterChip + ' ' + (active ? styles.filterChipOn : '')}
                            onClick={() => toggleFilter(group.key, opt)}>
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}

                <button className={styles.dlBtn} onClick={doDownload}>
                  ⬇ Download {dlCount > 0 ? dlCount : exercises.length} exercises
                </button>
              </div>
            )}
          </div>

          {/* ── UPLOAD section ── */}
          <div className={styles.vaultSection}>
            <div className={styles.vaultSectionTitle}>
              <span className={styles.vaultIcon}>⬆</span>
              <span>Upload Exercises</span>
            </div>

            {!uploadFile && !uploadDone && (
              <div className={styles.uploadZone}>
                <label className={styles.uploadLabel}>
                  <span>Tap to select your Excel / TSV file</span>
                  <input ref={fileInputRef} type="file" accept=".xls,.xlsx,.tsv,.txt"
                    onChange={handleFileSelect} style={{display:'none'}} />
                </label>
              </div>
            )}

            {validating && (
              <div className={styles.validateLoading}>Checking file...</div>
            )}

            {validateRes && !validateRes.error && (
              <div className={styles.validateCard}>
                <div className={styles.validateTitle}>✅ File looks good</div>
                <div className={styles.validateRows}>
                  <div className={styles.validateRow}>
                    <span>Rows detected</span><span>{validateRes.total}</span>
                  </div>
                  <div className={styles.validateRow + ' ' + styles.validateAdd}>
                    <span>New exercises (will be added)</span><span>{validateRes.will_add}</span>
                  </div>
                  <div className={styles.validateRow}>
                    <span>Existing (will be updated)</span><span>{validateRes.will_update}</span>
                  </div>
                  {validateRes.skipped > 0 && (
                    <div className={styles.validateRow + ' ' + styles.validateWarn}>
                      <span>Skipped (blank name)</span><span>{validateRes.skipped}</span>
                    </div>
                  )}
                </div>
                {validateRes.will_add > 0 && (
                  <div className={styles.notFoundNote}>
                    New names (first {Math.min(5, validateRes.not_found.length)}):
                    {' ' + validateRes.not_found.slice(0,5).join(', ')}
                    {validateRes.not_found_count > 5 ? ' +' + (validateRes.not_found_count-5) + ' more' : ''}
                  </div>
                )}
                <div className={styles.validateActions}>
                  <button className={styles.cancelBtn} onClick={cancelUpload}>Cancel</button>
                  <button className={styles.confirmBtn} onClick={confirmUpload} disabled={uploading}>
                    {uploading ? 'Uploading...' : 'Confirm & Replace'}
                  </button>
                </div>
              </div>
            )}

            {validateRes?.error && (
              <div className={styles.validateError}>
                {validateRes.error}
                <button className={styles.cancelBtn} onClick={cancelUpload} style={{marginTop:8}}>Try again</button>
              </div>
            )}

            {uploadDone && (
              <div className={styles.uploadDone}>
                <div className={styles.validateTitle}>✅ Upload complete</div>
                <div className={styles.validateRows}>
                  <div className={styles.validateRow + ' ' + styles.validateAdd}>
                    <span>Added</span><span>{uploadDone.added}</span>
                  </div>
                  <div className={styles.validateRow}>
                    <span>Updated</span><span>{uploadDone.updated}</span>
                  </div>
                  {uploadDone.skipped > 0 && (
                    <div className={styles.validateRow + ' ' + styles.validateWarn}>
                      <span>Skipped</span><span>{uploadDone.skipped}</span>
                    </div>
                  )}
                  {uploadDone.errors?.length > 0 && (
                    <div className={styles.validateRow + ' ' + styles.validateErr}>
                      <span>Errors</span><span>{uploadDone.errors.length}</span>
                    </div>
                  )}
                  <div className={styles.validateRow}>
                    <span>Total in DB now</span><span>{uploadDone.total_in_db}</span>
                  </div>
                </div>
                <button className={styles.cancelBtn} onClick={() => setUploadDone(null)} style={{marginTop:12}}>
                  Upload another file
                </button>
              </div>
            )}
          </div>

          {/* ── BACKUP section ── */}
          <div className={styles.vaultSection}>
            <div className={styles.vaultSectionTitle}>
              <span className={styles.vaultIcon}>💾</span>
              <span>Backup</span>
            </div>
            <div className={styles.vaultBody}>
              {backupInfo && (
                <div className={styles.backupStatus}>
                  {backupInfo.count > 0
                    ? 'Last backup: ' + backupInfo.count + ' exercises · ' + (backupInfo.last ? new Date(backupInfo.last).toLocaleDateString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : 'unknown date')
                    : 'No backup yet'
                  }
                </div>
              )}
              <button className={styles.vaultBtn} onClick={doBackup}>💾 Backup Now</button>
              {backupMsg && <div className={styles.backupMsg}>{backupMsg}</div>}
            </div>
          </div>

          {/* ── RESTORE section ── */}
          <div className={styles.vaultSection}>
            <div className={styles.vaultSectionTitle}>
              <span className={styles.vaultIcon}>↩</span>
              <span>Restore</span>
            </div>
            <div className={styles.vaultBody}>
              {backupInfo && backupInfo.count > 0 ? (
                <>
                  <div className={styles.backupStatus}>
                    Backup has {backupInfo.count} exercises
                    {backupInfo.last ? ' from ' + new Date(backupInfo.last).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : ''}
                  </div>
                  <button className={styles.vaultBtnDanger} onClick={doRestore}>↩ Restore from Backup</button>
                </>
              ) : (
                <div className={styles.backupStatus}>No backup available to restore from.</div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* ════════════════════════════════════════════════════ */}
      {/* EXERCISE LIBRARY TABS                               */}
      {/* ════════════════════════════════════════════════════ */}
      {tab !== 'vault' && (
        <>
          <div className={styles.tabs}>
            <button className={styles.tabBtn + ' ' + (tab==='library' ? styles.activeTab : '')} onClick={()=>setTab('library')}>All Exercises</button>
            <button className={styles.tabBtn + ' ' + (tab==='flagged' ? styles.activeTab : '')} onClick={()=>setTab('flagged')}>
              Flagged {flagged.length > 0 && <span className={styles.badge}>{flagged.length}</span>}
            </button>
            <button className={styles.tabBtn + ' ' + (tab==='favourites' ? styles.activeTab : '')} onClick={()=>{setTab('favourites');loadFavs()}}>
              Saved {favourites.length > 0 && <span className={styles.badge}>{favourites.length}</span>}
            </button>
          </div>

          {tab === 'library' && (
            <div className={styles.formPanel}>
              <div className={styles.formTitle}>{editId ? 'Edit Exercise' : '+ Add New Exercise'}</div>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label>Name *</label>
                  <input className={styles.input} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Push-Ups" />
                </div>
                <div className={styles.field}>
                  <label>Category *</label>
                  <select className={styles.input} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                    {CATEGORIES.map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
                  </select>
                </div>
                <div className={styles.field} style={{gridColumn:'1 / -1'}}>
                  <label>Reps / Sets *</label>
                  <input className={styles.input} value={form.reps} onChange={e=>setForm(f=>({...f,reps:e.target.value}))} placeholder="e.g. 3 sets x 12 reps" />
                </div>
                <div className={styles.field} style={{gridColumn:'1 / -1'}}>
                  <label>Description</label>
                  <input className={styles.input} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Short cue" />
                </div>
                <div className={styles.field} style={{gridColumn:'1 / -1'}}>
                  <label>Equipment</label>
                  <div className={styles.checkRow}>
                    {EQUIPMENT.map(eq=>(
                      <label key={eq} className={styles.checkLabel}>
                        <input type="checkbox" checked={form.equipment.includes(eq)} onChange={()=>toggleEquipment(eq)} />
                        {eq.charAt(0).toUpperCase()+eq.slice(1)}
                      </label>
                    ))}
                  </div>
                </div>
                <div className={styles.field} style={{gridColumn:'1 / -1'}}>
                  <label>Category Tags</label>
                  <div className={styles.checkRow}>
                    {['hiit','strength','core'].map(t=>(
                      <label key={t} className={styles.checkLabel}>
                        <input type="checkbox" checked={form[t]==='yes'} onChange={e=>setForm(f=>({...f,[t]:e.target.checked?'yes':''}))} />
                        {t.charAt(0).toUpperCase()+t.slice(1)}
                      </label>
                    ))}
                  </div>
                </div>
                <div className={styles.field} style={{gridColumn:'1 / -1'}}>
                  <label>Format Tags</label>
                  <div className={styles.checkRow}>
                    {['amrap','lucky7','compound','burner','unilateral','plyometric','bodyweight'].map(t=>(
                      <label key={t} className={styles.checkLabel}>
                        <input type="checkbox" checked={form[t]==='yes'} onChange={e=>setForm(f=>({...f,[t]:e.target.checked?'yes':''}))} />
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
                <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving?'Saving...':editId?'Save Changes':'Add Exercise'}</button>
                {editId && <button className={styles.cancelBtn} onClick={()=>{setEditId(null);setForm(EMPTY_FORM)}}>Cancel</button>}
              </div>
            </div>
          )}

          {tab === 'flagged' && (
            <div className={styles.flaggedInfo}>
              {flagged.length===0 ? 'No exercises flagged.' : flagged.length + ' exercises flagged.'}
            </div>
          )}

          {tab === 'library' && (
            <div className={styles.filters}>
              {['all',...CATEGORIES].map(f=>(
                <button key={f} className={styles.filterBtn + ' ' + (filter===f ? styles.activeFilter : '')} onClick={()=>setFilter(f)}>
                  {f==='all'?'All':f.charAt(0).toUpperCase()+f.slice(1)}
                  <span className={styles.filterCount}>{f==='all'?exercises.length:exercises.filter(e=>e.category===f).length}</span>
                </button>
              ))}
            </div>
          )}

          {tab === 'favourites' && (
            <div className={styles.favAdmin}>
              {favourites.length===0
                ? <div className={styles.flaggedInfo}>No saved workouts yet.</div>
                : favourites.map(fav=>(
                  <div key={fav.id} className={styles.favAdminRow}>
                    <div className={styles.favAdminMeta}>
                      <div className={styles.favAdminName}>{fav.label}</div>
                      <div className={styles.favAdminSub}>{fav.date}</div>
                    </div>
                    <button className={styles.deleteBtn} onClick={()=>deleteFav(fav.id)}>Delete</button>
                  </div>
                ))
              }
            </div>
          )}

          {tab !== 'favourites' && (
            <div className={styles.list}>
              {filtered.map(ex=>(
                <div key={ex.id} className={styles.row + ' ' + (ex.flagged ? styles.flaggedRow : '')}>
                  <div className={styles.rowBody}>
                    <span className={styles.catDot + ' ' + styles[ex.category]} />
                    <div>
                      <div className={styles.rowName}>
                        {ex.name}
                        {ex.flagged && <span className={styles.flagBadge}>Flagged</span>}
                        {ex.system_flagged && <span className={styles.sysFlagBadge}>Removed</span>}
                      </div>
                      <div className={styles.rowMeta}>{ex.reps}{ex.intensity?' · i:'+ex.intensity:''}</div>
                      {ex.description && <div className={styles.rowDesc}>{ex.description}</div>}
                    </div>
                  </div>
                  <div className={styles.rowActions}>
                    <button className={styles.flagBtn + ' ' + (ex.flagged?styles.flaggedActive:'')} onClick={()=>handleFlag(ex.id)}>
                      {ex.flagged?'Unflag':'Flag'}
                    </button>
                    <button className={styles.editBtn} onClick={()=>startEdit(ex)}>Edit</button>
                    <button className={styles.deleteBtn} onClick={()=>handleDelete(ex.id)}>Delete</button>
                  </div>
                </div>
              ))}
              {filtered.length===0 && <div className={styles.empty}>No exercises found.</div>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
