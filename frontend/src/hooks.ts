import { useApolloClient, useMutation } from '@apollo/client/react'
import { notifications } from '@mantine/notifications'
import { useCallback, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { LOGOUT, UPDATE_PROFILE, type Language } from './graphql/operations'
import i18n, { type AppLanguage } from './i18n'
import { describeError } from './lib/errors'
import { forgetSaved } from './lib/offline'
import { isNative, setToken } from './lib/platform'
import { MeContext } from './me'

/** Shows any error as a red toast. */
export function useNotifyError() {
  const { t } = useTranslation()
  return useCallback(
    (error: unknown) => notifications.show({ color: 'red', message: describeError(error, t), autoClose: 8000 }),
    [t],
  )
}

export function useNotifySuccess() {
  return useCallback((message: string) => notifications.show({ color: 'green', message, autoClose: 3000 }), [])
}

export function useLogout() {
  const client = useApolloClient()
  const navigate = useNavigate()
  const [logout] = useMutation(LOGOUT)
  return async () => {
    try {
      await logout()
    } catch {
      // Offline: forget the login here anyway.
    }
    if (isNative) await setToken(null)
    // Drop everything cached for this user (also the offline copy), then re-run `me` (now null).
    forgetSaved()
    await client.resetStore()
    void navigate('/')
  }
}

/** Switch UI language, and persist it on the profile when logged in. */
export function useChangeLanguage() {
  const me = useContext(MeContext)
  const [updateProfile] = useMutation(UPDATE_PROFILE)
  return (lng: AppLanguage) => {
    void i18n.changeLanguage(lng)
    if (me) void updateProfile({ variables: { language: lng.toUpperCase() as Language } })
  }
}
