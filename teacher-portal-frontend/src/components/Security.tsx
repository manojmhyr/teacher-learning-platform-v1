import { useEffect, useRef, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { guardBackgroundBlur, guardContextMenu, guardCopy } from '@/security/leakGuards';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { fmtDate } from '@/utils/format';

export function SecureChip({ label = 'Protected content' }: { label?: string }) {
  return <Chip size="small" variant="outlined" icon={<LockOutlinedIcon sx={{ fontSize: 16 }} />} label={label} sx={{ fontWeight: 600 }} />;
}

export function SecureNote({ children }: { children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary', mt: 1 }}>
      <LockOutlinedIcon sx={{ fontSize: 16 }} />
      <Typography variant="caption">{children}</Typography>
    </Stack>
  );
}

/**
 * Tiled, per-teacher watermark drawn over protected content.
 *
 * This is the control that survives a screenshot: a leaked image carries the
 * name, employee ID and date of whoever was logged in, which is what makes
 * casual sharing traceable. It is drawn as an SVG background so it cannot be
 * removed by deleting a single element.
 */
export function Watermark({ name, employeeId }: { name: string; employeeId: string }) {
  const line1 = 'CONFIDENTIAL';
  const line2 = `${name} • ${employeeId}`;
  const line3 = fmtDate(new Date().toISOString());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">
    <g transform="rotate(-24 160 100)" fill="rgba(120,120,120,0.16)" font-family="sans-serif" text-anchor="middle">
      <text x="160" y="86" font-size="17" font-weight="700" letter-spacing="2">${line1}</text>
      <text x="160" y="110" font-size="13">${line2}</text>
      <text x="160" y="130" font-size="12">${line3}</text>
    </g>
  </svg>`;
  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 2,
        backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`,
        backgroundRepeat: 'repeat',
      }}
    />
  );
}

/**
 * Wraps any protected material (lesson plan, video, resource) with the full
 * set of client-side guards: no copy, no context menu, no drag, a per-teacher
 * watermark, and content hidden whenever the window loses focus.
 */
export function ProtectedContent({ children, watermark = true }: { children: ReactNode; watermark?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { session } = useAuth();
  const { toast } = useToast();
  const [obscured, setObscured] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cleanups = [
      guardCopy(el, () => toast('Copying is disabled for protected content.', 'warning')),
      guardContextMenu(el),
      guardBackgroundBlur(setObscured),
    ];
    return () => cleanups.forEach((fn) => fn());
  }, [toast]);

  return (
    <Box ref={ref} className="protected-content" sx={{ position: 'relative', userSelect: 'text' }}>
      {children}
      {watermark && session && <Watermark name={session.user.fullName} employeeId={session.user.employeeId} />}
      {obscured && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 5,
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'background.paper',
            backdropFilter: 'blur(14px)',
          }}
        >
          <Stack spacing={1} alignItems="center" sx={{ color: 'text.secondary', p: 3, textAlign: 'center' }}>
            <VisibilityOffOutlinedIcon />
            <Typography variant="body2" fontWeight={600}>
              Content hidden while the app is not in focus
            </Typography>
            <Typography variant="caption">Return to this window to continue reading.</Typography>
          </Stack>
        </Box>
      )}
    </Box>
  );
}
