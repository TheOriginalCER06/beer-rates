import { useState, useEffect } from 'react'
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
import { alpha, useTheme } from '@mui/material/styles'
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

  const prevMonth = () => month === 1 ? (setYear(y => y-1), setMonth(12)) : setMonth(m => m-1)
  const nextMonth = () => month === 12 ? (setYear(y => y+1), setMonth(1)) : setMonth(m => m+1)

  const firstDow = (new Date(year, month-1, 1).getDay() + 6) % 7
  const daysIn   = new Date(year, month, 0).getDate()
  const cells    = [...Array(firstDow).fill(null), ...Array.from({length:daysIn},(_,i)=>i+1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const pad    = n => String(n).padStart(2,'0')
  const toKey  = d => `${year}-${pad(month)}-${pad(d)}`
  const isToday = d => d===now.getDate() && month===now.getMonth()+1 && year===now.getFullYear()

  const monthTotal = Object.values(cal).reduce((a,b)=>a+b.length,0)

  return (
    <Box>
      <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', mb:3 }}>
        <Typography variant="h5" fontWeight={700}>Calendar</Typography>
        {monthTotal > 0 && <Typography variant="caption" color="text.secondary">{monthTotal} drink{monthTotal!==1?'s':''} this month</Typography>}
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
          {DOW_HDR.map(d => (
            <Typography key={d} variant="caption" align="center" sx={{ py:1, color:'text.disabled', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
              {d}
            </Typography>
          ))}
        </Box>

        {/* Grid */}
        {loading ? (
          <Box sx={{ py:8, textAlign:'center' }}><Typography color="text.disabled">Loading…</Typography></Box>
        ) : (
          <Box sx={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
            {cells.map((day,i) => {
              if (!day) return <Box key={`e-${i}`} sx={{ minHeight:64, borderRight:'1px solid', borderBottom:'1px solid', borderColor:'divider' }} />
              const key    = toKey(day)
              const drinks = cal[key]||[]
              const today  = isToday(day)
              const active = sel===key
              return (
                <ButtonBase key={key} onClick={()=>setSel(active?null:key)}
                  sx={{ minHeight:64, flexDirection:'column', alignItems:'flex-start', p:1,
                    borderRight:'1px solid', borderBottom:'1px solid', borderColor:'divider',
                    background: active ? alpha('#f59e0b',0.08) : today ? alpha('#f59e0b',0.04) : 'transparent',
                    outline: active ? `1px solid ${alpha('#f59e0b',0.4)}` : 'none',
                    '&:hover': { background: alpha('#ffffff',0.04) },
                    transition: 'background 150ms' }}>
                  <Box sx={{ width:24, height:24, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                    bgcolor: today ? 'primary.main' : 'transparent', mb:0.5 }}>
                    <Typography variant="caption" fontWeight={today?700:400} sx={{ color: today?'#000':'text.secondary', lineHeight:1 }}>
                      {day}
                    </Typography>
                  </Box>
                  <Box sx={{ display:'flex', flexWrap:'wrap', gap:0.3 }}>
                    {drinks.slice(0,4).map(d => (
                      <Box key={d.id} sx={{ width:6, height:6, borderRadius:'50%', bgcolor: CATEGORY_DOT_COLOR[d.category]||'#64748b' }} />
                    ))}
                    {drinks.length>4 && <Typography sx={{ fontSize:8, color:'text.disabled' }}>+{drinks.length-4}</Typography>}
                  </Box>
                </ButtonBase>
              )
            })}
          </Box>
        )}
      </Paper>

      {/* Legend */}
      <Stack direction="row" spacing={2} flexWrap="wrap" mt={1.5}>
        {Object.entries(CATEGORY_DOT_COLOR).map(([cat,color]) => (
          <Box key={cat} sx={{ display:'flex', alignItems:'center', gap:0.75 }}>
            <Box sx={{ width:8, height:8, borderRadius:'50%', bgcolor:color, flexShrink:0 }} />
            <Typography variant="caption" color="text.secondary">{cat}</Typography>
          </Box>
        ))}
      </Stack>

      {/* Day panel */}
      {sel && (
        <Paper sx={{ mt:2, p:2.5, borderRadius:3 }}>
          <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', mb:2 }}>
            <Typography variant="subtitle2">
              {new Date(sel+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'})}
            </Typography>
            {canCreateDrinks && (
              <Button component={Link} to={`/add?date=${sel}`} size="small" startIcon={<AddRounded/>} variant="outlined">
                Log drink
              </Button>
            )}
          </Box>
          {(cal[sel]||[]).length===0 ? (
            <Typography color="text.secondary" variant="body2" sx={{ textAlign:'center', py:2 }}>No drinks on this day.</Typography>
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
                      {[d.brewery,d.style].filter(Boolean).join(' · ')}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.disabled">→</Typography>
                </ButtonBase>
              ))}
            </Stack>
          )}
        </Paper>
      )}
    </Box>
  )
}
