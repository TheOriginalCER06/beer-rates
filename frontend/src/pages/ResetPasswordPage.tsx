import { useMutation } from '@apollo/client/react'
import { Alert, Anchor, Button, PasswordInput, Stack } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { AuthCard } from '../components/Common'
import { RESET_PASSWORD } from '../graphql/operations'
import { describeError } from '../lib/errors'

export function ResetPasswordPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const [password, setPassword] = useState('')
  const [reset, { loading, error, data }] = useMutation(RESET_PASSWORD)
  return (
    <AuthCard title={t('auth.resetTitle')}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void reset({
            variables: { uid: params.get('uid') ?? '', token: params.get('token') ?? '', newPassword: password },
          }).catch(() => undefined)
        }}
      >
        <Stack>
          {data ? (
            <Alert color="green">{t('auth.resetDone')}</Alert>
          ) : (
            <>
              {error && <Alert color="red">{describeError(error, t)}</Alert>}
              <PasswordInput label={t('profile.newPassword')} description={t('auth.passwordRules')} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
              <Button type="submit" loading={loading}>
                {t('common.save')}
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
