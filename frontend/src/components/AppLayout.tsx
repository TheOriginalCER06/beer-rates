import {
  ActionIcon,
  Alert,
  AppShell,
  Button,
  Group,
  Title,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import {
  IconCalendar,
  IconChartBar,
  IconCloudOff,
  IconGlass,
  IconLogin,
  IconMoon,
  IconPlus,
  IconShieldCog,
  IconSun,
  IconUser,
} from '@tabler/icons-react'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useOnline } from '../lib/offline'
import { canAdd, useMe } from '../me'
import { Logo } from './Logo'
import { OutboxBanner } from './OutboxBanner'
import { PageLoader } from './PageLoader'
import { VersionFooter } from './Common'

export function ColorSchemeToggle() {
  const { t } = useTranslation()
  const { setColorScheme } = useMantineColorScheme()
  const computed = useComputedColorScheme('light')
  return (
    <Tooltip label={t('nav.toggleColorScheme')}>
      <ActionIcon
        variant="subtle"
        color="gray.0"
        size="lg"
        aria-label={t('nav.toggleColorScheme')}
        onClick={() => setColorScheme(computed === 'dark' ? 'light' : 'dark')}
      >
        {computed === 'dark' ? <IconSun size={20} /> : <IconMoon size={20} />}
      </ActionIcon>
    </Tooltip>
  )
}

export function AppLayout() {
  const { t } = useTranslation()
  const me = useMe()
  const online = useOnline()
  const location = useLocation()
  const desktop = useMediaQuery('(min-width: 48em)', true)
  const adding = canAdd(me)

  const links = [
    { to: '/', label: t('nav.drinks'), icon: IconGlass },
    { to: '/calendar', label: t('nav.calendar'), icon: IconCalendar },
    { to: '/stats', label: t('nav.stats'), icon: IconChartBar },
    ...(me ? [{ to: '/profile', label: t('nav.profile'), icon: IconUser }] : []),
    ...(me?.isAdmin ? [{ to: '/manage', label: t('nav.admin'), icon: IconShieldCog }] : []),
  ]
  const active = (to: string) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to))

  return (
    <AppShell header={{ height: 56 }} padding={0}>
      <AppShell.Header
        className="app-header"
        bg="stout.9"
        style={{ borderBottom: '3px solid var(--mantine-color-beer-5)', height: 'calc(56px + var(--safe-top))' }}
      >
        <Group h={56} px="md" justify="space-between" wrap="nowrap">
          <Group wrap="nowrap" gap="sm">
            <Link to="/" style={{ textDecoration: 'none' }}>
              <Group gap={8} wrap="nowrap">
                <Logo size={34} />
                <Title order={4} c="beer.4">
                  {t('app.title')}
                </Title>
              </Group>
            </Link>
            {desktop && (
              <Group gap={4} ml="md" wrap="nowrap">
                {links.map((link) => (
                  <Button
                    key={link.to}
                    component={NavLink}
                    to={link.to}
                    variant={active(link.to) ? 'filled' : 'subtle'}
                    color={active(link.to) ? 'beer' : 'gray.0'}
                    leftSection={<link.icon size={16} />}
                  >
                    {link.label}
                  </Button>
                ))}
              </Group>
            )}
          </Group>
          <Group gap="xs" wrap="nowrap">
            {desktop && adding && (
              <Button component={Link} to="/add" leftSection={<IconPlus size={16} />}>
                {t('nav.add')}
              </Button>
            )}
            <ColorSchemeToggle />
            {!me && (
              <Button component={Link} to="/login" size="xs" variant="white" color="stout" leftSection={<IconLogin size={14} />}>
                {t('auth.login')}
              </Button>
            )}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main
        className={desktop ? 'app-main' : 'app-main with-tabbar'}
        style={{ paddingTop: 'calc(56px + var(--safe-top) + var(--mantine-spacing-md))' }}
      >
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          {!online && (
            <Alert color="gray" variant="light" mb="md" icon={<IconCloudOff size={18} />}>
              {t('offline.banner')}
            </Alert>
          )}
          {me && <OutboxBanner />}
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
          <VersionFooter />
        </div>
      </AppShell.Main>

      {!desktop && (
        <nav className="tabbar" aria-label={t('nav.menu')}>
          <NavLink to="/" end>
            <IconGlass size={22} />
            {t('nav.drinks')}
          </NavLink>
          <NavLink to="/calendar">
            <IconCalendar size={22} />
            {t('nav.calendar')}
          </NavLink>
          {adding && (
            <NavLink to="/add" className="add" aria-label={t('nav.add')}>
              <span className="fab">
                <IconPlus size={28} stroke={2.5} />
              </span>
            </NavLink>
          )}
          <NavLink to="/stats">
            <IconChartBar size={22} />
            {t('nav.stats')}
          </NavLink>
          {me ? (
            <NavLink to="/profile">
              <IconUser size={22} />
              {t('nav.profile')}
            </NavLink>
          ) : (
            <NavLink to="/login">
              <IconLogin size={22} />
              {t('auth.login')}
            </NavLink>
          )}
        </nav>
      )}
    </AppShell>
  )
}
