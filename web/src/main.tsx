import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import { logRuntimeSummary } from '@/config/env';
import '@/index.css';

logRuntimeSummary();

const root = document.getElementById('root');
if (!root) throw new Error('MAMA CARE could not start: the #root element is missing from index.html.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
