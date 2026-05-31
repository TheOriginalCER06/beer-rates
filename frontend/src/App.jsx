import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import Navbar       from './components/Navbar'
import LoginPage    from './components/LoginPage'
import DrinkList    from './components/DrinkList'
import DrinkForm    from './components/DrinkForm'
import DrinkDetail  from './components/DrinkDetail'
import CalendarView from './components/CalendarView'
import StatsView    from './components/StatsView'
import SettingsPage from './components/SettingsPage'
import Box          from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'

function AppContent() {
  const { user, publicView, loading } = useAuth()
  const canCreateDrinks = Boolean(user && user.role !== 'viewer')

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
        <CircularProgress color="primary" />
      </Box>
    )
  }

  // No session + public view is off → show ONLY the login prompt
  if (!user && !publicView) return <LoginPage />

  return (
    <BrowserRouter>
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <Navbar />
        <Box component="main" sx={{ maxWidth: 900, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}>
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
        </Box>
      </Box>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
