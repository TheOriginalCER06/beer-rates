import { useState } from 'react'
import { useAuth } from '../AuthContext'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import PasswordInput from './PasswordInput'

export default function LoginPage() {
  const { login }       = useAuth()
  const [u, setU]       = useState('')
  const [p, setP]       = useState('')
  const [err, setErr]   = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try { await login(u, p) }
    catch (ex) { setErr(ex.message) }
    finally { setBusy(false) }
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Box sx={{ width: '100%', maxWidth: 380 }}>
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography variant="body2" color="text.secondary" mt={0.5}>Sign in to continue</Typography>
        </Box>

        <Paper sx={{ p: 3.5, borderRadius: 4 }}>
          <form onSubmit={submit}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField label="Username" autoComplete="username" autoFocus required fullWidth value={u} onChange={(e) => setU(e.target.value)} />
              <PasswordInput label="Password" autoComplete="current-password" required fullWidth value={p} onChange={(e) => setP(e.target.value)} />
              {err && <Alert severity="error" variant="outlined" sx={{ py: 0.5 }}>{err}</Alert>}
              <Button type="submit" variant="contained" size="large" fullWidth disabled={busy} sx={{ mt: 0.5, py: 1.2, fontWeight: 700 }}>
                {busy ? <CircularProgress size={22} color="inherit" /> : 'Sign In'}
              </Button>
            </Box>
          </form>
        </Paper>

        {/* <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'center', mt: 3 }}>
          First time? Check Docker logs or /app/data/admin-password.txt
        </Typography> */}
      </Box>
    </Box>
  )
}
