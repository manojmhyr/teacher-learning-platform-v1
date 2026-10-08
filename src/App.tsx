import { useEffect, useMemo, type ReactNode } from 'react';
import { BrowserRouter, HashRouter, MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import CssBaseline from '@mui/material/CssBaseline';
import useMediaQuery from '@mui/material/useMediaQuery';
import { ThemeProvider } from '@mui/material/styles';
import { Capacitor } from '@capacitor/core';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { DirectoryProvider } from '@/context/DirectoryContext';
import { PlatformProvider, usePlatform } from '@/context/PlatformContext';
import { SecurityProvider } from '@/context/SecurityContext';
import { ToastProvider } from '@/context/ToastContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppLayout } from '@/layouts/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ClassesPage, SubjectsPage } from '@/pages/ClassesPage';
import { LessonsPage } from '@/pages/LessonsPage';
import { LessonDetailsPage } from '@/pages/LessonDetailsPage';
import { ProgressPage } from '@/pages/ProgressPage';
import { ActivityPage } from '@/pages/ActivityPage';
import { AdminPage } from '@/pages/AdminPage';
import { ForbiddenPage, ForcedPasswordChangePage, NotFoundPage, ProfilePage, SettingsPage } from '@/pages/AccountPages';
import { buildTheme } from '@/theme/theme';

/**
 * Router choice by environment.
 *
 * BrowserRouter is correct when the app is served over HTTP (web and the
 * Capacitor webview, which serves from a real localhost origin). HashRouter
 * covers a build opened directly from disk, and MemoryRouter is the fallback
 * for sandboxed contexts with no usable document URL, where parsing the
 * location would throw.
 */
function pickRouter(): typeof BrowserRouter {
  try {
    const { protocol, href } = window.location;
    new URL(href);
    if (Capacitor.isNativePlatform() || protocol === 'http:' || protocol === 'https:') return BrowserRouter;
    if (protocol === 'file:') return HashRouter;
    return MemoryRouter;
  } catch {
    return MemoryRouter;
  }
}

function Router({ children }: { children: ReactNode }) {
  const Selected = useMemo(pickRouter, []);
  return <Selected>{children}</Selected>;
}

/** Applies the user's theme preference, falling back to the OS setting. */
function Themed({ children }: { children: ReactNode }) {
  const { colorPref } = usePlatform();
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const mode = colorPref === 'system' ? (prefersDark ? 'dark' : 'light') : colorPref;
  const theme = useMemo(() => buildTheme(mode), [mode]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
  }, [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, restoring, mustChangePassword } = useAuth();
  const location = useLocation();
  if (restoring) return <SplashScreen />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // A temporary password gets you exactly one screen: the one that replaces it.
  if (mustChangePassword) return <ForcedPasswordChangePage />;
  return <>{children}</>;
}

/** Admin-only routes. A teacher reaching one is told, not silently redirected. */
function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <ForbiddenPage />;
  return <>{children}</>;
}

/** Shown briefly while a stored session is checked. */
function SplashScreen() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <CircularProgress />
    </Box>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    try {
      window.scrollTo(0, 0);
    } catch {
      /* some embedded webviews return a value here; never let it break routing */
    }
  }, [pathname]);
  return null;
}

/** Resets the error boundary when the route changes. */
function RouteBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <ErrorBoundary resetKey={pathname} onHome={() => navigate('/')}>
      {children}
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <DirectoryProvider>
      <AuthProvider>
        <PlatformProvider>
          <Themed>
            <ToastProvider>
              <SecurityProvider>
              <Router>
                <ScrollToTop />
                <RouteBoundary>
                  <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route
                      element={
                        <RequireAuth>
                          <AppLayout />
                        </RequireAuth>
                      }
                    >
                      <Route index element={<DashboardPage />} />
                      <Route path="classes" element={<ClassesPage />} />
                      <Route path="classes/:classId" element={<SubjectsPage />} />
                      <Route path="classes/:classId/:subjectId" element={<LessonsPage />} />
                      <Route path="subjects" element={<SubjectsPage />} />
                      <Route path="lessons" element={<LessonsPage />} />
                      <Route path="lessons/:lessonId" element={<LessonDetailsPage />} />
                      <Route path="progress" element={<ProgressPage />} />
                      <Route path="activity" element={<ActivityPage />} />
                      <Route
                        path="admin"
                        element={
                          <RequireAdmin>
                            <AdminPage />
                          </RequireAdmin>
                        }
                      />
                      <Route path="profile" element={<ProfilePage />} />
                      <Route path="settings" element={<SettingsPage />} />
                      <Route path="*" element={<NotFoundPage />} />
                    </Route>
                  </Routes>
                </RouteBoundary>
              </Router>
              </SecurityProvider>
            </ToastProvider>
          </Themed>
        </PlatformProvider>
      </AuthProvider>
    </DirectoryProvider>
  );
}
