import Avatar from '@mui/material/Avatar'
import { ratingColor } from '../constants'

const SIZES = { sm: 30, md: 42, lg: 58 }
const FONT  = { sm: 12, md: 16, lg: 22 }

export default function RatingBadge({ rating, size = 'md' }) {
  const bg = ratingColor(rating)
  return (
    <Avatar
      aria-label={`Rating: ${rating} out of 10`}
      sx={{
        bgcolor: bg,
        width:  SIZES[size],
        height: SIZES[size],
        fontSize: FONT[size],
        fontWeight: 700,
        flexShrink: 0,
        boxShadow: `0 0 16px ${bg}55`,
        color: '#fff',
      }}
    >
      {rating}
    </Avatar>
  )
}
