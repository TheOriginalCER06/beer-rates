import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { CATEGORIES, STYLES_BY_CATEGORY } from '../constants'
import DrinkCard from './DrinkCard'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import ToggleButton from '@mui/material/ToggleButton'
import Fab from '@mui/material/Fab'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import AddRounded from '@mui/icons-material/AddRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import FileDownloadRounded from '@mui/icons-material/FileDownloadRounded'
import PersonRounded from '@mui/icons-material/PersonRounded'

function CardSkeleton() {
  return (
    <Paper sx={{ display: 'flex', overflow: 'hidden', borderRadius: 3 }}>
      <Skeleton variant="rectangular" width={88} height={88} sx={{ flexShrink: 0, borderRadius: 0 }} />
      <Box sx={{ p: 1.5, flex: 1 }}>
        <Skeleton variant="text" width="60%" height={20} />
        <Skeleton variant="text" width="40%" height={16} sx={{ mt: 0.5 }} />
        <Skeleton variant="rounded" width={80} height={20} sx={{ mt: 1 }} />
      </Box>
    </Paper>
  )
}

export default function DrinkList() {
  const { user }                = useAuth()
  const canCreateDrinks         = Boolean(user && user.role !== 'viewer')
  const theme                   = useTheme()
  const mobile                  = useMediaQuery(theme.breakpoints.down('sm'))
  const [drinks, setDrinks]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [searchInput, setSearchInput] = useState('') // what the user types
  const [search, setSearch]     = useState('')        // debounced value used for fetching
  const [category, setCategory] = useState('')
  const [style, setStyle]       = useState('')
  const [sort, setSort]         = useState('created_at')
  const [order, setOrder]       = useState('desc')
  const [mine, setMine]         = useState(false)

  useEffect(() => { setStyle('') }, [category])
  // Drop the "Mine" filter if the user logs out
  useEffect(() => { if (!user) setMine(false) }, [user])

  // Debounce the search box so we don't fetch on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    setLoading(true)
    const p = new URLSearchParams({ sort, order })
    if (search)   p.set('search',   search)
    if (category) p.set('category', category)
    if (style)    p.set('style',    style)
    if (mine)     p.set('mine',     '1')
    fetch(`/api/drinks?${p}`)
      .then(async (r) => {
        if (!r.ok) return []
        const data = await r.json()
        return Array.isArray(data) ? data : []
      })
      .then(setDrinks)
      .catch(() => setDrinks([]))
      .finally(() => setLoading(false))
  }, [search, category, style, sort, order, mine])

  const styles = category ? (STYLES_BY_CATEGORY[category] || []) : []
  // Only surface the creator when more than one person has contributed
  const showCreator = new Set(drinks.map(d => d.created_by_name).filter(Boolean)).size > 1

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>All Drinks</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {drinks.length > 0 && (
            <Tooltip title="Export all drinks as CSV">
              <IconButton component="a" href="/api/drinks/export.csv"
                sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}>
                <FileDownloadRounded />
              </IconButton>
            </Tooltip>
          )}
          {canCreateDrinks && !mobile && (
            <Button component={Link} to="/add" variant="contained" startIcon={<AddRounded />} sx={{ borderRadius: 3 }}>
              Add Drink
            </Button>
          )}
        </Box>
      </Box>

      {/* Category tabs + Mine filter */}
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ overflowX: 'auto', pb: 0.5, flex: 1 }}>
          <ToggleButtonGroup value={category} exclusive onChange={(_, v) => setCategory(v ?? '')} size="small">
            <ToggleButton value="">All</ToggleButton>
            {CATEGORIES.map(c => (
              <ToggleButton key={c} value={c}>{c}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        {user && (
          <Tooltip title="Show only drinks I added">
            <Chip
              icon={<PersonRounded sx={{ fontSize: 16 }} />}
              label="Mine"
              size="small"
              color={mine ? 'primary' : 'default'}
              variant={mine ? 'filled' : 'outlined'}
              onClick={() => setMine(m => !m)}
              sx={{ flexShrink: 0, cursor: 'pointer' }}
            />
          </Tooltip>
        )}
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField
            placeholder="Search name, brewery, notes…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            size="small"
            sx={{ flex: 2 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" sx={{ color: 'text.disabled' }} /></InputAdornment> }}
          />
          <TextField select label="Style" value={style} onChange={e => setStyle(e.target.value)}
            size="small" disabled={!category} sx={{ flex: 1.5 }}>
            <MenuItem value="">{category ? 'All styles' : 'Select category first'}</MenuItem>
            {styles.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField select label="Sort by" value={sort} onChange={e => setSort(e.target.value)} size="small" sx={{ flex: 1 }}>
            <MenuItem value="created_at">Date Added</MenuItem>
            <MenuItem value="date_tried">Date Tried</MenuItem>
            <MenuItem value="rating">Rating</MenuItem>
            <MenuItem value="name">Name A–Z</MenuItem>
          </TextField>
          <TextField select label="Order" value={order} onChange={e => setOrder(e.target.value)} size="small" sx={{ flex: 1 }}>
            <MenuItem value="desc">Newest / Highest</MenuItem>
            <MenuItem value="asc">Oldest / Lowest</MenuItem>
          </TextField>
        </Stack>
      </Paper>

      {/* Results */}
      {loading ? (
        <Stack spacing={1.5}>
          {[1, 2, 3].map(i => <CardSkeleton key={i} />)}
        </Stack>
      ) : drinks.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <Typography sx={{ fontSize: 48, opacity: 0.2 }}>🍺</Typography>
          <Typography color="text.secondary" mt={1}>No drinks found.</Typography>
          {canCreateDrinks && (
            <Button component={Link} to="/add" variant="outlined" sx={{ mt: 2 }}>
              Log your first drink
            </Button>
          )}
        </Box>
      ) : (
        <>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1.5 }}>
            {drinks.length} drink{drinks.length !== 1 ? 's' : ''}
          </Typography>
          <Stack spacing={1.5}>
            {drinks.map(d => <DrinkCard key={d.id} drink={d} showCreator={showCreator} />)}
          </Stack>
        </>
      )}

      {/* Mobile FAB */}
      {canCreateDrinks && mobile && (
        <Fab component={Link} to="/add" sx={{ position: 'fixed', bottom: 20, right: 20 }}>
          <AddRounded />
        </Fab>
      )}
    </Box>
  )
}
