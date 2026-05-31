import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { CATEGORY_ICON, CATEGORY_COLOR } from '../constants'
import RatingBadge from './RatingBadge'
import ConfirmDialog from './ConfirmDialog'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import Skeleton from '@mui/material/Skeleton'
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import EditRounded from '@mui/icons-material/EditRounded'
import DeleteRounded from '@mui/icons-material/DeleteRounded'
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'

export default function DrinkDetail() {
  const { id }            = useParams()
  const navigate          = useNavigate()
  const { user }          = useAuth()
  const [drink, setDrink] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    fetch(`/api/drinks/${id}`)
      .then(r => { if (!r.ok) { navigate('/', { replace: true }); return null } return r.json() })
      .then(d => { if (d) setDrink(d) })
      .finally(() => setLoading(false))
  }, [id, navigate])

  const handleDelete = async () => {
    const res = await fetch(`/api/drinks/${id}`, { method: 'DELETE' })
    if (res.ok) navigate('/')
    setConfirm(false)
  }

  if (loading) {
    return (
      <Box sx={{ maxWidth: 640, mx: 'auto' }}>
        <Skeleton width={80} height={36} sx={{ mb: 2 }} />
        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 0 }} />
          <Box sx={{ p: 3 }}><Skeleton height={32} width="60%" /><Skeleton height={20} width="40%" sx={{ mt: 1 }} /></Box>
        </Paper>
      </Box>
    )
  }
  if (!drink) return null

  const canManageDrink = Boolean(
    user && (user.role === 'admin' || (user.role === 'contributor' && Number(drink.created_by) === Number(user.id)))
  )

  const cat   = CATEGORY_COLOR[drink.category] || CATEGORY_COLOR.Other
  const info  = [
    { label: 'Brewery / Producer', value: drink.brewery },
    { label: 'Style / Type',       value: drink.style },
    { label: 'ABV',                value: drink.abv != null ? `${drink.abv}%` : null },
    { label: 'Country / Region',   value: drink.country },
    { label: 'Date Tried',         value: drink.date_tried ? new Date(drink.date_tried + 'T00:00:00').toLocaleDateString() : null },
    { label: 'Location',           value: drink.location },
  ].filter((item) => item.value)

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto' }}>
      <Button startIcon={<ArrowBackRounded />} component={Link} to="/"
        color="inherit" sx={{ mb: 2, color: 'text.secondary' }}>All Drinks</Button>

      <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
        {/* Hero photo */}
        {drink.photo_path && (
          <Box sx={{ position: 'relative' }}>
            <Box component="img" src={drink.photo_path} alt={drink.name}
              sx={{ width: '100%', height: { xs: 200, sm: 260 }, objectFit: 'cover', display: 'block' }} />
            <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(15,23,42,0.8) 0%, transparent 60%)' }} />
          </Box>
        )}

        <Box sx={{ p: { xs: 2.5, sm: 3 } }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, mb: 2.5 }}>
            <Box>
              <Chip label={`${CATEGORY_ICON[drink.category] || '🍶'} ${drink.category}`} size="small"
                sx={{ bgcolor: cat.bg, color: cat.color, border: `1px solid ${cat.border}`, mb: 1, fontWeight: 500 }} />
              <Typography variant="h5" fontWeight={700} lineHeight={1.2}>{drink.name}</Typography>
              {drink.brewery && <Typography color="text.secondary" mt={0.5}>{drink.brewery}</Typography>}
            </Box>
            <RatingBadge rating={drink.rating} size="lg" />
          </Box>

          {/* Info grid */}
          {info.length > 0 && (
            <>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                {info.map(({ label, value }) => (
                  <Grid item xs={6} sm={4} key={label}>
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                      {label}
                    </Typography>
                    <Typography variant="body2" color="text.primary" fontWeight={500} mt={0.25}>{value}</Typography>
                  </Grid>
                ))}
              </Grid>
              <Divider sx={{ mb: 2 }} />
            </>
          )}

          {/* Notes */}
          {drink.comment && (
            <Box mb={2}>
              <Typography variant="caption" color="text.disabled" sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, display: 'block', mb: 0.75 }}>
                Tasting Notes
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                {drink.comment}
              </Typography>
            </Box>
          )}

          {/* Would have again */}
          {drink.would_buy_again ? (
            <Chip icon={<CheckCircleRounded />} label="Would have again" size="small" color="success" variant="outlined" sx={{ mb: 2.5 }} />
          ) : null}

          {/* Actions */}
          {canManageDrink && (
            <>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Button component={Link} to={`/edit/${drink.id}`} variant="contained" startIcon={<EditRounded />}>
                  Edit
                </Button>
                <Button variant="outlined" color="error" startIcon={<DeleteRounded />} onClick={() => setConfirm(true)}>
                  Delete
                </Button>
              </Box>
            </>
          )}
        </Box>
      </Paper>

      <ConfirmDialog
        open={confirm}
        title="Delete entry?"
        message={`"${drink.name}" will be permanently deleted.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirm(false)}
      />
    </Box>
  )
}
