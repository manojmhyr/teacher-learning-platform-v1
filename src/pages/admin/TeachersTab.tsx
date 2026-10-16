import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import TuneIcon from '@mui/icons-material/Tune';
import { useDirectory } from '@/context/DirectoryContext';
import { useToast } from '@/context/ToastContext';
import { usePlatform } from '@/context/PlatformContext';
import { useAuth } from '@/context/AuthContext';
import { checkPasswordStrength, generateTempPassword } from '@/services/password';
import type { User } from '@/types';
import { fmtDate } from '@/utils/format';

/**
 * Teacher management.
 *
 * Accounts are created here and nowhere else — there is no self-registration.
 * The admin sets a temporary password, hands it over in person, and the
 * teacher is forced to change it on first sign-in.
 */
export function TeachersTab() {
  const directory = useDirectory();
  const { session } = useAuth();
  const { log, records } = usePlatform();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [assignFor, setAssignFor] = useState<User | null>(null);
  const [issued, setIssued] = useState<{ name: string; password: string } | null>(null);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied to clipboard.');
    } catch {
      toast('Could not copy — select the text and copy it manually.', 'warning');
    }
  };

  const resetPassword = async (user: User) => {
    let temp: string;
    try {
      temp = await directory.resetPassword(user.id, generateTempPassword());
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not reset the password.', 'error');
      return;
    }
    if (session) log(session.user.id, 'admin', `Issued a new temporary password for ${user.fullName}`);
    setIssued({ name: user.fullName, password: temp });
  };

  const toggleActive = async (user: User) => {
    try {
      await directory.updateUser(user.id, { active: !user.active });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not update the account.', 'error');
      return;
    }
    if (session) log(session.user.id, 'admin', `${user.active ? 'Deactivated' : 'Reactivated'} the account for ${user.fullName}`);
    toast(user.active ? `${user.fullName} can no longer sign in.` : `${user.fullName} can sign in again.`);
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">Accounts</Typography>
        <Button variant="contained" startIcon={<PersonAddAltIcon />} onClick={() => setCreateOpen(true)}>
          Add teacher
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Employee ID</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Assignments</TableCell>
              <TableCell>Records</TableCell>
              <TableCell>Last sign-in</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {directory.users.map((u) => {
              const assigned = directory.assignmentsFor(u.id);
              const mine = records.filter((r) => r.userId === u.id).length;
              return (
                <TableRow key={u.id} hover sx={{ opacity: u.active ? 1 : 0.55 }}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {u.fullName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {u.title}
                      {u.mustChange ? ' · must change password' : ''}
                    </Typography>
                  </TableCell>
                  <TableCell>{u.employeeId}</TableCell>
                  <TableCell>
                    <Chip size="small" label={u.role === 'ADMIN' ? 'Admin' : 'Teacher'} color={u.role === 'ADMIN' ? 'secondary' : 'default'} />
                  </TableCell>
                  <TableCell>{u.role === 'ADMIN' ? 'All' : `${assigned.length} class–subject`}</TableCell>
                  <TableCell>{mine}</TableCell>
                  <TableCell>{u.lastLoginAt ? fmtDate(u.lastLoginAt) : 'Never'}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      {u.role === 'TEACHER' && (
                        <Tooltip title="Assign classes and subjects">
                          <IconButton size="small" onClick={() => setAssignFor(u)}>
                            <TuneIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Issue a new temporary password">
                        <IconButton size="small" onClick={() => void resetPassword(u)}>
                          <KeyOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Button size="small" onClick={() => void toggleActive(u)} disabled={u.id === session?.user.id}>
                        {u.active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>

      <Alert severity="info" sx={{ mt: 2 }}>
        Deactivating keeps a teacher's history intact but stops them signing in. Accounts are never deleted, so teaching records always stay
        attributable.
      </Alert>

      <CreateTeacherDialog open={createOpen} onClose={() => setCreateOpen(false)} onIssued={setIssued} />
      {assignFor && <AssignmentsDialog user={assignFor} onClose={() => setAssignFor(null)} />}

      <Dialog open={Boolean(issued)} onClose={() => setIssued(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Temporary password</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Give this to {issued?.name} in person. They will be asked to set their own password on first sign-in. It is not shown again.
          </Typography>
          <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography fontFamily="monospace" fontSize="1.05rem">
              {issued?.password}
            </Typography>
            <IconButton size="small" onClick={() => issued && void copy(issued.password)} aria-label="Copy password">
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setIssued(null)}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function CreateTeacherDialog({
  open,
  onClose,
  onIssued,
}: {
  open: boolean;
  onClose: () => void;
  onIssued: (v: { name: string; password: string }) => void;
}) {
  const directory = useDirectory();
  const { session } = useAuth();
  const { log } = usePlatform();
  const [employeeId, setEmployeeId] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('Teacher');
  const [role, setRole] = useState<User['role']>('TEACHER');
  const [password, setPassword] = useState(generateTempPassword());
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setEmployeeId('');
    setFullName('');
    setEmail('');
    setTitle('Teacher');
    setRole('TEACHER');
    setPassword(generateTempPassword());
    setErrors([]);
  };

  const submit = async () => {
    const problems: string[] = [];
    if (!employeeId.trim()) problems.push('Enter an employee ID.');
    else if (directory.users.some((u) => u.employeeId.toLowerCase() === employeeId.trim().toLowerCase())) {
      problems.push('That employee ID is already in use.');
    }
    if (!fullName.trim()) problems.push('Enter the full name.');
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) problems.push('Enter a valid email address.');
    problems.push(...checkPasswordStrength(password, employeeId).errors);
    setErrors(problems);
    if (problems.length) return;

    setBusy(true);
    try {
      const { user, temporaryPassword } = await directory.createUser({ employeeId, fullName, email, title, role, temporaryPassword: password });
      if (session) log(session.user.id, 'admin', `Created the account ${user.employeeId} for ${user.fullName}`);
      // In live mode the server generates the password, so show what it issued.
      onIssued({ name: user.fullName, password: temporaryPassword });
      reset();
      onClose();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Could not create the account.']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add a teacher</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Employee ID" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} fullWidth placeholder="T1025" />
            <TextField label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} fullWidth />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />
            <TextField label="Job title" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth placeholder="Mathematics Teacher" />
          </Stack>
          <TextField select label="Role" value={role} onChange={(e) => setRole(e.target.value as User['role'])} sx={{ maxWidth: 220 }}>
            <MenuItem value="TEACHER">Teacher</MenuItem>
            <MenuItem value="ADMIN">Administrator</MenuItem>
          </TextField>

          <Divider />
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Temporary password
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField value={password} onChange={(e) => setPassword(e.target.value)} fullWidth size="small" />
              <Button onClick={() => setPassword(generateTempPassword())}>Generate</Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Hand this over in person. The teacher must change it at first sign-in.
            </Typography>
          </Box>

          {errors.length > 0 && (
            <Alert severity="error">
              {errors.map((e) => (
                <div key={e}>{e}</div>
              ))}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy}>
          Create account
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * The assignment grid: classes down, subjects across, a checkbox per cell.
 *
 * This is the whole access model in one screen — a teacher sees a lesson only
 * where a box is ticked for its class AND subject.
 */
function AssignmentsDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const directory = useDirectory();
  const { session } = useAuth();
  const { log } = usePlatform();
  const { toast } = useToast();
  const [pairs, setPairs] = useState<Array<{ classId: string; subjectId: string }>>(
    directory.assignmentsFor(user.id).map((a) => ({ classId: a.classId, subjectId: a.subjectId })),
  );

  const has = (classId: string, subjectId: string) => pairs.some((p) => p.classId === classId && p.subjectId === subjectId);
  const toggle = (classId: string, subjectId: string) =>
    setPairs((prev) => (has(classId, subjectId) ? prev.filter((p) => !(p.classId === classId && p.subjectId === subjectId)) : [...prev, { classId, subjectId }]));

  const save = async () => {
    try {
      await directory.setAssignments(user.id, pairs);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save assignments.', 'error');
      return;
    }
    if (session) log(session.user.id, 'admin', `Updated assignments for ${user.fullName} (${pairs.length} class–subject pairs)`);
    toast(`Assignments updated for ${user.fullName}.`);
    onClose();
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Assignments — {user.fullName}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Tick each class and subject this teacher is responsible for. They will see published lessons for those combinations and nothing else.
        </Typography>
        <Card variant="outlined">
          <CardContent sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell />
                  {directory.subjects.map((s) => (
                    <TableCell key={s.id} align="center">
                      {s.name}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {directory.classes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell sx={{ fontWeight: 600 }}>{c.name}</TableCell>
                    {directory.subjects.map((s) => {
                      const offered = c.subjectIds.includes(s.id);
                      return (
                        <TableCell key={s.id} align="center">
                          {offered ? (
                            <Checkbox
                              checked={has(c.id, s.id)}
                              onChange={() => toggle(c.id, s.id)}
                              inputProps={{ 'aria-label': `${c.name} ${s.name}` }}
                            />
                          ) : (
                            <Typography variant="caption" color="text.disabled">
                              —
                            </Typography>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Alert severity="info" sx={{ mt: 2 }}>
          Removing an assignment hides those lessons but never deletes teaching records — history belongs to the teacher who taught it.
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => void save()}>
          Save assignments
        </Button>
      </DialogActions>
    </Dialog>
  );
}
