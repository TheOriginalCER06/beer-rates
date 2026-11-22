import { Badge, Card, Group, Stack, Text } from '@mantine/core'
import { IconBeer, IconCloudUpload } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { Category, Drink } from '../graphql/operations'
import { formatAbv, relativeDay } from '../lib/format'
import { mediaUrl } from '../lib/platform'
import { CATEGORY_ICON } from '../lib/styles'
import { CATEGORY_COLOR } from '../theme'
import { RatingBadge } from './Rating'

export function CategoryBadge({ category }: { category: Category }) {
  const { t } = useTranslation()
  return (
    <Badge color={CATEGORY_COLOR[category]} variant="light" size="sm">
      {CATEGORY_ICON[category]} {t(`category.${category}`)}
    </Badge>
  )
}

interface CardProps {
  drink: Pick<Drink, 'name' | 'producer' | 'style' | 'abv' | 'category' | 'rating' | 'dateTried' | 'thumbnailUrl'> &
    Partial<Pick<Drink, 'id' | 'createdBy' | 'cheersCount'>>
  /** Local preview for drinks still waiting to upload. */
  previewUrl?: string
  pending?: boolean
}

export function DrinkCard({ drink, previewUrl, pending }: CardProps) {
  const { t } = useTranslation()
  const image = previewUrl ?? mediaUrl(drink.thumbnailUrl)
  const details = [drink.producer, drink.style, formatAbv(drink.abv)].filter(Boolean).join(' · ')
  const body = (
    <Card withBorder padding="sm" radius="md" style={pending ? { borderStyle: 'dashed' } : undefined}>
      <Group wrap="nowrap" align="flex-start" gap="sm">
        {image ? (
          <img className="drink-thumb" src={image} alt="" loading="lazy" />
        ) : (
          <div className="drink-thumb" style={{ display: 'grid', placeItems: 'center', fontSize: 30 }}>
            {CATEGORY_ICON[drink.category] ?? <IconBeer />}
          </div>
        )}
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
            <Text fw={700} lineClamp={2} style={{ wordBreak: 'break-word' }}>
              {drink.name}
            </Text>
            <RatingBadge rating={drink.rating} size="md" />
          </Group>
          {details && (
            <Text size="sm" c="dimmed" lineClamp={1}>
              {details}
            </Text>
          )}
          <Group gap={6} wrap="wrap">
            <CategoryBadge category={drink.category} />
            {pending ? (
              <Badge color="gray" variant="outline" size="sm" leftSection={<IconCloudUpload size={12} />}>
                {t('outbox.waiting')}
              </Badge>
            ) : (
              <Text size="xs" c="dimmed">
                {relativeDay(drink.dateTried)}
                {drink.createdBy && ` · ${drink.createdBy.username}`}
                {!!drink.cheersCount && ` · 🍻 ${drink.cheersCount}`}
              </Text>
            )}
          </Group>
        </Stack>
      </Group>
    </Card>
  )
  return drink.id && !pending ? (
    <Link to={`/drinks/${drink.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      {body}
    </Link>
  ) : (
    body
  )
}
