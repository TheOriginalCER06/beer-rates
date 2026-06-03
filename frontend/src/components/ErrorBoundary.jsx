import { Component } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import RefreshRounded from '@mui/icons-material/RefreshRounded'

/**
 * React error boundary — catches render errors in child components and shows
 * a recovery UI instead of a blank screen.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ textAlign: 'center', py: 10, px: 3 }}>
          <Typography sx={{ fontSize: 48, mb: 1 }}>😵</Typography>
          <Typography variant="h6" fontWeight={700} mb={1}>
            Something went wrong
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3} sx={{ maxWidth: 400, mx: 'auto' }}>
            An unexpected error occurred. Try refreshing the page.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<RefreshRounded />}
            onClick={this.handleRetry}
          >
            Try Again
          </Button>
        </Box>
      )
    }

    return this.props.children
  }
}
