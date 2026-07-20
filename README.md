# App-Finanzas-Personales

Un tracker de gastos e ingresos simple y fácil de usar, con dashboard.
Los movimientos se añaden manualmente. Una sola persona, un solo archivo.

## Cómo funciona (la parte importante)

Toda la app es **un solo archivo**: `index.html`. No hay servidor, no hay base de
datos, no hay dependencias que instalar. Eso la hace muy duradera: mientras exista
un navegador, la app funciona.

- **Dónde se guardan tus datos:** en el almacenamiento local de tu navegador
  (`localStorage`), en el dispositivo donde la abras.
- **Respaldo:** en *Ajustes → Descargar respaldo* bajas un archivo `.json` con todo.
  Con *Restaurar respaldo* lo vuelves a cargar. Hazlo cada cierto tiempo, y sobre todo
  antes de cambiar de teléfono o de navegador.

> Como los datos viven en el navegador, no se sincronizan solos entre tu móvil y tu
> laptop. Para pasarlos de uno a otro: descarga respaldo en uno, restáuralo en el otro.

## Publicarla en la web (gratis, sin cuenta de Apple)

Usaremos **GitHub Pages**:

1. Sube `index.html` a este repositorio (rama `main`).
2. En GitHub, entra a **Settings → Pages**.
3. En *Source* elige **Deploy from a branch**, rama `main`, carpeta `/root`. Guarda.
4. Espera ~1 minuto. Tu app quedará en:
   `https://davidvicunap.github.io/App-Finanzas-Personales/`
5. Abre esa dirección en tu iPhone y usa *Compartir → Añadir a pantalla de inicio*.
   Se comporta como una app, sin pagar el developer account.

## Para modificarla

Todo el código (estilos y lógica) está comentado en español dentro de `index.html`.
Los colores y tipografías se controlan en la sección de tokens (`:root`) al inicio.
