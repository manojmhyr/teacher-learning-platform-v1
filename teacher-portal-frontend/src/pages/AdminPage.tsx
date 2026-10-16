import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import { useDirectory } from '@/context/DirectoryContext';
import { usePlatform } from '@/context/PlatformContext';
import { EmptyState, PageHeader } from '@/components/common';
import { TeachersTab } from '@/pages/admin/TeachersTab';
import { LessonsTab } from '@/pages/admin/LessonsTab';
import { ProgressTab } from '@/pages/admin/ProgressTab';
import { ActivityList } from '@/pages/ActivityPage';
import { fmtDate } from '@/utils/format';

const TABS = [
  { key: 'teachers', label: 'Teachers', icon: <GroupsOutlinedIcon /> },
  { key: 'lessons', label: 'Lessons & content', icon: <LibraryBooksOutlinedIcon /> },
  { key: 'progress', label: 'Progress', icon: <TrendingUpOutlinedIcon /> },
  { key: 'records', label: 'Teaching records', icon: <FactCheckOutlinedIcon /> },
  { key: 'audit', label: 'Audit log', icon: <HistoryOutlinedIcon /> },
] as const;

/**
 * The administrator console.
 *
 * Admins see every teacher, every lesson and every teaching record. Teachers
 * never reach this route — the guard in App.tsx stops them, and every query
 * below is unscoped precisely because only admins get here.
 */
export function AdminPage() {
  const [tab, setTab] = useState(0);
  const directory = useDirectory();
  const { records } = usePlatform();

  const published = directory.lessons.filter((l) => l.published).length;

  return (
    <Box>
      <PageHeader
        title="Admin console"
        subtitle="Manage teachers, lessons and content. Restricted to administrators."
        crumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Admin console' }]}
        actions={<Chip label="Administrator view" color="secondary" />}
      />

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 3 }}>
        {[
          { label: 'Accounts', value: directory.users.length },
          { label: 'Lessons', value: directory.lessons.length },
          { label: 'Published', value: published },
          { label: 'Teaching records', value: records.length },
        ].map((s) => (
          <Card key={s.label} variant="outlined">
            <CardContent>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                {s.label}
              </Typography>
              <Typography variant="h4" fontWeight={800}>
                {s.value}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ borderBottom: 1, borderColor: 'divider', mb: 2.5 }}>
        {TABS.map((t) => (
          <Tab key={t.key} label={t.label} icon={t.icon} iconPosition="start" />
        ))}
      </Tabs>

      {TABS[tab].key === 'teachers' && <TeachersTab />}
      {TABS[tab].key === 'lessons' && <LessonsTab />}
      {TABS[tab].key === 'progress' && <ProgressTab />}
      {TABS[tab].key === 'records' && <AdminRecords />}
      {TABS[tab].key === 'audit' && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Audit log
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Every sign-in, lesson-plan view, content access, administrative change and detected capture attempt, across all users. This is the
              record that answers “who had access to this document?”.
            </Typography>
            <AuditList />
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

function AdminRecords() {
  const directory = useDirectory();
  const { records } = usePlatform();
  const [teacherId, setTeacherId] = useState('all');
  const [classId, setClassId] = useState('all');

  const rows = useMemo(
    () =>
      records
        .filter((r) => (teacherId === 'all' ? true : r.userId === teacherId))
        .filter((r) => (classId === 'all' ? true : r.classId === classId))
        .sort((a, b) => b.dateTaught.localeCompare(a.dateTaught))
        .slice(0, 200),
    [records, teacherId, classId],
  );

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField select size="small" label="Teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="all">All teachers</MenuItem>
          {directory.users.filter((u) => u.role === 'TEACHER').map((u) => (
            <MenuItem key={u.id} value={u.id}>
              {u.fullName}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Class" value={classId} onChange={(e) => setClassId(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="all">All classes</MenuItem>
          {directory.classes.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {rows.length === 0 ? (
        <EmptyState title="No teaching records" description="Records appear here as teachers save what they covered in class." />
      ) : (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Teacher</TableCell>
                <TableCell>Lesson</TableCell>
                <TableCell>Class</TableCell>
                <TableCell align="right">Duration</TableCell>
                <TableCell>Topics covered</TableCell>
                <TableCell>Notes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(r.dateTaught)}</TableCell>
                  <TableCell>{directory.getUser(r.userId)?.fullName ?? '—'}</TableCell>
                  <TableCell>{directory.getLesson(r.lessonId)?.title ?? r.lessonId}</TableCell>
                  <TableCell>{r.classId}</TableCell>
                  <TableCell align="right">{r.durationMin} min</TableCell>
                  <TableCell>{r.topics.join(', ')}</TableCell>
                  <TableCell sx={{ maxWidth: 280 }}>
                    <Typography variant="caption" color="text.secondary">
                      {r.notes || '—'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
      <Divider sx={{ my: 2 }} />
      <Typography variant="caption" color="text.secondary">
        Teaching records are append-only. They cannot be edited or deleted here or anywhere else in the portal.
      </Typography>
    </Box>
  );
}

function AuditList() {
  const directory = useDirectory();
  const { activities } = usePlatform();
  const [userId, setUserId] = useState('all');

  const filtered = useMemo(
    () => (userId === 'all' ? activities : activities.filter((a) => a.userId === userId)),
    [activities, userId],
  );

  return (
    <Box>
      <TextField select size="small" label="User" value={userId} onChange={(e) => setUserId(e.target.value)} sx={{ minWidth: 220, mb: 1 }}>
        <MenuItem value="all">All users</MenuItem>
        {directory.users.map((u) => (
          <MenuItem key={u.id} value={u.id}>
            {u.fullName}
          </MenuItem>
        ))}
      </TextField>
      <ActivityList activities={filtered.slice(0, 150)} showUser />
    </Box>
  );
}
