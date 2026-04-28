import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

console.log('[Kredo] App starting...');

try {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (err) {
  console.error('[Kredo] Fatal:', err);
  document.getElementById('root')!.innerHTML = `<div style="padding:40px;font-family:system-ui"><h2 style="color:#E25C5C">Failed to start</h2><pre style="margin-top:12px;font-size:13px;color:#5E5C7A">${err}</pre></div>`;
}
