import { Badge, SimpleGrid, UnstyledButton, type MantineSize } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { ratingColor } from '../theme'

export function RatingBadge({ rating, size = 'lg' }: { rating: number; size?: MantineSize }) {
  return (
    <Badge color={ratingColor(rating)} size={size} variant="filled" radius="xl" style={{ minWidth: 44 }}>
      {rating}/10
    </Badge>
  )
}

/** Ten big buttons (two rows of five on phones): easy to hit with a thumb. */
export function RatingPicker({ value, onChange }: { value: number | null; onChange: (rating: number) => void }) {
  const { t } = useTranslation()
  return (
    <SimpleGrid cols={{ base: 5, sm: 10 }} spacing={6} role="radiogroup" aria-label={t('drink.rating')}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
        const selected = value === n
        const color = ratingColor(n)
        return (
          <UnstyledButton
            key={n}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(n)}
            style={{
              height: 48,
              borderRadius: 'var(--mantine-radius-md)',
              fontWeight: 800,
              fontSize: 18,
              textAlign: 'center',
              border: `2px solid var(--mantine-color-${color}-6)`,
              background: selected ? `var(--mantine-color-${color}-6)` : 'transparent',
              color: selected ? 'white' : `var(--mantine-color-${color}-7)`,
            }}
          >
            {n}
          </UnstyledButton>
        )
      })}
    </SimpleGrid>
  )
}
