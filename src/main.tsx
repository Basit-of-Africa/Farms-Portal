import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { Toaster } from './components/ui/sonner';
import { ConfirmProvider } from './components/ui/confirm';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfirmProvider>
      <App />
      <Toaster />
    </ConfirmProvider>
  </StrictMode>,
);

// Register Progressive Web App (PWA) Service Worker
if ('serviceWorker' in navigator) {
  const registerSW = () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('⚡ [PWA] Service Worker registered successfully with scope:', registration.scope);
      })
      .catch((error) => {
        console.error('⚡ [PWA] Service Worker registration failed:', error);
      });
  };

  if (document.readyState === 'complete') {
    registerSW();
  } else {
    window.addEventListener('load', registerSW);
  }
}

