import { Link } from 'react-router-dom'
import Tooltip from '@mui/material/Tooltip'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import PinDropRounded from '@mui/icons-material/PinDropRounded'
import PersonRounded from '@mui/icons-material/PersonRounded'
import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded'
import RatingBadge from './RatingBadge'
import { CATEGORY_ICON, CATEGORY_COLOR, CONTAINER_ICON } from '../constants'
import { relativeDate } from '../utils/relativeDate'

export default function DrinkCard({ drink, showCreator = false }) {
  const cat   = CATEGORY_COLOR[drink.category] || CATEGORY_COLOR.Other
  const containerDisplay = drink.container ? `${CONTAINER_ICON[drink.container] || ''} ${drink.container}`.trim() : null
  const meta  = [drink.brewery, drink.style, drink.abv ? `${drink.abv}%` : null, containerDisplay].filter(Boolean).join(' · ')
  const hasNotes = Boolean(drink.comment?.trim())

  return (
    <Card>
      <CardActionArea component={Link} to={`/drink/${drink.id}`}
        sx={{ display: 'flex', alignItems: 'stretch' }}
        aria-label={`${drink.name}, rated ${drink.rating} out of 10`}
      >
        {/* Left: photo or icon */}
        {drink.photo_path ? (
          <Box component="img" src={drink.photo_path} alt=""
            loading="lazy"
            sx={{ width: { xs: 88, sm: 96 }, height: { xs: 88, sm: 96 }, objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <Box sx={{ width: { xs: 88, sm: 96 }, height: { xs: 88, sm: 96 }, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
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
            <Tooltip title={new Date(drink.date_tried + 'T00:00:00').toLocaleDateString()} placement="top" arrow>
              <Typography variant="caption" color="text.disabled">
                {relativeDate(drink.date_tried)}
              </Typography>
            </Tooltip>
            {drink.location && (
              <Typography variant="caption" color="text.disabled" sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <PinDropRounded sx={{ fontSize: 11 }} />{drink.location}
              </Typography>
            )}
            {drink.would_buy_again ? (
              <CheckCircleRounded sx={{ fontSize: 14, color: 'success.main' }} />
            ) : null}
            {hasNotes && (
              <ChatBubbleOutlineRounded sx={{ fontSize: 12, color: 'text.disabled' }} />
            )}
            {showCreator && drink.created_by_name && (
              <Typography variant="caption" color="text.disabled" sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <PersonRounded sx={{ fontSize: 11 }} />{drink.created_by_name}
              </Typography>
            )}
          </Box>
        </Box>
      </CardActionArea>
    </Card>
  )
}
