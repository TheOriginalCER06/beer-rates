import { useMutation, useQuery } from '@apollo/client/react'
import {
  Alert,
  Badge,
  Button,
  Group,
  Image,
  Loader,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { IconArrowLeft, IconEdit, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { CategoryBadge, DrinkCard } from '../components/DrinkCard'
import { RatingBadge } from '../components/Rating'
import { CHEER, DELETE_DRINK, DRINK, DRINKS, SIMILAR_DRINKS } from '../graphql/operations'
import { useNotifyError } from '../hooks'
import { describeError } from '../lib/errors'
import { formatAbv, formatDateTime, formatDay } from '../lib/format'
import { mediaUrl } from '../lib/platform'
import { useMe } from '../me'

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
        {label}
      </Text>
      <Text>{value}</Text>
    </div>
  )
}

export function DrinkPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const me = useMe()
  const navigate = useNavigate()
  const notifyError = useNotifyError()
  const { data, loading, error } = useQuery(DRINK, { variables: { id }, fetchPolicy: 'cache-and-network' })
  const drink = data?.drink
  const similar = useQuery(SIMILAR_DRINKS, { variables: { name: drink?.name ?? '', excludeId: id }, skip: !drink })
  const [cheer, cheering] = useMutation(CHEER)
  const [remove, removing] = useMutation(DELETE_DRINK, { refetchQueries: [DRINKS] })
  const [confirm, setConfirm] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  if (loading && !drink) return <Loader m="xl" />
  if (error && !drink) return <Alert color="red">{describeError(error, t)}</Alert>
  if (!drink) return null

  const doDelete = async () => {
    try {
      await remove({ variables: { id } })
      void navigate('/', { replace: true })
    } catch (e) {
      notifyError(e)
    }
  }

  const toggleCheers = async () => {
    try {
      await cheer({
        variables: { drinkId: id, on: !drink.cheeredByMe },
        optimisticResponse: {
          cheer: {
            __typename: 'Drink',
            id,
            cheeredByMe: !drink.cheeredByMe,
            cheersCount: drink.cheersCount + (drink.cheeredByMe ? -1 : 1),
          } as never,
        },
      })
    } catch (e) {
      notifyError(e)
    }
  }

  const photo = mediaUrl(drink.photoUrl)
  const mine = me && drink.createdBy?.id === me.id

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Button variant="subtle" px={0} leftSection={<IconArrowLeft size={18} />} onClick={() => void navigate(-1)}>
          {t('common.back')}
        </Button>
        {drink.canEdit && (
          <Group gap="xs">
            <Button component={Link} to={`/drinks/${id}/edit`} variant="light" leftSection={<IconEdit size={16} />}>
              {t('common.edit')}
            </Button>
            <Button color="red" variant="subtle" leftSection={<IconTrash size={16} />} onClick={() => setConfirm(true)}>
              {t('common.delete')}
            </Button>
          </Group>
        )}
      </Group>

      {photo && (
        <Image
          src={photo}
          alt={drink.name}
          radius="md"
          mah="60vh"
          fit="contain"
          style={{ cursor: 'zoom-in', background: 'var(--mantine-color-default-hover)' }}
          onClick={() => setFullscreen(true)}
        />
      )}

      <Stack gap={6}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Title order={2} style={{ wordBreak: 'break-word' }}>
            {drink.name}
          </Title>
          <RatingBadge rating={drink.rating} size="xl" />
        </Group>
        <Group gap="xs">
          <CategoryBadge category={drink.category} />
          {drink.wouldHaveAgain && (
            <Badge color="green" variant="light">
              {t('drink.wouldHaveAgainShort')}
            </Badge>
          )}
          {drink.container && <Badge variant="outline">{t(`container.${drink.container}`)}</Badge>}
        </Group>
      </Stack>

      {drink.comment && (
        <Paper withBorder p="md" radius="md">
          <Text style={{ whiteSpace: 'pre-wrap' }}>{drink.comment}</Text>
        </Paper>
      )}

      <SimpleGrid cols={2} spacing="md">
        <Field label={t('drink.producer')} value={drink.producer} />
        <Field label={t('drink.style')} value={drink.style} />
        <Field label={t('drink.abv')} value={formatAbv(drink.abv)} />
        <Field label={t('drink.country')} value={drink.country} />
        <Field label={t('drink.date')} value={formatDay(drink.dateTried, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />
        <Field label={t('drink.location')} value={drink.location} />
        <Field label={t('drink.addedBy')} value={drink.createdBy?.username ?? t('drink.unknownUser')} />
        <Field label={t('drink.barcode')} value={drink.barcode} />
      </SimpleGrid>
      <Text size="xs" c="dimmed">
        {t('drink.added', { when: formatDateTime(drink.createdAt) })}
      </Text>

      <Group>
        <Button
          variant={drink.cheeredByMe ? 'filled' : 'light'}
          onClick={() => void toggleCheers()}
          loading={cheering.loading}
          disabled={!me?.isApproved || !!mine}
          title={mine ? t('cheers.own') : undefined}
        >
          🍻 {drink.cheeredByMe ? t('cheers.done') : t('cheers.give')} · {drink.cheersCount}
        </Button>
      </Group>

      {!!similar.data?.similarDrinks.length && (
        <Stack gap="xs">
          <Title order={4}>{t('drink.otherTimes')}</Title>
          {similar.data.similarDrinks.map((d) => (
            <DrinkCard key={d.id} drink={d} />
          ))}
        </Stack>
      )}

      <Modal opened={confirm} onClose={() => setConfirm(false)} title={t('drink.deleteTitle')} centered>
        <Stack>
          <Text>{t('drink.deleteConfirm', { name: drink.name })}</Text>
          <Group grow>
            <Button variant="default" onClick={() => setConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button color="red" onClick={() => void doDelete()} loading={removing.loading}>
              {t('common.delete')}
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal opened={fullscreen} onClose={() => setFullscreen(false)} fullScreen padding={0} withCloseButton zIndex={400}>
        {photo && <img src={photo} alt={drink.name} style={{ width: '100%', height: 'calc(100vh - 60px)', objectFit: 'contain' }} />}
      </Modal>
    </Stack>
  )
}
