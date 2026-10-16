import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { assertConfigValid } from '@/config/env';
import { isAndroidBrowser } from '@/security/platformGate';
import { AppRequiredScreen } from '@/security/AppRequiredScreen';

const problems = assertConfigValid();
if (problems.length) {
  // Fail loudly rather than silently showing empty lesson content.
  console.error('[Teacher Portal] configuration problems:\n' + problems.map((p) => ` • ${p}`).join('\n'));
}

const root = document.getElementById('root');
if (root) {
  root.setAttribute('data-mounted', 'true');
  // In an Android browser the portal never starts: nothing loads, nothing to capture.
  createRoot(root).render(<StrictMode>{isAndroidBrowser() ? <AppRequiredScreen /> : <App />}</StrictMode>);
}
