import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { App } from './App.js';
import { createQueryClient } from './api/queries.js';
import { AuthProvider } from './auth/AuthProvider.js';
import { ToastProvider } from './toast/ToastProvider.js';
import { ErrorBoundary } from './ui/ErrorBoundary.js';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

// One client for the life of the page. AuthProvider clears it on sign-in and sign-out,
// so cached data never outlives the account it belongs to.
const queryClient = createQueryClient();

/*
 * Order matters in two places.
 *
 * `ToastProvider` is outside `AuthProvider` because losing a session is one of the things
 * worth announcing, so the thing that announces it has to already exist. It is inside the
 * boundary because a toast about a crash is no use once the tree holding the toaster is
 * the thing that crashed — that case is the boundary's, and it renders a whole screen.
 */
createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
