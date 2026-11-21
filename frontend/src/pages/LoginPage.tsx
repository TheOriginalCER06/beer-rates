import { useApolloClient, useMutation } from '@apollo/client/react'
import { Alert, Anchor, Button, Collapse, Group, PasswordInput, Stack, Text, TextInput } from '@mantine/core'
import { IconServer } from '@tabler/icons-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { AuthCard } from '../components/Common'
import { LOGIN } from '../graphql/operations'
import { describeError } from '../lib/errors'
import { DEFAULT_SERVER, deviceName, isNative, serverLabel, serverUrl, setServerUrl, setToken } from '../lib/platform'
import { useSiteConfig } from '../me'

/** Apps only: which server to use (øl.cer06.no by default; the LAN address works too). */
export function ServerSetting() {
  const { t } = useTranslation()
  const client = useApolloClient()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(serverUrl())
  const [error, setError] = useState<string | null>(null)
  if (!isNative) return null

  const save = async () => {
    try {
      await setServerUrl(value)
      setValue(serverUrl())
      setError(null)
      setOpen(false)
      await client.resetStore()
    } catch {
      setError(t('auth.badServer'))
    }
  }

  return (
    <Stack gap={4}>
      <Button variant="subtle" size="compact-sm" leftSection={<IconServer size={14} />} onClick={() => setOpen((o) => !o)}>
        {t('auth.server', { server: serverLabel() })}
      </Button>
      <Collapse expanded={open}>
        <Stack gap="xs">
          <TextInput
            label={t('auth.serverLabel')}
            description={t('auth.serverHint')}
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="url"
            error={error}
          />
          <Group grow>
            <Button variant="default" onClick={() => setValue(DEFAULT_SERVER)}>
              {t('auth.serverDefault')}
            </Button>
            <Button onClick={() => void save()}>{t('common.save')}</Button>
          </Group>
        </Stack>
      </Collapse>
    </Stack>
  )
}

export function LoginPage() {
  const { t } = useTranslation()
  const client = useApolloClient()
  const config = useSiteConfig()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [login, { loading, error }] = useMutation(LOGIN)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const { data } = await login({ variables: { username, password, device: isNative ? deviceName() : null } })
      if (isNative && data?.login.token) await setToken(data.login.token)
      // Re-runs `me`; the router then sends the user on.
      await client.resetStore()
    } catch {
      // Shown via `error` below.
    }
  }

  return (
    <AuthCard title={t('auth.loginTitle')}>
      <form onSubmit={(e) => void onSubmit(e)}>
        <Stack>
          {error && <Alert color="red">{describeError(error, t)}</Alert>}
          <TextInput
            label={t('common.username')}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            required
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
          />
          <PasswordInput
            label={t('common.password')}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
          <Button type="submit" loading={loading} size="md">
            {t('auth.login')}
          </Button>
          <Anchor component={Link} to="/forgot-password" size="sm" ta="center">
            {t('auth.forgotPassword')}
          </Anchor>
          {config?.allowSignup && (
            <Text size="sm" ta="center">
              {t('auth.noAccount')}{' '}
              <Anchor component={Link} to="/signup">
                {t('auth.signupLink')}
              </Anchor>
            </Text>
          )}
          {config?.publicView && (
            <Anchor component={Link} to="/" size="sm" ta="center">
              {t('auth.browse')}
            </Anchor>
          )}
          <ServerSetting />
        </Stack>
      </form>
    </AuthCard>
  )
}
