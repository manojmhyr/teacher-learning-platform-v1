import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import { Link as RouterLink } from 'react-router-dom';
import type { LessonStatus } from '@/types';
import { tokens } from '@/theme/theme';

export function PageHeader({
  title,
  subtitle,
  crumbs,
  actions,
}: {
  title: string;
  subtitle?: string;
  crumbs?: Array<{ label: string; to?: string }>;
  actions?: ReactNode;
}) {
  return (
    <Box sx={{ mb: 3 }}>
      {crumbs && crumbs.length > 0 && (
        <Breadcrumbs sx={{ mb: 1 }} aria-label="breadcrumb">
          {crumbs.map((c) =>
            c.to ? (
              <Link key={c.label} component={RouterLink} to={c.to} underline="hover" color="inherit" variant="body2">
                {c.label}
              </Link>
            ) : (
              <Typography key={c.label} variant="body2" color="text.primary" fontWeight={600}>
                {c.label}
              </Typography>
            ),
          )}
        </Breadcrumbs>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between">
        <Box>
          <Typography variant="h4" component="h1">
            {title}
          </Typography>
          {subtitle && (
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {actions && <Box sx={{ flexShrink: 0 }}>{actions}</Box>}
      </Stack>
    </Box>
  );
}

export function progressColor(pct: number): 'success' | 'primary' | 'warning' {
  if (pct >= 80) return 'success';
  if (pct >= 40) return 'primary';
  return 'warning';
}

export function ProgressRow({ label, value, caption }: { label: string; value: number; caption?: string }) {
  return (
    <Box sx={{ py: 1 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.75 }}>
        <Typography variant="body2" fontWeight={600}>
          {label}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {caption ?? `${value}%`}
        </Typography>
      </Stack>
      <LinearProgress variant="determinate" value={Math.min(100, value)} color={progressColor(value)} />
    </Box>
  );
}

/** Compact SVG ring used on dashboard stat cards. */
export function ProgressRing({ value, size = 64, label }: { value: number; size?: number; label?: string }) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} role="img" aria-label={label ?? `${pct} percent`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.14} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={pct >= 80 ? tokens.success : pct >= 40 ? tokens.chalkGreen : tokens.warning}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <Typography variant="caption" fontWeight={800}>
          {pct}%
        </Typography>
      </Box>
    </Box>
  );
}

const STATUS_META: Record<LessonStatus, { label: string; color: 'default' | 'primary' | 'success' }> = {
  not_started: { label: 'Not started', color: 'default' },
  in_progress: { label: 'In progress', color: 'primary' },
  completed: { label: 'Completed', color: 'success' },
};

export function StatusChip({ status }: { status: LessonStatus }) {
  const meta = STATUS_META[status];
  return <Chip size="small" label={meta.label} color={meta.color} variant={status === 'not_started' ? 'outlined' : 'filled'} />;
}

export function SubjectIcon({ icon, fontSize }: { icon: 'math' | 'science'; fontSize?: 'small' | 'medium' | 'large' }) {
  return icon === 'math' ? <CalculateOutlinedIcon fontSize={fontSize} /> : <ScienceOutlinedIcon fontSize={fontSize} />;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <Stack spacing={1.5} alignItems="center" sx={{ py: 8, px: 3, textAlign: 'center', color: 'text.secondary' }}>
      <Typography variant="h6" color="text.primary">
        {title}
      </Typography>
      <Typography variant="body2" sx={{ maxWidth: 420 }}>
        {description}
      </Typography>
      {action}
    </Stack>
  );
}

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Logo">
      <rect x="2" y="3" width="28" height="26" rx="6" fill="currentColor" opacity="0.16" />
      <path d="M9 9h8a5 5 0 0 1 5 5v9h-8a5 5 0 0 1-5-5V9Z" fill="currentColor" />
      <path d="M9 9v10a5 5 0 0 0 5 5h8" stroke="currentColor" strokeWidth="1.6" fill="none" opacity="0.5" />
    </svg>
  );
}
