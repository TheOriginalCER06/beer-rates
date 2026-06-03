import { useState } from 'react'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Typography from '@mui/material/Typography'
import Fade from '@mui/material/Fade'
import { alpha } from '@mui/material/styles'
import { ratingColor } from '../constants'

const LABEL = {
  1: 'Terrible',  2: 'Bad',      3: 'Poor',    4: 'Below avg',  5: 'Average',
  6: 'Above avg', 7: 'Good',     8: 'Great',   9: 'Excellent',  10: 'Perfect',
}

export default function RatingPicker({ value, onChange }) {
  const [hover, setHover] = useState(null)
  const active = hover ?? value

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const selected = n === value
          const hovered  = n === hover
          const color    = ratingColor(n)
          return (
            <ButtonBase
              key={n}
              onClick={() => onChange(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(null)}
              aria-label={`Rate ${n} out of 10 — ${LABEL[n]}`}
              sx={{
                width: 42, height: 42,
                borderRadius: '50%',
                fontWeight: 700,
                fontSize: 14,
                fontFamily: 'inherit',
                bgcolor:     selected ? color : hovered ? alpha(color, 0.15) : alpha('#ffffff', 0.06),
                color:       selected ? '#fff' : hovered ? color : 'text.secondary',
                border:      '2px solid',
                borderColor: selected ? color : hovered ? alpha(color, 0.4) : 'transparent',
                transition:  'all 200ms cubic-bezier(.4,0,.2,1)',
                transform:   selected ? 'scale(1.18)' : hovered ? 'scale(1.08)' : 'scale(1)',
                boxShadow:   selected ? `0 0 18px ${alpha(color, 0.55)}` : 'none',
                '&:hover': {
                  bgcolor:   selected ? color : alpha(color, 0.15),
                  transform: selected ? 'scale(1.18)' : 'scale(1.1)',
                },
              }}
            >
              {n}
            </ButtonBase>
          )
        })}
      </Box>
      {/* Label below */}
      <Box sx={{ height: 22, mt: 0.75 }}>
        <Fade in={active != null} timeout={150}>
          <Typography variant="caption" sx={{
            fontWeight: 600,
            color: active ? ratingColor(active) : 'text.disabled',
            transition: 'color 150ms',
          }}>
            {active ? `${active}/10 — ${LABEL[active]}` : ''}
          </Typography>
        </Fade>
      </Box>
    </Box>
  )
}
