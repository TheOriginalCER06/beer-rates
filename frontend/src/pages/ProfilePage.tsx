import { useMutation, useQuery } from '@apollo/client/react'
import { Alert, Badge, Button, Group, PasswordInput, Stack, Switch, Text, TextInput, Title } from '@mantine/core'
import { IconBell, IconDownload, IconLogout, IconShieldCog } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { LanguageSwitcher, Section } from '../components/Common'
import {
  CHANGE_PASSWORD,
  PUSH_CONFIG,
  REGISTER_FCM,
  REGISTER_WEB_PUSH,
  SEND_TEST_PUSH,
  UNREGISTER_PUSH,
  UPDATE_NOTIFICATIONS,
  UPDATE_PROFILE,
  type User,
} from '../graphql/operations'
import { useLogout, useNotifyError, useNotifySuccess } from '../hooks'
import { downloadExport } from '../lib/download'
import { deviceName, isNative, serverLabel } from '../lib/platform'
import {
  currentWebSubscription,
  nativePushBuilt,
  needsHomeScreen,
  registerNative,
  subscribeWeb,
  unsubscribeWeb,
  webPushSupported,
} from '../lib/push'
import { useSiteConfig, useUser } from '../me'

function PushSection({ me }: { me: User }) {
  const { t } = useTranslation()
  const config = useSiteConfig()
  const notifyError = useNotifyError()
  const notifySuccess = useNotifySuccess()
  const { data, refetch } = useQuery(PUSH_CONFIG, { skip: !me.isApproved })
  const [registerWeb] = useMutation(REGISTER_WEB_PUSH)
  const [registerFcm] = useMutation(REGISTER_FCM)
  const [unregister] = useMutation(UNREGISTER_PUSH)
  const [sendTest, testing] = useMutation(SEND_TEST_PUSH)
  const [update] = useMutation(UPDATE_NOTIFICATIONS)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void currentWebSubscription().then((s) => setSubscribed(!!s))
  }, [])

  const nativeAvailable = nativePushBuilt && !!config?.pushFcm
  const available = isNative ? nativeAvailable : webPushSupported() && !needsHomeScreen()

  const enable = async () => {
    setBusy(true)
    try {
      if (isNative) {
        await registerFcm({ variables: { token: await registerNative(), device: deviceName() } })
      } else {
        const keys = await subscribeWeb(data!.pushConfig.publicKey)
        await registerWeb({ variables: keys })
      }
      setSubscribed(true)
      await refetch()
      notifySuccess(t('push.enabled'))
    } catch (error) {
      if (String(error).includes('denied')) notifyError(new Error(t('push.denied')))
      else notifyError(error)
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    const endpoint = await unsubscribeWeb()
    if (endpoint) await unregister({ variables: { endpoint } })
    setSubscribed(false)
    await refetch()
  }

  const toggle = (field: 'pushNewDrinks' | 'pushCheers' | 'pushAdminNewSignup' | 'emailAdminNewSignup', value: boolean) =>
    void update({ variables: { input: { [field]: value } } }).catch(notifyError)

  return (
    <Section title={t('push.title')} right={<Badge variant="light">{t('push.devices', { count: data?.pushConfig.devices ?? 0 })}</Badge>}>
      <Stack gap="sm">
        {!available && (
          <Alert color="gray" p="xs">
            {isNative ? t('push.nativeUnavailable') : needsHomeScreen() ? t('push.homeScreen') : t('push.unsupported')}
          </Alert>
        )}
        {available && (
          <Group>
            {subscribed && !isNative ? (
              <Button variant="default" onClick={() => void disable()}>
                {t('push.disable')}
              </Button>
            ) : (
              <Button leftSection={<IconBell size={16} />} onClick={() => void enable()} loading={busy} disabled={!data}>
                {t('push.enable')}
              </Button>
            )}
            {!!data?.pushConfig.devices && (
              <Button variant="subtle" loading={testing.loading} onClick={() => void sendTest().then((r) => notifySuccess(t('push.testSent', { count: r.data?.sendTestPush ?? 0 }))).catch(notifyError)}>
                {t('push.test')}
              </Button>
            )}
          </Group>
        )}
        <Switch label={t('push.cheers')} checked={me.pushCheers} onChange={(e) => toggle('pushCheers', e.currentTarget.checked)} />
        <Switch label={t('push.newDrinks')} checked={me.pushNewDrinks} onChange={(e) => toggle('pushNewDrinks', e.currentTarget.checked)} />
        {me.isAdmin && (
          <>
            <Switch label={t('push.adminSignup')} checked={me.pushAdminNewSignup} onChange={(e) => toggle('pushAdminNewSignup', e.currentTarget.checked)} />
            <Switch label={t('push.adminSignupEmail')} checked={me.emailAdminNewSignup} onChange={(e) => toggle('emailAdminNewSignup', e.currentTarget.checked)} />
          </>
        )}
      </Stack>
    </Section>
  )
}

export function ProfilePage() {
  const { t } = useTranslation()
  const me = useUser()
  const logout = useLogout()
  const notifyError = useNotifyError()
  const notifySuccess = useNotifySuccess()
  const [email, setEmail] = useState(me.email ?? '')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [updateProfile, savingProfile] = useMutation(UPDATE_PROFILE)
  const [changePassword, changing] = useMutation(CHANGE_PASSWORD)
  const [exporting, setExporting] = useState(false)

  const exportDrinks = async (format: 'csv' | 'xlsx', mine: boolean) => {
    setExporting(true)
    try {
      await downloadExport(format, mine ? me.id : null)
    } catch (error) {
      notifyError(error)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>{me.username}</Title>
        <Badge size="lg" variant="light">
          {t(`role.${me.role}`)}
        </Badge>
      </Group>
      {!me.isApproved && <Alert color="orange">{t('pending.text')}</Alert>}
      {me.isAdmin && (
        <Button component={Link} to="/manage" variant="light" leftSection={<IconShieldCog size={16} />}>
          {t('nav.admin')}
        </Button>
      )}

      <Section title={t('profile.settings')}>
        <Stack gap="sm">
          <Group justify="space-between">
            <Text>{t('common.language')}</Text>
            <LanguageSwitcher />
          </Group>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void updateProfile({ variables: { email } }).then(() => notifySuccess(t('common.saved'))).catch(notifyError)
            }}
          >
            <Group align="flex-end" wrap="nowrap">
              <TextInput
                style={{ flex: 1 }}
                label={t('common.email')}
                description={!me.email ? t('profile.addEmail') : undefined}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
              />
              <Button type="submit" loading={savingProfile.loading} disabled={email === (me.email ?? '')}>
                {t('common.save')}
              </Button>
            </Group>
          </form>
        </Stack>
      </Section>

      {me.isApproved && <PushSection me={me} />}

      <Section title={t('profile.password')}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void changePassword({ variables: { currentPassword: current, newPassword: next } })
              .then(() => {
                setCurrent('')
                setNext('')
                notifySuccess(t('profile.passwordChanged'))
              })
              .catch(notifyError)
          }}
        >
          <Stack gap="sm">
            <PasswordInput label={t('profile.currentPassword')} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.currentTarget.value)} required />
            <PasswordInput label={t('profile.newPassword')} autoComplete="new-password" value={next} onChange={(e) => setNext(e.currentTarget.value)} required minLength={8} />
            <Button type="submit" loading={changing.loading}>
              {t('profile.changePassword')}
            </Button>
          </Stack>
        </form>
      </Section>

      <Section title={t('profile.export')}>
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            {t('profile.exportHint')}
          </Text>
          <Group>
            <Button variant="light" leftSection={<IconDownload size={16} />} loading={exporting} onClick={() => void exportDrinks('xlsx', true)}>
              {t('profile.exportMine')} (Excel)
            </Button>
            <Button variant="subtle" loading={exporting} onClick={() => void exportDrinks('csv', true)}>
              CSV
            </Button>
            <Button variant="subtle" loading={exporting} onClick={() => void exportDrinks('xlsx', false)}>
              {t('profile.exportAll')}
            </Button>
          </Group>
        </Stack>
      </Section>

      {isNative && (
        <Text size="sm" c="dimmed">
          {t('profile.server', { server: serverLabel() })}
        </Text>
      )}
      <Button color="red" variant="light" leftSection={<IconLogout size={16} />} onClick={() => void logout()}>
        {t('nav.logout')}
      </Button>
    </Stack>
  )
}
