# Mercado Ciénega — storefront headless

Marketplace de la Ciénaga de Zapata. Arquitectura headless: `index.html + src/*` (frontend) hablan con el backend (Google Apps Script hoy) solo vía `src/api.js`.

## Archivos
- `main.pjs` — $meta + `generateText` (ai-text-plugin) + URLs del backend.
- `index.html` — shell semántico (body fragment): header, categorías, carrusel, filtros, grid, newsletter (Klaviyo-ready), carrito, checkout, admin, asistente IA.
- `src/styles.css` — Glassmorphism, Anchor Positioning, View Transitions, `@scope`.
- `src/data.js` — categorías, productos demo (offline), sinónimos, complementos, FAQ, claves de categoría.
- `src/api.js` — `window.MercadoStore`: sesión, catálogo, tasa, `Shipping` (Shippo/EasyPost-ready), `Payments` (Stripe/PayPal-ready), `Marketing` (Klaviyo-ready).
- `src/app.js` — UI: `window.MC_APP` (búsqueda instantánea tolerante a faltas, carrito, checkout, publicar, admin).
- `src/assistant.js` — `window.CF`: asistente híbrido LLM (prefix-cache + streaming) + motor local semántico offline.
- `src/assets/banner*.jpg`, `src/favicon.svg` — banners iguana + categorías.

## Backend (sin cambios)
- `API_URL` productos/auth/pedidos/pagos/tasa/config + `LEADS_API` leads. Todo POST JSON `{action, token, ...}`.
- Para migrar a backend propio: cambia URLs en `main.pjs` y adapta `src/api.js` (contratos ya definidos).

## Tasa USD (en vivo en cada entrada)
- Se consulta El Toque en vivo cada vez que se abre la página (tabla "Mercado Informal de Divisas" vía superFetch); la caché local solo pinta al instante y sirve de respaldo sin conexión. Al llegar el valor vivo se actualizan insignia, pie y precios.
- Buscador: texto oscuro sobre fondo claro + sugerencias en vivo (top 6 con foto/precio, clic abre el producto, Esc/clic-fuera cierra).
- View Transitions desactivadas cuando el documento está oculto (evita "Transition was aborted").

## Administración (usuario `admin`)
- Entra con **usuario `admin`** y tu clave de administrador → vas directo al panel 👑 (funciona con o sin conexión).
- La clave **no está en texto plano**: se guarda su hash SHA-256 en el código y se compara el hash al entrar.
- Pestañas: **⏳ Pendientes** (pagos por aprobar —al aprobar se publica el anuncio— y anuncios en espera, con aprobar/rechazar), **👥 Usuarios** (registro de quienes entran + crear/editar/eliminar usuarios locales con roles), **🏪 Negocios** (ver, crear, editar —incluso los demo—, eliminar), **💰 Pagos**, **📦 Anuncios** (estado + aprobar + eliminar), **🏷️ Categorías**, **💱 Tasa USD**, **🔧 Ajustes**.
- Los usuarios creados por el admin entran con su clave aunque no haya conexión. El `admin` es el único que no se puede eliminar.
- Contratos backend futuro: `usuarios_list/create/update/delete`, `producto_aprobar`.
- Nota: este admin es de gestión del dispositivo/navegador; la protección real contra manipulación debe vivir en tu backend (Apps Script).

## 💰 Mensualidad y suspensión automática
- Cada negocio paga cuota mensual (**500 CUP/mes** sugerido). Si llega el **día 1** debiendo el mes (con gracia si se creó ese mismo mes; demos de ejemplo exentas), la tienda **se suspende sola**: sus productos **desaparecen** de la búsqueda, lista de tiendas, enlaces y checkout, como si no existiera.
- Su admin **sí puede entrar** a su perfil, pero solo ve un **cartel ⛔ que no deja hacer nada**: avisa de la deuda y que debe pagar para seguir usando los servicios.
- El admin global lo controla todo en **🏪 Negocios**: columna Estado (✅/⛔ + motivo), último pago, contador de suspendidas, **💰 Cobrar** (mes/monto/método → reactiva al instante), **⛔/✅ Suspender/Reactivar** manual, más Ver/📊/✎/🗑.
- Contratos backend futuro: `cuota_registrar`, `negocio_suspender`.

## 🏪 Panel por tienda (administrador de cada negocio)
- Cada negocio tiene su **usuario + clave propios** (hash SHA-256): entra con ellos y va directo a **📊 Mi tienda**.
- Ahí ve **lo que vendieron los colaboradores por otras redes** (WhatsApp/Facebook/Instagram): tabla por colaborador (clics, ventas, vendido, comisión, pagado, **a pagar**) con botón ✓ Pagado, más el **detalle de cada venta** (fecha, producto, colaborador, comprador, total, comisión, %).
- Todo lo demás en el mismo sitio: **inventario** (agregar/editar/eliminar con stock), **perfil** (nombre, pagos, QR, domicilio), **programa de afiliados** (% y on/off), **mi clave** y botones a la tienda pública.
- El dueño (o el admin global desde 🏪 Negocios → 📊) define el acceso en **🔑 Acceso admin de la tienda**. Nadie puede abrir el panel de otra tienda.
- Contratos backend futuro: `negocio_set_admin`, `ventas_por_negocio` (hoy todo es local por dispositivo).

## Afiliados / colaboradores (nuevo)
- Modelo Amazon Afiliados/Temu: enlace `#p-ID-r-usuario`, atribución **30 días**, comisión % por negocio (gral 5%).
- Colaborador: botón 🤝 en el producto → kit (enlace + imagen promo 720×900 con QR + botón WhatsApp + descarga). El botón WhatsApp comparte **la imagen + texto + enlace juntos** (Web Share con archivos en el celular; en PC la descarga y abre wa.me con el texto listo para adjuntarla). Vista "🤝 Mis promociones" (menú usuario): clics/ventas/ganado por enlace.
- Tienda: panel en su perfil (solo dueño): activar/pausar, % comisión, clics, ventas por enlace, a pagar y últimas comisiones.
- Checkout: el pedido lleva `colab:@user` en la nota + campos `ref/ref_pid`; la venta se registra para el colaborador aunque el producto sea local o de backend.
- Contratos backend futuro: `ref_click`, `pedido_create{ref,ref_pid}`, `afiliado_config`, `afiliado_stats`.

## Negocios multi-tienda
- `src/data.js`: `DEMO_NEGOCIOS` (3 demo) + `ENG_SEED` (contadores iniciales).
- `src/api.js`: `window.MercadoStore.Engagement` (vistas/ventas/compartidos, score = s*10+v+c*3, `engagement_track` futuro) y `window.MercadoStore.Negocios` (CRUD localStorage: perfil, inventario, pagos, QR, domicilio).
- Orden: por defecto **🔥 Más vendidos**; al buscar cambia a **💰 Mejor oferta** (precio CUP más bajo → transferencia → solo-efectivo). Cintas "Más vendido/visto/compartido" y stats 👁/🛒/↗ en cada ficha. Compartir suma al ranking.
- Negocio: nombre, descripción, teléfono, municipio, dirección, pagos (transferencia / CUP / USD / CUP al cambio), cuenta + QR (sube foto o se genera solo), logo, domicilio (base + $/km + nota + calculadora por km en perfil y en checkout).
- Contratos backend futuro: `negocio_create/update/get/delete`, `negocio_add_item/update_item/del_item`, `negocios_list`, `engagement_track`. Mientras tanto todo funciona local + modo muestra (<3 anuncios reales).

## Asistente IA
- Intenta `root.generateText` con prompt prefix-cache (catálogo+FAQ+carrito+historial) y streaming en burbuja.
- Sin LLM/offline: motor local (sinónimos, Levenshtein, parseo de presupuesto, intención regalo, FAQ, recomendaciones por carrito, tracking de pedidos).
- Seguridad: `textContent` + DOMPurify, honeypot anti-spam en leads.

## Seguridad
- CSP meta (endurecer con nonces en producción), DOMPurify, `Secure/HttpOnly` a nivel servidor/backend real, validación de inputs, sin secretos en cliente.

## Probar
- Búsqueda: "celular", "mango", "regalo mama 50", "tenni" (falta ortográfica).
- Carrito → checkout → paga (simulado) → rastrea con el asistente ("dónde va mi pedido").
- Sin red: muestra modo demo con toast.
