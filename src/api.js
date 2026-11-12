/* Mercado Ciénega — src/api.js
 * Capa headless: separa el frontend del backend (Google Apps Script hoy,
 * tu API propia mañana). Incluye: productos, auth, pedidos, pagos, tasa,
 * envío (estructura Shippo/EasyPost) y marketing (estructura Klaviyo).
 */
(function () {
  "use strict";

  function rootCfg() {
    try {
      const r = globalThis.root || window.root;
      if (r && r.apiBase) return { url: String(r.apiBase.url), leadsUrl: String(r.apiBase.leadsUrl) };
    } catch (e) {}
    return {
      url: "https://script.google.com/macros/s/AKfycbzjU_FkecOBjYsMl8UfBeE8ckaeTxr2WKDqyOnSHPMZ4O6uj7RpDP2uVPz_GgwXWs1Uwg/exec",
      leadsUrl: "https://script.google.com/macros/s/AKfycbzjU_FkecOBjYsMl8UfBeE8ckaeTxr2WKDqyOnSHPMZ4O6uj7RpDP2uVPz_GgwXWs1Uwg/exec",
    };
  }
  const CFG = rootCfg();

  const S = {
    user: null, token: null,
    tasa: { tasa: 770, fecha: "2026-10-02", fuente: "El Toque" },
    cats: [], prods: [],
    connected: false,
  };

  const listeners = new Set();
  function emit(what) { listeners.forEach((fn) => { try { fn(what); } catch (e) {} }); }
  function setConn(ok) {
    S.connected = !!ok;
    const d = document.getElementById("connDot"), t = document.getElementById("connText");
    if (d) d.className = "conn-dot " + (ok ? "conn-green" : "conn-red");
    if (t) t.textContent = ok ? "Conectado" : "Sin conexión";
    emit("conn");
  }

  async function api(action, data) {
    data = data || {};
    const body = Object.assign({ action, token: S.token }, data);
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 18000);
    try {
      const r = await fetch(CFG.url, { method: "POST", body: JSON.stringify(body), signal: ctrl.signal });
      const j = await r.json();
      setConn(true);
      return j;
    } catch (e) { setConn(false); throw e; }
    finally { clearTimeout(to); }
  }

  /* ---------- formato ---------- */
  function fmtCUP(n) { n = Number(n) || 0; return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function fmtUSD(n) { n = Number(n) || 0; return (Math.round(n * 100) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function precios(p) {
    if (!p) return { main: "", sub: "" };
    if (p.moneda === "USD") return { main: "$" + fmtUSD(p.precio) + " USD", sub: "≈ " + fmtCUP(p.precio * S.tasa.tasa) + " CUP" };
    return { main: fmtCUP(p.precio) + " CUP", sub: "≈ $" + fmtUSD(p.precio / S.tasa.tasa) + " USD" };
  }
  function cupOf(p) { return p.moneda === "USD" ? p.precio * S.tasa.tasa : p.precio; }
  function waLink(tel) {
    let d = String(tel || "").replace(/\D/g, "");
    if (d.length === 8) d = "53" + d;
    return d ? "https://wa.me/" + d : "";
  }
  // Sanitización: DOMPurify si está disponible, si no, escape manual.
  function esc(s) {
    s = String(s == null ? "" : s);
    try {
      if (window.DOMPurify) return window.DOMPurify.sanitize(s, { ALLOWED_TAGS: [] });
    } catch (e) {}
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---------- sesión ---------- */
  function cargarSesion() {
    try {
      S.token = localStorage.getItem("mc_token") || null;
      S.user = JSON.parse(localStorage.getItem("mc_user") || "null");
      if (S.user) S.carrito = JSON.parse(localStorage.getItem("mc_cart_" + S.user.username) || "[]");
    } catch (e) { S.user = null; }
    S.carrito = S.carrito || [];
    try { if (!S.user) S.carrito = JSON.parse(localStorage.getItem("mc_cart_guest") || "[]"); } catch (e) {}
  }
  function guardarSesion() {
    try {
      localStorage.setItem("mc_token", S.token || "");
      localStorage.setItem("mc_user", JSON.stringify(S.user || null));
    } catch (e) {}
  }
  function guardarCarrito() {
    try {
      if (S.user) localStorage.setItem("mc_cart_" + S.user.username, JSON.stringify(S.carrito));
      else localStorage.setItem("mc_cart_guest", JSON.stringify(S.carrito));
    } catch (e) {}
  }

  /* ---------- catálogo con fallback demo ---------- */
  function demoList() {
    try { return (window.MC_DATA.DEMO_PRODUCTS || []).map((p) => Object.assign({}, p)); }
    catch (e) { return []; }
  }
  async function recargarCats() {
    try {
      const r = await api("categorias_list", {});
      if (r.ok && r.categorias) S.cats = r.categorias;
    } catch (e) {
      if (!S.cats.length) S.cats = (window.MC_DATA.CATEGORIES || []).map((c) => c.nombre);
    }
    if (!S.cats.length) S.cats = (window.MC_DATA.CATEGORIES || []).map((c) => c.nombre);
    return S.cats;
  }
  /* ---------- tasa USD en vivo desde El Toque ---------- */
  // La web de El Toque trae la tabla "Mercado Informal de Divisas" embebida.
  // Prioridad: El Toque en vivo > caché 12h (2 veces al día) > backend > valor por defecto.
  const TASA_CACHE_KEY = "mc_tasa_eltoque";
  function parseTasaElToque(html) {
    try {
      const start = html.indexOf("Mercado Informal de Divisas");
      if (start < 0) return null;
      const clean = html.slice(start, start + 12000).replace(/<[^>]*>/g, " ");
      const m = clean.match(/1\s*(?:&nbsp;|\s)+USD[\s\S]{0,400}?([\d]{2,4}(?:[.,]\d{1,2})?)\s*(?:&nbsp;|\s)*CUP/);
      if (!m) return null;
      const v = Number(String(m[1]).replace(",", "."));
      return v > 0 ? v : null;
    } catch (e) { return null; }
  }
  async function tasaElToqueVivo() {
    try {
      const c = JSON.parse(localStorage.getItem(TASA_CACHE_KEY) || "null");
      if (c && Date.now() - c.ts < 12 * 60 * 60 * 1000 && c.tasa > 0) return { tasa: c.tasa, cached: true };
    } catch (e) {}
    try {
      const html = await Promise.race([
        (async () => {
          try {
            const r = globalThis.root || window.root;
            if (r && r.superFetch) return await r.superFetch("https://eltoque.com/").then((x) => x.text());
          } catch (e) {}
          const resp = await fetch("https://eltoque.com/");
          return await resp.text();
        })(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000)),
      ]);
      const v = parseTasaElToque(html);
      if (!v) return null;
      try { localStorage.setItem(TASA_CACHE_KEY, JSON.stringify({ tasa: v, ts: Date.now() })); } catch (e) {}
      return { tasa: v, cached: false };
    } catch (e) { return null; }
  }
  async function cargarTasa() {
    try {
      const r = await api("tasa_get", {});
      if (r.ok) S.tasa = { tasa: Number(r.tasa) || S.tasa.tasa, fecha: r.fecha, fuente: r.fuente };
    } catch (e) {}
    try {
      const live = await tasaElToqueVivo();
      if (live && live.tasa > 0) {
        const hoy = new Date().toISOString().slice(0, 10);
        S.tasa = { tasa: live.tasa, fecha: hoy, fuente: live.cached ? "El Toque (caché)" : "El Toque · hoy (auto)" };
      }
    } catch (e) {}
    return S.tasa;
  }

  /* ---------- envíos (estructura Shippo/EasyPost) ---------- */
  // Hoy: cálculo local por distancia. Mañana: POST a tu backend → Shippo/EasyPost.
  const Shipping = {
    methods: [
      { id: "moto", nombre: "🛵 Moto mensajera", eta: "Hoy mismo", base: 150, porKm: 25 },
      { id: "triciclo", nombre: "🛺 Triciclo", eta: "Hoy / mañana", base: 300, porKm: 40 },
      { id: "camion", nombre: "🚚 Camión (muebles)", eta: "1–2 días", base: 800, porKm: 90 },
    ],
    quote(km, methodId) {
      const m = this.methods.find((x) => x.id === methodId) || this.methods[0];
      const cup = m.base + (Number(km) || 5) * m.porKm;
      return { method: m, km: Number(km) || 5, cup, usd: cup / (S.tasa.tasa || 770) };
    },
    // Hook para backend real: implementa POST /shipping/rates en tu API y cambia esta fn.
    async liveRates(/* destino, items */) { return null; },
  };

  /* ---------- pagos (estructura Stripe/PayPal) ---------- */
  // Checkout real con Stripe/PayPal requiere backend (nunca expongas secret keys).
  // Esta capa ya deja el contrato listo: createIntent → confirm → webhook.
  const Payments = {
    stripePublishableKey: "", // ← pega tu pk_test_… cuando actives backend
    paypalClientId: "",       // ← pega tu client-id cuando actives backend
    metodosLocales: ["transfermovil", "usdt", "efectivo"],
    async createIntent(totalCup, meta) {
      // Cuando tengas backend: return fetch(BACKEND+'/pay/intent',{...})
      return { simulated: true, id: "pi_demo_" + Date.now().toString(36), totalCup, meta: meta || {} };
    },
  };

  /* ---------- marketing (estructura Klaviyo) ---------- */
  // Captura de emails + carrito abandonado. Hoy: localStorage + leads API.
  // Mañana: POST a Klaviyo (lists + events) desde tu backend.
  const Marketing = {
    KEY: "mc_newsletter",
    subscribed() { try { return !!localStorage.getItem(this.KEY); } catch (e) { return false; } },
    subscribe(email) {
      email = String(email || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Ese correo no parece válido." };
      try { localStorage.setItem(this.KEY, email); } catch (e) {}
      // evento para automatización de carrito abandonado
      try {
        const pend = JSON.parse(localStorage.getItem("mc_abandoned") || "[]");
        pend.push({ email, ts: Date.now(), cart: (S.carrito || []).length });
        localStorage.setItem("mc_abandoned", JSON.stringify(pend.slice(-20)));
      } catch (e) {}
      if (CFG.leadsUrl) {
        fetch(CFG.leadsUrl, {
          method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: JSON.stringify({ a: "lead", nombre: email.split("@")[0], telefono: "", interes: "Newsletter", detalle: "Email: " + email, hp: "" }),
        }).catch(() => {});
      }
      return { ok: true };
    },
    markAbandoned() {
      try {
        if ((S.carrito || []).length && !this._t) {
          this._t = setTimeout(() => {
            const em = localStorage.getItem(this.KEY);
            if (em) console.info("[marketing] carrito abandonado registrado para", em);
          }, 45000);
        }
      } catch (e) {}
    },
  };

  /* ---------- engagement (ranking: ventas → vistas → compartidos) ----------
   * Hoy: local por dispositivo + semillas demo. Mañana (backend): la acción
   * `engagement_track {id, campo, n}` suma contadores globales y
   * `productos_list` devuelve {ventas, vistas, compartidos} por producto.
   */
  const Engagement = {
    KEY: "mc_eng_v2",
    _load() { try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch (e) { return {}; } },
    _save(d) { try { localStorage.setItem(this.KEY, JSON.stringify(d)); } catch (e) {} },
    seed() {
      const seeds = (window.MC_DATA && window.MC_DATA.ENG_SEED) || {};
      const cur = this._load();
      let ch = false;
      for (const k in seeds) {
        if (!cur[k]) { cur[k] = { v: seeds[k].v || 0, s: seeds[k].s || 0, c: seeds[k].c || 0 }; ch = true; }
      }
      if (ch) this._save(cur);
    },
    get(id) { const d = this._load(); return d[id] || { v: 0, s: 0, c: 0 }; },
    bump(id, campo, n) {
      if (!id) return;
      n = n || 1;
      const d = this._load();
      if (!d[id]) d[id] = { v: 0, s: 0, c: 0 };
      d[id][campo] = (d[id][campo] || 0) + n;
      this._save(d);
      api("engagement_track", { id, campo, n }).catch(() => {}); // backend futuro: ignora si no existe
    },
    score(e) { e = e || {}; return (e.s || 0) * 10 + (e.v || 0) + (e.c || 0) * 3; },
  };

  /* ---------- negocios (perfiles multi-negocio con inventario) ----------
   * Contrato backend futuro:
   *  negocio_create/update/get/delete, negocio_add_item/update_item/del_item, negocios_list
   * Hoy: negocios demo + los creados en este dispositivo (localStorage).
   */
  const Negocios = {
    KEY: "mc_negocios_v1",
    _read() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch (e) { return []; } },
    _write(l) { try { localStorage.setItem(this.KEY, JSON.stringify(l)); } catch (e) {} },
    all() {
      const demos = (window.MC_DATA && window.MC_DATA.DEMO_NEGOCIOS) || [];
      const own = this._read();
      const ids = new Set(own.map((b) => b.id));
      return own.concat(demos.filter((b) => !ids.has(b.id)));
    },
    get(id) { return this.all().find((b) => b.id === id) || null; },
    create(biz) {
      biz.id = "n" + Date.now().toString(36);
      biz.items = biz.items || [];
      biz.createdBy = (S.user && S.user.username) || "local";
      biz.fecha = new Date().toISOString().slice(0, 10);
      const l = this._read(); l.push(biz); this._write(l);
      return biz;
    },
    update(id, patch) {
      const l = this._read();
      const i = l.findIndex((b) => b.id === id);
      if (i < 0) return null;
      Object.assign(l[i], patch); this._write(l);
      return l[i];
    },
    remove(id) { this._write(this._read().filter((b) => b.id !== id)); },
    addItem(nid, item) {
      const l = this._read();
      const b = l.find((x) => x.id === nid);
      if (!b) return null;
      item.id = "ni" + Date.now().toString(36);
      b.items = b.items || []; b.items.push(item);
      this._write(l);
      return item;
    },
    updateItem(nid, iid, patch) {
      const l = this._read();
      const b = l.find((x) => x.id === nid);
      if (!b) return null;
      const it = (b.items || []).find((x) => x.id === iid);
      if (!it) return null;
      Object.assign(it, patch); this._write(l);
      return it;
    },
    removeItem(nid, iid) {
      const l = this._read();
      const b = l.find((x) => x.id === nid);
      if (!b) return;
      b.items = (b.items || []).filter((x) => x.id !== iid);
      this._write(l);
    },
  };

  /* ---------- afiliados (colaboradores que promocionan sin duplicar) ----------
   * Modelo estilo Amazon Afiliados / Temu: enlace con ?ref, atribución 30 días,
   * comisión % configurable por negocio, kit promo (imagen + texto + link).
   * Contrato backend futuro: ref_click {by,pid}, pedido_create acepta {ref,ref_pid},
   * afiliado_config {negocio_id,activo,pct}, afiliado_stats {negocio_id}.
   */
  const Afiliados = {
    CLICK_KEY: "mc_aff_v1", LINK_PREFIX: "mc_afflinks_",
    parseHash() {
      try {
        const h = String(location.hash || "");
        const m = h.match(/#p-([A-Za-z0-9-]+?)(?:-r-([A-Za-z0-9_.\-]+))?$/);
        if (!m) return null;
        return { pid: m[1], ref: m[2] || null };
      } catch (e) { return null; }
    },
    linkFor(pid) {
      const u = (S.user && S.user.username) || null;
      const base = "https://perchance.org/" + (window.generatorName || "") + "#p-" + pid;
      return u ? base + "-r-" + u : base;
    },
    getRef() {
      try {
        const r = JSON.parse(localStorage.getItem("mc_ref") || "null");
        if (!r || !r.by) return null;
        if (Date.now() - r.ts > 30 * 24 * 3600 * 1000) return null; // 30 días como Amazon/Temu
        if (S.user && S.user.username === r.by) return null; // tu propia compra no comisiona
        return r;
      } catch (e) { return null; }
    },
    setRef(by, pid) {
      if (!by) return;
      if (S.user && S.user.username === by) return;
      try { localStorage.setItem("mc_ref", JSON.stringify({ by, pid: pid || null, ts: Date.now() })); } catch (e) {}
    },
    _stats() { try { return JSON.parse(localStorage.getItem(this.CLICK_KEY)) || { clicks: {}, sales: [] }; } catch (e) { return { clicks: {}, sales: [] }; } },
    _save(s) { try { localStorage.setItem(this.CLICK_KEY, JSON.stringify(s)); } catch (e) {} },
    bumpClick(by, pid) {
      if (!by || !pid) return;
      const s = this._stats(); const k = by + "|" + pid;
      s.clicks[k] = (s.clicks[k] || 0) + 1; this._save(s);
      api("ref_click", { by, pid }).catch(() => {}); // backend futuro
    },
    recordSale(o) {
      const s = this._stats();
      s.sales.push(Object.assign({ ts: Date.now() }, o));
      s.sales = s.sales.slice(-300);
      this._save(s);
    },
    myLinks() {
      if (!S.user) return [];
      try { return JSON.parse(localStorage.getItem(this.LINK_PREFIX + S.user.username)) || []; } catch (e) { return []; }
    },
    addLink(pid, titulo) {
      if (!S.user) return;
      const l = this.myLinks();
      if (!l.find((x) => x.pid === pid)) l.unshift({ pid, titulo, ts: Date.now() });
      try { localStorage.setItem(this.LINK_PREFIX + S.user.username, JSON.stringify(l.slice(0, 100))); } catch (e) {}
    },
    salesFor(by, pid) { return this._stats().sales.filter((x) => (!by || x.by === by) && (!pid || x.pid === pid)); },
    bizStats(negocio) {
      const s = this._stats();
      const pids = new Set((negocio.items || []).map((x) => x.id));
      let clicks = 0;
      for (const k in s.clicks) { if (pids.has(k.split("|")[1])) clicks += s.clicks[k]; }
      const sales = s.sales.filter((x) => x.negocioId === negocio.id);
      const pct = (negocio.afiliados && negocio.afiliados.pct) || 0;
      const owed = sales.reduce((a, x) => a + x.cup * (x.pct != null ? x.pct : pct) / 100, 0);
      return { clicks, sales, owed, pct };
    },
  };

  window.MercadoStore = {
    S, CFG, api, setConn, on: (fn) => listeners.add(fn),
    fmtCUP, fmtUSD, precios, cupOf, waLink, esc,
    cargarSesion, guardarSesion, guardarCarrito,
    demoList, recargarCats, cargarTasa,
    Shipping, Payments, Marketing, Engagement, Negocios, Afiliados,
  };
})();
