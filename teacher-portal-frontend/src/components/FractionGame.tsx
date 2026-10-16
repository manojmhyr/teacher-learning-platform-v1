import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import ReplayIcon from '@mui/icons-material/Replay';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import type { GameQuestion } from '@/types';
import { tokens } from '@/theme/theme';

type Phase = 'idle' | 'playing' | 'done';

/** Fraction Match: a short, playable matching game used inside a lesson. */
export function FractionGame({ questions, onComplete }: { questions: GameQuestion[]; onComplete?: (score: number, total: number) => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);

  const total = questions.length;
  const question = questions[index];

  useEffect(() => {
    if (phase !== 'playing') return;
    const t = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  const start = () => {
    setPhase('playing');
    setIndex(0);
    setScore(0);
    setElapsed(0);
    setPicked(null);
  };

  const choose = (option: string) => {
    if (picked) return;
    setPicked(option);
    const correct = option === question.answer;
    if (correct) setScore((s) => s + 1);
    window.setTimeout(() => {
      if (index + 1 >= total) {
        setPhase('done');
        onComplete?.(correct ? score + 1 : score, total);
      } else {
        setIndex((i) => i + 1);
        setPicked(null);
      }
    }, 850);
  };

  const summary = useMemo(() => {
    const pct = total ? Math.round((score / total) * 100) : 0;
    if (pct >= 90) return 'Excellent — ready to teach this with confidence.';
    if (pct >= 70) return 'Good. Review equivalent fractions before the lesson.';
    if (pct >= 50) return 'A reasonable start. Worth another run before class.';
    return 'Worth revisiting the lesson plan before teaching this topic.';
  }, [score, total]);

  if (phase === 'idle') {
    return (
      <Card variant="outlined">
        <CardContent sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="h5" fontWeight={800} gutterBottom>
            Fraction Match
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 460, mx: 'auto', mb: 3 }}>
            Match each fraction to its decimal value. {total} questions, no time limit — a quick way to check you are ready to teach the topic, or to
            play on the board with the class.
          </Typography>
          <Button variant="contained" size="large" onClick={start}>
            Start game
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (phase === 'done') {
    const pct = Math.round((score / total) * 100);
    return (
      <Card variant="outlined">
        <CardContent sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="overline" color="text.secondary">
            Game complete
          </Typography>
          <Typography variant="h3" fontWeight={800} sx={{ my: 1 }}>
            {score} / {total}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {summary}
          </Typography>
          <Stack direction="row" spacing={1} justifyContent="center" sx={{ mb: 3 }}>
            <Chip label={`${pct}% correct`} color={pct >= 70 ? 'success' : 'default'} />
            <Chip icon={<TimerOutlinedIcon />} label={`${Math.floor(elapsed / 60)}m ${elapsed % 60}s`} variant="outlined" />
          </Stack>
          <Button variant="outlined" startIcon={<ReplayIcon />} onClick={start}>
            Play again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            Question {index + 1} of {total}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Chip size="small" label={`Score ${score}`} />
            <Chip size="small" variant="outlined" icon={<TimerOutlinedIcon sx={{ fontSize: 16 }} />} label={`${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`} />
          </Stack>
        </Stack>

        <LinearProgress variant="determinate" value={(index / total) * 100} sx={{ mb: 3 }} />

        <Typography variant="h5" fontWeight={700} textAlign="center" sx={{ my: 4 }}>
          {question.prompt}
        </Typography>

        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
          {question.options.map((option) => {
            const isPicked = picked === option;
            const isAnswer = option === question.answer;
            const reveal = picked !== null;
            return (
              <Button
                key={option}
                variant="outlined"
                size="large"
                onClick={() => choose(option)}
                disabled={reveal}
                startIcon={reveal && isAnswer ? <CheckCircleOutlineIcon /> : reveal && isPicked ? <HighlightOffIcon /> : undefined}
                sx={{
                  py: 2,
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  ...(reveal && isAnswer ? { borderColor: 'success.main', color: 'success.main', bgcolor: 'success.main', opacity: 0.12 } : {}),
                  ...(reveal && isPicked && !isAnswer ? { borderColor: 'error.main', color: 'error.main' } : {}),
                  '&.Mui-disabled': reveal && isAnswer ? { borderColor: tokens.success, color: tokens.success } : {},
                }}
              >
                {option}
              </Button>
            );
          })}
        </Box>

        {picked && (
          <Typography textAlign="center" sx={{ mt: 2.5, fontWeight: 600 }} color={picked === question.answer ? 'success.main' : 'error.main'}>
            {picked === question.answer ? 'Correct' : `Not quite — the answer is ${question.answer}`}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
