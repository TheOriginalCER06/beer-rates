import { createContext, useContext, useState, useCallback } from 'react'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [state, setState] = useState({ open: false, message: '', severity: 'success' })

  const toast = useCallback((message, severity = 'success') => {
    setState({ open: true, message, severity })
  }, [])

  const close = useCallback(() => {
    setState(s => ({ ...s, open: false }))
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <Snackbar
        open={state.open}
        autoHideDuration={3000}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={state.severity}
          variant="filled"
          onClose={close}
          sx={{ width: '100%', fontWeight: 600 }}
        >
          {state.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
