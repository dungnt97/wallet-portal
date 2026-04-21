// Entry point — mounts React app + global styles
// Sentry must init before React renders so the ErrorBoundary captures boot errors.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary, initSentry } from './observability/sentry';
import './styles/globals.css';

initSentry();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found in index.html');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary fallback={<div style={{ padding: 24 }}>An unexpected error occurred.</div>}>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
