/* Mercado Ciénega — src/data.js
 * Datos fallback/demo + base de conocimiento (headless: el frontend no depende del backend).
 * Si la API (Google Sheets) está offline, la tienda sigue funcionando en modo demo.
 */
(function () {
  "use strict";

  const CATEGORIES = [
    { nombre: "Alimentos", icono: "🍌", banner: "src/assets/banner1.jpg", desc: "Viandas, frutas y más" },
    { nombre: "Ropa y calzado", icono: "👕", banner: "src/assets/banner1.jpg", desc: "Moda local" },
    { nombre: "Electrónica", icono: "📱", banner: "src/assets/banner3.jpg", desc: "Celulares y accesorios" },
    { nombre: "Hogar", icono: "🛋️", banner: "src/assets/banner4.jpg", desc: "Muebles y cocina" },
    { nombre: "Belleza y cuidado", icono: "💄", banner: "src/assets/banner5.jpg", desc: "Perfumería y cuidado" },
    { nombre: "Herramientas", icono: "🔧", banner: "src/assets/banner6.jpg", desc: "Ferretería" },
    { nombre: "Vehículos y repuestos", icono: "🚗", banner: "src/assets/banner7.jpg", desc: "Motos, gomas y piezas" },
    { nombre: "Mascotas", icono: "🐶", banner: "src/assets/banner8.jpg", desc: "Pienso y accesorios" },
    { nombre: "Juguetes", icono: "🧸", banner: "src/assets/banner9.jpg", desc: "Niños y regalos" },
    { nombre: "Servicios", icono: "🔧", banner: "src/assets/banner2.jpg", desc: "Reparación y clases" },
    { nombre: "Otros", icono: "📦", banner: "src/assets/banner3.jpg", desc: "Todo lo demás" },
  ];

  // Productos demo (se muestran si la API no responde). Precios realistas en CUP.
  const DEMO_PRODUCTS = [
    { id: "demo-1", titulo: "Mango maduro por libra (cosecha local)", precio: 120, moneda: "CUP", categoria: "Alimentos", municipio: "Playa Larga", vendedor: "Finca El Mango", telefono: "5351234567", mini: "src/assets/banner1.jpg", imagenes: ["src/assets/banner1.jpg"], descripcion: "Mango fresco de la zona, maduro y dulce. Entrega en Playa Larga.", destacado: true },
    { id: "demo-2", titulo: "Camisa hawaiana de algodón (todas las tallas)", precio: 2500, moneda: "CUP", categoria: "Ropa y calzado", municipio: "Jagüey Grande", vendedor: "Tienda La Palma", telefono: "5352345678", mini: "src/assets/banner1.jpg", imagenes: ["src/assets/banner1.jpg"], descripcion: "Camisas frescas estampadas, ideales para el clima de la ciénaga.", destacado: true },
    { id: "demo-3", titulo: "Audífonos bluetooth con micrófono", precio: 18, moneda: "USD", categoria: "Electrónica", municipio: "Ciénaga de Zapata", vendedor: "ElectroCiénaga", telefono: "5353456789", mini: "src/assets/banner3.jpg", imagenes: ["src/assets/banner3.jpg"], descripcion: "Audífonos nuevos, con estuche de carga. Garantía de 7 días.", destacado: false },
    { id: "demo-4", titulo: "Sillón individual verde (como nuevo)", precio: 8500, moneda: "CUP", categoria: "Hogar", municipio: "Playa Girón", vendedor: "Muebles Karina", telefono: "", mini: "src/assets/banner4.jpg", imagenes: ["src/assets/banner4.jpg"], descripcion: "Sillón cómodo, tapizado verde. Ideal para sala o portal.", destacado: false },
    { id: "demo-5", titulo: "Set de maquillaje: perfume + labial + brochas", precio: 25, moneda: "USD", categoria: "Belleza y cuidado", municipio: "Jagüey Grande", vendedor: "Belleza Total", telefono: "5354567890", mini: "src/assets/banner5.jpg", imagenes: ["src/assets/banner5.jpg"], descripcion: "Set de regalo, perfecto para mamá. Original y sellado.", destacado: true },
    { id: "demo-6", titulo: "Taladro percutor 750W + juego de brocas", precio: 65, moneda: "USD", categoria: "Herramientas", municipio: "Ciénaga de Zapata", vendedor: "Ferretería El Taller", telefono: "5355678901", mini: "src/assets/banner6.jpg", imagenes: ["src/assets/banner6.jpg"], descripcion: "Taladro nuevo con maletín y 13 brocas. Potente y duradero.", destacado: false },
    { id: "demo-7", titulo: "Goma aro 14 (nueva) + batería 60Ah", precio: 180, moneda: "USD", categoria: "Vehículos y repuestos", municipio: "Matanzas", vendedor: "Repuestos Andy", telefono: "5356789012", mini: "src/assets/banner7.jpg", imagenes: ["src/assets/banner7.jpg"], descripcion: "Goma nueva y batería con garantía. Instalación incluida.", destacado: false },
    { id: "demo-8", titulo: "Saco de pienso para perro 20kg", precio: 3200, moneda: "CUP", categoria: "Mascotas", municipio: "Playa Larga", vendedor: "Mascotas Felices", telefono: "5357890123", mini: "src/assets/banner8.jpg", imagenes: ["src/assets/banner8.jpg"], descripcion: "Pienso balanceado para adulto. Entrega a domicilio.", destacado: false },
    { id: "demo-9", titulo: "Caja de juguetes surtidos (regalo)", precio: 2800, moneda: "CUP", categoria: "Juguetes", municipio: "Jagüey Grande", vendedor: "Juguetería Arcoíris", telefono: "", mini: "src/assets/banner9.jpg", imagenes: ["src/assets/banner9.jpg"], descripcion: "Peluches, carritos y juegos didácticos. Ideal para cumpleaños.", destacado: false },
    { id: "demo-10", titulo: "Moto eléctrica con batería de litio (autonomía 80km)", precio: 1450, moneda: "USD", categoria: "Vehículos y repuestos", municipio: "Ciénaga de Zapata", vendedor: "Motos Ciénaga", telefono: "5358901234", mini: "src/assets/banner2.jpg", imagenes: ["src/assets/banner2.jpg"], descripcion: "Moto nueva, papeles en regla. Prueba antes de comprar.", destacado: true },
    { id: "demo-11", titulo: "Servicio de reparación de split + mantenimiento", precio: 1500, moneda: "CUP", categoria: "Servicios", municipio: "Playa Larga", vendedor: "ClimaFrío", telefono: "5359012345", mini: "src/assets/banner2.jpg", imagenes: ["src/assets/banner2.jpg"], descripcion: "Técnico certificado, visita a domicilio en toda la ciénaga.", destacado: false },
    { id: "demo-12", titulo: "Aceite de coco natural 500ml", precio: 450, moneda: "CUP", categoria: "Belleza y cuidado", municipio: "Ciénaga de Zapata", vendedor: "Natural Ciénaga", telefono: "", mini: "src/assets/banner5.jpg", imagenes: ["src/assets/banner5.jpg"], descripcion: "Aceite puro para cabello y piel. Producción artesanal.", destacado: false },
  ];

  // Sinónimos para búsqueda semántica local (entiende intención, no solo keywords)
  const SYNONYMS = {
    celular: ["movil", "telefono", "smartphone", "iphone", "android"],
    movil: ["celular", "telefono"],
    tenis: ["zapatillas", "zapatos", "deportivas", "calzado"],
    camisa: ["blusa", "pullover", "ropa"],
    moto: ["motorina", "electrica", "pasola"],
    refrigerador: ["nevera", "frio"],
    perfume: ["colonia", "fragancia", "regalo"],
    regalo: ["obsequio", "detalle", "presente", "cumpleanos", "madre", "mama"],
    barato: ["economico", "oferta", "ganga"],
    comida: ["alimento", "arroz", "pollo", "vianda"],
    juguete: ["nino", "nina", "peluche", "carro"],
    perro: ["mascota", "can", "cachorro"],
    trabajo: ["servicio", "reparacion", "plomero", "electricista"],
  };

  // Mapa de complementos para recomendaciones proactivas
  const COMPLEMENTS = {
    "Electrónica": ["Electrónica", "Servicios"],
    "Ropa y calzado": ["Belleza y cuidado", "Ropa y calzado"],
    "Alimentos": ["Hogar", "Alimentos"],
    "Vehículos y repuestos": ["Herramientas", "Servicios"],
    "Herramientas": ["Servicios", "Hogar"],
    "Belleza y cuidado": ["Ropa y calzado", "Juguetes"],
    "Hogar": ["Herramientas", "Servicios"],
    "Mascotas": ["Servicios", "Alimentos"],
    "Juguetes": ["Ropa y calzado", "Belleza y cuidado"],
    "Servicios": ["Herramientas", "Electrónica"],
    "Otros": [],
  };

  // Base de conocimiento FAQ (el asistente la lee para soporte post-venta)
  const FAQ = [
    { q: "¿Cómo compro?", a: "Busca el producto, abre el anuncio y coordina por WhatsApp con el vendedor, o agrégalo al carrito y finaliza el pedido. El pago se coordina directo con cada vendedor." },
    { q: "¿Cómo publico un anuncio?", a: "Toca «＋ Vender», entra a tu cuenta, llena título, categoría, precio y foto. Cuesta 100 CUP al mes (precio configurable). Se publica cuando el admin confirma tu pago por Transfermóvil, USDT o efectivo." },
    { q: "¿Cómo pago?", a: "Aceptamos Transfermóvil (CUP), USDT (TRC20) y efectivo coordinado con el vendedor. En el checkout verás tarjetas simuladas tipo Stripe/PayPal para pedidos internacionales." },
    { q: "¿Hacen envíos?", a: "Cada vendedor coordina la entrega en la Ciénaga de Zapata y alrededores. En el checkout puedes calcular el costo estimado por distancia (moto / triciclo / camión)." },
    { q: "¿Puedo devolver un producto?", a: "Tienes 48h para reportar si el producto no corresponde al anuncio. Escríbenos con tu # de pedido y foto, y mediamos con el vendedor para cambio o devolución." },
    { q: "¿Dónde están ubicados?", a: "Somos la plataforma de la Ciénaga de Zapata, Matanzas. Los vendedores son de la zona: Playa Larga, Playa Girón, Jagüey Grande y alrededores." },
    { q: "¿Cómo rastreo mi pedido?", a: "Entra con tu cuenta → «🧾 Mis pedidos». Verás el estado y el contacto de cada vendedor con botón de WhatsApp directo." },
    { q: "¿Qué es destacado?", a: "Tu anuncio sale primero con estrella ⭐ durante varios días. Se solicita desde «Mis anuncios → ⭐ Destacar» con un pago adicional." },
    { q: "Tasa USD", a: "Mostramos la tasa de referencia CUP por USD (fuente El Toque por defecto, ajustable por el admin). Todos los precios se convierten automáticamente." },
  ];

  // Palabras clave por categoría (auto-detección al publicar + búsqueda)
  const CAT_KEYS = {
    Alimentos: ["arroz", "pollo", "carne", "leche", "huevo", "pan", "queso", "cafe", "azucar", "aceite", "frijol", "vianda", "fruta", "verdura", "pescado", "embutido", "dulce", "galleta", "refresco", "ron", "comida", "pizza", "helado", "manteca", "sal", "pasta", "harina", "tomate", "cebolla", "ajo", "platano", "mango", "pina", "jugo", "vino", "jamon", "chorizo", "yogurt", "mantequilla", "miel", "chocolate", "croqueta", "hamburguesa", "malta", "cerveza"],
    "Ropa y calzado": ["camisa", "pantalon", "zapato", "tenis", "sandalia", "vestido", "blusa", "short", "jean", "chaqueta", "abrigo", "gorra", "sombrero", "bota", "zapatilla", "traje", "corbata", "cinturon", "calcetin", "blumer", "ajustador", "pullover", "chancleta", "mocasin", "ropa", "calzado", "deportivo", "talla", "licra", "mezclilla"],
    "Electrónica": ["telefono", "celular", "movil", "laptop", "computadora", "tablet", "audifono", "bocina", "parlante", "televisor", "pantalla", "cargador", "teclado", "mouse", "monitor", "impresora", "camara", "dron", "smartwatch", "consola", "videojuego", "playstation", "xbox", "nintendo", "ventilador", "refrigerador", "nevera", "lavadora", "microondas", "split", "licuadora", "batidora", "router", "wifi", "electronica", "pulgadas", "smart"],
    Hogar: ["mueble", "silla", "mesa", "cama", "sofa", "sillon", "lampara", "cortina", "alfombra", "colchon", "almohada", "sabana", "toalla", "olla", "sarten", "plato", "vaso", "cuchillo", "tenedor", "cuchara", "cuadro", "espejo", "maceta", "estante", "closet", "armario", "puerta", "ventana", "gavetero", "hogar", "decoracion"],
    "Belleza y cuidado": ["perfume", "colonia", "crema", "maquillaje", "labial", "champu", "jabon", "desodorante", "cosmetico", "tinte", "cabello", "esmalte", "rimmel", "polvo facial", "crema dental", "cepillo dental", "afeitadora", "rasuradora", "acondicionador", "belleza", "aceite de coco"],
    Servicios: ["reparacion", "plomero", "electricista", "albanil", "carpintero", "clases", "curso", "tutoria", "transporte", "flete", "mudanza", "alquiler", "peluqueria", "barbero", "manicura", "pedicura", "masaje", "fotografo", "diseno", "costura", "instalacion", "servicio", "arreglo", "domicilio"],
    "Vehículos y repuestos": ["carro", "auto", "moto", "motorina", "bicicleta", "camion", "neumatico", "goma", "bateria", "freno", "bujia", "vehiculo", "repuesto", "amortiguador", "radiador", "carburador", "llanta", "parabrisa", "transmision", "cloche", "electrica"],
    Mascotas: ["perro", "gato", "mascota", "pienso", "jaula", "pecera", "pez", "pajaro", "loro", "periquito", "hamster", "conejo", "correa", "collar", "cachorro", "gatito", "veterinaria"],
    Juguetes: ["juguete", "peluche", "muneca", "carrito", "lego", "didactico", "nino", "nina", "cumpleanos", "regalo"],
    Herramientas: ["taladro", "herramienta", "destornillador", "llave", "martillo", "sierra", "ferreteria", "broca", "tornillo", "cinta metrica"],
  };

  // Negocios demo (visibles sin cuenta; los reales se crean con "🏪 Negocios → Crear")
  const DEMO_NEGOCIOS = [
    {
      id: "demo-n1", nombre: "Tienda La Palma", desc: "Ropa fresca y calzado para toda la familia.",
      telefono: "5352345678", municipio: "Jagüey Grande", direccion: "Calle Martí #12",
      pagos: { transfer: true, efectivoCUP: true, efectivoUSD: false, cupAlCambio: false },
      transferCuenta: "9225 3456 7890", qr: null,
      delivery: { activo: true, base: 100, porKm: 20, nota: "Entrega en el día en Jagüey y alrededores." },
      logo: "src/assets/banner1.jpg", createdBy: "demo", afiliados: { activo: true, pct: 5 }, items: [
        { id: "demo-n1i1", titulo: "Camisa hawaiana de algodón", precio: 2500, moneda: "CUP", categoria: "Ropa y calzado", descripcion: "Todas las tallas, varios estampados.", stock: 12, mini: "src/assets/banner1.jpg", imagenes: ["src/assets/banner1.jpg"] },
        { id: "demo-n1i2", titulo: "Tenis deportivos", precio: 4500, moneda: "CUP", categoria: "Ropa y calzado", descripcion: "Números del 38 al 44.", stock: 5, mini: "src/assets/banner1.jpg", imagenes: ["src/assets/banner1.jpg"] },
      ],
    },
    {
      id: "demo-n2", nombre: "ElectroCiénaga", desc: "Accesorios de celular y audio con garantía.",
      telefono: "5353456789", municipio: "Ciénaga de Zapata", direccion: "Playa Larga, frente al parque",
      pagos: { transfer: true, efectivoCUP: true, efectivoUSD: true, cupAlCambio: true },
      transferCuenta: "9225 1111 2222", qr: null,
      delivery: { activo: true, base: 150, porKm: 25, nota: "Moto mensajera a toda la ciénaga." },
      logo: "src/assets/banner3.jpg", createdBy: "demo", afiliados: { activo: true, pct: 5 }, items: [
        { id: "demo-n2i1", titulo: "Audífonos bluetooth con micrófono", precio: 18, moneda: "USD", categoria: "Electrónica", descripcion: "Con estuche de carga. Garantía 7 días.", stock: 8, mini: "src/assets/banner3.jpg", imagenes: ["src/assets/banner3.jpg"] },
        { id: "demo-n2i2", titulo: "Cargador rápido USB-C 25W", precio: 8, moneda: "USD", categoria: "Electrónica", descripcion: "Original, carga rápida.", stock: 20, mini: "src/assets/banner3.jpg", imagenes: ["src/assets/banner3.jpg"] },
      ],
    },
    {
      id: "demo-n3", nombre: "Mascotas Felices", desc: "Pienso y accesorios. Solo efectivo.",
      telefono: "5357890123", municipio: "Playa Larga", direccion: "Carretera a Girón km 3",
      pagos: { transfer: false, efectivoCUP: true, efectivoUSD: false, cupAlCambio: false },
      transferCuenta: "", qr: null,
      delivery: { activo: false, base: 0, porKm: 0, nota: "" },
      logo: "src/assets/banner8.jpg", createdBy: "demo", afiliados: { activo: true, pct: 5 }, items: [
        { id: "demo-n3i1", titulo: "Saco de pienso para perro 20kg", precio: 3000, moneda: "CUP", categoria: "Mascotas", descripcion: "Adulto, entrega a convenir.", stock: 15, mini: "src/assets/banner8.jpg", imagenes: ["src/assets/banner8.jpg"] },
        { id: "demo-n3i2", titulo: "Audífonos bluetooth con micrófono", precio: 20, moneda: "USD", categoria: "Electrónica", descripcion: "Sellados, sin garantía.", stock: 3, mini: "src/assets/banner3.jpg", imagenes: ["src/assets/banner3.jpg"] },
      ],
    },
  ];

  // Contadores iniciales para que el ranking se vea desde el primer día
  const ENG_SEED = {
    "demo-10": { v: 210, s: 18, c: 12 }, "demo-5": { v: 180, s: 14, c: 10 },
    "demo-1": { v: 150, s: 11, c: 6 }, "demo-2": { v: 120, s: 8, c: 5 },
    "demo-n2i1": { v: 140, s: 9, c: 7 }, "demo-n1i1": { v: 95, s: 6, c: 3 },
    "demo-n3i2": { v: 60, s: 2, c: 1 },
  };

  window.MC_DATA = { CATEGORIES, DEMO_PRODUCTS, SYNONYMS, COMPLEMENTS, FAQ, CAT_KEYS, DEMO_NEGOCIOS, ENG_SEED };
})();
