import { createTheme, type Theme } from '@mui/material/styles';

/**
 * Visual identity: a "chalkboard" palette rather than generic SaaS blue.
 * Highlighter yellow is reserved for the annotation layer, which ties the
 * brand to the product's core feature.
 */
export const tokens = {
  chalkGreen: '#2E5E4E',
  chalkGreenDark: '#17302A',
  inkNavy: '#1D2B4A',
  highlighter: '#F5D547',
  canvas: '#F4F6F5',
  canvasDark: '#111816',
  paper: '#FFFFFF',
  paperDark: '#18211F',
  danger: '#B3261E',
  warning: '#B26B00',
  success: '#2E7D52',
};

export const sans = '"Public Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const serif = '"Source Serif 4", Georgia, "Times New Roman", serif';

export function buildTheme(mode: 'light' | 'dark'): Theme {
  const dark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: { main: dark ? '#5FA98C' : tokens.chalkGreen, contrastText: dark ? '#06211A' : '#FFFFFF' },
      secondary: { main: dark ? '#8FA3D0' : tokens.inkNavy },
      warning: { main: tokens.warning },
      error: { main: dark ? '#F2B8B5' : tokens.danger },
      success: { main: dark ? '#7BC79B' : tokens.success },
      background: {
        default: dark ? tokens.canvasDark : tokens.canvas,
        paper: dark ? tokens.paperDark : tokens.paper,
      },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: sans,
      h1: { fontWeight: 800, letterSpacing: '-0.02em' },
      h2: { fontWeight: 800, letterSpacing: '-0.02em' },
      h3: { fontWeight: 700 },
      h4: { fontWeight: 700, letterSpacing: '-0.01em' },
      h5: { fontWeight: 700 },
      h6: { fontWeight: 700 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 14,
            boxShadow: dark ? '0 1px 2px rgba(0,0,0,.4)' : '0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.04)',
          },
        },
      },
      MuiButton: { defaultProps: { disableElevation: true } },
      MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 52 } } },
      MuiLinearProgress: { styleOverrides: { root: { height: 8, borderRadius: 99 }, bar: { borderRadius: 99 } } },
      MuiTooltip: { defaultProps: { arrow: true } },
    },
  });
}
