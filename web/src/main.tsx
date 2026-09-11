import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import { app, dataProvider, logRuntimeSummary } from '@/config/env';
import '@/index.css';

logRuntimeSummary();

const root = document.getElementById('root');
if (!root) throw new Error('MAMA CARE could not start: the #root element is missing from index.html.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * Device-storage mode only: provision the demonstration dataset the first time
 * the app is opened on this browser, so the clinical workflow can be exercised
 * without cloud credentials. Never runs against a real Firebase project, and the
 * flag only prevents a repeated attempt — `seedDemonstrationData()` refuses to
 * write twice regardless. Set VITE_LOCAL_DEMO_SEED=false to skip it entirely.
 */
const SEEDED_FLAG = 'mamacare.demo-seeded';
if (dataProvider === 'local' && app.demoSeed) {
  let flagged = false;
  try {
    flagged = localStorage.getItem(SEEDED_FLAG) === '1';
  } catch {
    flagged = false;
  }
  if (!flagged) {
    void import('@/services/demo/dataset')
      .then(({ seedDemonstrationData }) => seedDemonstrationData())
      .then((summary) => {
        try {
          localStorage.setItem(SEEDED_FLAG, '1');
        } catch {
          /* private mode — seeding still happened */
        }
        console.info(
          `[mamacare] demonstration data ready: ${summary.facilities} facilities, ${summary.users} accounts, ${summary.mothers} mothers, ${summary.alerts} alerts.`,
        );
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'unknown error';
        if (!/already exists/i.test(message)) console.warn('[mamacare] demonstration seeding was skipped:', message);
        else {
          try {
            localStorage.setItem(SEEDED_FLAG, '1');
          } catch {
            /* ignore */
          }
        }
      });
  }
}
