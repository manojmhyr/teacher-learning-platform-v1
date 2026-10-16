import { Fragment, useMemo } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import BorderColorOutlinedIcon from '@mui/icons-material/BorderColorOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import LoginOutlinedIcon from '@mui/icons-material/LoginOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import SportsEsportsOutlinedIcon from '@mui/icons-material/SportsEsportsOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import type { Activity, ActivityKind } from '@/types';
import { usePlatform } from '@/context/PlatformContext';
import { useAuth } from '@/context/AuthContext';
import { useDirectory } from '@/context/DirectoryContext';
import { EmptyState, PageHeader } from '@/components/common';
import { dayLabel, fmtTime } from '@/utils/format';

const ICONS: Record<ActivityKind, React.ReactNode> = {
  login: <LoginOutlinedIcon fontSize="small" />,
  view_plan: <DescriptionOutlinedIcon fontSize="small" />,
  watch_video: <PlayCircleOutlineIcon fontSize="small" />,
  coverage: <CheckCircleOutlineIcon fontSize="small" />,
  note: <BorderColorOutlinedIcon fontSize="small" />,
  game: <SportsEsportsOutlinedIcon fontSize="small" />,
  resource: <FolderOutlinedIcon fontSize="small" />,
  admin: <SettingsOutlinedIcon fontSize="small" />,
  security: <ShieldOutlinedIcon fontSize="small" />,
};

/** Timeline grouped into Today / Yesterday / date, reused on the dashboard. */
export function ActivityList({ activities, dense = false, showUser = false }: { activities: Activity[]; dense?: boolean; showUser?: boolean }) {
  const directory = useDirectory();
  const groups = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const a of activities) {
      const label = dayLabel(a.at);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(a);
    }
    return [...map.entries()];
  }, [activities]);

  if (activities.length === 0) {
    return <EmptyState title="No activity yet" description="Your recent actions in the portal will appear here." />;
  }

  return (
    <Box>
      {groups.map(([label, items]) => (
        <Fragment key={label}>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: dense ? 1 : 2.5, mb: 0.5 }}>
            {label}
          </Typography>
          {items.map((a) => (
            <Stack key={a.id} direction="row" spacing={1.5} alignItems="flex-start" sx={{ py: 0.9 }}>
              <Box sx={{ color: 'primary.main', mt: '2px' }}>{ICONS[a.kind]}</Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2">{a.text}</Typography>
                {showUser && (
                  <Typography variant="caption" color="text.secondary">
                    {directory.getUser(a.userId)?.fullName ?? 'Unknown user'}
                  </Typography>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                {fmtTime(a.at)}
              </Typography>
            </Stack>
          ))}
        </Fragment>
      ))}
    </Box>
  );
}

export function ActivityPage() {
  const { activitiesFor } = usePlatform();
  const { session } = useAuth();
  const activities = session ? activitiesFor(session.user.id) : [];
  return (
    <Box>
      <PageHeader
        title="Recent activity"
        subtitle="Everything you have done in the portal. Activity is retained for compliance and visible to your administrator."
        crumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Recent activity' }]}
      />
      <Card variant="outlined">
        <CardContent>
          <ActivityList activities={activities} />
        </CardContent>
      </Card>
    </Box>
  );
}
