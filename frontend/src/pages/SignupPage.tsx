import { useApolloClient, useMutation } from '@apollo/client/react'
import { Alert, Anchor, Button, PasswordInput, Stack, Text, TextInput } from '@mantine/core'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router'
import { AuthCard } from '../components/Common'
import { SIGNUP, type Language } from '../graphql/operations'
import { currentLanguage } from '../i18n'
import { describeError } from '../lib/errors'
import { deviceName, isNative, setToken } from '../lib/platform'
import { useSiteConfig } from '../me'
import { ServerSetting } from './LoginPage'

export function SignupPage() {
  const { t } = useTranslation()
  const client = useApolloClient()
  const config = useSiteConfig()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signup, { loading, error }] = useMutation(SIGNUP)

  if (config && !config.allowSignup) return <Navigate to="/login" replace />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const { data } = await signup({
        variables: {
          username,
          email,
          password,
          language: currentLanguage().toUpperCase() as Language,
          device: isNative ? deviceName() : null,
        },
      })
      if (isNative && data?.signup.token) await setToken(data.signup.token)
      await client.resetStore()
    } catch {
      // Shown via `error` below.
    }
  }

  return (
    <AuthCard title={t('auth.signupTitle')}>
      <form onSubmit={(e) => void onSubmit(e)}>
        <Stack>
          {config?.requireApproval && <Text size="sm" c="dimmed">{t('auth.approvalNote')}</Text>}
          {error && <Alert color="red">{describeError(error, t)}</Alert>}
          <TextInput label={t('common.username')} autoComplete="username" autoCapitalize="none" autoCorrect="off" required value={username} onChange={(e) => setUsername(e.currentTarget.value)} />
          <TextInput label={t('common.email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
          <PasswordInput label={t('common.password')} description={t('auth.passwordRules')} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
          <Button type="submit" loading={loading} size="md">
            {t('auth.signup')}
          </Button>
          <Text size="sm" ta="center">
            {t('auth.haveAccount')}{' '}
            <Anchor component={Link} to="/login">
              {t('auth.login')}
            </Anchor>
          </Text>
          <ServerSetting />
        </Stack>
      </form>
    </AuthCard>
  )
}
