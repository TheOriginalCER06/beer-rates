import { useQuery } from '@apollo/client/react'
import { Alert, Button, Center, Loader, Stack } from '@mantine/core'
import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes, useNavigate } from 'react-router'
import { AppLayout } from './components/AppLayout'
import { PageLoader } from './components/PageLoader'
import { ME, SITE_CONFIG, type User } from './graphql/operations'
import i18n from './i18n'
import { onRestoredPhoto, setPendingPhoto } from './lib/camera'
import { describeError } from './lib/errors'
import { onNativeNotificationTap } from './lib/push'
import { canAdd, MeContext, SiteConfigContext } from './me'

// Each page is its own file, fetched the first time it's opened. The apps have them all built in.
const page = <T extends string>(load: () => Promise<Record<T, () => ReactNode>>, name: T) =>
  lazy(() => load().then((m) => ({ default: m[name] })))
const DrinksPage = page(() => import('./pages/DrinksPage'), 'DrinksPage')
const DrinkPage = page(() => import('./pages/DrinkPage'), 'DrinkPage')
const DrinkFormPage = page(() => import('./pages/DrinkFormPage'), 'DrinkFormPage')
const CalendarPage = page(() => import('./pages/CalendarPage'), 'CalendarPage')
const StatsPage = page(() => import('./pages/StatsPage'), 'StatsPage')
const ProfilePage = page(() => import('./pages/ProfilePage'), 'ProfilePage')
const AdminPage = page(() => import('./pages/AdminPage'), 'AdminPage')
const LoginPage = page(() => import('./pages/LoginPage'), 'LoginPage')
const SignupPage = page(() => import('./pages/SignupPage'), 'SignupPage')
const ForgotPasswordPage = page(() => import('./pages/ForgotPasswordPage'), 'ForgotPasswordPage')
const ResetPasswordPage = page(() => import('./pages/ResetPasswordPage'), 'ResetPasswordPage')
const PendingPage = page(() => import('./pages/PendingPage'), 'PendingPage')

function NeedsLogin({ me, children }: { me: User | null; children: ReactNode }) {
  return me ? children : <Navigate to="/login" replace />
}

/** Browsing needs a login only when public viewing is off. */
function Browse({ me, open, children }: { me: User | null; open: boolean; children: ReactNode }) {
  if (me?.isApproved || open) return children
  return <Navigate to={me ? '/pending' : '/login'} replace />
}

export default function App() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const meQuery = useQuery(ME)
  const configQuery = useQuery(SITE_CONFIG)
  const me = meQuery.data?.me ?? null
  const config = configQuery.data?.siteConfig ?? null
  const open = config?.publicView ?? false

  // The profile's language preference wins once logged in.
  useEffect(() => {
    const lng = me?.language.toLowerCase()
    if (lng && lng !== i18n.resolvedLanguage) void i18n.changeLanguage(lng)
  }, [me?.language])

  // Android app: a photo taken just before the system closed the app, and tapped notifications.
  useEffect(
    () =>
      onRestoredPhoto((photo) => {
        setPendingPhoto(photo)
        void navigate('/add')
      }),
    [navigate],
  )
  useEffect(() => onNativeNotificationTap((path) => void navigate(path)), [navigate])

  // Fetch the main pages' code in the background, so they open at once (and offline).
  useEffect(() => {
    const id = window.setTimeout(() => {
      void import('./pages/DrinkFormPage')
      void import('./pages/DrinkPage')
      void import('./pages/StatsPage')
      void import('./pages/CalendarPage')
    }, 2500)
    return () => window.clearTimeout(id)
  }, [])

  const loading = (meQuery.loading && !meQuery.data) || (configQuery.loading && !configQuery.data)
  if (loading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }

  const error = meQuery.error ?? configQuery.error
  if (error && !meQuery.data) {
    return (
      <Center h="100vh" p="md">
        <Stack align="center" maw={420}>
          <Alert color="red">{describeError(error, t)}</Alert>
          <Button
            onClick={() => {
              void meQuery.refetch()
              void configQuery.refetch()
            }}
          >
            {t('common.tryAgain')}
          </Button>
          <Button variant="subtle" onClick={() => void navigate('/login')}>
            {t('auth.changeServer')}
          </Button>
        </Stack>
      </Center>
    )
  }

  return (
    <SiteConfigContext.Provider value={config}>
      <MeContext.Provider value={me}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={me ? <Navigate to="/" replace /> : <LoginPage />} />
            <Route path="/signup" element={me ? <Navigate to="/" replace /> : <SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              path="/pending"
              element={!me ? <Navigate to="/login" replace /> : me.isApproved ? <Navigate to="/" replace /> : <PendingPage />}
            />
            <Route element={<AppLayout />}>
              <Route index element={<Browse me={me} open={open}><DrinksPage /></Browse>} />
              <Route path="drinks/:id" element={<Browse me={me} open={open}><DrinkPage /></Browse>} />
              <Route path="calendar" element={<Browse me={me} open={open}><CalendarPage /></Browse>} />
              <Route path="stats" element={<Browse me={me} open={open}><StatsPage /></Browse>} />
              <Route
                path="add"
                element={<NeedsLogin me={me}>{canAdd(me) ? <DrinkFormPage /> : <Navigate to="/pending" replace />}</NeedsLogin>}
              />
              <Route path="drinks/:id/edit" element={<NeedsLogin me={me}><DrinkFormPage /></NeedsLogin>} />
              <Route path="profile" element={<NeedsLogin me={me}><ProfilePage /></NeedsLogin>} />
              <Route path="manage" element={me?.isAdmin ? <AdminPage /> : <Navigate to="/" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </MeContext.Provider>
    </SiteConfigContext.Provider>
  )
}
