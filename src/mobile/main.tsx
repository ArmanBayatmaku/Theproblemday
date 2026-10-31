import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import './mobile.css';
import { MobileApp } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MobileApp />
  </StrictMode>,
);
