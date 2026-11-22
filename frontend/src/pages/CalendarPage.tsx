import { useQuery } from '@apollo/client/react'
import { ActionIcon, Button, Group, Loader, Select, Stack, Text, Title } from '@mantine/core'
import { IconChevronLeft, IconChevronRight, IconPlus } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { DrinkCard } from '../components/DrinkCard'
import { DRINKS, PEOPLE, type Drink } from '../graphql/operations'
import { formatDay, monthName, today, weekdayNames } from '../lib/format'
import { canAdd, useMe } from '../me'
import { CATEGORY_COLOR } from '../theme'

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function CalendarPage() {
  const { t } = useTranslation()
  const me = useMe()
  const now = today()
  const [year, setYear] = useState(Number(now.slice(0, 4)))
  const [month, setMonth] = useState(Number(now.slice(5, 7)))
  const [selected, setSelected] = useState<string | null>(now)
  const [who, setWho] = useState<string>('all')
  const people = useQuery(PEOPLE)

  const last = new Date(year, month, 0).getDate()
  const { data, loading } = useQuery(DRINKS, {
    variables: {
      filter: {
        dateFrom: iso(year, month, 1),
        dateTo: iso(year, month, last),
        mine: who === 'mine',
        userId: who !== 'all' && who !== 'mine' ? who : null,
      },
      sort: 'DATE',
      descending: false,
      limit: 500,
    },
    fetchPolicy: 'cache-and-network',
  })

  const byDay = useMemo(() => {
    const map = new Map<string, Drink[]>()
    for (const drink of data?.drinks.items ?? []) map.set(drink.dateTried, [...(map.get(drink.dateTried) ?? []), drink])
    return map
  }, [data])

  const move = (delta: number) => {
    const date = new Date(year, month - 1 + delta, 1)
    setYear(date.getFullYear())
    setMonth(date.getMonth() + 1)
    setSelected(null)
  }

  // Monday-first grid with leading blanks.
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: last }, (_, i) => i + 1)]
  const dayDrinks = selected ? (byDay.get(selected) ?? []) : []
  const monthTotal = data?.drinks.items.length ?? 0

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <ActionIcon variant="default" size="lg" onClick={() => move(-1)} aria-label={t('calendar.previous')}>
          <IconChevronLeft size={18} />
        </ActionIcon>
        <Stack gap={0} align="center">
          <Title order={3} tt="capitalize">
            {monthName(month, year)} {year}
          </Title>
          <Text size="xs" c="dimmed">
            {loading ? <Loader size="xs" /> : t('list.count', { count: monthTotal })}
          </Text>
        </Stack>
        <ActionIcon variant="default" size="lg" onClick={() => move(1)} aria-label={t('calendar.next')}>
          <IconChevronRight size={18} />
        </ActionIcon>
      </Group>
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
      <div className="calendar-grid">
        {weekdayNames().map((name) => (
          <Text key={name} size="xs" c="dimmed" ta="center" fw={700} tt="capitalize">
            {name.slice(0, 2)}
          </Text>
        ))}
        {cells.map((day, index) => {
          if (day === null) return <div key={`blank-${index}`} />
          const date = iso(year, month, day)
          const drinks = byDay.get(date) ?? []
          const classes = ['calendar-day', date === now && 'today', date === selected && 'selected'].filter(Boolean).join(' ')
          return (
            <button key={date} type="button" className={classes} onClick={() => setSelected(date)} aria-label={formatDay(date)}>
              <Text size="sm" fw={drinks.length ? 800 : 400}>
                {day}
              </Text>
              <span className="dots">
                {drinks.slice(0, 6).map((d) => (
                  <span key={d.id} style={{ background: `var(--mantine-color-${CATEGORY_COLOR[d.category]}-5)` }} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
      {selected && (
        <Stack gap="xs" mt="sm">
          <Group justify="space-between">
            <Title order={4} tt="capitalize">
              {formatDay(selected, { weekday: 'long', day: 'numeric', month: 'long' })}
            </Title>
            {canAdd(me) && selected <= now && (
              <Button size="xs" variant="light" component={Link} to="/add" leftSection={<IconPlus size={14} />}>
                {t('nav.add')}
              </Button>
            )}
          </Group>
          {dayDrinks.length ? (
            dayDrinks.map((drink) => <DrinkCard key={drink.id} drink={drink} />)
          ) : (
            <Text size="sm" c="dimmed">
              {t('calendar.nothing')}
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  )
}
