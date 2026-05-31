import { createTheme, alpha } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#f59e0b',      // amber-400
      light: '#fbbf24',
      dark: '#d97706',
      contrastText: '#000',
    },
    secondary: {
      main: '#818cf8',      // indigo-400
      contrastText: '#000',
    },
    background: {
      default: '#030712',   // near-black
      paper: '#0f172a',     // slate-900
    },
    text: {
      primary: '#f1f5f9',
      secondary: '#94a3b8',
      disabled: '#475569',
    },
    divider: alpha('#ffffff', 0.07),
    error:   { main: '#f87171' },
    warning: { main: '#fbbf24' },
    success: { main: '#34d399' },
    info:    { main: '#38bdf8' },
    // Custom surface tokens accessible via theme.palette.surface
    surface: {
      1: '#0f172a',
      2: '#1e293b',
      3: '#334155',
    },
  },

  shape: { borderRadius: 12 },

  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 800 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 700 },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 500 },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { background: '#030712' },
      },
    },

    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          background: '#0f172a',
          borderBottom: `1px solid ${alpha('#ffffff', 0.07)}`,
        },
      },
    },

    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${alpha('#ffffff', 0.07)}`,
        },
        rounded: { borderRadius: 16 },
      },
    },

    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${alpha('#ffffff', 0.07)}`,
          transition: 'border-color 200ms ease, transform 150ms ease, box-shadow 200ms ease',
          '&:hover': {
            borderColor: alpha('#f59e0b', 0.35),
            boxShadow: `0 0 0 1px ${alpha('#f59e0b', 0.12)}, 0 4px 24px ${alpha('#000', 0.4)}`,
          },
        },
      },
    },

    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          textTransform: 'none',
          fontWeight: 600,
        },
        containedPrimary: {
          '&:hover': { backgroundColor: '#fbbf24' },
        },
        outlinedPrimary: {
          borderColor: alpha('#f59e0b', 0.4),
          '&:hover': { borderColor: '#f59e0b', background: alpha('#f59e0b', 0.08) },
        },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          '&:hover': { background: alpha('#ffffff', 0.08) },
        },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          background: alpha('#ffffff', 0.03),
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha('#ffffff', 0.12),
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: alpha('#ffffff', 0.25),
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#f59e0b',
            borderWidth: 1.5,
          },
        },
        input: {
          '&:-webkit-autofill': {
            WebkitBoxShadow: '0 0 0 100px #1e293b inset',
            WebkitTextFillColor: '#f1f5f9',
          },
        },
      },
    },

    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: '#94a3b8',
          '&.Mui-focused': { color: '#f59e0b' },
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 500 },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          background: '#0f172a',
          border: `1px solid ${alpha('#ffffff', 0.1)}`,
          borderRadius: 20,
        },
      },
    },

    MuiDialogTitle: {
      styleOverrides: {
        root: { fontWeight: 700, fontSize: '1.1rem' },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: alpha('#ffffff', 0.06) },
        head: { fontWeight: 600, color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' },
      },
    },

    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:last-child td': { border: 0 },
          '&:hover': { background: alpha('#ffffff', 0.02) },
        },
      },
    },

    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderRadius: '20px !important',
          border: `1px solid ${alpha('#ffffff', 0.1)} !important`,
          textTransform: 'none',
          fontWeight: 500,
          color: '#94a3b8',
          padding: '4px 14px',
          '&.Mui-selected': {
            background: '#f59e0b',
            color: '#000',
            fontWeight: 600,
            '&:hover': { background: '#fbbf24' },
          },
          '&:hover': { background: alpha('#ffffff', 0.06) },
        },
      },
    },

    MuiToggleButtonGroup: {
      styleOverrides: {
        root: { gap: 6, flexWrap: 'wrap' },
        grouped: {
          '&:not(:first-of-type)': { marginLeft: 0 },
        },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 4, height: 6 },
      },
    },

    MuiSkeleton: {
      defaultProps: { animation: 'wave' },
      styleOverrides: {
        root: { background: alpha('#ffffff', 0.06), borderRadius: 10 },
      },
    },

    MuiFab: {
      styleOverrides: {
        root: {
          background: '#f59e0b',
          color: '#000',
          fontWeight: 700,
          '&:hover': { background: '#fbbf24' },
          boxShadow: `0 4px 24px ${alpha('#f59e0b', 0.4)}`,
        },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 10 },
      },
    },

    MuiDivider: {
      styleOverrides: {
        root: { borderColor: alpha('#ffffff', 0.07) },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          background: '#0f172a',
          border: 'none',
          borderRight: `1px solid ${alpha('#ffffff', 0.07)}`,
        },
      },
    },

    MuiSwitch: {
      styleOverrides: {
        root: {
          '& .MuiSwitch-switchBase.Mui-checked': {
            color: '#f59e0b',
            '& + .MuiSwitch-track': { background: '#f59e0b', opacity: 0.5 },
          },
        },
      },
    },

    MuiSelect: {
      styleOverrides: {
        icon: { color: '#94a3b8' },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '2px 4px',
          '&:hover': { background: alpha('#ffffff', 0.06) },
          '&.Mui-selected': {
            background: alpha('#f59e0b', 0.15),
            '&:hover': { background: alpha('#f59e0b', 0.2) },
          },
        },
      },
    },

    MuiMenu: {
      styleOverrides: {
        paper: {
          background: '#1e293b',
          border: `1px solid ${alpha('#ffffff', 0.1)}`,
          borderRadius: 12,
          boxShadow: `0 8px 32px ${alpha('#000', 0.5)}`,
        },
        list: { padding: '4px' },
      },
    },
  },
});

export default theme;
