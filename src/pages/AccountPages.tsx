import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { useAuth } from '@/context/AuthContext';
import { usePlatform } from '@/context/PlatformContext';
import { useSecurity } from '@/context/SecurityContext';
import { useToast } from '@/context/ToastContext';
import { useScope } from '@/hooks/useScope';
import { contentProvider } from '@/services/content';
import { checkPasswordStrength } from '@/services/password';
import { config, isDemoContent, isLiveBackend } from '@/config/env';
import { EmptyState, PageHeader } from '@/components/common';
import { fmtDate } from '@/utils/format';

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

/** Phone keyboards must not capitalise or autocorrect a password. */
const NO_AUTOFIX = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } as const;

export function ProfilePage() {
  const { session } = useAuth();
  const { classes, subjects } = useScope();
  if (!session) return null;
  const u = session.user;

  return (
    <Box>
      <PageHeader title="Profile" crumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Profile' }]} />
      <Card variant="outlined">
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems={{ sm: 'center' }}>
            <Avatar sx={{ width: 76, height: 76, bgcolor: 'primary.main', fontSize: 26, fontWeight: 800 }}>{initials(u.fullName)}</Avatar>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h5" fontWeight={700}>
                  {u.fullName}
                </Typography>
                {u.role === 'ADMIN' && <Chip size="small" color="secondary" label="Administrator" />}
              </Stack>
              <Typography color="text.secondary">{u.title}</Typography>
              <Typography variant="body2" color="text.secondary">
                Employee ID {u.employeeId} · {u.email}
              </Typography>
            </Box>
          </Stack>

          <Divider sx={{ my: 3 }} />

          <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                My classes
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {classes.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    None assigned
                  </Typography>
                ) : (
                  classes.map((c) => <Chip key={c.id} label={c.name} component={RouterLink} to={`/classes/${c.id}`} clickable />)
                )}
              </Stack>
            </Box>
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                My subjects
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {subjects.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    None assigned
                  </Typography>
                ) : (
                  subjects.map((s) => <Chip key={s.id} label={s.name} variant="outlined" />)
                )}
              </Stack>
            </Box>
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
            Account created {fmtDate(u.createdAt)}
            {u.lastLoginAt ? ` · Last signed in ${fmtDate(u.lastLoginAt)}` : ''}. Your classes, subjects and profile details are managed by your
            administrator.
          </Typography>
        </CardContent>
      </Card>

      <ChangePasswordCard />
    </Box>
  );
}

/** Password change, reused by the forced-change screen. */
export function ChangePasswordCard({ forced = false }: { forced?: boolean }) {
  const { session, changePassword } = useAuth();
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const strength = checkPasswordStrength(next, session?.user.employeeId);
    const problems = [...strength.errors];
    if (next !== confirm) problems.push('The two new passwords do not match.');
    if (next === current) problems.push('Choose a password different from your current one.');
    setErrors(problems);
    if (problems.length) return;

    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      toast('Password changed.');
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Could not change the password.']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="outlined" sx={{ mt: forced ? 0 : 2.5 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {forced ? 'Set your password' : 'Change password'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {forced
            ? 'Your administrator gave you a temporary password. Choose your own before continuing.'
            : 'Use at least 10 characters. If you forget it, your administrator can issue a new temporary password.'}
        </Typography>

        <Stack spacing={2} sx={{ maxWidth: 420 }}>
          <TextField
            label={forced ? 'Temporary password' : 'Current password'}
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            inputProps={NO_AUTOFIX}
            fullWidth
          />
          <TextField label="New password" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" inputProps={NO_AUTOFIX} fullWidth />
          <TextField
            label="Confirm new password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            inputProps={NO_AUTOFIX}
            fullWidth
          />
          {errors.length > 0 && (
            <Alert severity="error">
              {errors.map((e) => (
                <div key={e}>{e}</div>
              ))}
            </Alert>
          )}
          <Button variant="contained" onClick={() => void submit()} disabled={busy || !current || !next}>
            {busy ? 'Saving…' : 'Update password'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const { colorPref, setColorPref, resetDemo } = usePlatform();
  const { protection, captureAttempts } = useSecurity();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [health, setHealth] = useState<{ ok: boolean; detail: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void contentProvider.healthCheck().then((h) => alive && setHealth(h));
    return () => {
      alive = false;
    };
  }, []);

  const levelLabel = {
    enforced: 'Enforced by the operating system',
    partial: 'Partially enforced',
    'deterrent-only': 'Deterrents only',
  }[protection.level];

  return (
    <Box>
      <PageHeader title="Settings" crumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Settings' }]} />

      <Stack spacing={2.5}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Appearance
            </Typography>
            <TextField select size="small" label="Theme" value={colorPref} onChange={(e) => setColorPref(e.target.value as 'light' | 'dark' | 'system')} sx={{ minWidth: 200 }}>
              <MenuItem value="system">Match system</MenuItem>
              <MenuItem value="light">Light</MenuItem>
              <MenuItem value="dark">Dark</MenuItem>
            </TextField>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <ShieldOutlinedIcon color="primary" />
              <Typography variant="h6">Content protection</Typography>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
              <Chip
                label={levelLabel}
                color={protection.level === 'enforced' ? 'success' : protection.level === 'partial' ? 'primary' : 'default'}
                icon={protection.level === 'enforced' ? <CheckCircleOutlineIcon /> : <ErrorOutlineIcon />}
              />
              <Chip label={`Platform: ${protection.platform}`} variant="outlined" />
              <Chip label={`Capture attempts this session: ${captureAttempts}`} variant="outlined" />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {protection.detail}
            </Typography>
            {protection.level !== 'enforced' && (
              <Alert severity="info" sx={{ mt: 2 }}>
                Screenshot blocking is enforced by the operating system only in the Android app. Install the mobile app for the strongest protection.
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Content source
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
              <Chip label={contentProvider.label} color={isDemoContent ? 'default' : 'primary'} icon={<LockOutlinedIcon />} />
              <Chip label={`Build ${config.buildId}`} variant="outlined" />
            </Stack>
            {health && (
              <Alert severity={health.ok ? 'success' : 'warning'} sx={{ mb: 1 }}>
                {health.detail}
              </Alert>
            )}
            {isDemoContent && (
              <Typography variant="body2" color="text.secondary">
                Set <code>VITE_CONTENT_SOURCE=azure</code> with the Azure values in <code>.env.local</code> to serve lesson plans from Azure Blob
                Storage. See <code>docs/AZURE_SETUP.md</code>.
              </Typography>
            )}
          </CardContent>
        </Card>

        <ChangePasswordCard />

        {!isLiveBackend && isAdmin && (
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Demo data
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Restores teachers, assignments, lessons, teaching records and highlights to their original state. Useful before a client
                presentation. Any accounts or lessons you created will be removed.
              </Typography>
              <Button
                variant="outlined"
                onClick={() => {
                  void resetDemo();
                  toast('Demo data reset.');
                }}
              >
                Reset demo data
              </Button>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Box>
  );
}

export function ForcedPasswordChangePage() {
  const { session } = useAuth();
  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', py: 4 }}>
      <Alert severity="warning" sx={{ mb: 2 }}>
        Welcome{session ? `, ${session.user.fullName.split(' ')[0]}` : ''}. You must set your own password before using the portal.
      </Alert>
      <ChangePasswordCard forced />
    </Box>
  );
}

export function NotFoundPage() {
  return (
    <EmptyState
      title="Not available"
      description="This page does not exist, or it covers a class or subject you are not assigned to."
      action={
        <Button component={RouterLink} to="/" variant="contained">
          Back to dashboard
        </Button>
      }
    />
  );
}

/** Shown when a teacher reaches an admin-only route. */
export function ForbiddenPage() {
  return (
    <EmptyState
      title="Administrators only"
      description="This area is restricted to portal administrators. If you need something changed, contact your administrator."
      action={
        <Button component={RouterLink} to="/" variant="contained">
          Back to dashboard
        </Button>
      }
    />
  );
}
