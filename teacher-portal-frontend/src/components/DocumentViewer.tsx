import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Badge from '@mui/material/Badge';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SearchIcon from '@mui/icons-material/Search';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import BorderColorOutlinedIcon from '@mui/icons-material/BorderColorOutlined';
import AutoFixOffOutlinedIcon from '@mui/icons-material/AutoFixOffOutlined';
import BookmarksOutlinedIcon from '@mui/icons-material/BookmarksOutlined';
import type { Annotation, DocBlock, ProtectedDocument } from '@/types';
import { ProtectedContent, Watermark } from '@/components/Security';
import { serif, tokens } from '@/theme/theme';
import { usePlatform } from '@/context/PlatformContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

interface Props {
  document: ProtectedDocument;
  /** Highlighting is only offered where a personal annotation layer makes sense. */
  allowAnnotations?: boolean;
  label?: string;
}

interface Segment {
  text: string;
  highlighted: boolean;
  match: boolean;
  annotationId?: string;
}

/**
 * Read-only viewer for protected documents.
 *
 * The document is rendered from structured text blocks rather than a PDF, so
 * it reflows on a phone, works offline-free, and — crucially — highlights
 * anchor to character offsets within a block rather than to page coordinates.
 * That keeps a teacher's annotations stable across devices, zoom levels and
 * font sizes.
 */
export function DocumentViewer({ document: doc, allowAnnotations = true, label = 'Lesson Plan' }: Props) {
  const { annotations, addAnnotation, removeAnnotation } = usePlatform();
  const { session } = useAuth();
  const { toast } = useToast();

  const [pageIdx, setPageIdx] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [query, setQuery] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [eraseMode, setEraseMode] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const page = doc.pages[Math.min(pageIdx, doc.pages.length - 1)];
  const docAnnotations = useMemo(
    () => annotations.filter((a) => a.documentId === doc.id && a.userId === session?.user.id),
    [annotations, doc.id, session],
  );

  useEffect(() => {
    setPageIdx(0);
  }, [doc.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [pageIdx]);

  // Esc leaves fullscreen.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  /** Captures a text selection and stores it as an offset range within one block. */
  const captureSelection = useCallback(() => {
    if (!allowAnnotations || eraseMode) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const startEl = (range.startContainer.parentElement as HTMLElement | null)?.closest('[data-block-id]');
    const endEl = (range.endContainer.parentElement as HTMLElement | null)?.closest('[data-block-id]');
    if (!startEl || startEl !== endEl) {
      toast('Select text within a single paragraph to highlight it.', 'info');
      sel.removeAllRanges();
      return;
    }

    const blockId = startEl.getAttribute('data-block-id')!;
    const blockText = startEl.textContent ?? '';
    const selected = sel.toString();
    if (!selected.trim()) return;

    // Map the visible selection back to an offset in the block's own text.
    const before = range.cloneRange();
    before.selectNodeContents(startEl);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;
    const end = start + selected.length;
    if (end > blockText.length) return;

    if (!session) return;
    addAnnotation({ userId: session.user.id, documentId: doc.id, pageNumber: page.number, blockId, start, end });
    sel.removeAllRanges();
    toast('Highlight saved to your personal annotations.');
  }, [allowAnnotations, eraseMode, addAnnotation, doc.id, page.number, toast, session]);

  /**
   * Splits a block's text into render segments, merging overlapping highlights
   * and marking search matches.
   */
  const segmentsFor = useCallback(
    (block: DocBlock): Segment[] => {
      const marks: Array<{ start: number; end: number; id?: string; kind: 'hl' | 'match' }> = [];
      for (const a of docAnnotations) {
        if (a.blockId === block.id) marks.push({ start: a.start, end: a.end, id: a.id, kind: 'hl' });
      }
      if (query.trim()) {
        const needle = query.trim().toLowerCase();
        const hay = block.text.toLowerCase();
        let from = 0;
        for (;;) {
          const idx = hay.indexOf(needle, from);
          if (idx === -1) break;
          marks.push({ start: idx, end: idx + needle.length, kind: 'match' });
          from = idx + needle.length;
        }
      }
      if (marks.length === 0) return [{ text: block.text, highlighted: false, match: false }];

      const points = new Set<number>([0, block.text.length]);
      marks.forEach((m) => {
        points.add(Math.max(0, m.start));
        points.add(Math.min(block.text.length, m.end));
      });
      const sorted = [...points].sort((a, b) => a - b);

      const out: Segment[] = [];
      for (let i = 0; i < sorted.length - 1; i += 1) {
        const [s, e] = [sorted[i], sorted[i + 1]];
        if (e <= s) continue;
        const covering = marks.filter((m) => m.start <= s && m.end >= e);
        out.push({
          text: block.text.slice(s, e),
          highlighted: covering.some((m) => m.kind === 'hl'),
          match: covering.some((m) => m.kind === 'match'),
          annotationId: covering.find((m) => m.kind === 'hl')?.id,
        });
      }
      return out;
    },
    [docAnnotations, query],
  );

  const matchCount = useMemo(() => {
    if (!query.trim()) return 0;
    const needle = query.trim().toLowerCase();
    return doc.pages.reduce(
      (sum, p) => sum + p.blocks.reduce((s, b) => s + (b.text.toLowerCase().split(needle).length - 1), 0),
      0,
    );
  }, [doc.pages, query]);

  const pageMatchCount = useMemo(() => {
    if (!query.trim()) return 0;
    const needle = query.trim().toLowerCase();
    return page.blocks.reduce((s, b) => s + (b.text.toLowerCase().split(needle).length - 1), 0);
  }, [page, query]);

  const onSegmentClick = (annotationId?: string) => {
    if (!eraseMode || !annotationId) return;
    removeAnnotation(annotationId);
    toast('Highlight removed.');
  };

  const blockStyle = (type: DocBlock['type']) => {
    switch (type) {
      case 'h1':
        return { fontFamily: serif, fontSize: '1.7rem', fontWeight: 700, mt: 1, mb: 1.5 };
      case 'h2':
        return { fontFamily: serif, fontSize: '1.22rem', fontWeight: 700, mt: 2.5, mb: 1 };
      case 'h3':
        return { fontFamily: serif, fontSize: '1.05rem', fontWeight: 700, mt: 2, mb: 0.75 };
      case 'li':
        return { fontFamily: serif, mb: 0.75, pl: 2.5, position: 'relative' as const };
      case 'quote':
        return { fontFamily: serif, my: 2, pl: 2, borderLeft: `3px solid ${tokens.highlighter}`, fontStyle: 'italic' as const, color: 'text.secondary' };
      case 'meta':
        return { fontSize: '0.8rem', color: 'text.secondary', mb: 1 };
      default:
        return { fontFamily: serif, mb: 1.25, lineHeight: 1.75 };
    }
  };

  const viewer = (
    <Paper variant="outlined" sx={{ overflow: 'hidden', ...(fullscreen ? { height: '100%', borderRadius: 0, border: 0 } : {}) }}>
      {/* Toolbar */}
      <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems={{ lg: 'center' }} justifyContent="space-between">
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={700} noWrap>
              {label}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {doc.title}
            </Typography>
          </Box>

          <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <IconButton size="small" onClick={() => setPageIdx((p) => Math.max(0, p - 1))} disabled={pageIdx === 0} aria-label="Previous page">
              <ChevronLeftIcon />
            </IconButton>
            <Typography variant="body2" sx={{ minWidth: 76, textAlign: 'center' }}>
              Page {page.number} / {doc.pages.length}
            </Typography>
            <IconButton
              size="small"
              onClick={() => setPageIdx((p) => Math.min(doc.pages.length - 1, p + 1))}
              disabled={pageIdx >= doc.pages.length - 1}
              aria-label="Next page"
            >
              <ChevronRightIcon />
            </IconButton>

            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

            <IconButton size="small" onClick={() => setZoom((z) => Math.max(60, z - 10))} disabled={zoom <= 60} aria-label="Zoom out">
              <ZoomOutIcon />
            </IconButton>
            <Typography variant="body2" sx={{ minWidth: 44, textAlign: 'center' }}>
              {zoom}%
            </Typography>
            <IconButton size="small" onClick={() => setZoom((z) => Math.min(180, z + 10))} disabled={zoom >= 180} aria-label="Zoom in">
              <ZoomInIcon />
            </IconButton>

            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

            {allowAnnotations && (
              <>
                <Tooltip title="Select text in the document to highlight it">
                  <Chip
                    size="small"
                    icon={<BorderColorOutlinedIcon sx={{ fontSize: 16 }} />}
                    label="Highlight"
                    variant={eraseMode ? 'outlined' : 'filled'}
                    onClick={() => setEraseMode(false)}
                    sx={{ fontWeight: 600, bgcolor: eraseMode ? undefined : tokens.highlighter, color: eraseMode ? undefined : '#000' }}
                  />
                </Tooltip>
                <Tooltip title="Click a highlight to remove it">
                  <IconButton size="small" color={eraseMode ? 'primary' : 'default'} onClick={() => setEraseMode((m) => !m)} aria-label="Remove highlight">
                    <AutoFixOffOutlinedIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="My highlights">
                  <IconButton size="small" onClick={() => setDrawerOpen(true)} aria-label="My highlights">
                    <Badge badgeContent={docAnnotations.length} color="primary">
                      <BookmarksOutlinedIcon />
                    </Badge>
                  </IconButton>
                </Tooltip>
              </>
            )}

            <Tooltip title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              <IconButton size="small" onClick={() => setFullscreen((f) => !f)} aria-label="Toggle fullscreen">
                {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mt: 1.5 }}>
          <TextField
            size="small"
            placeholder="Search in document"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            sx={{ maxWidth: { sm: 280 } }}
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: query ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setQuery('')} aria-label="Clear search">
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
          {query.trim() && (
            <Typography variant="caption" color="text.secondary">
              {matchCount} match{matchCount === 1 ? '' : 'es'} in document · {pageMatchCount} on this page
            </Typography>
          )}
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Downloads are disabled by your administrator to protect organisational teaching content">
            <span>
              <Button size="small" variant="outlined" startIcon={<LockOutlinedIcon />} disabled>
                Download disabled by administrator
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Box>

      {/* Document surface */}
      <Box
        ref={scrollRef}
        sx={{
          bgcolor: 'action.hover',
          p: { xs: 1.5, sm: 3 },
          maxHeight: fullscreen ? 'calc(100vh - 190px)' : { xs: 440, md: 620 },
          overflow: 'auto',
        }}
      >
        {/* Watermark sits on the page itself, not the surrounding tray. */}
        <ProtectedContent watermark={false}>
          <Paper
            elevation={0}
            onMouseUp={captureSelection}
            onTouchEnd={captureSelection}
            sx={{
              mx: 'auto',
              maxWidth: 820,
              width: `${zoom}%`,
              p: { xs: 2.5, sm: 5 },
              border: 1,
              borderColor: 'divider',
              cursor: eraseMode ? 'crosshair' : 'text',
              position: 'relative',
            }}
          >
            {session && <Watermark name={session.user.fullName} employeeId={session.user.employeeId} />}
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 3, color: 'text.secondary' }}>
              <Typography variant="caption">{doc.subtitle}</Typography>
              <Typography variant="caption">Internal use only</Typography>
            </Stack>

            {page.blocks.map((block) => (
              <Typography
                key={block.id}
                data-block-id={block.id}
                component={block.type === 'li' ? 'li' : 'p'}
                sx={{
                  ...blockStyle(block.type),
                  ...(block.type === 'li' ? { listStyle: 'none' } : {}),
                }}
              >
                {block.type === 'li' && (
                  <Box component="span" aria-hidden sx={{ position: 'absolute', left: 8, color: 'primary.main' }}>
                    •
                  </Box>
                )}
                {segmentsFor(block).map((seg, i) => (
                  <Box
                    key={i}
                    component="span"
                    onClick={() => onSegmentClick(seg.annotationId)}
                    sx={{
                      ...(seg.highlighted
                        ? { bgcolor: tokens.highlighter, color: '#000', borderRadius: '2px', px: '1px', cursor: eraseMode ? 'pointer' : 'inherit' }
                        : {}),
                      ...(seg.match ? { outline: `2px solid ${tokens.chalkGreen}`, outlineOffset: '1px', borderRadius: '2px' } : {}),
                    }}
                  >
                    {seg.text}
                  </Box>
                ))}
              </Typography>
            ))}

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 4, textAlign: 'center' }}>
              Page {page.number} of {doc.pages.length}
            </Typography>
          </Paper>
        </ProtectedContent>
      </Box>

      <Box sx={{ px: 2, py: 1.25, borderTop: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary' }}>
          <LockOutlinedIcon sx={{ fontSize: 16 }} />
          <Typography variant="caption">
            Read-only document. Your highlights are personal annotations and do not change the original.
            {doc.origin === 'azure' ? ' Served from managed storage.' : ''}
          </Typography>
        </Stack>
      </Box>
    </Paper>
  );

  return (
    <>
      {fullscreen ? (
        <Box sx={{ position: 'fixed', inset: 0, zIndex: 1300, bgcolor: 'background.default', p: { xs: 0, sm: 2 } }}>{viewer}</Box>
      ) : (
        viewer
      )}

      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: { xs: 300, sm: 360 }, p: 2 }} role="presentation">
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="h6">My highlights</Typography>
            <IconButton onClick={() => setDrawerOpen(false)} aria-label="Close">
              <CloseIcon />
            </IconButton>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Personal annotations, visible only to you.
          </Typography>
          {docAnnotations.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
              No highlights yet. Select text in the document to add one.
            </Typography>
          ) : (
            <List dense>
              {docAnnotations.map((a: Annotation) => {
                const block = doc.pages.flatMap((p) => p.blocks).find((b) => b.id === a.blockId);
                return (
                  <ListItem
                    key={a.id}
                    disableGutters
                    secondaryAction={
                      <IconButton edge="end" size="small" onClick={() => removeAnnotation(a.id)} aria-label="Remove highlight">
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    }
                  >
                    <ListItemText
                      primary={block ? block.text.slice(a.start, a.end) : '—'}
                      secondary={`Page ${a.pageNumber}`}
                      primaryTypographyProps={{ sx: { bgcolor: tokens.highlighter, color: '#000', px: 0.5, borderRadius: 0.5, display: 'inline' } }}
                    />
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>
      </Drawer>
    </>
  );
}
