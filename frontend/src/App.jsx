import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import { ToastProvider } from './ToastContext'
import Navbar       from './components/Navbar'
import BottomNav    from './components/BottomNav'
import LoginPage    from './components/LoginPage'
import DrinkList    from './components/DrinkList'
import DrinkForm    from './components/DrinkForm'
import DrinkDetail  from './components/DrinkDetail'
import CalendarView from './components/CalendarView'
import StatsView    from './components/StatsView'
import SettingsPage from './components/SettingsPage'
import ErrorBoundary from './components/ErrorBoundary'
import Box          from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'

/** Global keyboard shortcuts (must be inside BrowserRouter) */
function KeyboardShortcuts() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canCreate = Boolean(user && user.role !== 'viewer')

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'n' && canCreate) { e.preventDefault(); navigate('/add') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate, canCreate])

  return null
}

function AppContent() {
  const { user, publicView, loading } = useAuth()
  const canCreateDrinks = Boolean(user && user.role !== 'viewer')
  const theme  = useTheme()
  const mobile = useMediaQuery(theme.breakpoints.down('md'))

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
        <CircularProgress color="primary" />
      </Box>
    )
  }

  if (!user && !publicView) return <LoginPage />

  return (
    <BrowserRouter>
      <KeyboardShortcuts />
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <Navbar />
        <Box component="main" sx={{
          maxWidth: 900, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3,
          // Bottom padding on mobile so content isn't hidden behind BottomNav
          pb: mobile ? 10 : 3,
        }}>
          <ErrorBoundary>
          <Routes>
            <Route path="/"          element={<DrinkList />} />
            <Route path="/drink/:id" element={<DrinkDetail />} />
            <Route path="/calendar"  element={<CalendarView />} />
            <Route path="/stats"     element={<StatsView />} />
            <Route path="/add"       element={canCreateDrinks ? <DrinkForm /> : <Navigate to="/" replace />} />
            <Route path="/edit/:id"  element={canCreateDrinks ? <DrinkForm /> : <Navigate to="/" replace />} />
            <Route path="/settings"  element={user?.role === 'admin' ? <SettingsPage /> : <Navigate to="/" replace />} />
            <Route path="*"          element={<Navigate to="/" replace />} />
          </Routes>
          </ErrorBoundary>
        </Box>
        {mobile && <BottomNav />}
      </Box>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  )
}
