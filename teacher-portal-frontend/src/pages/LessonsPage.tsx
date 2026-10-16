import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import { useDirectory } from '@/context/DirectoryContext';
import { useScope } from '@/hooks/useScope';
import { filterLessons, lastTaught, lessonCoverage, lessonStatus } from '@/services/progressService';
import { EmptyState, PageHeader, StatusChip, progressColor } from '@/components/common';
import { fmtDate } from '@/utils/format';
import type { LessonStatus } from '@/types';

export function LessonsPage() {
  const { classId, subjectId } = useParams();
  const [params] = useSearchParams();
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const { lessons, records, classes, subjects } = useScope();

  const effectiveSubject = subjectId ?? params.get('subject') ?? undefined;
  const { getClass, getSubject } = useDirectory();
  const cls = getClass(classId);
  const subject = getSubject(effectiveSubject);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | LessonStatus>('all');

  const rows = useMemo(() => {
    return filterLessons(lessons, cls?.id, subject?.id)
      .map((lesson) => ({
        lesson,
        coverage: lessonCoverage(records, lesson),
        status: lessonStatus(records, lesson),
        last: lastTaught(records, lesson.id),
      }))
      .filter((r) => {
        if (status !== 'all' && r.status !== status) return false;
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return r.lesson.title.toLowerCase().includes(q) || r.lesson.chapter.toLowerCase().includes(q);
      });
  }, [lessons, cls?.id, subject?.id, records, query, status]);

  const title = subject ? `${subject.name} lessons` : 'All lessons';
  const crumbs = cls
    ? [{ label: 'Dashboard', to: '/' }, { label: 'My classes', to: '/classes' }, { label: cls.name, to: `/classes/${cls.id}` }, { label: subject?.name ?? 'Lessons' }]
    : [{ label: 'Dashboard', to: '/' }, { label: 'Lessons' }];

  return (
    <Box>
      <PageHeader title={title} subtitle={cls ? `${cls.name} · ${rows.length} lessons` : `${rows.length} lessons across your classes`} crumbs={crumbs} />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
        <TextField
          size="small"
          placeholder="Search lessons"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          fullWidth
          sx={{ maxWidth: { sm: 320 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <TextField size="small" select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} sx={{ minWidth: 170 }}>
          <MenuItem value="all">All statuses</MenuItem>
          <MenuItem value="not_started">Not started</MenuItem>
          <MenuItem value="in_progress">In progress</MenuItem>
          <MenuItem value="completed">Completed</MenuItem>
        </TextField>
      </Stack>

      {rows.length === 0 ? (
        <EmptyState title="No lessons match" description={lessons.length === 0 ? 'Your administrator has not assigned you any lessons yet.' : 'Try clearing the search or choosing a different status filter.'} />
      ) : isCompact ? (
        // Phone and tablet: cards, because a seven-column table is unusable at this width.
        <Stack spacing={1.5}>
          {rows.map(({ lesson, coverage, status: s, last }) => (
            <Card key={lesson.id} variant="outlined">
              <CardActionArea onClick={() => navigate(`/lessons/${lesson.id}`)}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography fontWeight={700}>{lesson.title}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {lesson.chapter} · {lesson.durationMin} min · Class {lesson.classId}
                      </Typography>
                    </Box>
                    <StatusChip status={s} />
                  </Stack>
                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1.5 }}>
                    <LinearProgress variant="determinate" value={coverage} color={progressColor(coverage)} sx={{ flex: 1 }} />
                    <Typography variant="caption" fontWeight={700}>
                      {coverage}%
                    </Typography>
                  </Stack>
                  {last && (
                    <Typography variant="caption" color="text.secondary">
                      Last taught {fmtDate(last)}
                    </Typography>
                  )}
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      ) : (
        <Paper variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Lesson</TableCell>
                <TableCell>Chapter</TableCell>
                <TableCell align="right">Duration</TableCell>
                <TableCell>Coverage</TableCell>
                <TableCell>Last taught</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(({ lesson, coverage, status: s, last }) => (
                <TableRow key={lesson.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/lessons/${lesson.id}`)}>
                  <TableCell>
                    <Typography fontWeight={600}>{lesson.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Class {lesson.classId} · {lesson.topics.length} topics
                    </Typography>
                  </TableCell>
                  <TableCell>{lesson.chapter}</TableCell>
                  <TableCell align="right">{lesson.durationMin} min</TableCell>
                  <TableCell sx={{ minWidth: 160 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <LinearProgress variant="determinate" value={coverage} color={progressColor(coverage)} sx={{ flex: 1 }} />
                      <Typography variant="caption" fontWeight={700} sx={{ minWidth: 34, textAlign: 'right' }}>
                        {coverage}%
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>{last ? fmtDate(last) : '—'}</TableCell>
                  <TableCell>
                    <StatusChip status={s} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {!cls && (
        <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
          {classes.map((c) => (
            <Chip key={c.id} label={c.name} variant="outlined" onClick={() => navigate(`/classes/${c.id}`)} />
          ))}
          {subjects.map((s) => (
            <Chip key={s.id} label={s.name} variant="outlined" onClick={() => navigate(`/lessons?subject=${s.id}`)} />
          ))}
        </Stack>
      )}
    </Box>
  );
}
