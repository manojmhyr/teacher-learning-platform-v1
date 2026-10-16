import { useState } from 'react';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import ClassOutlinedIcon from '@mui/icons-material/ClassOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import { useAuth } from '@/context/AuthContext';
import { LogoMark } from '@/components/common';
import { config } from '@/config/env';
import { tokens } from '@/theme/theme';
import { fmtDate } from '@/utils/format';

const SIDEBAR_WIDTH = 268;

const MAIN_NAV = [
  { to: '/', label: 'Dashboard', icon: <DashboardOutlinedIcon /> },
  { to: '/classes', label: 'My Classes', icon: <GroupsOutlinedIcon /> },
  { to: '/subjects', label: 'Subjects', icon: <ClassOutlinedIcon /> },
  { to: '/lessons', label: 'Lessons', icon: <LibraryBooksOutlinedIcon /> },
  { to: '/progress', label: 'Teaching Progress', icon: <TrendingUpOutlinedIcon /> },
  { to: '/activity', label: 'Recent Activity', icon: <HistoryOutlinedIcon /> },
];

const BOTTOM_NAV = [
  { to: '/profile', label: 'Profile', icon: <PersonOutlineIcon /> },
  { to: '/settings', label: 'Settings', icon: <SettingsOutlinedIcon /> },
  { to: '/admin', label: 'Admin console', icon: <AdminPanelSettingsOutlinedIcon /> },
];

export function AppLayout() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const { session, signOut, isAdmin } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const active = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));

  const sidebar = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: tokens.chalkGreenDark, color: 'rgba(255,255,255,.9)' }}>
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ p: 2.5, color: tokens.highlighter }}>
        <LogoMark />
        <Box>
          <Typography fontWeight={800} color="#fff" lineHeight={1.2}>
            {config.organisation}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.6)' }}>
            {config.appName}
          </Typography>
        </Box>
      </Stack>

      {session && (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mx: 2, mb: 1, p: 1.25, borderRadius: 2, bgcolor: 'rgba(255,255,255,.07)' }}>
          <Avatar sx={{ bgcolor: tokens.highlighter, color: '#000', fontWeight: 700, width: 38, height: 38 }}>
            {session.user.fullName
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography fontWeight={700} color="#fff" noWrap>
              {session.user.fullName}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.65)' }} noWrap>
              {session.user.title}
            </Typography>
          </Box>
        </Stack>
      )}

      <List sx={{ px: 1.25, flex: 1 }}>
        {MAIN_NAV.map((item) => (
          <ListItemButton
            key={item.to}
            component={RouterLink}
            to={item.to}
            selected={active(item.to)}
            onClick={() => setDrawerOpen(false)}
            sx={{
              borderRadius: 2,
              mb: 0.25,
              color: 'inherit',
              '&.Mui-selected': { bgcolor: 'rgba(255,255,255,.12)', borderLeft: `3px solid ${tokens.highlighter}` },
              '&:hover': { bgcolor: 'rgba(255,255,255,.08)' },
            }}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: active(item.to) ? 700 : 500 }} />
          </ListItemButton>
        ))}
      </List>

      <List sx={{ px: 1.25, pb: 1 }}>
        {BOTTOM_NAV.filter((item) => isAdmin || item.to !== '/admin').map((item) => (
          <ListItemButton
            key={item.to}
            component={RouterLink}
            to={item.to}
            selected={active(item.to)}
            onClick={() => setDrawerOpen(false)}
            sx={{ borderRadius: 2, color: 'inherit', '&:hover': { bgcolor: 'rgba(255,255,255,.08)' } }}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
        <ListItemButton onClick={() => setConfirmLogout(true)} sx={{ borderRadius: 2, color: 'inherit', '&:hover': { bgcolor: 'rgba(255,255,255,.08)' } }}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
            <LogoutOutlinedIcon />
          </ListItemIcon>
          <ListItemText primary="Logout" />
        </ListItemButton>
      </List>

      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ px: 2.5, py: 1.5, color: 'rgba(255,255,255,.5)' }}>
        <LockOutlinedIcon sx={{ fontSize: 14 }} />
        <Typography variant="caption">Internal use only · Session secured</Typography>
      </Stack>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {isDesktop ? (
        <Box component="nav" sx={{ width: SIDEBAR_WIDTH, flexShrink: 0, position: 'fixed', inset: '0 auto 0 0' }}>
          {sidebar}
        </Box>
      ) : (
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} PaperProps={{ sx: { width: SIDEBAR_WIDTH, border: 0 } }}>
          {sidebar}
        </Drawer>
      )}

      <Box sx={{ flex: 1, ml: { lg: `${SIDEBAR_WIDTH}px` }, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBar
          position="sticky"
          elevation={0}
          color="inherit"
          sx={{ backdropFilter: 'blur(8px)', bgcolor: 'rgba(255,255,255,.75)', borderBottom: 1, borderColor: 'divider', ...(theme.palette.mode === 'dark' && { bgcolor: 'rgba(17,24,22,.75)' }) }}
        >
          <Toolbar sx={{ gap: 1 }}>
            {!isDesktop && (
              <IconButton edge="start" onClick={() => setDrawerOpen(true)} aria-label="Open navigation">
                <MenuIcon />
              </IconButton>
            )}
            <Box sx={{ flex: 1 }} />
            <Chip size="small" variant="outlined" icon={<LockOutlinedIcon sx={{ fontSize: 15 }} />} label="Internal use only" />
            {!isPhone && (
              <Typography variant="body2" color="text.secondary">
                {fmtDate(new Date().toISOString())}
              </Typography>
            )}
            {session && (
              <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: 14, fontWeight: 700 }}>
                {session.user.fullName
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)}
              </Avatar>
            )}
          </Toolbar>
        </AppBar>

        <Box component="main" sx={{ flex: 1, p: { xs: 2, sm: 3, lg: 4 }, pb: { xs: 10, sm: 3 }, maxWidth: 1400, width: '100%', mx: 'auto' }}>
          <Outlet />
        </Box>

        {isPhone && (
          <BottomNavigation
            showLabels
            value={MAIN_NAV.findIndex((n) => active(n.to))}
            sx={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 1200,
              borderTop: 1,
              borderColor: 'divider',
              pb: 'env(safe-area-inset-bottom, 0px)',
              height: 'auto',
            }}
          >
            {[MAIN_NAV[0], MAIN_NAV[1], MAIN_NAV[4], MAIN_NAV[5]].map((item) => (
              <BottomNavigationAction key={item.to} label={item.label} icon={item.icon} onClick={() => navigate(item.to)} />
            ))}
          </BottomNavigation>
        )}
      </Box>

      <Dialog open={confirmLogout} onClose={() => setConfirmLogout(false)}>
        <DialogTitle>Sign out?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Signing out clears all cached content and your saved highlights from this device, so nothing protected is left behind.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmLogout(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={async () => {
              setConfirmLogout(false);
              await signOut('user');
            }}
          >
            Sign out
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
