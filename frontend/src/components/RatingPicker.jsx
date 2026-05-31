import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import { alpha } from '@mui/material/styles'
import { ratingColor } from '../constants'

export default function RatingPicker({ value, onChange }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
        const selected = n === value
        const color    = ratingColor(n)
        return (
          <ButtonBase
            key={n}
            onClick={() => onChange(n)}
            sx={{
              width: 42, height: 42,
              borderRadius: '50%',
              fontWeight: 700,
              fontSize: 14,
              fontFamily: 'inherit',
              bgcolor:     selected ? color : alpha('#ffffff', 0.06),
              color:       selected ? '#fff' : 'text.secondary',
              border:      '2px solid',
              borderColor: selected ? color : 'transparent',
              transition:  'all 200ms cubic-bezier(.4,0,.2,1)',
              transform:   selected ? 'scale(1.18)' : 'scale(1)',
              boxShadow:   selected ? `0 0 18px ${alpha(color, 0.55)}` : 'none',
              '&:hover': {
                bgcolor:   selected ? color : alpha('#ffffff', 0.1),
                transform: 'scale(1.1)',
              },
            }}
          >
            {n}
          </ButtonBase>
        )
      })}
    </Box>
  )
}
