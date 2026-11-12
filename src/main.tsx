import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

if (
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  window.top === window &&
  'serviceWorker' in navigator
) {
  window.addEventListener('load', () => {
    const appBase = import.meta.env.BASE_URL;
    void navigator.serviceWorker.register(`${appBase}service-worker.js`, { scope: appBase })
      .catch(error => console.warn('[Offline console] Service worker unavailable; the console remains usable.', error));
  });
}
