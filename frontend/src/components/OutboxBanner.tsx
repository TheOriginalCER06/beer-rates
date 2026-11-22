import { useApolloClient } from '@apollo/client/react'
import { ActionIcon, Alert, Button, Group, Stack, Text } from '@mantine/core'
import { IconCloudUpload, IconRefresh, IconTrash } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { translateCode } from '../lib/errors'
import { flushOutbox, removeFromOutbox, retryEntry, useOutbox, type OutboxEntry } from '../lib/outbox'
import { useOnline } from '../lib/offline'
import { DrinkCard } from './DrinkCard'

function Preview({ entry }: { entry: OutboxEntry }) {
  const url = useMemo(() => (entry.photo ? URL.createObjectURL(entry.photo) : undefined), [entry.photo])
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
  }, [url])
  if (!entry.input) return null
  return (
    <DrinkCard
      drink={{ ...entry.input, producer: entry.input.producer ?? '', style: entry.input.style ?? '', abv: entry.input.abv ?? null, dateTried: entry.input.dateTried ?? '', thumbnailUrl: null }}
      previewUrl={url}
      pending
    />
  )
}

/** Drinks and photos waiting to upload, with retry and remove. Shown above every page. */
export function OutboxBanner({ showCards = false }: { showCards?: boolean }) {
  const { t } = useTranslation()
  const client = useApolloClient()
  const entries = useOutbox()
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  if (!entries.length) return null
  const failed = entries.filter((e) => e.error)

  const sendNow = async () => {
    setBusy(true)
    try {
      await Promise.all(failed.map((e) => retryEntry(e.id)))
      await flushOutbox(client)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack gap="xs" mb="md">
      <Alert
        color={failed.length ? 'red' : 'beer'}
        variant="light"
        icon={<IconCloudUpload size={18} />}
        title={t('outbox.title', { count: entries.length })}
      >
        <Stack gap="xs">
          <Text size="sm">{online ? t('outbox.uploading') : t('outbox.offline')}</Text>
          {failed.map((entry) => (
            <Group key={entry.id} justify="space-between" wrap="nowrap" gap="xs">
              <Text size="sm" c="red">
                {entry.input?.name ?? t('outbox.photo')}: {translateCode(entry.error, entry.error ?? '', t)}
              </Text>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label={t('common.delete')}
                onClick={() => void removeFromOutbox(entry.id)}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))}
          {online && (
            <Group>
              <Button size="xs" variant="light" leftSection={<IconRefresh size={14} />} loading={busy} onClick={() => void sendNow()}>
                {t('outbox.sendNow')}
              </Button>
            </Group>
          )}
        </Stack>
      </Alert>
      {showCards && entries.filter((e) => e.kind === 'drink').map((entry) => <Preview key={entry.id} entry={entry} />)}
    </Stack>
  )
}
