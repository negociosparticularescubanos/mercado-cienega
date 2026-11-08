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
