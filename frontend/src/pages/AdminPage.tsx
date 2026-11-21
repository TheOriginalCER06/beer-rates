import { useMutation, useQuery } from '@apollo/client/react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  Menu,
  Modal,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { IconDots, IconUserPlus } from '@tabler/icons-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { Section } from '../components/Common'
import {
  ADMIN_SETTINGS,
  ADMIN_USERS,
  APPROVE_USER,
  CREATE_USER,
  DELETE_USER,
  REJECT_USER,
  SET_USER_PASSWORD,
  UPDATE_SITE_SETTINGS,
  UPDATE_USER,
  type Role,
  type SiteSettings,
  type User,
} from '../graphql/operations'
import { useNotifyError, useNotifySuccess } from '../hooks'
import { describeError } from '../lib/errors'
import { formatDateTime, formatDay } from '../lib/format'
import { useUser } from '../me'

const ROLES: Role[] = ['ADMIN', 'CONTRIBUTOR', 'VIEWER']

function UserCard({ user, onPassword, onDelete }: { user: User; onPassword: () => void; onDelete: () => void }) {
  const { t } = useTranslation()
  const me = useUser()
  const notifyError = useNotifyError()
  const [updateUser] = useMutation(UPDATE_USER)
  const [approve, approving] = useMutation(APPROVE_USER)
  const [reject] = useMutation(REJECT_USER, { refetchQueries: [ADMIN_USERS] })
  const self = user.id === me.id
  return (
    <Card withBorder padding="sm">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text fw={700}>
              {user.username} {self && <Badge size="xs">{t('admin.you')}</Badge>}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {user.email || t('admin.noEmail')} · {t('admin.drinks', { count: user.drinkCount ?? 0 })} ·{' '}
              {formatDay(user.dateJoined.slice(0, 10))}
            </Text>
          </Stack>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button variant="subtle" size="compact-md" aria-label={t('admin.actions')}>
                <IconDots size={18} />
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={onPassword}>{t('admin.setPassword')}</Menu.Item>
              {!self && (
                <Menu.Item onClick={() => void updateUser({ variables: { id: user.id, isActive: !user.isActive } }).catch(notifyError)}>
                  {user.isActive ? t('admin.deactivate') : t('admin.activate')}
                </Menu.Item>
              )}
              {!self && (
                <Menu.Item color="red" onClick={onDelete}>
                  {t('admin.delete')}
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        </Group>
        <Group gap="xs">
          {!user.isApproved && <Badge color="orange">{t('admin.pending')}</Badge>}
          {!user.isActive && <Badge color="gray">{t('admin.inactive')}</Badge>}
          {user.isSuperuser && <Badge color="grape">superuser</Badge>}
        </Group>
        {!user.isApproved ? (
          <Group grow>
            <Button size="xs" color="green" loading={approving.loading} onClick={() => void approve({ variables: { id: user.id } }).catch(notifyError)}>
              {t('admin.approve')}
            </Button>
            <Button size="xs" color="red" variant="light" onClick={() => void reject({ variables: { id: user.id } }).catch(notifyError)}>
              {t('admin.reject')}
            </Button>
          </Group>
        ) : (
          <Select
            size="sm"
            data={ROLES.map((r) => ({ value: r, label: t(`role.${r}`) }))}
            value={user.role}
            disabled={user.isSuperuser || self}
            allowDeselect={false}
            onChange={(role) => role && void updateUser({ variables: { id: user.id, role: role as Role } }).catch(notifyError)}
          />
        )}
      </Stack>
    </Card>
  )
}

function UsersTab() {
  const { t } = useTranslation()
  const notifyError = useNotifyError()
  const notifySuccess = useNotifySuccess()
  const { data, loading, error } = useQuery(ADMIN_USERS, { fetchPolicy: 'cache-and-network' })
  const [createUser, creating] = useMutation(CREATE_USER, { refetchQueries: [ADMIN_USERS] })
  const [setPassword, settingPassword] = useMutation(SET_USER_PASSWORD)
  const [deleteUser, deleting] = useMutation(DELETE_USER, { refetchQueries: [ADMIN_USERS] })
  const [creatingOpen, setCreatingOpen] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', password: '', email: '', role: 'CONTRIBUTOR' as Role })
  const [passwordFor, setPasswordFor] = useState<User | null>(null)
  const [password, setPasswordValue] = useState('')
  const [deleteFor, setDeleteFor] = useState<User | null>(null)
  const [deleteDrinks, setDeleteDrinks] = useState(false)

  if (loading && !data) return <Loader />
  if (error && !data) return <Alert color="red">{describeError(error, t)}</Alert>
  const users = data?.users ?? []
  const pending = users.filter((u) => !u.isApproved)

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          {t('admin.userCount', { count: users.length })}
          {pending.length > 0 && ` · ${t('admin.pendingCount', { count: pending.length })}`}
        </Text>
        <Button size="xs" leftSection={<IconUserPlus size={14} />} onClick={() => setCreatingOpen(true)}>
          {t('admin.newUser')}
        </Button>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        {users.map((user) => (
          <UserCard key={user.id} user={user} onPassword={() => setPasswordFor(user)} onDelete={() => setDeleteFor(user)} />
        ))}
      </SimpleGrid>

      <Modal opened={creatingOpen} onClose={() => setCreatingOpen(false)} title={t('admin.newUser')}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void createUser({ variables: { ...newUser, email: newUser.email || null } })
              .then(() => {
                setCreatingOpen(false)
                setNewUser({ username: '', password: '', email: '', role: 'CONTRIBUTOR' })
              })
              .catch(notifyError)
          }}
        >
          <Stack>
            <TextInput label={t('common.username')} required value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.currentTarget.value })} autoCapitalize="none" />
            <TextInput label={t('common.email')} type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.currentTarget.value })} />
            <PasswordInput label={t('common.password')} required value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.currentTarget.value })} />
            <Select label={t('admin.role')} data={ROLES.map((r) => ({ value: r, label: t(`role.${r}`) }))} value={newUser.role} onChange={(r) => setNewUser({ ...newUser, role: (r as Role) ?? 'CONTRIBUTOR' })} allowDeselect={false} />
            <Button type="submit" loading={creating.loading}>
              {t('admin.create')}
            </Button>
          </Stack>
        </form>
      </Modal>

      <Modal opened={!!passwordFor} onClose={() => setPasswordFor(null)} title={t('admin.setPasswordFor', { name: passwordFor?.username })}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void setPassword({ variables: { id: passwordFor!.id, password } })
              .then(() => {
                setPasswordFor(null)
                setPasswordValue('')
                notifySuccess(t('admin.passwordSet'))
              })
              .catch(notifyError)
          }}
        >
          <Stack>
            <PasswordInput label={t('profile.newPassword')} required value={password} onChange={(e) => setPasswordValue(e.currentTarget.value)} />
            <Text size="xs" c="dimmed">
              {t('admin.passwordHint')}
            </Text>
            <Button type="submit" loading={settingPassword.loading}>
              {t('common.save')}
            </Button>
          </Stack>
        </form>
      </Modal>

      <Modal opened={!!deleteFor} onClose={() => setDeleteFor(null)} title={t('admin.deleteTitle', { name: deleteFor?.username })}>
        <Stack>
          <Text>{t('admin.deleteText')}</Text>
          <Checkbox label={t('admin.deleteDrinks', { count: deleteFor?.drinkCount ?? 0 })} checked={deleteDrinks} onChange={(e) => setDeleteDrinks(e.currentTarget.checked)} />
          <Group grow>
            <Button variant="default" onClick={() => setDeleteFor(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              color="red"
              loading={deleting.loading}
              onClick={() =>
                void deleteUser({ variables: { id: deleteFor!.id, deleteDrinks } })
                  .then(() => setDeleteFor(null))
                  .catch(notifyError)
              }
            >
              {t('common.delete')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}

function SettingsTab() {
  const { t } = useTranslation()
  const notifyError = useNotifyError()
  const { data, loading } = useQuery(ADMIN_SETTINGS, { fetchPolicy: 'cache-and-network' })
  const [update] = useMutation(UPDATE_SITE_SETTINGS)
  if (loading && !data) return <Loader />
  if (!data) return null
  const site = data.siteSettings
  const status = data.systemStatus
  const set = (input: Partial<SiteSettings>) => void update({ variables: { input } }).catch(notifyError)
  const toggle = (key: keyof SiteSettings, label: string, description?: string, disabled = false) => (
    <Switch
      label={label}
      description={description}
      checked={site[key] as boolean}
      disabled={disabled}
      onChange={(e) => set({ [key]: e.currentTarget.checked })}
    />
  )

  return (
    <Stack gap="md">
      <Section title={t('admin.access')}>
        <Stack gap="md">
          {toggle('publicView', t('admin.publicView'), t('admin.publicViewHint'))}
          {toggle('allowSignup', t('admin.allowSignup'), t('admin.allowSignupHint'))}
          {toggle('requireApproval', t('admin.requireApproval'), t('admin.requireApprovalHint'), !site.allowSignup)}
          <Select
            label={t('admin.defaultRole')}
            description={t('admin.defaultRoleHint')}
            data={ROLES.filter((r) => r !== 'ADMIN').map((r) => ({ value: r, label: t(`role.${r}`) }))}
            value={site.defaultRole}
            onChange={(r) => r && set({ defaultRole: r as Role })}
            allowDeselect={false}
          />
        </Stack>
      </Section>
      <Section title={t('admin.features')}>
        <Stack gap="md">
          {toggle('photoAi', t('admin.photoAi'), t('admin.photoAiHint'))}
          {toggle('lookupEnabled', t('admin.lookup'), t('admin.lookupHint'))}
          <Stack gap="xs" pl="md">
            {toggle('lookupOpenfoodfacts', 'Open Food Facts', t('admin.offHint'), !site.lookupEnabled)}
            {toggle('lookupOpenbrewerydb', 'OpenBreweryDB', t('admin.obdbHint'), !site.lookupEnabled)}
            {toggle('lookupThecocktaildb', 'TheCocktailDB', t('admin.cdbHint'), !site.lookupEnabled)}
            {toggle('lookupVivino', 'Vivino', t('admin.vivinoHint'), !site.lookupEnabled)}
          </Stack>
        </Stack>
      </Section>
      <Section title={t('admin.system')}>
        <SimpleGrid cols={2} spacing="xs">
          <Text size="sm">{t('admin.version')}</Text>
          <Text size="sm">v{status.version}</Text>
          <Text size="sm">{t('admin.worker')}</Text>
          <Text size="sm" c={status.workerHealthy ? 'green' : 'red'}>
            {status.workerHealthy ? t('admin.ok') : t('admin.down')}
            {status.workerLastSeen && ` · ${formatDateTime(status.workerLastSeen)}`}
          </Text>
          <Text size="sm">{t('admin.emails')}</Text>
          <Text size="sm">{t('admin.queue', { pending: status.emailsPending, failed: status.emailsFailed })}</Text>
          <Text size="sm">{t('admin.pushes')}</Text>
          <Text size="sm">{status.pushesPending}</Text>
          <Text size="sm">{t('admin.totals')}</Text>
          <Text size="sm">{t('admin.totalsValue', { users: status.users, drinks: status.drinks, photos: status.photos })}</Text>
          <Text size="sm">{t('admin.appLogins')}</Text>
          <Text size="sm">{status.appLogins}</Text>
        </SimpleGrid>
        <Button component="a" href="/admin/" target="_blank" variant="subtle" mt="sm" size="xs">
          {t('admin.djangoAdmin')}
        </Button>
      </Section>
    </Stack>
  )
}

export function AdminPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'users'
  return (
    <Stack gap="md">
      <Title order={2}>{t('nav.admin')}</Title>
      <Tabs value={tab} onChange={(v) => setParams(v === 'users' ? {} : { tab: v ?? 'users' }, { replace: true })}>
        <Tabs.List grow>
          <Tabs.Tab value="users">{t('admin.users')}</Tabs.Tab>
          <Tabs.Tab value="settings">{t('admin.settings')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="users" pt="md">
          <UsersTab />
        </Tabs.Panel>
        <Tabs.Panel value="settings" pt="md">
          <SettingsTab />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  )
}
