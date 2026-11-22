import { useQuery } from '@apollo/client/react'
import { Alert, Group, Loader, Paper, Select, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Section } from '../components/Common'
import { DrinkCard } from '../components/DrinkCard'
import { PEOPLE, STATS, type Bucket } from '../graphql/operations'
import { describeError } from '../lib/errors'
import { formatNumber, monthName } from '../lib/format'
import { CATEGORY_ICON } from '../lib/styles'
import { useMe } from '../me'
import { ratingColor } from '../theme'

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
        {label}
      </Text>
      <Text fw={800} size="xl">
        {value}
      </Text>
    </Paper>
  )
}

/** Horizontal bars: label, bar, count (and average rating). */
function Bars({ items, label = (b) => b.label }: { items: Bucket[]; label?: (b: Bucket) => string }) {
  const { t } = useTranslation()
  if (!items.length) return <Text size="sm" c="dimmed">{t('stats.none')}</Text>
  const max = Math.max(...items.map((b) => b.count))
  return (
    <Stack gap={8}>
      {items.map((b) => (
        <div key={b.label}>
          <Group justify="space-between" gap="xs" wrap="nowrap">
            <Text size="sm" lineClamp={1}>
              {label(b)}
            </Text>
            <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
              {b.count}
              {b.avgRating != null && ` · ⌀ ${formatNumber(b.avgRating)}`}
            </Text>
          </Group>
          <div className="bar" style={{ width: `${(100 * b.count) / max}%` }} />
        </div>
      ))}
    </Stack>
  )
}

export function StatsPage() {
  const { t } = useTranslation()
  const me = useMe()
  const [who, setWho] = useState<string>('all')
  const [year, setYear] = useState<string>('all')
  const people = useQuery(PEOPLE)
  const userId = who === 'mine' ? (me?.id ?? null) : who === 'all' ? null : who
  const { data, loading, error } = useQuery(STATS, {
    variables: { userId, year: year === 'all' ? null : Number(year) },
    fetchPolicy: 'cache-and-network',
  })
  const stats = data?.stats

  return (
    <Stack gap="md">
      <Title order={2}>{t('stats.title')}</Title>
      <SimpleGrid cols={2} spacing="sm">
        <Select
          data={[
            { value: 'all', label: t('list.everyone') },
            ...(me ? [{ value: 'mine', label: t('list.mine') }] : []),
            ...(people.data?.people ?? []).filter((p) => p.id !== me?.id).map((p) => ({ value: p.id, label: p.username })),
          ]}
          value={who}
          onChange={(v) => setWho(v ?? 'all')}
          allowDeselect={false}
          size="sm"
        />
        <Select
          data={[{ value: 'all', label: t('stats.allYears') }, ...(stats?.years ?? []).map((y) => ({ value: String(y), label: String(y) }))]}
          value={year}
          onChange={(v) => setYear(v ?? 'all')}
          allowDeselect={false}
          size="sm"
        />
      </SimpleGrid>
      {error && !stats && <Alert color="red">{describeError(error, t)}</Alert>}
      {loading && !stats && <Loader />}
      {stats && stats.total === 0 && <Text c="dimmed">{t('stats.empty')}</Text>}
      {stats && stats.total > 0 && (
        <>
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
            <Kpi label={t('stats.total')} value={stats.total} />
            <Kpi label={t('stats.average')} value={formatNumber(stats.avgRating)} />
            <Kpi label={t('stats.again')} value={`${stats.wouldHaveAgainPct ?? 0} %`} />
            <Kpi label={t('stats.countries')} value={stats.uniqueCountries} />
          </SimpleGrid>

          <Section title={t('stats.ratings')}>
            <Group align="flex-end" gap={4} h={120} wrap="nowrap">
              {stats.ratingDistribution.map((count, i) => {
                const max = Math.max(1, ...stats.ratingDistribution)
                return (
                  <Stack key={i} gap={2} align="center" style={{ flex: 1 }} justify="flex-end" h="100%">
                    <Text size="xs" c="dimmed">
                      {count || ''}
                    </Text>
                    <div
                      style={{
                        width: '100%',
                        height: `${(85 * count) / max}%`,
                        minHeight: count ? 3 : 0,
                        borderRadius: 4,
                        background: `var(--mantine-color-${ratingColor(i + 1)}-6)`,
                      }}
                    />
                    <Text size="xs" fw={700}>
                      {i + 1}
                    </Text>
                  </Stack>
                )
              })}
            </Group>
          </Section>

          {who === 'all' && stats.byUser.length > 1 && (
            <Section title={t('stats.byUser')}>
              <Bars items={stats.byUser.map((u) => ({ label: u.username || t('drink.unknownUser'), count: u.count, avgRating: u.avgRating }))} />
            </Section>
          )}

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Section title={t('stats.byCategory')}>
              <Bars items={stats.byCategory} label={(b) => `${CATEGORY_ICON[b.label.toUpperCase() as keyof typeof CATEGORY_ICON] ?? ''} ${t(`category.${b.label.toUpperCase()}`)}`} />
            </Section>
            <Section title={t('stats.monthly')}>
              <Bars
                items={stats.monthly}
                label={(b) => `${monthName(Number(b.label.slice(5, 7)), Number(b.label.slice(0, 4)), 'short')} ${b.label.slice(0, 4)}`}
              />
            </Section>
            <Section title={t('stats.styles')}>
              <Bars items={stats.topStyles} />
            </Section>
            <Section title={t('stats.countriesTop')}>
              <Bars items={stats.topCountries} />
            </Section>
            <Section title={t('stats.producers')}>
              <Bars items={stats.topProducers} />
            </Section>
            <Section title={t('stats.containers')}>
              <Bars items={stats.byContainer} label={(b) => t(`container.${b.label.toUpperCase()}`)} />
            </Section>
          </SimpleGrid>

          <Section title={t('stats.top')}>
            <Stack gap="xs">
              {stats.topDrinks.map((drink) => (
                <DrinkCard key={drink.id} drink={drink} />
              ))}
            </Stack>
          </Section>
        </>
      )}
    </Stack>
  )
}
