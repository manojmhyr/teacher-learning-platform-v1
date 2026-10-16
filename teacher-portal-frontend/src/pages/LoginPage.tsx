import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { isSessionConflict, useAuth } from '@/context/AuthContext';
import { LogoMark } from '@/components/common';
import { config, isLiveBackend } from '@/config/env';
import { serif, tokens } from '@/theme/theme';

/**
 * Phone keyboards capitalise, autocorrect and append a space after a
 * suggestion — all of which silently change a password, especially once it is
 * shown as plain text. Credentials are typed exactly as entered.
 */
const NO_AUTOFIX = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } as const;

export function LoginPage() {
  const { session, restoring, signIn, lastSignOutReason } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  /** Set when the account is already in use on another device. */
  const [conflict, setConflict] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  if (session && !restoring) return <Navigate to="/" replace />;

  const submit = async (force = false) => {
    setTouched(true);
    if (!identifier || !password) return;
    setLoading(true);
    setError('');
    setConflict(null);
    try {
      await signIn(identifier.trim(), password, { force });
      navigate('/', { replace: true });
    } catch (err) {
      if (isSessionConflict(err)) setConflict(err.message);
      else setError(err instanceof Error ? err.message : 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { md: '1.05fr 1fr' }, bgcolor: 'background.default' }}>
      {/* Chalkboard panel — hidden on phones */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          p: 6,
          bgcolor: tokens.chalkGreenDark,
          color: '#fff',
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ color: tokens.highlighter }}>
          <LogoMark size={34} />
          <Typography fontWeight={800} color="#fff" fontSize="1.1rem">
            {config.organisation}
          </Typography>
        </Stack>

        <Box>
          <Box aria-hidden sx={{ mb: 5 }}>
            <svg width="150" height="150" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="2" />
              <path d="M50 6 A44 44 0 1 1 6 50 Z" fill={tokens.highlighter} opacity="0.82" />
              <text x="50" y="58" textAnchor="middle" fontSize="22" fontWeight="700" fill="#17302A" fontFamily="sans-serif">
                ¾
              </text>
            </svg>
          </Box>
          <Typography variant="h3" sx={{ fontFamily: serif, fontWeight: 700, maxWidth: 420, lineHeight: 1.2 }}>
            Plan it, teach it, record what was covered.
          </Typography>
          <Typography sx={{ mt: 2, color: 'rgba(255,255,255,.72)', maxWidth: 440 }}>
            Lesson plans, classroom videos and teaching records for {config.organisation} staff, kept in one secure place.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'rgba(255,255,255,.55)' }}>
          <LockOutlinedIcon sx={{ fontSize: 16 }} />
          <Typography variant="caption">Internal system · Activity is logged for compliance</Typography>
        </Stack>
      </Box>

      {/* Form */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 3, sm: 6 } }}>
        <Box
          role="form"
          aria-label="Sign in"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading && (e.target as HTMLElement).tagName === 'INPUT') {
              e.preventDefault();
              void submit();
            }
          }}
          sx={{ width: '100%', maxWidth: 420 }}
        >
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ display: { md: 'none' }, mb: 4, color: 'primary.main' }}>
            <LogoMark />
            <Typography fontWeight={800} color="text.primary">
              {config.organisation}
            </Typography>
          </Stack>

          <Typography variant="overline" color="text.secondary">
            {config.appName}
          </Typography>
          <Typography variant="h4" sx={{ mb: 0.5 }}>
            Sign in
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Use your staff email or employee ID.
          </Typography>

          {lastSignOutReason === 'idle' && (
            <Alert severity="info" sx={{ mb: 2 }}>
              You were signed out after a period of inactivity to keep protected content secure.
            </Alert>
          )}
          {lastSignOutReason === 'expired' && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Your session ended — it expired, or your account was changed by an administrator. Please sign in again.
            </Alert>
          )}
          {lastSignOutReason === 'replaced' && !conflict && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              You were signed out because your account signed in on another device. If that was not you, sign in and change your
              password.
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {conflict && (
            <Alert severity="warning" sx={{ mb: 2 }} role="alertdialog" aria-label="Already signed in elsewhere">
              <Typography variant="body2" fontWeight={600} gutterBottom>
                Already signed in on another device
              </Typography>
              <Typography variant="body2" sx={{ mb: 1.5 }}>
                {conflict} Your account can be open on only one device at a time.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button variant="contained" color="warning" size="small" disabled={loading} onClick={() => void submit(true)}>
                  {loading ? 'Signing in…' : 'Sign out other device & sign in here'}
                </Button>
                <Button size="small" color="inherit" disabled={loading} onClick={() => setConflict(null)}>
                  Cancel
                </Button>
              </Stack>
            </Alert>
          )}

          <TextField
            label="Email or employee ID"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            error={touched && !identifier}
            helperText={touched && !identifier ? 'Enter your email or employee ID.' : ' '}
            autoComplete="username"
            inputProps={NO_AUTOFIX}
            fullWidth
          />
          <TextField
            label="Password"
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={touched && !password}
            helperText={
              touched && !password
                ? 'Enter your password.'
                : password !== password.trim()
                  ? 'Your password starts or ends with a space — check your keyboard did not add one.'
                  : ' '
            }
            autoComplete="current-password"
            inputProps={NO_AUTOFIX}
            fullWidth
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShow((s) => !s)} edge="end" aria-label={show ? 'Hide password' : 'Show password'}>
                    {show ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <Stack direction="row" alignItems="center" justifyContent="flex-end" sx={{ mb: 1 }}>
            <Link component="button" type="button" variant="body2" onClick={() => setForgotOpen(true)}>
              Forgot password?
            </Link>
          </Stack>

          <Button type="button" onClick={() => void submit()} variant="contained" size="large" fullWidth disabled={loading || Boolean(conflict)} sx={{ py: 1.4 }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>

          <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mt: 3, color: 'text.secondary' }}>
            <LockOutlinedIcon sx={{ fontSize: 15 }} />
            <Typography variant="caption">Secure access for authorized teaching staff only.</Typography>
          </Stack>

          {!isLiveBackend && (
            <Alert severity="info" variant="outlined" sx={{ mt: 3 }}>
              <Typography variant="body2" fontWeight={600}>
                Demo build
              </Typography>
              <Typography variant="caption" component="div">
                Two demo accounts — lesson content is served from built-in demo data.
              </Typography>
              <Typography variant="caption" component="div" sx={{ mt: 0.75, fontFamily: 'monospace' }}>
                Teacher · T1024 / teacher-demo-01
              </Typography>
              <Typography variant="caption" component="div" sx={{ fontFamily: 'monospace' }}>
                Admin · A1001 / admin-portal-01
              </Typography>
            </Alert>
          )}
        </Box>
      </Box>

      <Dialog open={forgotOpen} onClose={() => setForgotOpen(false)}>
        <DialogTitle>Forgot your password?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Teacher Portal accounts are managed by your school IT administrator. Contact the IT helpdesk to have your password reset — passwords
            cannot be reset from this screen.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForgotOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
