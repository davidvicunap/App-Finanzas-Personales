// Se ejecuta antes de cada archivo de pruebas.
// fake-indexeddb simula la base de datos del navegador dentro de Node.
import 'fake-indexeddb/auto';

// jsdom no trae matchMedia. Simulamos "reducir movimiento" (sin animaciones,
// así los montos se muestran de inmediato) y tema claro.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Desmonta lo que cada prueba de interfaz haya dibujado, para que no se mezclen.
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(() => cleanup());
