import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ReplayIcon from '@mui/icons-material/Replay';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import type { Video } from '@/types';
import { ProtectedContent } from '@/components/Security';
import { formatDuration } from '@/data/demoContent';
import { tokens } from '@/theme/theme';

/**
 * In-app video player.
 *
 * With Azure configured this plays an HLS stream through a short-lived SAS
 * URL. In demo mode there is no media file, so a synthetic scene stands in —
 * which keeps the protection behaviour (watermark, no download, no context
 * menu, hidden on blur) identical and demonstrable.
 */
export function VideoPlayer({ video, streamUrl, open, onClose }: { video: Video | null; streamUrl?: string; open: boolean; onClose: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const isDemoStream = !streamUrl || streamUrl.startsWith('demo://');

  useEffect(() => {
    if (!open) {
      setPlaying(false);
      setPosition(0);
    }
  }, [open]);

  useEffect(() => {
    if (!playing || !video) return;
    timer.current = window.setInterval(() => {
      setPosition((p) => {
        if (p + 1 >= video.durationSec) {
          setPlaying(false);
          return video.durationSec;
        }
        return p + 1;
      });
    }, 1000);
    return () => window.clearInterval(timer.current);
  }, [playing, video]);

  if (!video) return null;
  const pct = (position / video.durationSec) * 100;
  const finished = position >= video.durationSec;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogContent sx={{ p: 0, bgcolor: '#0C1310' }}>
        <ProtectedContent>
          <Box sx={{ position: 'relative' }}>
            <IconButton onClick={onClose} aria-label="Close player" sx={{ position: 'absolute', top: 8, right: 8, zIndex: 6, color: '#fff' }}>
              <CloseIcon />
            </IconButton>

            <Box sx={{ position: 'relative', aspectRatio: '16 / 9', bgcolor: '#0C1310', display: 'grid', placeItems: 'center' }}>
              {isDemoStream ? (
                <DemoScene title={video.title} playing={playing} progress={pct} />
              ) : (
                <Box
                  component="video"
                  src={streamUrl}
                  controls={false}
                  controlsList="nodownload noplaybackrate"
                  disablePictureInPicture
                  sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              )}
            </Box>

            <Box sx={{ p: 2, color: '#fff' }}>
              <Typography variant="subtitle1" fontWeight={700}>
                {video.title}
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.7)', mb: 1.5 }}>
                {video.description}
              </Typography>

              <Slider
                value={position}
                max={video.durationSec}
                onChange={(_, v) => setPosition(v as number)}
                size="small"
                aria-label="Seek"
                sx={{ color: tokens.highlighter }}
              />
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <IconButton
                  onClick={() => (finished ? (setPosition(0), setPlaying(true)) : setPlaying((p) => !p))}
                  sx={{ color: '#fff' }}
                  aria-label={finished ? 'Replay' : playing ? 'Pause' : 'Play'}
                >
                  {finished ? <ReplayIcon /> : playing ? <PauseIcon /> : <PlayArrowIcon />}
                </IconButton>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.75)' }}>
                  {formatDuration(position)} / {formatDuration(video.durationSec)}
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: 'rgba(255,255,255,.7)' }}>
                  <LockOutlinedIcon sx={{ fontSize: 15 }} />
                  <Typography variant="caption">Content protected — download disabled</Typography>
                </Stack>
              </Stack>
            </Box>
          </Box>
        </ProtectedContent>
      </DialogContent>
    </Dialog>
  );
}

/** A simple animated stand-in so the player is demonstrable without media files. */
function DemoScene({ title, playing, progress }: { title: string; playing: boolean; progress: number }) {
  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative', display: 'grid', placeItems: 'center', px: 4 }}>
      <svg viewBox="0 0 320 180" style={{ width: '70%', maxWidth: 420 }} role="img" aria-label="Lesson video">
        <defs>
          <linearGradient id="vg" x1="0" x2="1">
            <stop offset="0%" stopColor={tokens.chalkGreen} />
            <stop offset="100%" stopColor={tokens.chalkGreenDark} />
          </linearGradient>
        </defs>
        <rect width="320" height="180" rx="10" fill="url(#vg)" />
        <circle cx="160" cy="78" r="40" fill="none" stroke={tokens.highlighter} strokeWidth="3" opacity="0.65" />
        <path d="M160 38 A40 40 0 0 1 160 118 Z" fill={tokens.highlighter} opacity={playing ? 0.9 : 0.45} />
        <text x="160" y="150" fill="rgba(255,255,255,.92)" fontSize="13" fontFamily="sans-serif" textAnchor="middle">
          {title.length > 34 ? `${title.slice(0, 33)}…` : title}
        </text>
      </svg>
      <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <LinearProgress variant="determinate" value={progress} sx={{ height: 3 }} />
      </Box>
      <Typography variant="caption" sx={{ position: 'absolute', top: 12, left: 16, color: 'rgba(255,255,255,.6)' }}>
        Demo content — no media file is streamed
      </Typography>
    </Box>
  );
}
