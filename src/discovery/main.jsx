// Phase 3d-iii-b — Discovery console entry (separate Vite entry from the trading
// dashboard's index.html; the existing App is untouched).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import DiscoveryApp from './DiscoveryApp.jsx';
import './theme.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DiscoveryApp />
  </StrictMode>,
);
