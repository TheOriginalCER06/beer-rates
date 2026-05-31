import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { CATEGORY_ICON, CATEGORY_COLOR, ratingColor } from '../constants'
import RatingBadge from './RatingBadge'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Grid'
import LinearProgress from '@mui/material/LinearProgress'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Skeleton from '@mui/material/Skeleton'
import { alpha } from '@mui/material/styles'

function KPI({ label, value }) {
  return (
    <Paper sx={{ p: 2.5, borderRadius: 3, textAlign: 'center' }}>
      <Typography variant="h4" fontWeight={800} color="primary.main">{value}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
        {label}
      </Typography>
    </Paper>
  )
}

function Section({ title, children }) {
  return (
    <Paper sx={{ p: 2.5, borderRadius: 3 }}>
      <Typography variant="caption" color="text.disabled" sx={{ textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, display: 'block', mb: 2 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  )
}

export default function StatsView() {
  const { user } = useAuth()
  const canCreateDrinks = Boolean(user && user.role !== 'viewer')
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/drinks/stats').then(r => r.json()).then(setStats).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Box>
        <Typography variant="h5" fontWeight={700} mb={3}>Stats</Typography>
        <Grid container spacing={2} mb={3}>
          {[1,2,3].map(i => <Grid item xs={4} key={i}><Skeleton height={90} sx={{ borderRadius: 3 }} /></Grid>)}
        </Grid>
        <Skeleton height={160} sx={{ borderRadius: 3, mb: 2 }} />
        <Skeleton height={120} sx={{ borderRadius: 3 }} />
      </Box>
    )
  }

  if (!stats || !stats.total) {
    return (
      <Box sx={{ textAlign: 'center', py: 10 }}>
        <Typography sx={{ fontSize: 52, opacity: 0.2 }}>📊</Typography>
        <Typography color="text.secondary" mt={1} mb={2}>No data yet.</Typography>
        {canCreateDrinks && <Button component={Link} to="/add" variant="outlined">Log your first drink</Button>}
      </Box>
    )
  }

  const allRatings = Array.from({length:10},(_,i)=>{
    const f = stats.ratingDistribution.find(r=>r.rating===i+1)
    return { rating: i+1, count: f?.count??0 }
  })
  const maxCount = Math.max(...allRatings.map(r=>r.count), 1)

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={3}>Stats</Typography>

      {/* KPIs */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={4}><KPI label="Total" value={stats.total} /></Grid>
        <Grid item xs={4}><KPI label="Avg Rating" value={stats.avgRating?.toFixed(1)??'—'} /></Grid>
        <Grid item xs={4}><KPI label="Repeat" value={`${stats.wouldBuyAgainPct}%`} /></Grid>
      </Grid>

      {/* By category */}
      {stats.byCategory?.length > 0 && (
        <Paper sx={{ p: 2.5, borderRadius: 3, mb: 2.5 }}>
          <Typography variant="caption" color="text.disabled" sx={{ textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:700, display:'block', mb:2 }}>
            By Category
          </Typography>
          <Grid container spacing={1.5}>
            {stats.byCategory.map(c => {
              const col = CATEGORY_COLOR[c.category] || CATEGORY_COLOR.Other
              return (
                <Grid item xs={6} sm={4} key={c.category}>
                  <Box sx={{ bgcolor: col.bg, border: `1px solid ${col.border}`, borderRadius: 2, px: 1.5, py: 1.25 }}>
                    <Typography variant="subtitle2" sx={{ color: col.color }}>
                      {CATEGORY_ICON[c.category]} {c.category}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {c.count}× · avg {Number(c.avgRating).toFixed(1)}
                    </Typography>
                  </Box>
                </Grid>
              )
            })}
          </Grid>
        </Paper>
      )}

      {/* Rating distribution */}
      <Section title="Rating Distribution">
        <Stack spacing={0.75}>
          {allRatings.map(({ rating, count }) => {
            const color = ratingColor(rating)
            return (
              <Box key={rating} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="caption" sx={{ minWidth: 16, color: 'text.secondary', textAlign: 'right' }}>{rating}</Typography>
                <LinearProgress variant="determinate" value={(count/maxCount)*100}
                  sx={{ flex: 1, height: 8, borderRadius: 4, bgcolor: alpha(color, 0.12),
                    '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 4 } }} />
                <Typography variant="caption" color="text.disabled" sx={{ minWidth: 20, textAlign: 'right' }}>{count}</Typography>
              </Box>
            )
          })}
        </Stack>
      </Section>

      <Grid container spacing={2.5} mt={0}>
        {/* Top rated */}
        {stats.topDrinks?.length > 0 && (
          <Grid item xs={12} md={6}>
            <Section title="Top Rated">
              <Stack spacing={0.5}>
                {stats.topDrinks.map((d, i) => (
                  <ButtonBase key={d.id} component={Link} to={`/drink/${d.id}`}
                    sx={{ display:'flex', alignItems:'center', gap:1.5, p:1, borderRadius:2, width:'100%', textAlign:'left',
                      '&:hover': { bgcolor: alpha('#ffffff',0.04) } }}>
                    <Typography variant="caption" color="text.disabled" sx={{ minWidth:16, textAlign:'right' }}>{i+1}</Typography>
                    <RatingBadge rating={d.rating} size="sm" />
                    <Box sx={{ minWidth:0, flex:1 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>{d.name}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {CATEGORY_ICON[d.category]} {d.brewery||d.category}
                      </Typography>
                    </Box>
                  </ButtonBase>
                ))}
              </Stack>
            </Section>
          </Grid>
        )}

        {/* Top styles */}
        {stats.topStyles?.length > 0 && (
          <Grid item xs={12} md={6}>
            <Section title="Top Styles">
              <Stack spacing={1.25}>
                {stats.topStyles.slice(0,6).map(s => (
                  <Box key={s.style} sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:1 }}>
                    <Typography variant="body2" noWrap sx={{ flex:1 }}>{s.style}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink:0 }}>
                      {s.count}× · avg {Number(s.avgRating).toFixed(1)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Section>
          </Grid>
        )}

        {/* By country */}
        {stats.topCountries?.length > 0 && (
          <Grid item xs={12} md={6}>
            <Section title="By Country / Region">
              <Stack spacing={1.25}>
                {stats.topCountries.slice(0,6).map(c => (
                  <Box key={c.country} sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:1 }}>
                    <Typography variant="body2">{c.country}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink:0 }}>
                      {c.count}× · avg {Number(c.avgRating).toFixed(1)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Section>
          </Grid>
        )}
      </Grid>
    </Box>
  )
}
