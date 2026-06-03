import { useState, useEffect, useRef, useCallback } from 'react'
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
import Collapse from '@mui/material/Collapse'
import TravelExploreRounded from '@mui/icons-material/TravelExploreRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded'
import SearchOffRounded from '@mui/icons-material/SearchOffRounded'

const SOURCE_LABEL = {
  openbrewerydb: 'Brewery DB',
  thecocktaildb: 'CocktailDB',
  vivino:        'Vivino',
  openfoodfacts: 'Open Food Facts',
}

const SOURCE_COLOR = {
  openbrewerydb: '#f59e0b',
  thecocktaildb: '#ec4899',
  vivino:        '#a855f7',
  openfoodfacts: '#04cc5e',
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
  const [expanded, setExpanded] = useState(false)
  const [searched, setSearched] = useState(false)  // true after at least one search
  const [providers, setProviders] = useState(null) // null until loaded
  const seq = useRef(0)
  const wrapRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Learn which providers are enabled so we can hide the box when none apply
  useEffect(() => {
    fetch('/api/lookup/providers')
      .then(r => (r.ok ? r.json() : null))
      .then(setProviders)
      .catch(() => setProviders({ enabled: false }))
  }, [])

  const available = providers?.enabled &&
    (CATEGORY_PROVIDERS[category] || []).some(p => providers[p])

  // Active source names for the hint
  const activeSources = available
    ? (CATEGORY_PROVIDERS[category] || []).filter(p => providers[p]).map(p => SOURCE_LABEL[p])
    : []

  useEffect(() => {
    if (!available) { setRes([]); setOpen(false); return }
    const query = q.trim()
    if (query.length < 2) { setRes([]); setLoad(false); setSearched(false); return }
    setLoad(true)
    const mySeq = ++seq.current
    const t = setTimeout(() => {
      fetch(`/api/lookup?category=${encodeURIComponent(category)}&q=${encodeURIComponent(query)}`)
        .then(r => (r.ok ? r.json() : { results: [] }))
        .then(d => { if (mySeq === seq.current) { setRes(d.results || []); setOpen(true); setSearched(true) } })
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
    setSearched(false)
    setExpanded(false)
  }

  // Hidden entirely when look-ups are off or no provider serves this category
  if (!available) return null

  return (
    <Box>
      {/* Collapsible header bar */}
      <ButtonBase
        onClick={() => setExpanded(e => !e)}
        sx={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 1,
          p: 1.25, borderRadius: 2,
          bgcolor: 'rgba(245,158,11,0.06)',
          border: '1px solid',
          borderColor: expanded ? 'rgba(245,158,11,0.3)' : 'rgba(245,158,11,0.15)',
          transition: 'all 0.2s',
          '&:hover': { bgcolor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.3)' },
        }}
      >
        <TravelExploreRounded sx={{ color: 'primary.main', fontSize: 20 }} />
        <Box sx={{ flex: 1, textAlign: 'left' }}>
          <Typography variant="body2" fontWeight={600} color="primary.main">
            Search online databases
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {activeSources.join(', ')} — click to auto-fill fields
          </Typography>
        </Box>
        {expanded ? <ExpandLessRounded sx={{ color: 'text.secondary' }} /> : <ExpandMoreRounded sx={{ color: 'text.secondary' }} />}
      </ButtonBase>

      <Collapse in={expanded}>
        <Box ref={wrapRef} sx={{ position: 'relative', mt: 1.5 }}>
          <TextField
            fullWidth size="small" autoFocus={expanded}
            label="Search to auto-fill"
            placeholder={`Type a name to search ${activeSources.join(' & ')}…`}
            value={q}
            onChange={e => setQ(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><TravelExploreRounded fontSize="small" sx={{ color: 'text.disabled' }} /></InputAdornment>,
              endAdornment: (
                <InputAdornment position="end">
                  {loading
                    ? <CircularProgress size={16} />
                    : q && <IconButton size="small" onClick={() => { setQ(''); setRes([]); setOpen(false); setSearched(false) }}><CloseRounded fontSize="small" /></IconButton>}
                </InputAdornment>
              ),
            }}
          />

          {/* Results dropdown */}
          {open && results.length > 0 && (
            <Paper elevation={6} sx={{ position: 'absolute', zIndex: 20, left: 0, right: 0, mt: 0.5,
              maxHeight: 360, overflowY: 'auto', borderRadius: 2 }}>
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', px: 1.5, pt: 1, pb: 0.5, fontWeight: 600 }}>
                {results.length} result{results.length !== 1 ? 's' : ''} — tap to auto-fill
              </Typography>
              <Stack divider={<Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />}>
                {results.map((r, i) => {
                  const srcColor = SOURCE_COLOR[r.source] || '#888'
                  return (
                    <ButtonBase key={`${r.source}-${i}`} onClick={() => pick(r)}
                      sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.25, textAlign: 'left', justifyContent: 'flex-start',
                        '&:hover': { bgcolor: 'action.hover' } }}>
                      <Avatar variant="rounded" src={r.thumbnail || undefined}
                        sx={{ width: 44, height: 44, bgcolor: 'surface.2', fontSize: 18, flexShrink: 0 }}>
                        {!r.thumbnail && '🥂'}
                      </Avatar>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{r.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                          {[r.brewery, r.style, r.abv ? `${r.abv}%` : null, r.country, r.detail].filter(Boolean).join(' · ') || '—'}
                        </Typography>
                      </Box>
                      <Chip label={SOURCE_LABEL[r.source] || r.source} size="small"
                        sx={{ height: 20, fontSize: '0.62rem', flexShrink: 0,
                          bgcolor: `${srcColor}18`, color: srcColor, border: `1px solid ${srcColor}40`,
                          fontWeight: 600 }} />
                    </ButtonBase>
                  )
                })}
              </Stack>
            </Paper>
          )}

          {/* No results state */}
          {open && searched && !loading && results.length === 0 && q.trim().length >= 2 && (
            <Paper elevation={2} sx={{ position: 'absolute', zIndex: 20, left: 0, right: 0, mt: 0.5,
              p: 2.5, borderRadius: 2, textAlign: 'center' }}>
              <SearchOffRounded sx={{ fontSize: 32, color: 'text.disabled', mb: 0.5 }} />
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                No results found
              </Typography>
              <Typography variant="caption" color="text.disabled">
                Try a different spelling, or fill in the fields manually
              </Typography>
            </Paper>
          )}
        </Box>
      </Collapse>
    </Box>
  )
}
