import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Divider from '@mui/material/Divider'
import Tooltip from '@mui/material/Tooltip'
import Avatar from '@mui/material/Avatar'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme, alpha } from '@mui/material/styles'
import MenuIcon from '@mui/icons-material/Menu'
import HomeRounded from '@mui/icons-material/HomeRounded'
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded'
import BarChartRounded from '@mui/icons-material/BarChartRounded'
import AddRounded from '@mui/icons-material/AddRounded'
import SettingsRounded from '@mui/icons-material/SettingsRounded'
import LogoutRounded from '@mui/icons-material/LogoutRounded'
import LoginRounded from '@mui/icons-material/LoginRounded'

const NAV = [
  { to: '/',         label: 'All Drinks', icon: <HomeRounded fontSize="small" /> },
  { to: '/calendar', label: 'Calendar',   icon: <CalendarMonthRounded fontSize="small" /> },
  { to: '/stats',    label: 'Stats',      icon: <BarChartRounded fontSize="small" /> },
]

export default function Navbar() {
  const { pathname }     = useLocation()
  const { user, logout } = useAuth()
  const canCreateDrinks  = Boolean(user && user.role !== 'viewer')
  const navigate         = useNavigate()
  const theme            = useTheme()
  const mobile           = useMediaQuery(theme.breakpoints.down('md'))
  const [drawerOpen, setDrawer] = useState(false)

  const active = (to) => to === '/' ? pathname === '/' : pathname.startsWith(to)

  const handleLogout = async () => { await logout(); setDrawer(false) }

  const navLinkSx = (to) => ({
    borderRadius: 2,
    px: 1.5,
    py: 0.75,
    fontWeight: active(to) ? 600 : 500,
    color: active(to) ? 'primary.main' : 'text.secondary',
    background: active(to) ? alpha('#f59e0b', 0.1) : 'transparent',
    '&:hover': { background: alpha('#ffffff', 0.06), color: 'text.primary' },
    transition: 'all 150ms',
    fontSize: '0.875rem',
  })

  const drawerContent = (
    <Box sx={{ width: 260, pt: 1 }}>
      <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main' }}>Beer Rates</Typography>
      </Box>
      <Divider />
      <List sx={{ px: 1, pt: 1 }}>
        {NAV.map(({ to, label, icon }) => (
          <ListItemButton
            key={to} component={Link} to={to}
            onClick={() => setDrawer(false)}
            selected={active(to)}
            sx={{ borderRadius: 2, mb: 0.5,
              '&.Mui-selected': { bgcolor: alpha('#f59e0b', 0.1), color: 'primary.main',
                '&:hover': { bgcolor: alpha('#f59e0b', 0.15) } } }}
          >
            <ListItemIcon sx={{ minWidth: 36, color: active(to) ? 'primary.main' : 'text.secondary' }}>
              {icon}
            </ListItemIcon>
            <ListItemText primary={label} primaryTypographyProps={{ fontWeight: active(to) ? 600 : 400, fontSize: '0.9rem' }} />
          </ListItemButton>
        ))}
        {canCreateDrinks && (
          <ListItemButton component={Link} to="/add" onClick={() => setDrawer(false)} selected={active('/add')}
            sx={{ borderRadius: 2, mb: 0.5,
              '&.Mui-selected': { bgcolor: alpha('#f59e0b', 0.1), color: 'primary.main' } }}
          >
            <ListItemIcon sx={{ minWidth: 36, color: active('/add') ? 'primary.main' : 'text.secondary' }}>
              <AddRounded fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Add Drink" primaryTypographyProps={{ fontWeight: 500, fontSize: '0.9rem' }} />
          </ListItemButton>
        )}
      </List>
      <Divider />
      <List sx={{ px: 1, pt: 1 }}>
        {user?.role === 'admin' && (
          <ListItemButton component={Link} to="/settings" onClick={() => setDrawer(false)} sx={{ borderRadius: 2, mb: 0.5 }}>
            <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}><SettingsRounded fontSize="small" /></ListItemIcon>
            <ListItemText primary="Settings" primaryTypographyProps={{ fontSize: '0.9rem' }} />
          </ListItemButton>
        )}
        {user ? (
          <ListItemButton onClick={handleLogout} sx={{ borderRadius: 2, color: 'error.main' }}>
            <ListItemIcon sx={{ minWidth: 36, color: 'error.main' }}><LogoutRounded fontSize="small" /></ListItemIcon>
            <ListItemText primary="Sign out" primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: 500 }} />
          </ListItemButton>
        ) : (
          <ListItemButton onClick={() => { navigate('/login'); setDrawer(false) }} sx={{ borderRadius: 2 }}>
            <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}><LoginRounded fontSize="small" /></ListItemIcon>
            <ListItemText primary="Sign in" primaryTypographyProps={{ fontSize: '0.9rem' }} />
          </ListItemButton>
        )}
      </List>
    </Box>
  )

  return (
    <>
      <AppBar position="sticky">
        <Toolbar sx={{ gap: 1, minHeight: { xs: 56, sm: 64 } }}>
          {mobile && (
            <IconButton edge="start" onClick={() => setDrawer(true)} sx={{ mr: 0.5 }}>
              <MenuIcon />
            </IconButton>
          )}

          <Typography component={Link} to="/" variant="h6"
            sx={{ fontWeight: 800, color: 'primary.main', textDecoration: 'none', flexShrink: 0, letterSpacing: '-0.02em' }}>
            🍺 Beer Rates
          </Typography>

          {!mobile && (
            <Box sx={{ display: 'flex', gap: 0.5, ml: 2, flex: 1 }}>
              {NAV.map(({ to, label }) => (
                <Button key={to} component={Link} to={to} sx={navLinkSx(to)} disableRipple={false}>
                  {label}
                </Button>
              ))}
              {canCreateDrinks && (
                <Button component={Link} to="/add" sx={navLinkSx('/add')}>+ Add</Button>
              )}
            </Box>
          )}

          <Box sx={{ flex: mobile ? 1 : 0 }} />

          {!mobile && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {user?.role === 'admin' && (
                <Tooltip title="Settings">
                  <IconButton component={Link} to="/settings" size="small"
                    sx={{ color: active('/settings') ? 'primary.main' : 'text.disabled' }}>
                    <SettingsRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {user ? (
                <>
                  <Tooltip title={user.username}>
                    <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.dark', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'default' }}>
                      {user.username[0].toUpperCase()}
                    </Avatar>
                  </Tooltip>
                  <Tooltip title="Sign out">
                    <IconButton onClick={handleLogout} size="small" sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
                      <LogoutRounded fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              ) : (
                <Button startIcon={<LoginRounded />} onClick={() => navigate('/login')} size="small" variant="outlined" color="primary">
                  Sign in
                </Button>
              )}
            </Box>
          )}
        </Toolbar>
      </AppBar>

      <Drawer anchor="left" open={drawerOpen} onClose={() => setDrawer(false)}>
        {drawerContent}
      </Drawer>
    </>
  )
}
