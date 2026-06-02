import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import PasswordInput from './PasswordInput'
import ConfirmDialog from './ConfirmDialog'
import { useAiSettings, setAiSetting } from '../utils/aiSettings'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import Divider from '@mui/material/Divider'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Avatar from '@mui/material/Avatar'
import EditRounded from '@mui/icons-material/EditRounded'
import LockResetRounded from '@mui/icons-material/LockResetRounded'
import DeleteRounded from '@mui/icons-material/DeleteRounded'
import PersonOffRounded from '@mui/icons-material/PersonOffRounded'
import PersonRounded from '@mui/icons-material/PersonRounded'
import LogoutRounded from '@mui/icons-material/LogoutRounded'

const SECTION_LABEL = { fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.disabled', display: 'block', mb: 1 }
const ROLE_STYLES = {
  admin: { bgcolor: 'rgba(245,158,11,0.12)', color: 'primary.main' },
  contributor: { bgcolor: 'rgba(16,185,129,0.12)', color: 'success.main' },
  viewer: { bgcolor: 'rgba(148,163,184,0.1)', color: 'text.secondary' },
}

export default function SettingsPage() {
  const { user, logout }  = useAuth()
  const ai                = useAiSettings()
  const [settings, setSettings] = useState(null)
  const [users, setUsers]       = useState([])
  const [snack, setSnack]       = useState({ open: false, msg: '', severity: 'success' })

  const [curPw, setCurPw]   = useState('')
  const [newPw, setNewPw]   = useState('')
  const [pwMsg, setPwMsg]   = useState({ ok: null, text: '' })

  const [addName, setAddName]   = useState('')
  const [addPw, setAddPw]       = useState('')
  const [addRole, setAddRole]   = useState('viewer')
  const [addMsg, setAddMsg]     = useState({ ok: null, text: '' })

  const [editDlg, setEditDlg]   = useState(null)
  const [editRole, setEditRole] = useState('')
  const [resetDlg, setResetDlg] = useState(null)
  const [resetPw, setResetPw]   = useState('')
  const [resetMsg, setResetMsg] = useState('')
  const [delDlg, setDelDlg]     = useState(null)
  const [toggleDlg, setToggleDlg] = useState(null)

  if (!user || user.role !== 'admin') return <Navigate to="/" replace />

  const toast = (msg, severity = 'success') => setSnack({ open: true, msg, severity })
  const reload = () => Promise.all([
    fetch('/api/settings').then(r => r.json()).then(setSettings),
    fetch('/api/auth/users').then(r => r.json()).then(setUsers),
  ])
  useEffect(() => { reload() }, [])

  const savePublicView = async (val) => {
    setSettings(s => ({ ...s, public_view: val ? 'true' : 'false' }))
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ public_view: val }) })
    toast(val ? 'Public view enabled' : 'Public view disabled')
  }

  // Generic boolean setting saver (used by the look-up provider toggles)
  const saveBool = async (key, val, label) => {
    setSettings(s => ({ ...s, [key]: val ? 'true' : 'false' }))
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: val }) })
    toast(`${label} ${val ? 'enabled' : 'disabled'}`)
  }
  const isOn = (key) => settings?.[key] === 'true'

  const changeOwnPw = async (e) => {
    e.preventDefault()
    const res = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: curPw, newPassword: newPw }) })
    const d = await res.json()
    if (res.ok) { setPwMsg({ ok: true, text: 'Password changed' }); setCurPw(''); setNewPw('') }
    else setPwMsg({ ok: false, text: d.error })
    setTimeout(() => setPwMsg({ ok: null, text: '' }), 3000)
  }

  const addUser = async (e) => {
    e.preventDefault()
    const res = await fetch('/api/auth/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: addName, password: addPw, role: addRole }) })
    const d = await res.json()
    if (res.ok) { setAddMsg({ ok: true, text: `User "${d.username}" created` }); setAddName(''); setAddPw(''); setAddRole('viewer'); reload() }
    else setAddMsg({ ok: false, text: d.error })
    setTimeout(() => setAddMsg({ ok: null, text: '' }), 3000)
  }

  const confirmToggle = async () => {
    await fetch(`/api/auth/users/${toggleDlg.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !toggleDlg.active }) })
    setToggleDlg(null); reload(); toast(`User ${toggleDlg.active ? 'deactivated' : 'activated'}`)
  }

  const saveEditRole = async () => {
    await fetch(`/api/auth/users/${editDlg.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: editRole }) })
    setEditDlg(null); reload(); toast('Role updated')
  }

  const doResetPw = async (e) => {
    e.preventDefault()
    const res = await fetch(`/api/auth/users/${resetDlg.id}/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newPassword: resetPw }) })
    if (res.ok) { setResetMsg('Password reset!'); setTimeout(() => { setResetDlg(null); setResetPw(''); setResetMsg('') }, 1200) }
    else { const d = await res.json(); setResetMsg(d.error) }
  }

  const confirmDelete = async () => {
    await fetch(`/api/auth/users/${delDlg.id}`, { method: 'DELETE' })
    setDelDlg(null); reload(); toast('User deleted')
  }

  return (
    <Box sx={{ maxWidth: 680, mx: 'auto' }}>
      <Typography variant="h5" fontWeight={700} mb={3}>Settings</Typography>

      {/* Access control */}
      <Paper sx={{ p: 3, borderRadius: 3, mb: 2.5 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={2}>Access Control</Typography>
        {settings ? (
          <FormControlLabel
            control={<Switch checked={settings.public_view === 'true'} onChange={e => savePublicView(e.target.checked)} color="primary" />}
            label={
              <Box>
                <Typography variant="body2" fontWeight={600}>Public View</Typography>
                <Typography variant="caption" color="text.secondary">Allow anyone to browse without logging in (read-only)</Typography>
              </Box>
            }
            sx={{ alignItems: 'flex-start', ml: 0 }}
          />
        ) : <Typography color="text.disabled" variant="body2">Loading…</Typography>}
      </Paper>

      {/* AI Detection */}
      <Paper sx={{ p: 3, borderRadius: 3, mb: 2.5 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={0.5}>AI Features</Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Automatic image analysis when uploading photos. These run entirely in your browser.
        </Typography>
        <Stack spacing={1}>
          <FormControlLabel
            control={<Switch checked={ai.smartDetection} onChange={e => setAiSetting('smartDetection', e.target.checked)} color="primary" />}
            label={
              <Box>
                <Typography variant="body2" fontWeight={600}>Automatic Drink Detection</Typography>
                <Typography variant="caption" color="text.secondary">
                  Detects drink type, brand, ABV and country from the photo, then auto-fills empty fields.
                </Typography>
                <Typography variant="caption" display="block" color="warning.main" sx={{ mt: 0.25 }}>
                  First use downloads AI models (~50&nbsp;MB), cached afterwards.
                </Typography>
              </Box>
            }
            sx={{ alignItems: 'flex-start', ml: 0 }}
          />
          <Divider flexItem />
          <FormControlLabel
            control={<Switch checked={ai.qualityWarnings} onChange={e => setAiSetting('qualityWarnings', e.target.checked)} color="primary" />}
            label={
              <Box>
                <Typography variant="body2" fontWeight={600}>Quality Warnings</Typography>
                <Typography variant="caption" color="text.secondary">
                  Warns you if a photo looks blurry or too dark.
                </Typography>
              </Box>
            }
            sx={{ alignItems: 'flex-start', ml: 0 }}
          />
          <Divider flexItem />
          <FormControlLabel
            control={<Switch checked={ai.autoEnhance} onChange={e => setAiSetting('autoEnhance', e.target.checked)} color="primary" />}
            label={
              <Box>
                <Typography variant="body2" fontWeight={600}>Auto-Rotation & Cropping</Typography>
                <Typography variant="caption" color="text.secondary">
                  Fixes photo orientation and crops large images to a 9:16 aspect ratio.
                </Typography>
              </Box>
            }
            sx={{ alignItems: 'flex-start', ml: 0 }}
          />
        </Stack>
      </Paper>

      {/* Online drink databases */}
      <Paper sx={{ p: 3, borderRadius: 3, mb: 2.5 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={0.5}>Online Drink Databases</Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Used by the “Look up online” search on the add/edit form. All are free and need no API key.
        </Typography>

        {/* Master switch */}
        <FormControlLabel
          control={<Switch checked={isOn('lookup_enabled')} onChange={e => saveBool('lookup_enabled', e.target.checked, 'Online look-ups')} color="primary" />}
          label={
            <Box>
              <Typography variant="body2" fontWeight={700}>Enable online look-ups</Typography>
              <Typography variant="caption" color="text.secondary">Master switch for all sources below</Typography>
            </Box>
          }
          sx={{ alignItems: 'flex-start', ml: 0 }}
        />

        <Divider sx={{ my: 1.5 }} />

        <Stack spacing={0.5} sx={{ opacity: isOn('lookup_enabled') ? 1 : 0.5, pointerEvents: isOn('lookup_enabled') ? 'auto' : 'none' }}>
          {[
            ['lookup_openbrewerydb', 'OpenBreweryDB', 'Beer — breweries & country'],
            ['lookup_thecocktaildb', 'TheCocktailDB', 'Cocktails — with photos & ingredients'],
            ['lookup_vivino',        'Vivino',        'Wine — producer, region, vintage, photos'],
            ['lookup_openfoodfacts', 'Open Food Facts', 'Packaged products — brands & photos'],
          ].map(([key, name, desc]) => (
            <FormControlLabel key={key}
              control={<Switch size="small" checked={isOn(key)} onChange={e => saveBool(key, e.target.checked, name)} color="primary" />}
              label={
                <Box>
                  <Typography variant="body2" fontWeight={600}>{name}</Typography>
                  <Typography variant="caption" color="text.secondary">{desc}</Typography>
                </Box>
              }
              sx={{ alignItems: 'flex-start', ml: 0 }}
            />
          ))}
        </Stack>
      </Paper>

      {/* Change own password */}
      <Paper sx={{ p: 3, borderRadius: 3, mb: 2.5 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={2}>Change Your Password</Typography>
        <form onSubmit={changeOwnPw}>
          <Stack spacing={2} sx={{ maxWidth: 360 }}>
            <PasswordInput label="Current password" required fullWidth value={curPw} onChange={e => setCurPw(e.target.value)} size="small" />
            <PasswordInput label="New password (min 8)" required fullWidth inputProps={{ minLength: 8 }} value={newPw} onChange={e => setNewPw(e.target.value)} size="small" />
            {pwMsg.text && <Alert severity={pwMsg.ok ? 'success' : 'error'} sx={{ py: 0.25 }}>{pwMsg.text}</Alert>}
            <Box><Button type="submit" variant="contained" size="small">Change Password</Button></Box>
          </Stack>
        </form>
      </Paper>

      {/* User management */}
      <Paper sx={{ p: 3, borderRadius: 3, mb: 2.5 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={2}>User Management</Typography>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Since</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map(u => {
                const isMe     = u.id === user.id
                const isAdmin  = u.username === 'local_admin'
                const roleStyle = ROLE_STYLES[u.role] || ROLE_STYLES.viewer
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ width: 26, height: 26, bgcolor: isAdmin ? 'primary.dark' : 'surface.2', fontSize: 12, color: isAdmin ? '#000' : 'text.secondary' }}>
                          {u.username[0].toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={600}>{u.username}</Typography>
                          {isMe && <Typography variant="caption" color="primary.main">you</Typography>}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={u.role} size="small"
                        sx={{ height: 20, fontSize: '0.68rem',
                          bgcolor: roleStyle.bgcolor,
                          color: roleStyle.color,
                          fontWeight: 600 }} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ color: u.active ? 'success.main' : 'error.main', fontWeight: 600 }}>
                        {u.active ? '● Active' : '○ Inactive'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.disabled">{new Date(u.created_at).toLocaleDateString()}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        {!isAdmin && !isMe && (
                          <Tooltip title={u.active ? 'Deactivate' : 'Activate'}>
                            <IconButton size="small" onClick={() => setToggleDlg(u)} sx={{ color: u.active ? 'warning.main' : 'success.main', opacity: 0.7 }}>
                              {u.active ? <PersonOffRounded fontSize="small" /> : <PersonRounded fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                        )}
                        {!isAdmin && (
                          <Tooltip title="Edit role">
                            <IconButton size="small" onClick={() => { setEditDlg(u); setEditRole(u.role) }} sx={{ color: 'text.secondary' }}>
                              <EditRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Reset password">
                          <IconButton size="small" onClick={() => { setResetDlg(u); setResetPw('') }} sx={{ color: 'text.secondary' }}>
                            <LockResetRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {!isAdmin && !isMe && (
                          <Tooltip title="Delete user">
                            <IconButton size="small" onClick={() => setDelDlg(u)} sx={{ color: 'error.main', opacity: 0.7 }}>
                              <DeleteRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <Divider sx={{ my: 2.5 }} />

        <Typography sx={SECTION_LABEL}>Add User</Typography>
        <form onSubmit={addUser}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} mb={1.5}>
            <TextField label="Username" required size="small" value={addName} onChange={e => setAddName(e.target.value)} sx={{ flex: 2 }} />
            <PasswordInput label="Password (min 8)" required size="small" inputProps={{ minLength: 8 }} value={addPw} onChange={e => setAddPw(e.target.value)} sx={{ flex: 2 }} />
            <TextField select label="Role" size="small" value={addRole} onChange={e => setAddRole(e.target.value)} sx={{ flex: 1 }}>
              <MenuItem value="viewer">Viewer</MenuItem>
              <MenuItem value="contributor">Contributor</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </TextField>
          </Stack>
          {addMsg.text && <Alert severity={addMsg.ok ? 'success' : 'error'} sx={{ py: 0.25, mb: 1.5 }}>{addMsg.text}</Alert>}
          <Button type="submit" variant="outlined" size="small">+ Create User</Button>
        </form>
      </Paper>

      {/* Sign out */}
      <Paper sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={1.5}>Session</Typography>
        <Button variant="outlined" color="error" startIcon={<LogoutRounded />} onClick={logout}>Sign out</Button>
      </Paper>

      {/* Edit role dialog */}
      <Dialog open={Boolean(editDlg)} onClose={() => setEditDlg(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit Role — {editDlg?.username}</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <TextField select fullWidth label="Role" value={editRole} onChange={e => setEditRole(e.target.value)} size="small">
            <MenuItem value="viewer">Viewer</MenuItem>
            <MenuItem value="contributor">Contributor</MenuItem>
            <MenuItem value="admin">Admin</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditDlg(null)} color="inherit">Cancel</Button>
          <Button onClick={saveEditRole} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={Boolean(resetDlg)} onClose={() => setResetDlg(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Reset Password — {resetDlg?.username}</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <form id="reset-form" onSubmit={doResetPw}>
            <PasswordInput label="New password (min 8)" required fullWidth autoFocus size="small"
              inputProps={{ minLength: 8 }} value={resetPw} onChange={e => setResetPw(e.target.value)} />
            {resetMsg && <Alert severity="success" sx={{ mt: 1.5, py: 0.25 }}>{resetMsg}</Alert>}
          </form>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setResetDlg(null)} color="inherit">Cancel</Button>
          <Button type="submit" form="reset-form" variant="contained">Set Password</Button>
        </DialogActions>
      </Dialog>

      {/* Toggle active confirm */}
      <ConfirmDialog
        open={Boolean(toggleDlg)}
        title={toggleDlg?.active ? 'Deactivate user?' : 'Activate user?'}
        message={`${toggleDlg?.active ? 'Deactivate' : 'Activate'} user "${toggleDlg?.username}"?`}
        onConfirm={confirmToggle}
        onCancel={() => setToggleDlg(null)}
        danger={toggleDlg?.active}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={Boolean(delDlg)}
        title="Delete user?"
        message={`Permanently delete "${delDlg?.username}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDelDlg(null)}
      />

      {/* Toast */}
      <Snackbar open={snack.open} autoHideDuration={3000} onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.severity} variant="filled" onClose={() => setSnack(s => ({ ...s, open: false }))} sx={{ width: '100%' }}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  )
}
