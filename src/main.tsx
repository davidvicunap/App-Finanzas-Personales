/** Punto de entrada: carga fuentes y estilos, y monta la app. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Fuentes incluidas en la app (no se piden a Google: privacidad y modo sin conexión).
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/space-grotesk/latin-700.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import './ui/styles/app.css';
import './ui/styles/extra.css';

import App from './App';
import { requestPersistentStorage } from './data/db';

// Pide al navegador que no borre los datos por falta de espacio.
void requestPersistentStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
