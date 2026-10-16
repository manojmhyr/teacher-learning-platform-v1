import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import FilterAltOffOutlinedIcon from '@mui/icons-material/FilterAltOffOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { useDirectory } from '@/context/DirectoryContext';
import { usePlatform } from '@/context/PlatformContext';
import { averageCoverage, filterLessons } from '@/services/progressService';
import { EmptyState, ProgressRing, ProgressRow } from '@/components/common';
import { fmtDate } from '@/utils/format';
import type { User } from '@/types';

/**
 * Coverage per teacher, with the filters an admin needs once there are more
 * than a handful of teachers: who is behind, in which class or subject, and
 * who has gone quiet.
 *
 * Only published lessons count — a draft is invisible to teachers, so it
 * should not drag their coverage down.
 */

type CoverageBand = 'all' | 'no-lessons' | 'not-started' | 'under-50' | '50-99' | 'complete';
type StatusFilter = 'active' | 'inactive' | 'all';
type SortKey = 'name' | 'coverage-asc' | 'coverage-desc' | 'recent' | 'stale';

const PAGE = 20;

const BANDS: Array<{ value: CoverageBand; label: string }> = [
  { value: 'all', label: 'Any coverage' },
  { value: 'not-started', label: 'Not started (0%)' },
  { value: 'under-50', label: 'Behind (under 50%)' },
  { value: '50-99', label: 'On track (50–99%)' },
  { value: 'complete', label: 'Complete (100%)' },
  { value: 'no-lessons', label: 'No published lessons yet' },
];

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'coverage-asc', label: 'Lowest coverage first' },
  { value: 'coverage-desc', label: 'Highest coverage first' },
  { value: 'recent', label: 'Most recently taught' },
  { value: 'stale', label: 'Longest since last taught' },
];

interface Row {
  teacher: User;
  lines: Array<{ key: string; label: string; coverage: number; lessons: number }>;
  /** Average over the shown class–subject pairs that have published lessons; null when none do. */
  overall: number | null;
  lastTaught: string | null;
  recordCount: number;
  totalAssignments: number;
}

function inBand(overall: number | null, band: CoverageBand): boolean {
  switch (band) {
    case 'all':
      return true;
    case 'no-lessons':
      return overall === null;
    case 'not-started':
      return overall === 0;
    case 'under-50':
      return overall !== null && overall < 50;
    case '50-99':
      return overall !== null && overall >= 50 && overall < 100;
    case 'complete':
      return overall === 100;
  }
}

export function ProgressTab() {
  const directory = useDirectory();
  const { records } = usePlatform();

  const [query, setQuery] = useState('');
  const [classId, setClassId] = useState('all');
  const [subjectId, setSubjectId] = useState('all');
  const [band, setBand] = useState<CoverageBand>('all');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [sort, setSort] = useState<SortKey>('name');
  const [shown, setShown] = useState(PAGE);

  const teachers = useMemo(() => directory.users.filter((u) => u.role === 'TEACHER'), [directory.users]);
  const published = useMemo(() => directory.lessons.filter((l) => l.published), [directory.lessons]);

  // Coverage for every teacher, narrowed to the chosen class and subject.
  const allRows = useMemo<Row[]>(() => {
    return teachers.map((teacher) => {
      const assigned = directory.assignmentsFor(teacher.id);
      const theirRecords = records.filter((r) => r.userId === teacher.id);
      const pairs = assigned.filter(
        (a) => (classId === 'all' || a.classId === classId) && (subjectId === 'all' || a.subjectId === subjectId),
      );
      const lines = pairs
        .map((a) => {
          const lessons = filterLessons(published, a.classId, a.subjectId);
          const subject = directory.subjects.find((s) => s.id === a.subjectId);
          return {
            key: `${a.classId}-${a.subjectId}`,
            label: `${a.classId} · ${subject?.name ?? a.subjectId}`,
            coverage: averageCoverage(theirRecords, lessons),
            lessons: lessons.length,
          };
        })
        .sort((x, y) => x.label.localeCompare(y.label));
      const withLessons = lines.filter((l) => l.lessons > 0);
      const overall = withLessons.length ? Math.round(withLessons.reduce((s, l) => s + l.coverage, 0) / withLessons.length) : null;
      const relevantRecords = theirRecords.filter((r) => pairs.some((a) => a.classId === r.classId));
      const lastTaught = relevantRecords.map((r) => r.dateTaught).sort().pop() ?? null;
      return { teacher, lines, overall, lastTaught, recordCount: relevantRecords.length, totalAssignments: assigned.length };
    });
  }, [teachers, directory, records, published, classId, subjectId]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const narrowing = classId !== 'all' || subjectId !== 'all';
    const filtered = allRows
      .filter((r) => (status === 'all' ? true : status === 'active' ? r.teacher.active : !r.teacher.active))
      .filter((r) => !q || r.teacher.fullName.toLowerCase().includes(q) || r.teacher.employeeId.toLowerCase().includes(q))
      // With a class or subject chosen, only teachers who teach it are relevant.
      .filter((r) => !narrowing || r.lines.length > 0)
      .filter((r) => inBand(r.overall, band));

    const byName = (a: Row, b: Row) => a.teacher.fullName.localeCompare(b.teacher.fullName);
    // Teachers with nothing to measure go last in coverage sorts.
    const cov = (r: Row, dir: 1 | -1) => (r.overall === null ? Infinity : dir * r.overall);
    const date = (r: Row) => r.lastTaught ?? '';
    return filtered.sort((a, b) => {
      switch (sort) {
        case 'coverage-asc':
          return cov(a, 1) - cov(b, 1) || byName(a, b);
        case 'coverage-desc':
          return cov(a, -1) - cov(b, -1) || byName(a, b);
        case 'recent':
          return date(b).localeCompare(date(a)) || byName(a, b);
        case 'stale':
          // Never taught counts as the stalest.
          return date(a).localeCompare(date(b)) || byName(a, b);
        default:
          return byName(a, b);
      }
    });
  }, [allRows, query, classId, subjectId, band, status, sort]);

  const filtersActive = query.trim() !== '' || classId !== 'all' || subjectId !== 'all' || band !== 'all' || status !== 'active';
  const clear = () => {
    setQuery('');
    setClassId('all');
    setSubjectId('all');
    setBand('all');
    setStatus('active');
    setShown(PAGE);
  };
  // Any filter change starts the list from the top again.
  const update = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setShown(PAGE);
  };

  const classSubjects = classId === 'all' ? directory.subjects : directory.subjects.filter((s) => directory.getClass(classId)?.subjectIds.includes(s.id));

  if (teachers.length === 0) {
    return <EmptyState title="No teachers yet" description="Add a teacher account to see teaching progress here." />;
  }

  return (
    <Box>
      <Box
        sx={{
          display: 'grid',
          gap: 1.5,
          mb: 1.5,
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'minmax(220px, 1.4fr) repeat(3, minmax(150px, 1fr))' },
        }}
      >
        <TextField
          size="small"
          placeholder="Search name or employee ID"
          value={query}
          onChange={(e) => update(setQuery)(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          inputProps={{ 'aria-label': 'Search teachers' }}
        />
        <TextField
          select
          size="small"
          label="Class"
          value={classId}
          onChange={(e) => {
            update(setClassId)(e.target.value);
            setSubjectId('all');
          }}
        >
          <MenuItem value="all">All classes</MenuItem>
          {directory.classes.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Subject" value={subjectId} onChange={(e) => update(setSubjectId)(e.target.value)}>
          <MenuItem value="all">All subjects</MenuItem>
          {classSubjects.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Coverage" value={band} onChange={(e) => update(setBand)(e.target.value as CoverageBand)}>
          {BANDS.map((b) => (
            <MenuItem key={b.value} value={b.value}>
              {b.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
        <TextField select size="small" label="Accounts" value={status} onChange={(e) => update(setStatus)(e.target.value as StatusFilter)} sx={{ minWidth: 170 }}>
          <MenuItem value="active">Active teachers</MenuItem>
          <MenuItem value="inactive">Deactivated</MenuItem>
          <MenuItem value="all">All accounts</MenuItem>
        </TextField>
        <TextField select size="small" label="Sort by" value={sort} onChange={(e) => update(setSort)(e.target.value as SortKey)} sx={{ minWidth: 220 }}>
          {SORTS.map((s) => (
            <MenuItem key={s.value} value={s.value}>
              {s.label}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <Typography variant="body2" color="text.secondary" aria-live="polite">
          Showing {Math.min(shown, rows.length)} of {rows.length} {rows.length === 1 ? 'teacher' : 'teachers'}
          {rows.length !== teachers.length && ` (${teachers.length} in total)`}
        </Typography>
        {filtersActive && (
          <Button size="small" startIcon={<FilterAltOffOutlinedIcon />} onClick={clear}>
            Clear filters
          </Button>
        )}
      </Stack>

      {rows.length === 0 ? (
        <EmptyState title="No teachers match" description="Try a different class, subject or coverage filter, or clear the filters." />
      ) : (
        <Stack spacing={2}>
          {rows.slice(0, shown).map((r) => (
            <Card key={r.teacher.id} variant="outlined">
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: r.lines.length ? 1 : 0 }}>
                  {r.overall === null ? (
                    <Box sx={{ width: 56, height: 56, borderRadius: '50%', border: 1, borderColor: 'divider', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <Typography variant="caption" color="text.secondary">
                        —
                      </Typography>
                    </Box>
                  ) : (
                    <ProgressRing value={r.overall} size={56} label={`${r.teacher.fullName}: ${r.overall}% coverage`} />
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography variant="h6">{r.teacher.fullName}</Typography>
                      {!r.teacher.active && <Chip size="small" label="Deactivated" />}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {r.teacher.employeeId} · {r.totalAssignments} class–subject {r.totalAssignments === 1 ? 'assignment' : 'assignments'} ·{' '}
                      {r.recordCount} {r.recordCount === 1 ? 'record' : 'records'} · {r.lastTaught ? `last taught ${fmtDate(r.lastTaught)}` : 'not taught yet'}
                    </Typography>
                  </Box>
                </Stack>
                {r.lines.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No assignments yet.
                  </Typography>
                ) : (
                  r.lines.map((line) => (
                    <ProgressRow
                      key={line.key}
                      label={line.label}
                      value={line.coverage}
                      caption={line.lessons === 0 ? 'No published lessons yet' : `${line.coverage}% of ${line.lessons} ${line.lessons === 1 ? 'lesson' : 'lessons'}`}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          ))}
          {rows.length > shown && (
            <Button variant="outlined" onClick={() => setShown((n) => n + PAGE)} sx={{ alignSelf: 'center' }}>
              Show {Math.min(PAGE, rows.length - shown)} more
            </Button>
          )}
        </Stack>
      )}
    </Box>
  );
}
