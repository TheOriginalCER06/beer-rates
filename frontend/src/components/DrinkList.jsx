import { useState, useEffect, useRef, useMemo } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { CATEGORIES, STYLES_BY_CATEGORY, CATEGORY_ICON, CATEGORY_COLOR, ratingColor } from '../constants'
import DrinkCard from './DrinkCard'
import RatingBadge from './RatingBadge'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Grid from '@mui/material/Grid'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import ToggleButton from '@mui/material/ToggleButton'
import Fab from '@mui/material/Fab'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Pagination from '@mui/material/Pagination'
import Fade from '@mui/material/Fade'
import ButtonBase from '@mui/material/ButtonBase'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme, alpha } from '@mui/material/styles'
import AddRounded from '@mui/icons-material/AddRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import FileDownloadRounded from '@mui/icons-material/FileDownloadRounded'
import PersonRounded from '@mui/icons-material/PersonRounded'
import KeyboardArrowUpRounded from '@mui/icons-material/KeyboardArrowUpRounded'
import ViewListRounded from '@mui/icons-material/ViewListRounded'
import GridViewRounded from '@mui/icons-material/GridViewRounded'
import CasinoRounded from '@mui/icons-material/CasinoRounded'
import StarRounded from '@mui/icons-material/StarRounded'

const PAGE_SIZE = 24
const GRID_PAGE_SIZE = 18

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

function GridCardSkeleton() {
  return (
    <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
      <Skeleton variant="rectangular" height={140} />
      <Box sx={{ p: 1.5 }}>
        <Skeleton variant="text" width="70%" height={18} />
        <Skeleton variant="text" width="50%" height={14} />
      </Box>
    </Paper>
  )
}

/** A compact grid card for the grid/gallery view */
function GridCard({ drink }) {
  const cat = CATEGORY_COLOR[drink.category] || CATEGORY_COLOR.Other
  return (
    <Paper sx={{ borderRadius: 3, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ButtonBase component={Link} to={`/drink/${drink.id}`}
        sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', textAlign: 'left', height: '100%' }}>
        {drink.photo_path ? (
          <Box component="img" src={drink.photo_path} alt="" loading="lazy"
            sx={{ width: '100%', height: 150, objectFit: 'cover' }} />
        ) : (
          <Box sx={{ width: '100%', height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: cat.bg, fontSize: 40 }}>
            {CATEGORY_ICON[drink.category] || '🍶'}
          </Box>
        )}
        <Box sx={{ p: 1.5, flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 0.5 }}>
            <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3, flex: 1,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {drink.name}
            </Typography>
            <RatingBadge rating={drink.rating} size="sm" />
          </Box>
          {drink.brewery && (
            <Typography variant="caption" color="text.secondary" noWrap>{drink.brewery}</Typography>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 'auto' }}>
            <Chip label={drink.category} size="small"
              sx={{ height: 18, fontSize: '0.6rem', bgcolor: cat.bg, color: cat.color,
                border: `1px solid ${cat.border}`, '& .MuiChip-label': { px: 0.5 } }} />
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
              {new Date(drink.date_tried + 'T00:00:00').toLocaleDateString()}
            </Typography>
          </Box>
        </Box>
      </ButtonBase>
    </Paper>
  )
}

/** Read/write filters to/from URL search params so bookmarks & back-button work. */
function useUrlFilters() {
  const [sp, setSp] = useSearchParams()

  const filters = useMemo(() => ({
    search:   sp.get('q')    || '',
    category: sp.get('cat')  || '',
    style:    sp.get('style')|| '',
    sort:     sp.get('sort') || 'created_at',
    order:    sp.get('order')|| 'desc',
    mine:     sp.get('mine') === '1',
    minRating: parseInt(sp.get('minr'), 10) || 0,
    page:     Math.max(1, parseInt(sp.get('page'), 10) || 1),
    view:     sp.get('view') || 'list',
  }), [sp])

  const setFilter = (key, value) => {
    setSp(prev => {
      const next = new URLSearchParams(prev)
      const paramMap = { search: 'q', category: 'cat', style: 'style', sort: 'sort', order: 'order', mine: 'mine', minRating: 'minr', page: 'page', view: 'view' }
      const param = paramMap[key] || key
      const defaults = { q: '', cat: '', style: '', sort: 'created_at', order: 'desc', mine: '', minr: '0', page: '1', view: 'list' }

      let strVal = key === 'mine' ? (value ? '1' : '') : String(value ?? '')
      if (strVal === (defaults[param] ?? '') || strVal === '0') next.delete(param)
      else next.set(param, strVal)

      // Reset page when any filter changes (except page itself and view)
      if (key !== 'page' && key !== 'view') next.delete('page')

      return next
    }, { replace: true })
  }

  const clearAll = () => setSp({}, { replace: true })

  return { ...filters, setFilter, clearAll }
}

const RATING_FILTERS = [0, 6, 7, 8, 9]

export default function DrinkList() {
  const { user }                = useAuth()
  const navigate                = useNavigate()
  const canCreateDrinks         = Boolean(user && user.role !== 'viewer')
  const theme                   = useTheme()
  const mobile                  = useMediaQuery(theme.breakpoints.down('sm'))
  const topRef                  = useRef(null)
  const f                       = useUrlFilters()
  const [drinks, setDrinks]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [searchInput, setSearchInput] = useState(f.search)
  const [showScrollTop, setShowScrollTop] = useState(false)

  useEffect(() => { if (!user && f.mine) f.setFilter('mine', false) }, [user])
  useEffect(() => { setSearchInput(f.search) }, [f.search])

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput.trim() !== f.search) f.setFilter('search', searchInput.trim())
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    if (f.style && f.category) {
      const valid = STYLES_BY_CATEGORY[f.category] || []
      if (!valid.includes(f.style)) f.setFilter('style', '')
    }
  }, [f.category])

  useEffect(() => {
    setLoading(true)
    const p = new URLSearchParams({ sort: f.sort, order: f.order })
    if (f.search)   p.set('search',   f.search)
    if (f.category) p.set('category', f.category)
    if (f.style)    p.set('style',    f.style)
    if (f.mine)     p.set('mine',     '1')
    if (f.minRating) p.set('minRating', String(f.minRating))
    fetch(`/api/drinks?${p}`)
      .then(async (r) => {
        if (!r.ok) return []
        const data = await r.json()
        return Array.isArray(data) ? data : []
      })
      .then(setDrinks)
      .catch(() => setDrinks([]))
      .finally(() => setLoading(false))
  }, [f.search, f.category, f.style, f.sort, f.order, f.mine, f.minRating])

  useEffect(() => {
    const handler = () => setShowScrollTop(window.scrollY > 400)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  const scrollToTop = () => topRef.current?.scrollIntoView({ behavior: 'smooth' })

  const handlePageChange = (_e, newPage) => {
    f.setFilter('page', newPage)
    scrollToTop()
  }

  const randomDrink = () => {
    if (drinks.length === 0) return
    const pick = drinks[Math.floor(Math.random() * drinks.length)]
    navigate(`/drink/${pick.id}`)
  }

  const isGrid = f.view === 'grid'
  const pageSize = isGrid ? GRID_PAGE_SIZE : PAGE_SIZE
  const styles = f.category ? (STYLES_BY_CATEGORY[f.category] || []) : []
  const showCreator = new Set(drinks.map(d => d.created_by_name).filter(Boolean)).size > 1

  const totalPages = Math.ceil(drinks.length / pageSize)
  const page = Math.min(f.page, totalPages || 1)
  const paginated = drinks.slice((page - 1) * pageSize, page * pageSize)
  const hasActiveFilters = Boolean(f.search || f.category || f.style || f.mine || f.minRating)

  return (
    <Box>
      <div ref={topRef} />

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>All Drinks</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {drinks.length > 1 && (
            <Tooltip title="Random drink">
              <IconButton size="small" onClick={randomDrink} aria-label="Random drink"
                sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}>
                <CasinoRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {drinks.length > 0 && (
            <Tooltip title="Export CSV">
              <IconButton component="a" href="/api/drinks/export.csv" aria-label="Export CSV" size="small"
                sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}>
                <FileDownloadRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={isGrid ? 'List view' : 'Grid view'}>
            <IconButton size="small" onClick={() => f.setFilter('view', isGrid ? 'list' : 'grid')}
              aria-label="Toggle view" sx={{ color: 'text.secondary' }}>
              {isGrid ? <ViewListRounded fontSize="small" /> : <GridViewRounded fontSize="small" />}
            </IconButton>
          </Tooltip>
          {canCreateDrinks && !mobile && (
            <Tooltip title="Ctrl+N">
              <Button component={Link} to="/add" variant="contained" startIcon={<AddRounded />}
                sx={{ borderRadius: 3, ml: 0.5 }}>
                Add Drink
              </Button>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Category tabs + quick filters */}
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ overflowX: 'auto', pb: 0.5, flex: 1 }}>
          <ToggleButtonGroup value={f.category} exclusive onChange={(_, v) => f.setFilter('category', v ?? '')} size="small">
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
              color={f.mine ? 'primary' : 'default'}
              variant={f.mine ? 'filled' : 'outlined'}
              onClick={() => f.setFilter('mine', !f.mine)}
              sx={{ flexShrink: 0, cursor: 'pointer' }}
            />
          </Tooltip>
        )}
      </Box>

      {/* Rating quick-filter chips */}
      <Box sx={{ display: 'flex', gap: 0.75, mb: 2, flexWrap: 'wrap' }}>
        {RATING_FILTERS.map(min => {
          const active = f.minRating === min
          return (
            <Chip
              key={min}
              icon={min > 0 ? <StarRounded sx={{ fontSize: 14 }} /> : undefined}
              label={min === 0 ? 'Any rating' : `${min}+`}
              size="small"
              color={active ? 'primary' : 'default'}
              variant={active ? 'filled' : 'outlined'}
              onClick={() => f.setFilter('minRating', active ? 0 : min)}
              sx={{
                cursor: 'pointer', height: 26,
                ...(min > 0 && !active ? { borderColor: alpha(ratingColor(min), 0.3), color: ratingColor(min) } : {}),
              }}
            />
          )
        })}
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
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" sx={{ color: 'text.disabled' }} /></InputAdornment>,
              endAdornment: searchInput ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchInput('')} aria-label="Clear search">
                    <CloseRounded fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
          <TextField select label="Style" value={f.style} onChange={e => f.setFilter('style', e.target.value)}
            size="small" disabled={!f.category} sx={{ flex: 1.5 }}>
            <MenuItem value="">{f.category ? 'All styles' : 'Select category first'}</MenuItem>
            {styles.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField select label="Sort by" value={f.sort} onChange={e => f.setFilter('sort', e.target.value)} size="small" sx={{ flex: 1 }}>
            <MenuItem value="created_at">Date Added</MenuItem>
            <MenuItem value="date_tried">Date Tried</MenuItem>
            <MenuItem value="rating">Rating</MenuItem>
            <MenuItem value="name">Name A–Z</MenuItem>
            <MenuItem value="brewery">Brewery</MenuItem>
          </TextField>
          <TextField select label="Order" value={f.order} onChange={e => f.setFilter('order', e.target.value)} size="small" sx={{ flex: 1 }}>
            <MenuItem value="desc">Newest / Highest</MenuItem>
            <MenuItem value="asc">Oldest / Lowest</MenuItem>
          </TextField>
        </Stack>
      </Paper>

      {/* Results */}
      {loading ? (
        isGrid ? (
          <Grid container spacing={2}>
            {[1,2,3,4,5,6].map(i => <Grid item xs={6} sm={4} md={3} key={i}><GridCardSkeleton /></Grid>)}
          </Grid>
        ) : (
          <Stack spacing={1.5}>
            {[1, 2, 3, 4].map(i => <CardSkeleton key={i} />)}
          </Stack>
        )
      ) : drinks.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <Typography sx={{ fontSize: 48, opacity: 0.2 }}>
            {f.category ? (CATEGORY_ICON[f.category] || '🍶') : '🍺'}
          </Typography>
          <Typography color="text.secondary" mt={1} fontWeight={500}>
            {hasActiveFilters
              ? 'No drinks match your filters.'
              : 'No drinks logged yet.'}
          </Typography>
          {hasActiveFilters && (
            <Button variant="text" size="small" sx={{ mt: 1, color: 'text.secondary' }}
              onClick={f.clearAll}>
              Clear all filters
            </Button>
          )}
          {canCreateDrinks && !hasActiveFilters && (
            <Button component={Link} to="/add" variant="outlined" sx={{ mt: 2 }}>
              Log your first drink
            </Button>
          )}
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="caption" color="text.disabled">
              {drinks.length} drink{drinks.length !== 1 ? 's' : ''}
              {totalPages > 1 && ` · page ${page} of ${totalPages}`}
            </Typography>
            {hasActiveFilters && (
              <Chip label="Clear filters" size="small" variant="outlined"
                onClick={f.clearAll} onDelete={f.clearAll}
                sx={{ height: 22, fontSize: '0.68rem' }} />
            )}
          </Box>

          {isGrid ? (
            <Grid container spacing={2}>
              {paginated.map(d => (
                <Grid item xs={6} sm={4} md={3} key={d.id}>
                  <GridCard drink={d} />
                </Grid>
              ))}
            </Grid>
          ) : (
            <Stack spacing={1.5}>
              {paginated.map(d => <DrinkCard key={d.id} drink={d} showCreator={showCreator} />)}
            </Stack>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={handlePageChange}
                color="primary"
                size={mobile ? 'small' : 'medium'}
                sx={{
                  '& .MuiPaginationItem-root': {
                    color: 'text.secondary',
                    '&.Mui-selected': { fontWeight: 700 },
                  },
                }}
              />
            </Box>
          )}
        </>
      )}

      {/* Scroll-to-top */}
      <Fade in={showScrollTop}>
        <Fab size="small" onClick={scrollToTop} aria-label="Scroll to top"
          sx={{
            position: 'fixed', bottom: mobile ? 76 : 20, left: 20,
            bgcolor: 'surface.2', color: 'text.secondary',
            boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
            '&:hover': { bgcolor: 'surface.3', color: 'text.primary' },
          }}>
          <KeyboardArrowUpRounded />
        </Fab>
      </Fade>
    </Box>
  )
}
