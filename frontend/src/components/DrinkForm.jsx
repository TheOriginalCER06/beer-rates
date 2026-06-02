import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom'
import { CATEGORIES, STYLES_BY_CATEGORY } from '../constants'
import { compressImage } from '../utils/imageCompress'
import { runFullDetection } from '../utils/imageDetection'
import RatingPicker from './RatingPicker'
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
import Chip from '@mui/material/Chip'
import CameraAltRounded from '@mui/icons-material/CameraAltRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'

const today = () => new Date().toISOString().split('T')[0]

const SECTION = { mb: 0.5, fontWeight: 600, color: 'text.secondary', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em' }

export default function DrinkForm() {
  const { id }         = useParams()
  const navigate       = useNavigate()
  const [sp]           = useSearchParams()
  const isEdit         = Boolean(id)
  const fileRef        = useRef()

  const empty = { name: '', brewery: '', style: '', abv: '', country: '', category: 'Beer',
    rating: null, comment: '', location: '', date_tried: sp.get('date') || today(), would_buy_again: false }

  const [form, setForm]         = useState(empty)
  const [photoFile, setPhoto]   = useState(null)
  const [photoPreview, setPrev] = useState(null)
  const [removePhoto, setRm]    = useState(false)
  const [error, setError]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [detection, setDetection] = useState(null)
  const [smartCropEnabled, setSmartCrop] = useState(false)

  useEffect(() => {
    if (!isEdit) return
    fetch(`/api/drinks/${id}`).then(r => r.json())
      .then(d => setForm({ ...d, abv: d.abv ?? '', would_buy_again: Boolean(d.would_buy_again) }))
  }, [id, isEdit])

  const set = (field, val) =>
    setForm(f => ({ ...f, [field]: val, ...(field === 'category' ? { style: '' } : {}) }))

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    try {
      setDetecting(true); setDetection(null)
      const blob = await compressImage(file); setPhoto(blob); setRm(false)

      // Run detection if enabled
      if (smartCropEnabled) {
        const img = new Image()
        img.onload = async () => {
          const canvas = document.createElement('canvas')
          canvas.width = img.width
          canvas.height = img.height
          canvas.getContext('2d').drawImage(img, 0, 0)

          const detectionResults = await runFullDetection(canvas, true)
          setDetection(detectionResults)

          // Auto-fill detected fields
          if (detectionResults.drink?.class) {
            setForm(f => ({ ...f, style: detectionResults.drink.class }))
          }
          if (detectionResults.ocr?.brand) {
            setForm(f => ({ ...f, brewery: detectionResults.ocr.brand }))
          }
          if (detectionResults.ocr?.abv) {
            setForm(f => ({ ...f, abv: detectionResults.ocr.abv }))
          }
          setDetecting(false)
        }
        img.src = URL.createObjectURL(blob)
      } else {
        setDetecting(false)
      }

      const reader = new FileReader(); reader.onload = ev => setPrev(ev.target.result); reader.readAsDataURL(blob)
    } catch (ex) { setError('Could not process image'); setDetecting(false) }
  }

  const clearPhoto = () => {
    setPhoto(null); setPrev(null)
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
      } else if (removePhoto && isEdit) {
        await fetch(`/api/drinks/${id}/photo`, { method: 'DELETE' })
      }
      navigate(`/drink/${saved.id}`)
    } finally { setSaving(false) }
  }

  const styles = STYLES_BY_CATEGORY[form.category] || []
  const showExisting = form.photo_path && !removePhoto && !photoPreview

  return (
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

            {/* Core fields */}
            <TextField label="Name" required fullWidth value={form.name} onChange={e => set('name', e.target.value)}
              placeholder={form.category === 'Wine' ? 'e.g. Château Margaux 2018' : 'e.g. Guinness Draught'} />

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
                  control={<Switch checked={smartCropEnabled} onChange={e => setSmartCrop(e.target.checked)} size="small" />}
                  label={<Typography variant="caption" sx={{ fontSize: '0.7rem' }}>AI Detection</Typography>}
                  sx={{ ml: 0 }}
                />
              </Box>

              {detection && (
                <Stack spacing={1} sx={{ mb: 2, p: 1.5, bgcolor: 'rgba(16,185,129,0.1)', borderRadius: 2 }}>
                  {detection.isBlurry && <Alert severity="warning" sx={{ py: 0.5 }}>⚠ Image may be blurry</Alert>}
                  {detection.isDark && <Alert severity="warning" sx={{ py: 0.5 }}>⚠ Image is very dark</Alert>}
                  {detection.drink && (
                    <Box>
                      <Chip
                        icon={<AutoAwesomeRounded />}
                        label={`Detected: ${detection.drink.class}`}
                        size="small"
                        color="success"
                        variant="outlined"
                      />
                    </Box>
                  )}
                  {detection.ocr?.brand && (
                    <Chip label={`Brand: ${detection.ocr.brand}`} size="small" />
                  )}
                  {detection.ocr?.abv && (
                    <Chip label={`ABV: ${detection.ocr.abv}%`} size="small" />
                  )}
                </Stack>
              )}

              {detecting && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <CircularProgress size={20} />
                  <Typography variant="caption" color="text.secondary">Analyzing image...</Typography>
                </Box>
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
  )
}
