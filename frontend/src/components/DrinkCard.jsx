import { Link } from 'react-router-dom'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import PinDropRounded from '@mui/icons-material/PinDropRounded'
import RatingBadge from './RatingBadge'
import { CATEGORY_ICON, CATEGORY_COLOR } from '../constants'

export default function DrinkCard({ drink }) {
  const cat   = CATEGORY_COLOR[drink.category] || CATEGORY_COLOR.Other
  const meta  = [drink.brewery, drink.style, drink.abv ? `${drink.abv}%` : null].filter(Boolean).join(' · ')

  return (
    <Card>
      <CardActionArea component={Link} to={`/drink/${drink.id}`} sx={{ display: 'flex', alignItems: 'stretch' }}>
        {/* Left: photo or icon */}
        {drink.photo_path ? (
          <Box component="img" src={drink.photo_path} alt={drink.name}
            sx={{ width: 88, height: 88, objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <Box sx={{ width: 88, height: 88, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: cat.bg, fontSize: 28 }}>
            {CATEGORY_ICON[drink.category] || '🍶'}
          </Box>
        )}

        {/* Content */}
        <Box sx={{ flex: 1, minWidth: 0, p: 1.5, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" noWrap sx={{ lineHeight: 1.3, color: 'text.primary' }}>
                {drink.name}
              </Typography>
              {meta && (
                <Typography variant="caption" noWrap sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}>
                  {meta}
                </Typography>
              )}
            </Box>
            <RatingBadge rating={drink.rating} size="sm" />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
            <Chip label={`${CATEGORY_ICON[drink.category]} ${drink.category}`} size="small"
              sx={{ height: 20, fontSize: '0.68rem', bgcolor: cat.bg, color: cat.color,
                border: `1px solid ${cat.border}`, borderRadius: '6px', '& .MuiChip-label': { px: 0.75 } }} />
            <Typography variant="caption" color="text.disabled">
              {new Date(drink.date_tried + 'T00:00:00').toLocaleDateString()}
            </Typography>
            {drink.location && (
              <Typography variant="caption" color="text.disabled" sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <PinDropRounded sx={{ fontSize: 11 }} />{drink.location}
              </Typography>
            )}
            {drink.would_buy_again ? (
              <CheckCircleRounded sx={{ fontSize: 14, color: 'success.main' }} />
            ) : null}
          </Box>
        </Box>
      </CardActionArea>
    </Card>
  )
}
