import { useQuery } from '@apollo/client/react'
import { Center, Group, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SITE_CONFIG } from '../graphql/operations'
import { useChangeLanguage } from '../hooks'
import { currentLanguage, type AppLanguage } from '../i18n'
import { isNative, serverLabel } from '../lib/platform'
import { ColorSchemeToggle } from './AppLayout'
import { Logo } from './Logo'

export function LanguageSwitcher() {
  const { t } = useTranslation()
  const changeLanguage = useChangeLanguage()
  return (
    <SegmentedControl
      size="xs"
      aria-label={t('common.language')}
      value={currentLanguage()}
      onChange={(value) => changeLanguage(value as AppLanguage)}
      data={[
        { value: 'nb', label: 'NB' },
        { value: 'en', label: 'EN' },
      ]}
    />
  )
}

/** App name and version (backend/pyproject.toml), and in the apps which server they use. */
export function VersionFooter() {
  const { t } = useTranslation()
  const { data } = useQuery(SITE_CONFIG)
  return (
    <Text size="xs" c="dimmed" ta="center" mt="xl">
      {t('app.title')}
      {data?.siteConfig.version && ` · v${data.siteConfig.version}`}
      {isNative && ` · ${serverLabel()}`}
    </Text>
  )
}

/** Centered card for login, signup and the other account pages. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <Center mih="100vh" p="md" style={{ paddingTop: 'calc(var(--safe-top) + 16px)', paddingBottom: 'calc(var(--safe-bottom) + 16px)' }}>
      <Stack w="100%" maw={420}>
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Logo size={44} background />
            <Text fw={800} size="xl" c="beer.7">
              {t('app.title')}
            </Text>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <LanguageSwitcher />
            <Paper bg="stout.9" radius="md">
              <ColorSchemeToggle />
            </Paper>
          </Group>
        </Group>
        <Paper withBorder shadow="sm" p="lg">
          <Title order={2} mb="lg">
            {title}
          </Title>
          {children}
        </Paper>
      </Stack>
    </Center>
  )
}

/** Heading for a block of a page. */
export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Title order={4}>{title}</Title>
        {right}
      </Group>
      {children}
    </Paper>
  )
}
