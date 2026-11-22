import { useApolloClient } from '@apollo/client/react'
import { Button, Group, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { AuthCard } from '../components/Common'
import { useLogout } from '../hooks'
import { useSiteConfig, useUser } from '../me'

export function PendingPage() {
  const { t } = useTranslation()
  const me = useUser()
  const client = useApolloClient()
  const logout = useLogout()
  const config = useSiteConfig()
  return (
    <AuthCard title={t('pending.title', { name: me.username })}>
      <Stack>
        <Text>{t('pending.text')}</Text>
        <Group grow>
          <Button onClick={() => void client.refetchQueries({ include: 'active' })}>{t('pending.checkAgain')}</Button>
          <Button variant="default" onClick={() => void logout()}>
            {t('nav.logout')}
          </Button>
        </Group>
        {config?.publicView && (
          <Button component={Link} to="/" variant="subtle">
            {t('auth.browse')}
          </Button>
        )}
      </Stack>
    </AuthCard>
  )
}
