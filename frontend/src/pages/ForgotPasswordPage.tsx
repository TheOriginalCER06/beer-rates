import { useMutation } from '@apollo/client/react'
import { Alert, Anchor, Button, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { AuthCard } from '../components/Common'
import { REQUEST_PASSWORD_RESET } from '../graphql/operations'
import { describeError } from '../lib/errors'

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [send, { loading, error, data }] = useMutation(REQUEST_PASSWORD_RESET)
  return (
    <AuthCard title={t('auth.forgotTitle')}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send({ variables: { email } }).catch(() => undefined)
        }}
      >
        <Stack>
          {data ? (
            <Alert color="green">{t('auth.resetSent')}</Alert>
          ) : (
            <>
              <Text size="sm" c="dimmed">
                {t('auth.forgotText')}
              </Text>
              {error && <Alert color="red">{describeError(error, t)}</Alert>}
              <TextInput label={t('common.email')} type="email" required value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
              <Button type="submit" loading={loading}>
                {t('auth.sendReset')}
              </Button>
            </>
          )}
          <Anchor component={Link} to="/login" size="sm" ta="center">
            {t('auth.backToLogin')}
          </Anchor>
        </Stack>
      </form>
    </AuthCard>
  )
}
