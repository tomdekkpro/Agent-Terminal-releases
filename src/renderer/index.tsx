import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';

// Provide a no-op stub when running outside Electron (e.g. browser dev at localhost:5173)
if (!window.electronAPI) {
  const noop = () => {};
  const noopAsync = () => Promise.resolve({ success: false, error: 'Not running in Electron' });
  const noopListener = (_cb: any) => noop; // returns unsubscribe function

  window.electronAPI = new Proxy({} as any, {
    get(_target, prop) {
      // Event listener methods (on*) return an unsubscribe function
      if (typeof prop === 'string' && prop.startsWith('on')) {
        return noopListener;
      }
      // send* methods are fire-and-forget
      if (typeof prop === 'string' && prop.startsWith('send')) {
        return noop;
      }
      // Everything else is an async invoke
      return noopAsync;
    },
  });

  console.warn('[Agent Terminal] Running outside Electron — electronAPI stubbed with no-ops.');
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
