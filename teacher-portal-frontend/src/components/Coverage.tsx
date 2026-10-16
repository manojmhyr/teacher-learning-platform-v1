import { useMemo, useState } from 'react';
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
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import HistoryIcon from '@mui/icons-material/History';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import type { Lesson, TeachingRecord } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useDirectory } from '@/context/DirectoryContext';
import { usePlatform } from '@/context/PlatformContext';
import { useToast } from '@/context/ToastContext';
import { buildRecord, saveRecord, validateRecord } from '@/services/recordService';
import { coveredTopics, lessonCoverage } from '@/services/progressService';
import { ProgressRow } from '@/components/common';
import { fmtDate, todayISO } from '@/utils/format';

/**
 * Teaching Coverage — record what was actually covered in a session.
 *
 * Saving always appends a new record. Previously recorded topics stay ticked
 * and read-only, so history can never be edited away; the checklist only
 * offers what has not yet been covered.
 */
export function Coverage({ lesson }: { lesson: Lesson }) {
  const { records: allRecords, addRecord, log } = usePlatform();
  const { session } = useAuth();
  const { classes } = useDirectory();
  // A teacher only ever sees and adds to their own history.
  const records = useMemo(() => allRecords.filter((r) => r.userId === session?.user.id), [allRecords, session]);
  const { toast } = useToast();

  const already = useMemo(() => coveredTopics(records, lesson.id), [records, lesson.id]);
  const history = useMemo(
    () => records.filter((r) => r.lessonId === lesson.id).sort((a, b) => b.dateTaught.localeCompare(a.dateTaught)),
    [records, lesson.id],
  );

  const [selected, setSelected] = useState<string[]>([]);
  const [dateTaught, setDateTaught] = useState(todayISO());
  const [classId, setClassId] = useState(lesson.classId);
  const [durationMin, setDurationMin] = useState(lesson.durationMin);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState<string | null>(null);

  const currentCoverage = lessonCoverage(records, lesson);
  const projected = useMemo(() => {
    const union = new Set([...already, ...selected]);
    const hits = lesson.topics.filter((t) => union.has(t)).length;
    return Math.round((hits / lesson.topics.length) * 100);
  }, [already, selected, lesson.topics]);

  const toggle = (topic: string) => {
    setSelected((prev) => (prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]));
  };

  const attemptSave = () => {
    const result = validateRecord({ topics: selected, dateTaught, durationMin });
    setErrors(result.errors);
    if (result.ok) setConfirmOpen(true);
  };

  const commit = async () => {
    setConfirmOpen(false);
    setSaving(true);
    if (!session) return;
    const record: TeachingRecord = buildRecord({
      userId: session.user.id,
      lessonId: lesson.id,
      classId,
      dateTaught,
      durationMin,
      topics: selected,
      notes: notes.trim(),
    });
    try {
      await saveRecord(record);
      addRecord(record);
      selected.forEach((t) => log(session.user.id, 'coverage', `Marked “${t}” as covered in ${lesson.title}`));
      if (notes.trim()) log(session.user.id, 'note', `Added a teaching note to ${lesson.title}`);
      setJustSaved(record.id);
      setSelected([]);
      setNotes('');
      toast('Teaching record saved successfully.');
    } catch {
      // The typed notes are deliberately preserved so nothing is lost on failure.
      toast('Could not save the teaching record. Your notes are still here — try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remaining = lesson.topics.filter((t) => !already.has(t));

  return (
    <Stack spacing={3}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Record what was covered
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Tick the topics taught in this session. Topics covered previously are shown ticked and cannot be unticked — each save adds a new record
            rather than replacing history.
          </Typography>

          <ProgressRow
            label="Coverage for this lesson"
            value={projected}
            caption={projected === currentCoverage ? `${currentCoverage}%` : `${currentCoverage}% → ${projected}%`}
          />

          <Box sx={{ mt: 2 }}>
            {lesson.topics.map((topic) => {
              const locked = already.has(topic);
              return (
                <FormControlLabel
                  key={topic}
                  sx={{ display: 'flex', mr: 0, py: 0.25 }}
                  control={
                    <Checkbox
                      checked={locked || selected.includes(topic)}
                      disabled={locked}
                      onChange={() => toggle(topic)}
                      inputProps={{ 'aria-label': topic }}
                    />
                  }
                  label={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" sx={{ color: locked ? 'text.secondary' : 'text.primary' }}>
                        {topic}
                      </Typography>
                      {locked && <Chip size="small" label="Covered" icon={<CheckIcon sx={{ fontSize: 14 }} />} variant="outlined" />}
                    </Stack>
                  }
                />
              );
            })}
          </Box>

          {remaining.length === 0 && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Every topic in this lesson has been covered. You can still record another session to log extra practice or revision.
            </Alert>
          )}

          <Divider sx={{ my: 3 }} />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Date taught"
              type="date"
              value={dateTaught}
              onChange={(e) => setDateTaught(e.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: todayISO() }}
              fullWidth
            />
            <TextField label="Class" select value={classId} onChange={(e) => setClassId(e.target.value)} fullWidth>
              {classes.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Duration (minutes)"
              type="number"
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              inputProps={{ min: 1, max: 240 }}
              fullWidth
            />
          </Stack>

          <TextField
            label="Teacher notes"
            placeholder="e.g. Students understood numerator well. Need additional examples for equivalent fractions."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            sx={{ mt: 2 }}
          />

          {errors.length > 0 && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {errors.map((e) => (
                <div key={e}>{e}</div>
              ))}
            </Alert>
          )}

          <Button
            variant="contained"
            size="large"
            startIcon={<SaveOutlinedIcon />}
            onClick={attemptSave}
            disabled={saving}
            sx={{ mt: 2.5 }}
            fullWidth={false}
          >
            {saving ? 'Saving…' : 'Save teaching record'}
          </Button>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <HistoryIcon color="action" />
            <Typography variant="h6">Teaching history</Typography>
            <Chip size="small" label={`${history.length} record${history.length === 1 ? '' : 's'}`} variant="outlined" />
          </Stack>

          {history.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No sessions recorded for this lesson yet. Your first saved record will appear here.
            </Typography>
          ) : (
            <Stack divider={<Divider flexItem />} spacing={2}>
              {history.map((r) => (
                <Box
                  key={r.id}
                  sx={{
                    pt: 1,
                    ...(justSaved === r.id ? { bgcolor: 'action.hover', borderRadius: 1, p: 1.5, mt: 1 } : {}),
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="subtitle2" fontWeight={700}>
                      {fmtDate(r.dateTaught)}
                    </Typography>
                    <Chip size="small" variant="outlined" label={`Class ${r.classId}`} />
                    <Chip size="small" variant="outlined" label={`${r.durationMin} min`} />
                    {justSaved === r.id && <Chip size="small" color="success" label="Just saved" />}
                  </Stack>
                  <Box sx={{ mt: 1 }}>
                    {r.topics.map((t) => (
                      <Stack key={t} direction="row" spacing={1} alignItems="center">
                        <CheckIcon sx={{ fontSize: 16 }} color="success" />
                        <Typography variant="body2">{t}</Typography>
                      </Stack>
                    ))}
                  </Box>
                  {r.notes && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                      {r.notes}
                    </Typography>
                  )}
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Save this teaching record?</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            <Typography variant="body2" sx={{ mb: 1 }}>
              {selected.length} topic{selected.length === 1 ? '' : 's'} will be recorded as covered for {fmtDate(dateTaught)}, Class {classId}.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Teaching records are permanent and cannot be edited or deleted afterwards. Coverage for this lesson will move from {currentCoverage}% to{' '}
              {projected}%.
            </Typography>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={commit}>
            Save record
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
