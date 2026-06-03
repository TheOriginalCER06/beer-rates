import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom'
import { CATEGORIES, STYLES_BY_CATEGORY, CONTAINERS, CONTAINER_CATEGORIES } from '../constants'
import { loadOrientedCanvas, cropToAspect, canvasToBlob, DEFAULT_TARGET_RATIO } from '../utils/imageCompress'
import { useAiSettings, setAiSetting } from '../utils/aiSettings'
import { useToast } from '../ToastContext'
import RatingPicker from './RatingPicker'
import DrinkLookup from './DrinkLookup'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import ToggleButton from '@mui/material/ToggleButton'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Divider from '@mui/material/Divider'
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import IconButton from '@mui/material/IconButton'
import CircularProgress from '@mui/material/CircularProgress'
import LinearProgress from '@mui/material/LinearProgress'
import Chip from '@mui/material/Chip'
import Fade from '@mui/material/Fade'
import CameraAltRounded from '@mui/icons-material/CameraAltRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'

const today = () => new Date().toISOString().split('T')[0]

const SECTION = { mb: 0.5, fontWeight: 600, color: 'text.secondary', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em' }

const STAGE_LABEL = {
  'quality':       'Checking image quality…',
  'loading-model': 'Loading AI models (first run downloads ~50 MB)…',
  'detecting':     'Detecting drink…',
  'reading-text':  'Reading label text…',
  'done':          'Done',
}

export default function DrinkForm() {
  const { id }         = useParams()
  const navigate       = useNavigate()
  const toast          = useToast()
  const [sp]           = useSearchParams()
  const isEdit         = Boolean(id)
  const fileRef        = useRef()

  const empty = { name: '', brewery: '', style: '', abv: '', country: '', category: 'Beer',
    rating: null, comment: '', location: '', date_tried: sp.get('date') || today(), would_buy_again: false, container: '' }

  const ai                      = useAiSettings()
  const [form, setForm]         = useState(empty)
  const [photoFile, setPhoto]   = useState(null)
  const [photoPreview, setPrev] = useState(null)
  const [photoUrl, setPhotoUrl] = useState(null)       // external image to import on save
  const [removePhoto, setRm]    = useState(false)
  const [error, setError]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [stage, setStage]       = useState(null)      // current detection stage or null
  const [detection, setDetection] = useState(null)    // raw detection results
  const [autofilled, setAutofilled] = useState([])    // labels of fields we filled
  const [dupes, setDupes]       = useState([])         // possible duplicates by name

  const isDirty = Boolean(form.name || form.brewery || form.rating || photoFile)

  // Warn before leaving with unsaved changes
  useEffect(() => {
    if (!isDirty) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  useEffect(() => {
    if (!isEdit) return
    fetch(`/api/drinks/${id}`).then(r => r.json())
      .then(d => setForm({ ...d, abv: d.abv ?? '', would_buy_again: Boolean(d.would_buy_again) }))
  }, [id, isEdit])

  // While adding, warn if a drink with a similar name already exists
  useEffect(() => {
    if (isEdit) return
    const name = form.name.trim()
    if (name.length < 3) { setDupes([]); return }
    const t = setTimeout(() => {
      fetch(`/api/drinks?search=${encodeURIComponent(name)}`)
        .then(r => (r.ok ? r.json() : []))
        .then(list => {
          const lower = name.toLowerCase()
          const matches = (Array.isArray(list) ? list : [])
            .filter(d => d.name?.toLowerCase().includes(lower))
            .slice(0, 3)
          setDupes(matches)
        })
        .catch(() => setDupes([]))
    }, 400)
    return () => clearTimeout(t)
  }, [form.name, isEdit])

  const set = (field, val) =>
    setForm(f => ({ ...f, [field]: val, ...(field === 'category' ? { style: '' } : {}) }))

  // Apply a chosen external look-up result. This is an explicit action, so we
  // overwrite fields that the result provides (keeping anything it doesn't).
  const handlePick = (r) => {
    setForm(prev => {
      const next = { ...prev }
      if (r.name)    next.name = r.name
      if (r.brewery) next.brewery = r.brewery
      if (r.country) next.country = r.country
      if (r.abv != null && r.abv !== '') next.abv = String(r.abv)
      if (r.category && CATEGORIES.includes(r.category)) {
        if (r.category !== next.category) next.style = ''
        next.category = r.category
      }
      // Only set style if it matches the category's known list, else stash in notes
      if (r.style) {
        const allowed = STYLES_BY_CATEGORY[next.category] || []
        if (allowed.includes(r.style)) next.style = r.style
      }
      return next
    })
    // Offer the result's image as the photo (imported server-side on save)
    if (r.thumbnail && !photoFile) {
      setPhotoUrl(r.thumbnail)
      setPrev(r.thumbnail)
      setRm(false)
    }
  }

  // Fill only empty fields so we never clobber what the user typed.
  const applyAutofill = (det) => {
    const filled = []
    setForm(prev => {
      const next = { ...prev }
      const add = (field, val, label) => {
        if (val && !String(next[field] ?? '').trim()) { next[field] = val; filled.push(label) }
      }
      // Category: only set from detection if user is still on the default 'Beer'
      if (det.drink?.category && next.category === 'Beer' && det.drink.category !== 'Beer') {
        next.category = det.drink.category
        next.style = ''
        filled.push('Category')
      }
      add('name',    det.ocr?.name,    'Name')
      add('brewery', det.ocr?.brand,   'Brewery')
      add('abv',     det.ocr?.abv,     'ABV')
      add('country', det.ocr?.country, 'Country')
      return next
    })
    setAutofilled(filled)
  }

  const showPreview = (blob) => {
    const reader = new FileReader()
    reader.onload = ev => setPrev(ev.target.result)
    reader.readAsDataURL(blob)
  }

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setError(''); setDetection(null); setAutofilled([])
    try {
      // 1. Orient + resize (no crop yet — we may crop around a detected drink)
      const base = await loadOrientedCanvas(file, { autoEnhance: ai.autoEnhance })

      // 2. Immediate centre-cropped preview so the user sees something right away
      const centre = ai.autoEnhance ? cropToAspect(base, { targetRatio: DEFAULT_TARGET_RATIO }) : base
      let blob = await canvasToBlob(centre)
      setPhoto(blob); setPhotoUrl(null); setRm(false); showPreview(blob)

      // 3. Detection (drink localisation, quality, OCR) if enabled
      if (ai.smartDetection || ai.qualityWarnings) {
        setStage('quality')
        try {
          const { runFullDetection } = await import('../utils/imageDetection')
          const results = await runFullDetection(base, {
            smart: ai.smartDetection,
            quality: ai.qualityWarnings,
            onProgress: (s) => setStage(s),
          })
          setDetection(results)

          // 4. Re-crop around the detected drink (when auto-enhance is on)
          if (ai.autoEnhance && results.drink?.bbox) {
            const [x, y, bw, bh] = results.drink.bbox
            const focus = { cx: (x + bw / 2) / base.width, cy: (y + bh / 2) / base.height }
            const focused = cropToAspect(base, { targetRatio: DEFAULT_TARGET_RATIO, focus })
            blob = await canvasToBlob(focused)
            setPhoto(blob); showPreview(blob)
          }

          if (ai.smartDetection) applyAutofill(results)
        } catch {
          setError('Image analysis failed')
        } finally {
          setStage(null)
        }
      }
    } catch (ex) {
      setError('Could not process image'); setStage(null)
    }
  }

  const clearPhoto = () => {
    setPhoto(null); setPrev(null); setPhotoUrl(null)
    if (form.photo_path) setRm(true)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.rating) { setError('Please select a rating'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(isEdit ? `/api/drinks/${id}` : '/api/drinks', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(form),
      })
      if (!res.ok) { setError((await res.json()).error || 'Save failed'); return }
      const saved = await res.json()
      if (photoFile) {
        const fd = new FormData(); fd.append('photo', photoFile, 'photo.jpg')
        await fetch(`/api/drinks/${saved.id}/photo`, { method: 'POST', body: fd })
      } else if (photoUrl) {
        // Import the chosen look-up image server-side (handles CORS + storage)
        await fetch(`/api/drinks/${saved.id}/photo-url`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: photoUrl }),
        })
      } else if (removePhoto && isEdit) {
        await fetch(`/api/drinks/${id}/photo`, { method: 'DELETE' })
      }
      toast?.(isEdit ? 'Changes saved!' : `"${saved.name}" logged!`)
      navigate(`/drink/${saved.id}`)
    } finally { setSaving(false) }
  }

  const styles = STYLES_BY_CATEGORY[form.category] || []
  const showExisting = form.photo_path && !removePhoto && !photoPreview

  return (
    <Fade in timeout={300}>
    <Box sx={{ maxWidth: 640, mx: 'auto' }}>
      <Button startIcon={<ArrowBackRounded />} component={Link} to={isEdit ? `/drink/${id}` : '/'}
        color="inherit" sx={{ mb: 2, color: 'text.secondary' }}>Back</Button>

      <Typography variant="h5" fontWeight={700} mb={3}>{isEdit ? 'Edit Entry' : 'Log a Drink'}</Typography>

      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <form onSubmit={handleSubmit}>
          <Stack spacing={3}>
            {/* Category */}
            <Box>
              <Typography sx={SECTION} mb={1}>Category</Typography>
              <ToggleButtonGroup value={form.category} exclusive size="small"
                onChange={(_, v) => v && set('category', v)}
                sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                {CATEGORIES.map(c => <ToggleButton key={c} value={c}>{c}</ToggleButton>)}
              </ToggleButtonGroup>
            </Box>

            <Divider />

            {/* Online look-up */}
            <DrinkLookup category={form.category} onPick={handlePick} />

            {/* Core fields */}
            <Box>
              <TextField label="Name" required fullWidth value={form.name} onChange={e => set('name', e.target.value)}
                placeholder={form.category === 'Wine' ? 'e.g. Château Margaux 2018' : 'e.g. Guinness Draught'} />
              {dupes.length > 0 && (
                <Alert severity="info" sx={{ mt: 1, py: 0.25 }}>
                  <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>
                    Already logged something similar:
                  </Typography>
                  <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                    {dupes.map(d => (
                      <Chip key={d.id} component={Link} to={`/drink/${d.id}`} clickable size="small"
                        label={`${d.name} · ${d.rating}/10`} variant="outlined" />
                    ))}
                  </Stack>
                </Alert>
              )}
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField fullWidth label={form.category === 'Wine' ? 'Producer / Château' : 'Brewery / Producer'}
                value={form.brewery} onChange={e => set('brewery', e.target.value)} />
              <TextField select fullWidth label="Style / Type" value={form.style} onChange={e => set('style', e.target.value)}>
                <MenuItem value="">— Select —</MenuItem>
                {styles.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField fullWidth label="ABV (%)" type="number" inputProps={{ min: 0, max: 70, step: 0.1 }}
                value={form.abv} onChange={e => set('abv', e.target.value)} />
              <TextField fullWidth label="Country / Region"
                value={form.country} onChange={e => set('country', e.target.value)} />
            </Stack>

            {/* Container / serving type — only for relevant categories */}
            {CONTAINER_CATEGORIES.includes(form.category) && (
              <Box>
                <Typography sx={SECTION} mb={1}>Served as</Typography>
                <ToggleButtonGroup value={form.container || ''} exclusive size="small"
                  onChange={(_, v) => set('container', v || '')}
                  sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                  {CONTAINERS.map(c => <ToggleButton key={c} value={c}>{c}</ToggleButton>)}
                </ToggleButtonGroup>
              </Box>
            )}

            <Divider />

            {/* Rating */}
            <Box>
              <Typography sx={SECTION} mb={1.5}>Rating (1–10) *</Typography>
              <RatingPicker value={form.rating} onChange={v => set('rating', v)} />
            </Box>

            <Divider />

            {/* Date + location */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField fullWidth label="Date Tried" type="date" value={form.date_tried}
                onChange={e => set('date_tried', e.target.value)} InputLabelProps={{ shrink: true }} />
              <TextField fullWidth label="Location / Occasion"
                value={form.location} onChange={e => set('location', e.target.value)}
                placeholder="e.g. The Pub, Oslo" />
            </Stack>

            <TextField multiline rows={3} fullWidth label="Tasting Notes"
              value={form.comment} onChange={e => set('comment', e.target.value)}
              placeholder="Aroma, taste, finish… Norwegian chars work fine: æ ø å" />

            <FormControlLabel
              control={<Switch checked={form.would_buy_again} onChange={e => set('would_buy_again', e.target.checked)} color="primary" />}
              label="Would have again" />

            <Divider />

            {/* Photo */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography sx={SECTION}>Photo</Typography>
                <FormControlLabel
                  control={<Switch checked={ai.smartDetection} onChange={e => setAiSetting('smartDetection', e.target.checked)} size="small" color="primary" />}
                  label={<Typography variant="caption" sx={{ fontSize: '0.7rem' }}>Automatic drink detection</Typography>}
                  sx={{ ml: 0 }}
                />
              </Box>

              {/* Staged "working" indicator */}
              {stage && stage !== 'done' && (
                <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, bgcolor: 'rgba(245,158,11,0.08)', border: '1px solid', borderColor: 'rgba(245,158,11,0.25)' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <CircularProgress size={16} color="primary" />
                    <Typography variant="caption" fontWeight={600} color="primary.main">
                      {STAGE_LABEL[stage] || 'Analyzing image…'}
                    </Typography>
                  </Box>
                  <LinearProgress color="primary" sx={{ borderRadius: 2, height: 4 }} />
                </Box>
              )}

              {/* Detection results + autofill summary */}
              {detection && !stage && (
                <Stack spacing={1} sx={{ mb: 2, p: 1.5, bgcolor: 'rgba(16,185,129,0.08)', border: '1px solid', borderColor: 'rgba(16,185,129,0.25)', borderRadius: 2 }}>
                  {detection.isBlurry && <Alert severity="warning" sx={{ py: 0.25 }}>⚠ Image may be blurry</Alert>}
                  {detection.isDark && <Alert severity="warning" sx={{ py: 0.25 }}>⚠ Image is very dark</Alert>}

                  {autofilled.length > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
                      <AutoAwesomeRounded fontSize="small" sx={{ color: 'success.main' }} />
                      <Typography variant="caption" color="success.main" fontWeight={600}>
                        Auto-filled:
                      </Typography>
                      {autofilled.map(f => <Chip key={f} label={f} size="small" color="success" variant="outlined" />)}
                    </Box>
                  )}

                  {ai.smartDetection && detection.drink && (
                    <Chip icon={<AutoAwesomeRounded />} label={`Detected: ${detection.drink.class}`}
                      size="small" color="success" variant="outlined" sx={{ alignSelf: 'flex-start' }} />
                  )}

                  {ai.smartDetection && !detection.drink && autofilled.length === 0 &&
                   !detection.isBlurry && !detection.isDark && (
                    <Typography variant="caption" color="text.secondary">
                      No drink details recognised — fill the fields manually.
                    </Typography>
                  )}
                </Stack>
              )}

              {showExisting || photoPreview ? (
                <Box sx={{ position: 'relative', display: 'inline-block' }}>
                  <Box component="img" src={photoPreview || form.photo_path} alt="preview"
                    sx={{ height: 160, borderRadius: 2, objectFit: 'cover', display: 'block', border: '1px solid', borderColor: 'divider' }} />
                  <IconButton onClick={clearPhoto} size="small"
                    sx={{ position: 'absolute', top: 6, right: 6, bgcolor: 'rgba(0,0,0,0.7)', '&:hover': { bgcolor: 'rgba(0,0,0,0.9)' } }}>
                    <CloseRounded fontSize="small" />
                  </IconButton>
                  {photoFile && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      Compressed to {(photoFile.size / 1024).toFixed(0)} KB
                    </Typography>
                  )}
                </Box>
              ) : (
                <Button component="label" variant="outlined" startIcon={<CameraAltRounded />} sx={{ borderStyle: 'dashed' }}>
                  Take / choose photo
                  <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={handlePhoto} />
                </Button>
              )}
            </Box>

            {error && <Alert severity="error" variant="outlined">{error}</Alert>}

            <Stack direction="row" spacing={1.5} pt={1}>
              <Button type="submit" variant="contained" size="large" disabled={saving} sx={{ px: 4 }}>
                {saving ? <CircularProgress size={22} color="inherit" /> : isEdit ? 'Save Changes' : 'Log Drink'}
              </Button>
              <Button variant="outlined" color="inherit" onClick={() => navigate(-1)} sx={{ color: 'text.secondary' }}>
                Cancel
              </Button>
            </Stack>
          </Stack>
        </form>
      </Paper>
    </Box>
    </Fade>
  )
}
