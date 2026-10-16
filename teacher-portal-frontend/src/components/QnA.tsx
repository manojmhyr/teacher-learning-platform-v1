import { useMemo, useState } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import type { QnAItem } from '@/types';
import { EmptyState } from '@/components/common';
import { usePlatform } from '@/context/PlatformContext';

export function QnA({ items }: { items: QnAItem[] }) {
  const { bookmarks, toggleBookmark } = usePlatform();
  const [query, setQuery] = useState('');
  const [onlySaved, setOnlySaved] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (onlySaved && !bookmarks.includes(item.id)) return false;
      if (!q) return true;
      return item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q);
    });
  }, [items, query, onlySaved, bookmarks]);

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search questions"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          fullWidth
          sx={{ maxWidth: { sm: 340 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <Chip
          label={`Saved (${bookmarks.length})`}
          icon={<BookmarkIcon sx={{ fontSize: 16 }} />}
          variant={onlySaved ? 'filled' : 'outlined'}
          color={onlySaved ? 'primary' : 'default'}
          onClick={() => setOnlySaved((v) => !v)}
        />
      </Stack>

      {filtered.length === 0 ? (
        <EmptyState
          title="No questions match"
          description={onlySaved ? 'You have not saved any questions for this lesson yet.' : 'Try a different search term.'}
        />
      ) : (
        filtered.map((item) => {
          const saved = bookmarks.includes(item.id);
          return (
            <Accordion key={item.id} disableGutters variant="outlined" sx={{ '&:before': { display: 'none' }, mb: 1, borderRadius: 1.5 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%', pr: 1 }}>
                  <Typography fontWeight={600} sx={{ flex: 1 }}>
                    {item.question}
                  </Typography>
                  <Tooltip title={saved ? 'Remove from saved' : 'Save this question'}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleBookmark(item.id);
                      }}
                      aria-label={saved ? 'Remove bookmark' : 'Add bookmark'}
                    >
                      {saved ? <BookmarkIcon fontSize="small" color="primary" /> : <BookmarkBorderIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.75 }}>
                  {item.answer}
                </Typography>
                <Stack direction="row" spacing={0.75} sx={{ mt: 1.5 }}>
                  {item.tags.map((t) => (
                    <Chip key={t} size="small" label={t} variant="outlined" />
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          );
        })
      )}
    </Box>
  );
}
