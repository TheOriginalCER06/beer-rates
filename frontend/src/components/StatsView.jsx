import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { CATEGORY_ICON, CATEGORY_COLOR, CONTAINER_ICON, ratingColor } from '../constants'
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
import Fade from '@mui/material/Fade'
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
    <Fade in timeout={300}>
    <Box>
      <Typography variant="h5" fontWeight={700} mb={3}>Stats</Typography>

      {/* KPIs */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={4} sm={2}><KPI label="Total" value={stats.total} /></Grid>
        <Grid item xs={4} sm={2}><KPI label="Avg Rating" value={stats.avgRating?.toFixed(1)??'—'} /></Grid>
        <Grid item xs={4} sm={2}><KPI label="Repeat %" value={`${stats.wouldBuyAgainPct}%`} /></Grid>
        <Grid item xs={4} sm={2}><KPI label="Breweries" value={stats.uniqueBreweries ?? '—'} /></Grid>
        <Grid item xs={4} sm={2}><KPI label="Countries" value={stats.uniqueCountries ?? '—'} /></Grid>
        <Grid item xs={4} sm={2}><KPI label="Categories" value={stats.byCategory?.length ?? '—'} /></Grid>
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

        {/* By container */}
        {stats.byContainer?.length > 0 && (
          <Grid item xs={12} md={6}>
            <Section title="Served As">
              <Stack spacing={1.25}>
                {stats.byContainer.map(c => (
                  <Box key={c.container} sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:1 }}>
                    <Typography variant="body2">
                      {CONTAINER_ICON[c.container] || '🍶'} {c.container}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink:0 }}>
                      {c.count}×
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Section>
          </Grid>
        )}

        {/* Monthly trend */}
        {stats.monthlyCount?.length > 1 && (
          <Grid item xs={12}>
            <Section title="Monthly Activity (Last 12 Months)">
              {(() => {
                const maxM = Math.max(...stats.monthlyCount.map(m => m.count), 1)
                const months = [...stats.monthlyCount].reverse()
                return (
                  <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.75, height: 100, pt: 1 }}>
                    {months.map(m => (
                      <Box key={m.month} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>
                          {m.count}
                        </Typography>
                        <Box sx={{
                          width: '100%', maxWidth: 36,
                          height: `${Math.max((m.count / maxM) * 72, 4)}px`,
                          bgcolor: 'primary.main', borderRadius: 1, opacity: 0.8,
                          transition: 'height 0.3s',
                        }} />
                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.55rem', whiteSpace: 'nowrap' }}>
                          {m.month.slice(5)}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )
              })()}
            </Section>
          </Grid>
        )}
      </Grid>

      {/* Highlights */}
      {(stats.highestRated || stats.lowestRated) && (
        <Grid container spacing={2.5} mt={0}>
          {stats.highestRated && (
            <Grid item xs={12} sm={6}>
              <Paper sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <Typography variant="caption" color="success.main" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  🏆 Highest Rated
                </Typography>
                <ButtonBase component={Link} to={`/drink/${stats.highestRated.id}`}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1, width: '100%', textAlign: 'left', borderRadius: 2,
                    '&:hover': { bgcolor: alpha('#ffffff', 0.04) } }}>
                  <RatingBadge rating={stats.highestRated.rating} size="md" />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>{stats.highestRated.name}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {CATEGORY_ICON[stats.highestRated.category]} {stats.highestRated.brewery || stats.highestRated.category}
                    </Typography>
                  </Box>
                </ButtonBase>
              </Paper>
            </Grid>
          )}
          {stats.lowestRated && stats.total > 3 && (
            <Grid item xs={12} sm={6}>
              <Paper sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)' }}>
                <Typography variant="caption" color="error.main" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  👎 Lowest Rated
                </Typography>
                <ButtonBase component={Link} to={`/drink/${stats.lowestRated.id}`}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1, width: '100%', textAlign: 'left', borderRadius: 2,
                    '&:hover': { bgcolor: alpha('#ffffff', 0.04) } }}>
                  <RatingBadge rating={stats.lowestRated.rating} size="md" />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>{stats.lowestRated.name}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {CATEGORY_ICON[stats.lowestRated.category]} {stats.lowestRated.brewery || stats.lowestRated.category}
                    </Typography>
                  </Box>
                </ButtonBase>
              </Paper>
            </Grid>
          )}
        </Grid>
      )}

      {/* Recently Added */}
      {stats.recentDrinks?.length > 0 && (
        <Paper sx={{ p: 2.5, borderRadius: 3, mt: 2.5 }}>
          <Typography variant="caption" color="text.disabled" sx={{ textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, display: 'block', mb: 2 }}>
            Recently Added
          </Typography>
          <Stack spacing={0.5}>
            {stats.recentDrinks.map(d => (
              <ButtonBase key={d.id} component={Link} to={`/drink/${d.id}`}
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, borderRadius: 2, width: '100%', textAlign: 'left',
                  '&:hover': { bgcolor: alpha('#ffffff', 0.04) } }}>
                <Typography sx={{ fontSize: 18, flexShrink: 0 }}>{CATEGORY_ICON[d.category] || '🍶'}</Typography>
                <RatingBadge rating={d.rating} size="sm" />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>{d.name}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {[d.brewery, d.style].filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.disabled">
                  {d.created_at ? new Date(d.created_at).toLocaleDateString() : ''}
                </Typography>
              </ButtonBase>
            ))}
          </Stack>
        </Paper>
      )}
    </Box>
    </Fade>
  )
}
