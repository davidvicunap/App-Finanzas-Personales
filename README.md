# Mis Finanzas

App de finanzas personales y familiares para un hogar en Canadá (CAD y USD).
Es privada, funciona sin conexión, está en español e inglés y vive en tu dispositivo.

**En línea:** https://davidvicunap.github.io/App-Finanzas-Personales/

## Qué hace

Son cinco pantallas, y cada una responde una pregunta:

| Pantalla | Pregunta | Qué tiene |
|---|---|---|
| **Resumen** | ¿Cómo voy este mes? | Balance y tasa de ahorro, **lo importante** (alertas, cambios contra tu promedio y una acción sugerida), resumen de la semana, tendencia de 6 meses y gasto por categoría. Puedes verlo del hogar, por persona o solo lo compartido. |
| **Movimientos** | ¿En qué se fue el dinero? | Lista por día, con búsqueda y filtros por tipo, categoría y persona. Puedes editar y deshacer. |
| **Plan** | ¿Voy dentro de lo planeado? | Presupuesto por **sobres** o **50/30/20**, **metas de ahorro** (pueden vincularse a una cuenta) y **recurrentes**: suscripciones detectadas solas, con aviso si suben de precio. |
| **Patrimonio** | ¿Cuánto tenemos y hacia dónde vamos? | **Patrimonio neto** con su evolución, saldos de cuentas, **inversiones** (acciones, ETF, opciones, cripto) con ganancia en CAD y en USD y su asignación, espacio **TFSA/RRSP/FHSA**, **proyección** a 5/10/20/30 años en 3 escenarios e **independencia financiera**. |
| **Ajustes** | | Idioma, tema, tipo de cambio, hogar, cuentas, categorías y respaldos (JSON, **JSON cifrado** y CSV). |

Además:
- **Bienvenida guiada** de 3 pasos: tu nombre, tu pareja y tus cuentas de CIBC y Wealthsimple.
- **Registro rápido**: el monto acepta `12,50`, las categorías que más usas aparecen primero y Enter guarda.
- **La app no inventa datos.** Si falta un tipo de cambio, lo avisa y no suma esos montos. El espacio TFSA/RRSP/FHSA lo escribes tú, con el dato de CRA. Las proyecciones usan los supuestos que tú eliges.
- **No da asesoría.** Las acciones sugeridas son de organización ("revisa tu presupuesto"), nunca de inversión.
- Modo oscuro, español e inglés. Se instala en el teléfono como app (PWA) y funciona sin internet.

### Cómo se usa cada mes (unos 10 minutos)
1. Durante el mes, registra los gastos con **+**. Pon una nota corta ("Netflix", "Costco"): así se detectan las suscripciones.
2. Una vez al mes, en **Patrimonio → Cuentas**, toca **Actualizar** en cada cuenta y copia el saldo de tu banco.
3. En **Patrimonio → Inversiones**, actualiza los precios de tus posiciones.
4. Revisa **Resumen → Lo importante** y descarga un respaldo.

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
- Cada dispositivo tiene sus propios datos. La sincronización automática con tu pareja llega en la fase 4.
  Mientras tanto, usa el **respaldo cifrado**: descárgalo en un teléfono y restáuralo en el otro.
  Va protegido con contraseña (PBKDF2 + AES-256-GCM); si olvidas la contraseña, el archivo no se puede abrir.
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
│  ├─ plan.ts       Sobres, 50/30/20 y progreso de metas
│  ├─ recurring.ts  Detección de suscripciones y gastos fijos
│  ├─ wealth.ts     Patrimonio neto, posiciones, ganancias y asignación
│  ├─ registered.ts Espacio TFSA / RRSP / FHSA
│  ├─ projection.ts Interés compuesto e independencia financiera
│  ├─ insights.ts   "Lo importante": alertas, cambios y resumen semanal
│  └─ backup.ts     Validación de respaldos (zod), cifrado y exportación CSV
├─ data/
│  ├─ db.ts         Base de datos IndexedDB (Dexie) y cómo hacer migraciones
│  └─ repo.ts       Todas las escrituras pasan por aquí (con validación)
├─ i18n/            Textos en español (es.ts) e inglés (en.ts)
├─ ui/
│  ├─ context.tsx   Datos en vivo, idioma, formato de dinero y avisos
│  ├─ QuickAdd.tsx  Formulario de registro rápido
│  ├─ Onboarding.tsx Bienvenida guiada
│  ├─ views/        Pantallas: Resumen, Movimientos, Plan, Patrimonio, Ajustes
│  ├─ components/   Gráficos, hoja modal, campos y piezas reutilizables
│  └─ styles/       CSS. Los colores están en los tokens de app.css (:root)
├─ App.tsx          Navegación y estructura
└─ main.tsx         Punto de entrada
```

### Tres reglas del código

1. **El dinero siempre va en centavos enteros** (`amountCents: 1250` = $12.50).
   Los decimales de JavaScript fallan: `0.1 + 0.2` da `0.30000000000000004`.
   Solo se divide entre 100 al mostrar el monto (`formatMoney`).
   Las cantidades y los precios de inversiones (`0.00512` BTC) se guardan como texto
   y se multiplican con `BigInt` (`marketValueCents`).
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
| 2 | Patrimonio neto, saldos, vista por persona | ✅ |
| 3 | Presupuesto (sobres o 50/30/20), metas, recurrentes | ✅ |
| 5 | Inversiones, espacio TFSA/RRSP/FHSA, proyecciones, independencia financiera | ✅ |
| 6 | Lo importante (insights), acción sugerida, resumen semanal | ✅ |
| 4 | Sincronización cifrada de extremo a extremo con tu pareja (necesita una cuenta de Supabase o PocketBase) | Pendiente |
| — | Importar CSV de CIBC y Wealthsimple · tipo de cambio automático del Banco de Canadá · precios automáticos | Pendiente |

La app muestra datos y cálculos. No da asesoría financiera ni de inversión.
