import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import SportsEsportsOutlinedIcon from '@mui/icons-material/SportsEsportsOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import type { Lesson, LessonContent, ProtectedDocument, Resource, Video } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useDirectory } from '@/context/DirectoryContext';
import { formatDuration, formatSize } from '@/data/demoContent';
import { contentProvider } from '@/services/content';
import { lessonCoverage, lastTaught } from '@/services/progressService';
import { usePlatform } from '@/context/PlatformContext';
import { useToast } from '@/context/ToastContext';
import { DocumentViewer } from '@/components/DocumentViewer';
import { VideoPlayer } from '@/components/VideoPlayer';
import { FractionGame } from '@/components/FractionGame';
import { QnA } from '@/components/QnA';
import { Coverage } from '@/components/Coverage';
import { PageHeader, ProgressRow } from '@/components/common';
import { SecureChip } from '@/components/Security';
import { fmtDate } from '@/utils/format';

const TABS = [
  { key: 'overview', label: 'Overview', icon: <InfoOutlinedIcon /> },
  { key: 'plan', label: 'Lesson Plan', icon: <DescriptionOutlinedIcon /> },
  { key: 'videos', label: 'Videos', icon: <PlayCircleOutlineIcon /> },
  { key: 'resources', label: 'Resources', icon: <FolderOutlinedIcon /> },
  { key: 'game', label: 'Game', icon: <SportsEsportsOutlinedIcon /> },
  { key: 'qna', label: 'Q&A', icon: <QuizOutlinedIcon /> },
  { key: 'coverage', label: 'Coverage', icon: <FactCheckOutlinedIcon /> },
] as const;

export function LessonDetailsPage() {
  const { lessonId } = useParams();
  const { session } = useAuth();
  const directory = useDirectory();
  const { records: allRecords, log } = usePlatform();
  // Resolved through the directory so an unassigned or unpublished lesson is
  // simply not found, whatever URL was typed.
  const lesson = useMemo(
    () => directory.lessonsForUser(session?.user ?? null).find((l) => l.id === lessonId),
    [directory, session, lessonId],
  );
  const records = useMemo(() => allRecords.filter((r) => r.userId === session?.user.id), [allRecords, session]);
  const { toast } = useToast();

  const [tab, setTab] = useState(0);
  const [content, setContent] = useState<LessonContent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeVideo, setActiveVideo] = useState<{ video: Video; url: string } | null>(null);
  const [activeResource, setActiveResource] = useState<ProtectedDocument | null>(null);

  // Fetch through the provider seam — identical code path for demo and Azure.
  useEffect(() => {
    if (!lessonId) return;
    const controller = new AbortController();
    setContent(null);
    setLoadError(null);
    if (!lesson) return;
    contentProvider
      .getLessonContent(lesson, controller.signal)
      .then(setContent)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : 'Could not load lesson content.');
      });
    return () => controller.abort();
  }, [lessonId, lesson]);

  const coverage = useMemo(() => lessonCoverage(records, lesson), [records, lesson]);
  const last = useMemo(() => (lesson ? lastTaught(records, lesson.id) : null), [records, lesson]);

  if (!lesson) return <Navigate to="/lessons" replace />;

  const cls = directory.getClass(lesson.classId);
  const subject = directory.getSubject(lesson.subjectId);

  const openVideo = async (video: Video) => {
    try {
      const url = await contentProvider.getVideoUrl(lesson, video);
      setActiveVideo({ video, url });
      if (session) log(session.user.id, 'watch_video', `Watched “${video.title}”`);
    } catch {
      toast('Could not open this video. Please try again.', 'error');
    }
  };

  const openResource = async (resource: Resource) => {
    try {
      const doc = await contentProvider.getResourceDocument(lesson, resource);
      setActiveResource(doc);
      if (session) log(session.user.id, 'resource', `Viewed “${resource.name}”`);
    } catch {
      toast('Could not open this resource. Please try again.', 'error');
    }
  };

  const onTabChange = (next: number) => {
    setTab(next);
    if (TABS[next].key === 'plan' && session) log(session.user.id, 'view_plan', `Opened the lesson plan for ${lesson.title}`);
  };

  return (
    <Box>
      <PageHeader
        title={lesson.title}
        subtitle={lesson.description}
        crumbs={[
          { label: 'Dashboard', to: '/' },
          { label: cls?.name ?? 'Class', to: `/classes/${lesson.classId}` },
          { label: subject?.name ?? 'Subject', to: `/classes/${lesson.classId}/${lesson.subjectId}` },
          { label: lesson.title },
        ]}
        actions={
          <Stack direction="row" spacing={1}>
            <Chip label={coverage >= 100 ? 'Completed' : coverage > 0 ? 'In progress' : 'Not started'} color={coverage > 0 ? 'primary' : 'default'} />
            <SecureChip />
          </Stack>
        }
      />

      <Card variant="outlined" sx={{ mb: 2.5 }}>
        <CardContent sx={{ py: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1, md: 4 }} alignItems={{ md: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Duration: <strong>{lesson.durationMin} minutes</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Difficulty: <strong>{lesson.difficulty}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Last taught: <strong>{last ? fmtDate(last) : 'Not yet taught'}</strong>
            </Typography>
            <Box sx={{ flex: 1, minWidth: 180 }}>
              <ProgressRow label="Coverage" value={coverage} />
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Tabs
        value={tab}
        onChange={(_, v) => onTabChange(v)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 2.5 }}
      >
        {TABS.map((t) => (
          <Tab key={t.key} label={t.label} icon={t.icon} iconPosition="start" />
        ))}
      </Tabs>

      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      )}

      {TABS[tab].key === 'overview' && <OverviewTab lesson={lesson} coverage={coverage} last={last} />}

      {TABS[tab].key === 'plan' &&
        (content ? <DocumentViewer document={content.plan} /> : <Skeleton variant="rounded" height={520} />)}

      {TABS[tab].key === 'videos' &&
        (content ? (
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' } }}>
            {content.videos.map((video) => (
              <Card key={video.id} variant="outlined">
                <Box sx={{ aspectRatio: '16 / 9', bgcolor: 'action.hover', display: 'grid', placeItems: 'center', position: 'relative' }}>
                  <PlayCircleOutlineIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.8 }} />
                  <Chip size="small" label={formatDuration(video.durationSec)} sx={{ position: 'absolute', bottom: 8, right: 8 }} />
                </Box>
                <CardContent>
                  <Typography fontWeight={700} gutterBottom>
                    {video.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 40 }}>
                    {video.description}
                  </Typography>
                  <Button variant="contained" fullWidth startIcon={<PlayCircleOutlineIcon />} onClick={() => void openVideo(video)}>
                    Watch
                  </Button>
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 1.25, color: 'text.secondary' }}>
                    <LockOutlinedIcon sx={{ fontSize: 14 }} />
                    <Typography variant="caption">Content protected — download disabled.</Typography>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' } }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rounded" height={280} />
            ))}
          </Box>
        ))}

      {TABS[tab].key === 'resources' &&
        (content ? (
          <Paper variant="outlined">
            <Stack divider={<Divider flexItem />}>
              {content.resources.map((r) => (
                <Stack key={r.id} direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} sx={{ p: 2 }}>
                  <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: 'action.hover', color: 'primary.main', display: 'grid', placeItems: 'center' }}>
                    <FolderOutlinedIcon />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={600} noWrap>
                      {r.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {r.kind.toUpperCase()} · {formatSize(r.sizeBytes)} · {r.pages} pages
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip size="small" variant="outlined" icon={<LockOutlinedIcon sx={{ fontSize: 14 }} />} label="View only" />
                    <Button variant="outlined" onClick={() => void openResource(r)}>
                      View
                    </Button>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          </Paper>
        ) : (
          <Skeleton variant="rounded" height={320} />
        ))}

      {TABS[tab].key === 'game' &&
        (content ? (
          <FractionGame
            questions={content.game}
            onComplete={(score, total) => session && log(session.user.id, 'game', `Played Fraction Match — scored ${score} / ${total}`)}
          />
        ) : (
          <Skeleton variant="rounded" height={320} />
        ))}

      {TABS[tab].key === 'qna' && (content ? <QnA items={content.qna} /> : <Skeleton variant="rounded" height={320} />)}

      {TABS[tab].key === 'coverage' && <Coverage lesson={lesson} />}

      <VideoPlayer video={activeVideo?.video ?? null} streamUrl={activeVideo?.url} open={Boolean(activeVideo)} onClose={() => setActiveVideo(null)} />

      <Dialog open={Boolean(activeResource)} onClose={() => setActiveResource(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pr: 6 }}>
          {activeResource?.title}
          <IconButton onClick={() => setActiveResource(null)} sx={{ position: 'absolute', right: 10, top: 10 }} aria-label="Close">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>{activeResource && <DocumentViewer document={activeResource} allowAnnotations={false} label="Resource" />}</DialogContent>
      </Dialog>
    </Box>
  );
}

function OverviewTab({ lesson, coverage, last }: { lesson: Lesson; coverage: number; last: string | null }) {
  return (
    <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' } }}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Learning objectives
          </Typography>
          <Stack component="ul" sx={{ pl: 2.5, m: 0 }} spacing={0.75}>
            {lesson.objectives.map((o) => (
              <Typography key={o} component="li" variant="body2">
                {o}
              </Typography>
            ))}
          </Stack>

          <Divider sx={{ my: 2.5 }} />

          <Typography variant="h6" gutterBottom>
            Lesson sequence
          </Typography>
          <Stack component="ol" sx={{ pl: 2.5, m: 0 }} spacing={0.5}>
            {lesson.topics.map((t) => (
              <Typography key={t} component="li" variant="body2" color="text.secondary">
                {t}
              </Typography>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Stack spacing={2.5}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Required materials
            </Typography>
            <Stack component="ul" sx={{ pl: 2.5, m: 0 }} spacing={0.5}>
              {lesson.materials.map((m) => (
                <Typography key={m} component="li" variant="body2">
                  {m}
                </Typography>
              ))}
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Teaching progress
            </Typography>
            <ProgressRow label="Topics covered" value={coverage} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {last ? `Last taught on ${fmtDate(last)}.` : 'This lesson has not been taught yet.'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Estimated duration: {lesson.durationMin} minutes · {lesson.difficulty}
            </Typography>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
