import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { CATEGORY_ICON, CATEGORY_DOT_COLOR } from '../constants'
import RatingBadge from './RatingBadge'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import ButtonBase from '@mui/material/ButtonBase'
import Fade from '@mui/material/Fade'
import { alpha, useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import AddRounded from '@mui/icons-material/AddRounded'

const MONTHS  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW_HDR = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

export default function CalendarView() {
  const now   = new Date()
  const { user } = useAuth()
  const canCreateDrinks = Boolean(user && user.role !== 'viewer')
  const theme    = useTheme()
  const mobile   = useMediaQuery(theme.breakpoints.down('sm'))
  const gridRef  = useRef(null)
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [cal, setCal]     = useState({})
  const [sel, setSel]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true); setSel(null)
    fetch(`/api/drinks/calendar?year=${year}&month=${month}`)
      .then(r => r.json()).then(setCal).finally(() => setLoading(false))
  }, [year, month])

  const prevMonth = useCallback(() => {
    if (month === 1) { setYear(y => y-1); setMonth(12) } else setMonth(m => m-1)
  }, [month])
  const nextMonth = useCallback(() => {
    if (month === 12) { setYear(y => y+1); setMonth(1) } else setMonth(m => m+1)
  }, [month])

  // Keyboard navigation (left/right arrows)
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowLeft')  prevMonth()
      if (e.key === 'ArrowRight') nextMonth()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [prevMonth, nextMonth])

  // Swipe navigation for mobile
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    let startX = 0, startY = 0
    const onStart = (e) => { startX = e.touches[0].clientX; startY = e.touches[0].clientY }
    const onEnd = (e) => {
      const dx = e.changedTouches[0].clientX - startX
      const dy = e.changedTouches[0].clientY - startY
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return // not a horizontal swipe
      if (dx > 0) prevMonth(); else nextMonth()
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchend', onEnd) }
  }, [prevMonth, nextMonth])

  const firstDow = (new Date(year, month-1, 1).getDay() + 6) % 7
  const daysIn   = new Date(year, month, 0).getDate()
  const cells    = [...Array(firstDow).fill(null), ...Array.from({length:daysIn},(_,i)=>i+1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const pad    = n => String(n).padStart(2,'0')
  const toKey  = d => `${year}-${pad(month)}-${pad(d)}`
  const isToday = d => d===now.getDate() && month===now.getMonth()+1 && year===now.getFullYear()

  const monthTotal = Object.values(cal).reduce((a,b)=>a+b.length,0)
  // Best day this month (most drinks or highest-rated)
  const bestDay = Object.entries(cal).reduce((best, [date, list]) => {
    if (list.length > (best?.count || 0)) return { date, count: list.length }
    return best
  }, null)

  return (
    <Box>
      <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', mb:3 }}>
        <Typography variant="h5" fontWeight={700}>Calendar</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          {monthTotal > 0 && (
            <Chip label={`${monthTotal} drink${monthTotal!==1?'s':''}`} size="small" variant="outlined"
              sx={{ height: 22, fontSize: '0.7rem', color: 'text.secondary' }} />
          )}
        </Stack>
      </Box>

      <Paper sx={{ borderRadius: 3, overflow:'hidden' }}>
        {/* Month nav */}
        <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', px:2, py:1.5, borderBottom:'1px solid', borderColor:'divider' }}>
          <IconButton size="small" onClick={prevMonth}><ChevronLeftRounded /></IconButton>
          <Box sx={{ display:'flex', alignItems:'center', gap:1.5 }}>
            <Typography fontWeight={700}>{MONTHS[month-1]} {year}</Typography>
            {(year!==now.getFullYear()||month!==now.getMonth()+1) && (
              <Chip label="Today" size="small" onClick={()=>{setYear(now.getFullYear());setMonth(now.getMonth()+1)}}
                sx={{ height:22, cursor:'pointer', fontSize:'0.7rem' }} />
            )}
          </Box>
          <IconButton size="small" onClick={nextMonth}><ChevronRightRounded /></IconButton>
        </Box>

        {/* DoW headers */}
        <Box sx={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid', borderColor:'divider' }}>
          {DOW_HDR.map((d, i) => (
            <Typography key={d} variant="caption" align="center" sx={{
              py:1, color: i >= 5 ? 'text.disabled' : 'text.secondary',
              fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em',
              fontSize: mobile ? '0.6rem' : '0.75rem',
            }}>
              {mobile ? d[0] : d}
            </Typography>
          ))}
        </Box>

        {/* Grid */}
        {loading ? (
          <Box sx={{ py:8, textAlign:'center' }}><Typography color="text.disabled">Loading…</Typography></Box>
        ) : (
          <Box ref={gridRef} sx={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', userSelect: 'none' }}>
            {cells.map((day,i) => {
              if (!day) return <Box key={`e-${i}`} sx={{ minHeight: mobile ? 48 : 64, borderRight:'1px solid', borderBottom:'1px solid', borderColor:'divider', bgcolor: 'rgba(0,0,0,0.15)' }} />
              const key    = toKey(day)
              const drinks = cal[key]||[]
              const today  = isToday(day)
              const active = sel===key
              const weekend = (firstDow + day - 1) % 7 >= 5
              return (
                <ButtonBase key={key} onClick={()=>setSel(active?null:key)}
                  sx={{ minHeight: mobile ? 48 : 64, flexDirection:'column', alignItems:'flex-start', p: mobile ? 0.5 : 1,
                    borderRight:'1px solid', borderBottom:'1px solid', borderColor:'divider',
                    background: active ? alpha('#f59e0b',0.08) : today ? alpha('#f59e0b',0.04) : weekend ? 'rgba(255,255,255,0.01)' : 'transparent',
                    outline: active ? `1px solid ${alpha('#f59e0b',0.4)}` : 'none',
                    '&:hover': { background: alpha('#ffffff',0.04) },
                    transition: 'background 150ms' }}>
                  <Box sx={{ width: mobile ? 20 : 24, height: mobile ? 20 : 24, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                    bgcolor: today ? 'primary.main' : 'transparent', mb:0.5 }}>
                    <Typography variant="caption" fontWeight={today?700:400} sx={{
                      color: today ? '#000' : 'text.secondary', lineHeight:1,
                      fontSize: mobile ? '0.65rem' : '0.75rem',
                    }}>
                      {day}
                    </Typography>
                  </Box>
                  <Box sx={{ display:'flex', flexWrap:'wrap', gap:0.3, alignItems: 'center' }}>
                    {drinks.slice(0, mobile ? 3 : 4).map(d => (
                      <Box key={d.id} sx={{ width: mobile ? 5 : 6, height: mobile ? 5 : 6, borderRadius:'50%', bgcolor: CATEGORY_DOT_COLOR[d.category]||'#64748b' }} />
                    ))}
                    {drinks.length > (mobile ? 3 : 4) && (
                      <Typography sx={{ fontSize: mobile ? 7 : 8, color:'text.disabled', lineHeight: 1 }}>
                        +{drinks.length - (mobile ? 3 : 4)}
                      </Typography>
                    )}
                  </Box>
                </ButtonBase>
              )
            })}
          </Box>
        )}
      </Paper>

      {/* Legend */}
      <Stack direction="row" spacing={2} flexWrap="wrap" mt={1.5} sx={{ gap: mobile ? 1 : 2 }}>
        {Object.entries(CATEGORY_DOT_COLOR).map(([cat,color]) => (
          <Box key={cat} sx={{ display:'flex', alignItems:'center', gap:0.75 }}>
            <Box sx={{ width:8, height:8, borderRadius:'50%', bgcolor:color, flexShrink:0 }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: mobile ? '0.65rem' : '0.75rem' }}>{cat}</Typography>
          </Box>
        ))}
      </Stack>
      {mobile && (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5, textAlign: 'center' }}>
          Swipe left/right to change month
        </Typography>
      )}

      {/* Day panel */}
      {sel && (
        <Fade in>
          <Paper sx={{ mt:2, p:2.5, borderRadius:3 }}>
            <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', mb:2 }}>
              <Box>
                <Typography variant="subtitle2">
                  {new Date(sel+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'})}
                </Typography>
                {(cal[sel]||[]).length > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    {(cal[sel]||[]).length} drink{(cal[sel]||[]).length !== 1 ? 's' : ''}
                    {' · avg '}
                    {(cal[sel].reduce((s, d) => s + d.rating, 0) / cal[sel].length).toFixed(1)}
                  </Typography>
                )}
              </Box>
              {canCreateDrinks && (
                <Button component={Link} to={`/add?date=${sel}`} size="small" startIcon={<AddRounded/>} variant="outlined">
                  Log drink
                </Button>
              )}
            </Box>
            {(cal[sel]||[]).length===0 ? (
              <Box sx={{ textAlign:'center', py:3 }}>
                <Typography sx={{ fontSize: 32, opacity: 0.2 }}>📅</Typography>
                <Typography color="text.secondary" variant="body2" mt={1}>No drinks on this day.</Typography>
                {canCreateDrinks && (
                  <Button component={Link} to={`/add?date=${sel}`} size="small" variant="text" sx={{ mt: 1, color: 'text.secondary' }}>
                    Add one?
                  </Button>
                )}
              </Box>
            ) : (
              <Stack spacing={0.5}>
                {(cal[sel]||[]).map(d => (
                  <ButtonBase key={d.id} component={Link} to={`/drink/${d.id}`}
                    sx={{ display:'flex', alignItems:'center', gap:1.5, p:1.25, borderRadius:2, width:'100%', textAlign:'left',
                      '&:hover': { bgcolor: alpha('#ffffff',0.04) } }}>
                    <Typography sx={{ fontSize:20, flexShrink:0 }}>{CATEGORY_ICON[d.category]||'🍶'}</Typography>
                    <RatingBadge rating={d.rating} size="sm" />
                    <Box sx={{ minWidth:0, flex:1 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>{d.name}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {[d.brewery, d.style, d.container].filter(Boolean).join(' · ')}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.disabled">→</Typography>
                  </ButtonBase>
                ))}
              </Stack>
            )}
          </Paper>
        </Fade>
      )}
    </Box>
  )
}
