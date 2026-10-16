import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL as NodeURL } from 'node:url';

/**
 * Content-Security-Policy for the built app.
 *
 * Kept in one place so the same policy is applied by the dev server, the static
 * host (via the generated `staticwebapp.config.json` / `_headers`) and the
 * Capacitor webview. `connect-src` is widened at build time from the configured
 * API + Azure Blob origins so the app can talk to them and nothing else.
 */
export function buildCsp(env: Record<string, string | undefined>, target: 'meta' | 'header' = 'header'): string {
  const extra = [env.VITE_API_BASE_URL, env.VITE_AZURE_BLOB_BASE_URL]
    .filter(Boolean)
    .map((u) => {
      try {
        return new URL(u as string).origin;
      } catch {
        return '';
      }
    })
    .filter(Boolean);

  return [
    "default-src 'self'",
    // Capacitor serves the app from capacitor://localhost (iOS) / https://localhost (Android).
    `connect-src 'self' https://localhost capacitor://localhost ${extra.join(' ')}`.trim(),
    "img-src 'self' data: blob:",
    "media-src 'self' blob: " + extra.join(' '),
    // MUI/emotion inject styles at runtime, so inline styles must be allowed.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "script-src 'self'",
    "object-src 'none'",
    // frame-ancestors is ignored in a <meta> tag — it is only honoured as a
    // real response header, so it goes in the host config files only.
    ...(target === 'header' ? ["frame-ancestors 'none'"] : []),
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/** Injects the CSP meta tag into index.html and emits host header config files. */
function securityHeaders(env: Record<string, string | undefined>): Plugin {
  const csp = buildCsp(env, 'header');
  const metaCsp = buildCsp(env, 'meta');
  return {
    name: 'security-headers',
    transformIndexHtml(html) {
      return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${metaCsp}" />`);
    },
    generateBundle() {
      // Azure Static Web Apps
      this.emitFile({
        type: 'asset',
        fileName: 'staticwebapp.config.json',
        source: JSON.stringify(
          {
            navigationFallback: { rewrite: '/index.html' },
            globalHeaders: {
              'Content-Security-Policy': csp,
              'X-Frame-Options': 'DENY',
              'X-Content-Type-Options': 'nosniff',
              'Referrer-Policy': 'no-referrer',
              'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
              'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
              'Cache-Control': 'no-store',
            },
          },
          null,
          2,
        ),
      });
      // Netlify / Cloudflare Pages
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: `/*\n  Content-Security-Policy: ${csp}\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Cache-Control: no-store\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Read .env, .env.local and .env.[mode] the same way the app bundle does — process.env
  // alone misses them, which left the API origin out of connect-src and blocked every call.
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env } as Record<string, string | undefined>;
  return {
    plugins: [react(), securityHeaders(env)],
    resolve: {
      alias: [
        { find: '@', replacement: fileURLToPath(new NodeURL('./src', import.meta.url)) },
        // @mui/icons-material v5 ships CommonJS at the package root. Vite 8's
        // Rolldown interop hands those default imports back as `{ default }`
        // objects, which React rejects and the whole app renders blank. Point
        // deep icon imports at the package's ESM build instead.
        { find: /^@mui\/icons-material\/(?!esm\/)(.+)$/, replacement: '@mui/icons-material/esm/$1' },
      ],
    },
    build: {
      target: 'es2017',
      sourcemap: mode !== 'production',
      rollupOptions: {
        output: {
          // Rolldown (Vite 8) only accepts the function form of manualChunks.
          manualChunks(id: string) {
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react';
            if (/[\\/]node_modules[\\/]@mui[\\/](material|icons-material)[\\/]/.test(id)) return 'mui';
          },
        },
      },
    },
    server: {
      port: 5173,
      // With VITE_API_BASE_URL=/ (see .env.mobile) the app calls its own origin
      // and these routes are forwarded to Spring Boot. A phone or emulator then
      // needs to reach only this one address — no CORS, no mixed content.
      proxy: Object.fromEntries(
        ['/api', '/auth'].map((prefix) => [
          prefix,
          {
            target: env.VITE_API_PROXY_TARGET || 'http://localhost:8080',
            changeOrigin: true,
            xfwd: true,
            // Server-to-server from here on; the browser's Origin would trip Spring's CORS check.
            configure: (proxy) => {
              proxy.on('proxyReq', (req) => req.removeHeader('origin'));
            },
          },
        ]),
      ),
      headers: {
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  };
});
