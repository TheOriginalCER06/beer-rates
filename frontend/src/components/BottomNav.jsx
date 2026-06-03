import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import Paper from '@mui/material/Paper'
import HomeRounded from '@mui/icons-material/HomeRounded'
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded'
import BarChartRounded from '@mui/icons-material/BarChartRounded'
import AddCircleRounded from '@mui/icons-material/AddCircleRounded'
import SettingsRounded from '@mui/icons-material/SettingsRounded'

const ROUTES = [
  { value: '/',         label: 'Drinks',   icon: <HomeRounded /> },
  { value: '/calendar', label: 'Calendar', icon: <CalendarMonthRounded /> },
  { value: '/add',      label: 'Add',      icon: <AddCircleRounded />, requireCreate: true },
  { value: '/stats',    label: 'Stats',    icon: <BarChartRounded /> },
  { value: '/settings', label: 'Settings', icon: <SettingsRounded />, requireAdmin: true },
]

export default function BottomNav() {
  const { pathname } = useLocation()
  const navigate     = useNavigate()
  const { user }     = useAuth()
  const canCreate    = Boolean(user && user.role !== 'viewer')
  const isAdmin      = user?.role === 'admin'

  // Resolve active tab — detail pages map to home
  const current = ROUTES.find(r => r.value === pathname)?.value
    || (pathname.startsWith('/drink/') || pathname.startsWith('/edit/') ? '/' : null)

  const visible = ROUTES.filter(r => {
    if (r.requireCreate && !canCreate) return false
    if (r.requireAdmin && !isAdmin) return false
    return true
  })

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1200,
        borderTop: '1px solid', borderColor: 'divider',
        borderRadius: 0,
        // Safe area for notched phones
        pb: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <BottomNavigation
        value={current}
        onChange={(_, newVal) => navigate(newVal)}
        showLabels
        sx={{
          bgcolor: 'background.paper',
          '& .MuiBottomNavigationAction-root': {
            color: 'text.disabled',
            minWidth: 56,
            py: 0.75,
            '&.Mui-selected': { color: 'primary.main' },
          },
          '& .MuiBottomNavigationAction-label': {
            fontSize: '0.62rem',
            '&.Mui-selected': { fontSize: '0.64rem', fontWeight: 600 },
          },
        }}
      >
        {visible.map(r => (
          <BottomNavigationAction key={r.value} value={r.value} label={r.label} icon={r.icon} />
        ))}
      </BottomNavigation>
    </Paper>
  )
}
