# Mis Finanzas

App de finanzas personales y familiares para un hogar en Canadá (CAD y USD).
Es privada, funciona sin conexión, está en español e inglés y vive en tu dispositivo.

**En línea:** https://davidvicunap.github.io/App-Finanzas-Personales/

## Qué hace hoy (fase 1)

- **Registro rápido:** el monto acepta `12,50` o `12.50`, las categorías que más usas aparecen primero y Enter guarda.
- **Resumen del mes:** balance, tasa de ahorro, comparación con el mes anterior, tendencia de 6 meses y gasto por categoría.
- **Movimientos:** agrupados por día, con búsqueda y filtros por tipo, categoría y persona. Puedes deshacer un borrado.
- **Hogar:** varias personas, cuentas en CAD o USD (incluidas TFSA, RRSP y FHSA) y gastos compartidos.
- **Tipo de cambio USD→CAD:** por ahora lo escribes tú. La app nunca inventa uno: si falta, te avisa y no suma esos montos.
- **Tus datos:** respaldo completo en JSON, exportación a CSV para Excel, restauración y borrado.
- Modo oscuro, se instala en el teléfono como una app (PWA) y funciona sin internet.

## Cómo correrla en tu computadora

Necesitas [Node.js](https://nodejs.org) 20 o más reciente.

```bash
npm install
```

```bash
npm run dev
```

Abre la dirección que aparece (normalmente `http://localhost:5173`).

| Comando | Para qué sirve |
|---|---|
| `npm run dev` | App en modo desarrollo; se recarga al guardar cambios |
| `npm test` | Corre todas las pruebas una vez |
| `npm run test:watch` | Vuelve a correr las pruebas cada vez que guardas |
| `npm run lint` | Revisa errores comunes y estilo |
| `npm run typecheck` | Revisa los tipos de TypeScript |
| `npm run check` | Corre las tres revisiones anteriores |
| `npm run build` | Genera la versión final en `dist/` |

## Cómo se publica

Cada cambio que llega a la rama `main` se publica solo en GitHub Pages
(`.github/workflows/deploy.yml`). Primero corre las pruebas: si alguna falla, no se publica.

**Configuración necesaria (una sola vez):** en GitHub, ve a **Settings → Pages → Build and deployment → Source** y elige **GitHub Actions**.

**Instalarla en el iPhone:** abre la dirección en Safari y elige *Compartir → Añadir a pantalla de inicio*.

## Dónde viven tus datos (importante)

- Se guardan en **IndexedDB**, la base de datos del navegador, en tu dispositivo.
  No hay servidor y nada sale de tu teléfono.
- Cada dispositivo tiene sus propios datos. La sincronización cifrada con tu pareja llega en la fase 4.
- **Descarga un respaldo** de vez en cuando (*Ajustes → Tus datos*), sobre todo antes de cambiar de teléfono.
- No hay secretos en el código. Si alguna fase futura necesita uno, irá en `.env` (ver `.env.example`).

## Cómo está organizado el código

```
src/
├─ domain/          Lógica pura: sin pantalla ni base de datos. Toda tiene pruebas.
│  ├─ money.ts      Dinero en CENTAVOS ENTEROS (nunca decimales), conversión CAD/USD
│  ├─ dates.ts      Fechas sin errores de zona horaria
│  ├─ types.ts      Modelo de datos: personas, cuentas, categorías, movimientos
│  ├─ defaults.ts   Categorías y cuenta iniciales
│  ├─ stats.ts      Cálculos del resumen (totales, tasa de ahorro, series)
│  └─ backup.ts     Validación de respaldos (zod) y exportación CSV
├─ data/
│  ├─ db.ts         Base de datos IndexedDB (Dexie) y cómo hacer migraciones
│  └─ repo.ts       Todas las escrituras pasan por aquí (con validación)
├─ i18n/            Textos en español (es.ts) e inglés (en.ts)
├─ ui/
│  ├─ context.tsx   Datos en vivo, idioma, formato de dinero y avisos
│  ├─ QuickAdd.tsx  Formulario de registro rápido
│  ├─ views/        Pantallas: Resumen, Movimientos, Ajustes
│  ├─ components/   Gráficos y piezas reutilizables
│  └─ styles/       CSS. Los colores están en los tokens de app.css (:root)
├─ App.tsx          Navegación y estructura
└─ main.tsx         Punto de entrada
```

### Tres reglas del código

1. **El dinero siempre va en centavos enteros** (`amountCents: 1250` = $12.50).
   Los decimales de JavaScript fallan: `0.1 + 0.2` da `0.30000000000000004`.
   Solo se divide entre 100 al mostrar el monto (`formatMoney`).
2. **Las fechas son texto `AAAA-MM-DD`**, nunca `new Date('2026-11-01')`. Esa forma se
   interpreta en UTC, y en Vancouver cae en el día anterior.
3. **Nada que venga de fuera es confiable:** los respaldos se validan campo por campo
   antes de guardarse (`domain/backup.ts`).

### Cambiar la estructura de la base de datos

Mira el comentario al inicio de `src/data/db.ts`: se añade una versión nueva con su
función `upgrade`, y nunca se edita una versión que ya existe.

## Seguridad

- Hay una política de seguridad de contenido (CSP), así que solo se ejecuta código de la propia app.
- Los respaldos importados se validan. Por ejemplo, los IDs solo pueden tener letras, números y guiones.
- Al exportar a CSV se neutralizan las fórmulas de Excel (celdas que empiezan con `=`, `+`, `-` o `@`).
- Las fuentes vienen incluidas en la app; no se piden a Google.

## Plan

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Corrección de bugs de la versión anterior | ✅ |
| 1 | Cimientos: TypeScript, pruebas, dinero en centavos, IndexedDB, es/en, PWA, CI | ✅ |
| 2 | Importar CSV de CIBC y Wealthsimple con reglas que aprenden, patrimonio neto, tipo de cambio del Banco de Canadá | Siguiente |
| 3 | Presupuesto, metas de ahorro, recurrentes, vista individual y de pareja | |
| 4 | Sincronización cifrada de extremo a extremo con tu pareja | |
| 5 | Portafolio, ACB, espacio TFSA/RRSP/FHSA, proyecciones | |
| 6 | Resúmenes e insights automáticos | |

La app muestra datos y cálculos. No da asesoría financiera ni de inversión.
