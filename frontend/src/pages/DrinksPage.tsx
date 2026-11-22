import { useQuery } from '@apollo/client/react'
import {
  ActionIcon,
  Alert,
  Button,
  Center,
  Chip,
  Drawer,
  Group,
  Loader,
  RangeSlider,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core'
import { useDebouncedValue, useIntersection } from '@mantine/hooks'
import { IconAdjustments, IconPlus, IconSearch, IconX } from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { DrinkCard } from '../components/DrinkCard'
import { OutboxBanner } from '../components/OutboxBanner'
import { CATEGORIES, DRINKS, PEOPLE, type Category, type DrinkFilter, type DrinkSort } from '../graphql/operations'
import { describeError } from '../lib/errors'
import { CATEGORY_ICON } from '../lib/styles'
import { canAdd, useMe } from '../me'

const PAGE = 30

export function DrinksPage() {
  const { t } = useTranslation()
  const me = useMe()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [debounced] = useDebouncedValue(search.trim(), 350)
  const category = (params.get('category') as Category | null) ?? null
  const who = params.get('who') ?? 'all' // all | mine | <user id>
  const sort = (params.get('sort') as DrinkSort | null) ?? 'DATE'
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [ratings, setRatings] = useState<[number, number]>([1, 10])
  const [againOnly, setAgainOnly] = useState(false)
  const people = useQuery(PEOPLE)

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null || value === '' || value === 'all') next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const filter: DrinkFilter = useMemo(
    () => ({
      search: debounced || undefined,
      category,
      mine: who === 'mine',
      userId: who !== 'all' && who !== 'mine' ? who : null,
      minRating: ratings[0] > 1 ? ratings[0] : null,
      maxRating: ratings[1] < 10 ? ratings[1] : null,
      wouldHaveAgain: againOnly ? true : null,
    }),
    [debounced, category, who, ratings, againOnly],
  )
  const descending = sort !== 'NAME'
  const { data, loading, error, fetchMore, refetch } = useQuery(DRINKS, {
    variables: { filter, sort, descending, offset: 0, limit: PAGE },
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
  })
  const items = data?.drinks.items ?? []

  // Load the next page when the end of the list comes into view.
  // `loading` already covers this fetch (notifyOnNetworkStatusChange); the ref only stops a second
  // request for the same page while the first is on its way.
  const { ref: endRef, entry } = useIntersection({ rootMargin: '400px' })
  const fetchingMore = useRef(false)
  useEffect(() => {
    if (!entry?.isIntersecting || !data?.drinks.hasMore || fetchingMore.current) return
    fetchingMore.current = true
    void fetchMore({
      variables: { offset: items.length },
      updateQuery: (prev, { fetchMoreResult }) => ({
        drinks: {
          ...fetchMoreResult.drinks,
          items: [...prev.drinks.items, ...fetchMoreResult.drinks.items],
        },
      }),
    }).finally(() => {
      fetchingMore.current = false
    })
  }, [entry?.isIntersecting, data?.drinks.hasMore, items.length, fetchMore])

  // Pull to refresh isn't available in a WebView; refresh when returning to the app instead.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && void refetch()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refetch])

  const filtered = ratings[0] > 1 || ratings[1] < 10 || againOnly
  const whoOptions = [
    { value: 'all', label: t('list.everyone') },
    ...(me ? [{ value: 'mine', label: t('list.mine') }] : []),
    ...(people.data?.people ?? []).filter((p) => p.id !== me?.id).map((p) => ({ value: p.id, label: p.username })),
  ]

  return (
    <Stack gap="sm">
      <Group gap="xs" wrap="nowrap">
        <TextInput
          style={{ flex: 1 }}
          placeholder={t('list.search')}
          leftSection={<IconSearch size={18} />}
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value)
            update('q', e.currentTarget.value)
          }}
          rightSection={
            search ? (
              <ActionIcon variant="subtle" color="gray" aria-label={t('common.clear')} onClick={() => { setSearch(''); update('q', null) }}>
                <IconX size={16} />
              </ActionIcon>
            ) : null
          }
          type="search"
          enterKeyHint="search"
        />
        <ActionIcon
          size={42}
          variant={filtered || who !== 'all' || sort !== 'DATE' ? 'filled' : 'default'}
          aria-label={t('list.filters')}
          onClick={() => setFiltersOpen(true)}
        >
          <IconAdjustments size={20} />
        </ActionIcon>
      </Group>
      <div className="chip-row">
        <Chip checked={!category} onChange={() => update('category', null)} variant="filled">
          {t('list.allCategories')}
        </Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c} checked={category === c} onChange={() => update('category', category === c ? null : c)} variant="filled">
            {CATEGORY_ICON[c]} {t(`category.${c}`)}
          </Chip>
        ))}
      </div>

      {me && <OutboxBanner showCards />}
      {error && !data && <Alert color="red">{describeError(error, t)}</Alert>}
      {data && (
        <Text size="sm" c="dimmed">
          {t('list.count', { count: data.drinks.total })}
        </Text>
      )}

      {items.map((drink) => (
        <DrinkCard key={drink.id} drink={drink} />
      ))}
      <div ref={endRef} />
      {loading && (
        <Center py="md">
          <Loader size="sm" />
        </Center>
      )}
      {data && !items.length && !loading && (
        <Stack align="center" py="xl" gap="sm">
          <Text size="xl">🍺</Text>
          <Text c="dimmed" ta="center">
            {debounced || category || filtered ? t('list.noMatches') : t('list.empty')}
          </Text>
          {canAdd(me) && (
            <Button component={Link} to="/add" leftSection={<IconPlus size={16} />}>
              {t('nav.add')}
            </Button>
          )}
        </Stack>
      )}

      <Drawer opened={filtersOpen} onClose={() => setFiltersOpen(false)} position="bottom" size="auto" title={t('list.filters')} zIndex={300}>
        <Stack pb="calc(var(--safe-bottom) + 16px)">
          <Select label={t('list.who')} data={whoOptions} value={who} onChange={(v) => update('who', v)} allowDeselect={false} />
          <div>
            <Text size="sm" fw={500} mb={6}>
              {t('list.sort')}
            </Text>
            <SegmentedControl
              fullWidth
              value={sort}
              onChange={(v) => update('sort', v === 'DATE' ? null : v)}
              data={(['DATE', 'RATING', 'NAME', 'ABV', 'ADDED'] as DrinkSort[]).map((s) => ({ value: s, label: t(`sort.${s}`) }))}
            />
          </div>
          <div>
            <Text size="sm" fw={500} mb={6}>
              {t('list.rating', { min: ratings[0], max: ratings[1] })}
            </Text>
            <RangeSlider min={1} max={10} step={1} minRange={0} value={ratings} onChange={setRatings} marks={[{ value: 1 }, { value: 5 }, { value: 10 }]} />
          </div>
          <Switch label={t('drink.wouldHaveAgain')} checked={againOnly} onChange={(e) => setAgainOnly(e.currentTarget.checked)} />
          <Group grow>
            <Button
              variant="default"
              onClick={() => {
                setRatings([1, 10])
                setAgainOnly(false)
                setParams(new URLSearchParams(), { replace: true })
                setSearch('')
              }}
            >
              {t('list.reset')}
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>{t('common.ok')}</Button>
          </Group>
        </Stack>
      </Drawer>
    </Stack>
  )
}
