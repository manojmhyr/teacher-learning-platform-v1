import { Component, type ErrorInfo, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';

interface Props {
  children: ReactNode;
  /** Changing this value (the current route) clears a previous error. */
  resetKey?: string;
  onHome?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Catches rendering errors below it so one failing screen does not unmount the
 * whole app and leave a blank page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Replace with a reporting service (App Insights / Sentry) in production.
    console.error('Teacher Portal error:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <Box sx={{ minHeight: '60vh', display: 'grid', placeItems: 'center', p: 3 }}>
        <Paper variant="outlined" sx={{ p: 4, maxWidth: 520, width: '100%' }}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <ReportProblemOutlinedIcon color="warning" />
              <Typography variant="h6" fontWeight={700}>
                Something went wrong on this screen
              </Typography>
            </Stack>
            <Typography color="text.secondary">
              Your saved teaching records and highlights are safe. Try again, or go back to the dashboard.
            </Typography>
            <Typography component="pre" sx={{ m: 0, p: 1.5, borderRadius: 1, bgcolor: 'action.hover', fontSize: 12, whiteSpace: 'pre-wrap' }}>
              {error.message}
            </Typography>
            <Stack direction="row" spacing={1.5}>
              <Button variant="contained" onClick={() => this.setState({ error: null })}>
                Try again
              </Button>
              <Button
                onClick={() => {
                  this.props.onHome?.();
                  this.setState({ error: null });
                }}
              >
                Go to dashboard
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Box>
    );
  }
}
