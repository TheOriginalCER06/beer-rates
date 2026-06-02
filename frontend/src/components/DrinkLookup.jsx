import { useState, useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Avatar from '@mui/material/Avatar'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import ButtonBase from '@mui/material/ButtonBase'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import TravelExploreRounded from '@mui/icons-material/TravelExploreRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'

const SOURCE_LABEL = {
  openbrewerydb: 'Brewery DB',
  thecocktaildb: 'CocktailDB',
  vivino:        'Vivino',
  openfoodfacts: 'Open Food Facts',
}

// Which providers feed each category (used to hide the box when all are off)
const CATEGORY_PROVIDERS = {
  Beer:           ['openbrewerydb', 'openfoodfacts'],
  Wine:           ['vivino', 'openfoodfacts'],
  Cocktail:       ['thecocktaildb'],
  'Alcohol Free': ['thecocktaildb', 'openfoodfacts'],
  Other:          ['openfoodfacts'],
}

/**
 * Search external drink databases (proxied + cached by the backend) and let the
 * user pick a result to auto-fill the form. `onPick(result)` receives the
 * normalised result; the parent decides which fields to apply.
 */
export default function DrinkLookup({ category, onPick }) {
  const [q, setQ]           = useState('')
  const [results, setRes]   = useState([])
  const [loading, setLoad]  = useState(false)
  const [open, setOpen]     = useState(false)
  const [providers, setProviders] = useState(null) // null until loaded
  const seq = useRef(0)

  // Learn which providers are enabled so we can hide the box when none apply
  useEffect(() => {
    fetch('/api/lookup/providers')
      .then(r => (r.ok ? r.json() : null))
      .then(setProviders)
      .catch(() => setProviders({ enabled: false }))
  }, [])

  const available = providers?.enabled &&
    (CATEGORY_PROVIDERS[category] || []).some(p => providers[p])

  useEffect(() => {
    if (!available) { setRes([]); setOpen(false); return }
    const query = q.trim()
    if (query.length < 2) { setRes([]); setLoad(false); return }
    setLoad(true)
    const mySeq = ++seq.current
    const t = setTimeout(() => {
      fetch(`/api/lookup?category=${encodeURIComponent(category)}&q=${encodeURIComponent(query)}`)
        .then(r => (r.ok ? r.json() : { results: [] }))
        .then(d => { if (mySeq === seq.current) { setRes(d.results || []); setOpen(true) } })
        .catch(() => { if (mySeq === seq.current) setRes([]) })
        .finally(() => { if (mySeq === seq.current) setLoad(false) })
    }, 400)
    return () => clearTimeout(t)
  }, [q, category, available])

  const pick = (r) => {
    onPick(r)
    setOpen(false)
    setQ('')
    setRes([])
  }

  // Hidden entirely when look-ups are off or no provider serves this category
  if (!available) return null

  return (
    <Box sx={{ position: 'relative' }}>
      <TextField
        fullWidth size="small"
        label="Look up online"
        placeholder={`Search ${category} databases to auto-fill…`}
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        InputProps={{
          startAdornment: <InputAdornment position="start"><TravelExploreRounded fontSize="small" sx={{ color: 'text.disabled' }} /></InputAdornment>,
          endAdornment: (
            <InputAdornment position="end">
              {loading
                ? <CircularProgress size={16} />
                : q && <IconButton size="small" onClick={() => { setQ(''); setRes([]); setOpen(false) }}><CloseRounded fontSize="small" /></IconButton>}
            </InputAdornment>
          ),
        }}
      />

      {open && results.length > 0 && (
        <Paper elevation={6} sx={{ position: 'absolute', zIndex: 20, left: 0, right: 0, mt: 0.5,
          maxHeight: 320, overflowY: 'auto', borderRadius: 2 }}>
          <Stack divider={<Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />}>
            {results.map((r, i) => (
              <ButtonBase key={`${r.source}-${i}`} onClick={() => pick(r)}
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.25, textAlign: 'left', justifyContent: 'flex-start',
                  '&:hover': { bgcolor: 'action.hover' } }}>
                <Avatar variant="rounded" src={r.thumbnail || undefined}
                  sx={{ width: 40, height: 40, bgcolor: 'surface.2', fontSize: 18, flexShrink: 0 }}>
                  {!r.thumbnail && '🥂'}
                </Avatar>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>{r.name}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                    {[r.brewery, r.style, r.abv ? `${r.abv}%` : null, r.country, r.detail].filter(Boolean).join(' · ') || '—'}
                  </Typography>
                </Box>
                <Chip label={SOURCE_LABEL[r.source] || r.source} size="small"
                  sx={{ height: 18, fontSize: '0.6rem', flexShrink: 0 }} />
              </ButtonBase>
            ))}
          </Stack>
        </Paper>
      )}
    </Box>
  )
}
