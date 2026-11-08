/* Mercado Ciénega — src/app.js (storefront headless) */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const st = () => window.MercadoStore;
  const S = () => window.MercadoStore.S;

  let cats = [], prods = [], baseProds = [], cat = "", q = "", sortBy = "ventas", maxPrice = 0;
  let carrI = 0, carrT = null; const CARR_N = 3;
  let imgsSel = [], imgsNombres = [], catManual = false;
  let bizActual = null, topSeller = null, topVisto = null, topComp = null;

  // Acceso administrador local (hash SHA-256 de la clave; nunca en texto plano).
  // El panel admin completo funciona con o sin conexión al servidor.
  const ADMIN_HASH = "d6709bf4f4908b44260f727f8e575136143345fbda8bba4d2de56c9ec83b531a";
  function isAdmin() { const u = S().user; return !!(u && u.rol === "admin"); }
  let tiendaActual = null, bizReturnTo = null;
  // ¿puede este usuario gestionar el negocio? (dueño, admin global o admin de esa tienda)
  function canManageBiz(b) {
    const u = S().user;
    if (!u || !b) return false;
    if (u.rol === "admin") return true;
    if (b.createdBy && b.createdBy === u.username) return true;
    if (u.rol === "tienda" && (u.negocioId === b.id || (b.adminUser && String(b.adminUser).toLowerCase() === String(u.username).toLowerCase()))) return true;
    return false;
  }
  // negocio de la sesión tienda (con respaldo por si la sesión guardada es vieja)
  function tiendaId() {
    const u = S().user;
    if (!u || u.rol !== "tienda") return null;
    if (u.negocioId) return u.negocioId;
    try {
      const b = st().Negocios.all().find((x) => x.adminUser && String(x.adminUser).toLowerCase() === String(u.username).toLowerCase());
      if (b) { u.negocioId = b.id; st().guardarSesion(); return b.id; }
    } catch (e) {}
    return null;
  }
  function openTienda(nid) {
    const M = st();
    const b = M.Negocios.get(nid);
    if (!b) { toast("Negocio no encontrado"); return; }
    const u = S().user;
    const ok = u && (u.rol === "admin" || (b.createdBy && b.createdBy === u.username) || (u.rol === "tienda" && (u.negocioId === nid || tiendaId() === nid)));
    if (!ok) { toast("Solo el administrador de esta tienda"); return; }
    tiendaActual = nid;
    mostrar("tienda");
  }

  /* ---------- helpers ---------- */
  function toast(msg) {
    let box = $("toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
    const d = document.createElement("div");
    d.className = "toast"; d.textContent = msg;
    box.appendChild(d);
    setTimeout(() => d.remove(), 2600);
  }
  let vtBusy = false;
  function withTransition(fn) {
    try {
      if (document.startViewTransition && !vtBusy && !document.hidden) {
        vtBusy = true;
        const tr = document.startViewTransition(() => { try { fn(); } catch (e) { console.error(e); } });
        const done = () => { vtBusy = false; };
        if (tr && tr.finished) tr.finished.then(done, done);
        else done();
        return;
      }
    } catch (e) { vtBusy = false; }
    try { fn(); } catch (e) { console.error(e); }
  }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function normK(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function lev(a, b) {
    a = normK(a); b = normK(b);
    const m = a.length, n = b.length;
    if (!a || !b || Math.abs(m - n) > 2) return 99;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[m][n];
  }

  /* ---------- catálogo ---------- */
  function products() { return prods.length ? prods : []; }
  // pago: 'transfer' (acepta transferencia) < 'consultar' < 'efectivo' (solo efectivo)
  function pagoRank(p) {
    if (p.pago === "transfer") return 0;
    if (p.pago === "efectivo") return 2;
    return 1;
  }
  function engOf(p) { try { return st().Engagement.get(p.id); } catch (e) { return { v: 0, s: 0, c: 0 }; } }
  function payBadgesHTML(p) {
    const M = st();
    if (!p.pagos) return "";
    return `<div class="pay-badges">` +
      (p.pagos.transfer ? `<span class="ok">📱 Transferencia</span>` : ``) +
      (p.pagos.efectivoCUP ? `<span class="cash">💵 CUP</span>` : ``) +
      (p.pagos.efectivoUSD ? `<span class="cash">💵 USD</span>` : ``) +
      (p.pagos.cupAlCambio ? `<span>💱 CUP al cambio</span>` : ``) + `</div>`;
  }
  function filtered() {
    const M = st();
    const terms = normK(q).split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
    let list = prods.filter((p) => {
      if (cat && p.categoria !== cat) return false;
      if (maxPrice > 0) {
        const cup = p.moneda === "USD" ? p.precio * M.S.tasa.tasa : p.precio;
        if (cup > maxPrice) return false;
      }
      if (!terms.length) return true;
      const hay = normK((p.titulo || "") + " " + (p.descripcion || "") + " " + (p.categoria || "") + " " + (p.negocioNombre || ""));
      return terms.every((t) => hay.includes(t) || hay.split(/[^a-z0-9]+/).some((w) => lev(w, t) <= (t.length >= 6 ? 2 : 1)));
    });
    const E = M.Engagement;
    if (sortBy === "precio-asc") list = [...list].sort((a, b) => M.cupOf(a) - M.cupOf(b));
    else if (sortBy === "precio-desc") list = [...list].sort((a, b) => M.cupOf(b) - M.cupOf(a));
    else if (sortBy === "vistos") list = [...list].sort((a, b) => engOf(b).v - engOf(a).v);
    else if (sortBy === "compartidos") list = [...list].sort((a, b) => engOf(b).c - engOf(a).c);
    else if (sortBy === "oferta") list = [...list].sort((a, b) => (M.cupOf(a) - M.cupOf(b)) || (pagoRank(a) - pagoRank(b)));
    else if (sortBy === "ventas") list = [...list].sort((a, b) => (E.score(engOf(b)) - E.score(engOf(a))) || ((b.destacado ? 1 : 0) - (a.destacado ? 1 : 0)));
    else list = [...list].sort((a, b) => (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0));
    return list;
  }
  function cardHTML(p) {
    const M = st();
    const pr = M.precios(p);
    const img = p.mini
      ? `<img loading="lazy" decoding="async" src="${M.esc(p.mini)}" alt="" onerror="this.onerror=null;this.src='src/assets/banner1.jpg'">`
      : `<span style="font-size:2.5rem">📦</span>`;
    let ribbon = "";
    if (p.id === topSeller) ribbon = `<span class="rank-ribbon">🔥 Más vendido</span>`;
    else if (p.id === topVisto) ribbon = `<span class="rank-ribbon" style="background:linear-gradient(135deg,#0ea5e9,#2563eb)">👁 Más visto</span>`;
    else if (p.id === topComp) ribbon = `<span class="rank-ribbon" style="background:linear-gradient(135deg,#8b5cf6,#6d28d9)">↗ Más compartido</span>`;
    let stock = "";
    if (typeof p.stock === "number") {
      stock = p.stock <= 0 ? `<div class="sin-stock">Agotado</div>`
        : p.stock <= 5 ? `<div class="stock-bajo">¡Solo quedan ${p.stock}!</div>` : "";
    }
    return `<div class="card${p.destacado ? " dest" : ""}" data-id="${M.esc(p.id)}" tabindex="0" role="button" aria-label="${M.esc(p.titulo)}">` +
      `<div class="img">${img}</div><div class="cuerpo">` + ribbon +
      (p.destacado ? `<span class="badge-dest">⭐ Destacado</span>` : "") +
      `<div class="tit">${M.esc(p.titulo)}</div><div class="pre">${pr.main}</div><div class="conv">${pr.sub}</div>` +
      (p.negocioNombre ? `<div class="mun">🏪 ${M.esc(p.negocioNombre)}</div>` : "") + payBadgesHTML(p) + stock +
      `<div class="mun">📍 ${M.esc(p.municipio || "—")}</div></div></div>`;
  }
  function bindCards() {
    document.querySelectorAll(".card[data-id]").forEach((el) => {
      if (el.dataset.bound) return; el.dataset.bound = "1";
      el.addEventListener("click", () => viewProduct(el.dataset.id));
      el.addEventListener("keydown", (e) => { if (e.key === "Enter") viewProduct(el.dataset.id); });
    });
    // Respaldo por tiempo para imágenes remotas lentas/bloqueadas (ej. Drive en ciertos entornos):
    // si a los 6s sigue sin cargar, se sustituye por banner local.
    document.querySelectorAll(".card .img img").forEach((img) => {
      if (img.dataset.wd) return; img.dataset.wd = "1";
      setTimeout(() => {
        try { if (img.isConnected && img.naturalWidth === 0 && /^https?:/.test(img.src)) img.src = "src/assets/banner1.jpg"; } catch (e) {}
      }, 6000);
    });
  }
  function pintarCats() {
    const M = st();
    const nav = $("catNav");
    let h = `<button class="${cat === "" ? "act" : ""}" data-cat="">Todo</button>`;
    cats.forEach((c) => { h += `<button class="${cat === c ? "act" : ""}" data-cat="${M.esc(c)}">${M.esc(c)}</button>`; });
    nav.innerHTML = h;
    nav.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      cat = b.dataset.cat; withTransition(() => { pintarCats(); renderGrid(); });
    }));
    // tira visual de categorías con banners
    const strip = $("catStrip");
    if (strip) {
      const dc = (window.MC_DATA.CATEGORIES || []);
      strip.innerHTML = dc.filter((c) => cats.includes(c.nombre)).map((c) =>
        `<div class="cat-card" data-cat="${M.esc(c.nombre)}"><img loading="lazy" decoding="async" src="${M.esc(c.banner)}" alt=""><span>${M.esc(c.icono + " " + c.nombre)}</span></div>`
      ).join("");
      strip.querySelectorAll(".cat-card").forEach((el) => el.addEventListener("click", () => {
        cat = el.dataset.cat; withTransition(() => { pintarCats(); renderGrid(); });
        document.getElementById("grid").scrollIntoView({ behavior: "smooth", block: "start" });
      }));
    }
  }
  function renderGrid() {
    const M = st();
    // cintas de ranking global (ventas → vistos → compartidos)
    try {
      const E = M.Engagement;
      const eg = (p) => E.get(p.id);
      const byS = [...prods].sort((a, b) => E.score(eg(b)) - E.score(eg(a)));
      const byV = [...prods].sort((a, b) => eg(b).v - eg(a).v);
      const byC = [...prods].sort((a, b) => eg(b).c - eg(a).c);
      topSeller = byS.length && E.score(eg(byS[0])) > 0 ? byS[0].id : null;
      topVisto = byV.length && eg(byV[0]).v > 0 ? byV[0].id : null;
      topComp = byC.length && eg(byC[0]).c > 0 ? byC[0].id : null;
    } catch (e) { topSeller = topVisto = topComp = null; }
    const list = filtered();
    const dest = list.filter((p) => p.destacado);
    const rest = list.filter((p) => !p.destacado);
    $("secDest").innerHTML = dest.length
      ? `<h2 class="sec">⭐ Destacados</h2><div class="grid">${dest.map(cardHTML).join("")}</div>` : "";
    $("grid").innerHTML = rest.map(cardHTML).join("");
    $("vacio").style.display = list.length ? "none" : "block";
    $("resCount").textContent = list.length ? `${list.length} resultado${list.length > 1 ? "s" : ""}` : "";
    bindCards();
  }
  // Ofertas de los negocios (inventarios) unificadas con el catálogo general.
  // Cada oferta sabe su negocio, pagos, stock y si acepta transferencia.
  // Las tiendas suspendidas (cuota impaga) no existen en la página.
  function bizOffers() {
    const M = st();
    const out = [];
    try {
      M.Negocios.all().forEach((b) => {
        if (M.Negocios.suspendida(b)) return;
        (b.items || []).forEach((it) => {
          out.push(Object.assign({}, it, {
            negocioId: b.id, negocioNombre: b.nombre,
            vendedor: b.nombre, telefono: it.telefono || b.telefono,
            municipio: it.municipio || b.municipio,
            pago: b.pagos && b.pagos.transfer ? "transfer" : "efectivo",
            pagos: b.pagos, delivery: b.delivery, local: true,
          }));
        });
      });
    } catch (e) {}
    return out;
  }
  function refrescarOfertas() { prods = baseProds.concat(bizOffers()); renderGrid(); }
  async function cargarProductos() {
    const M = st();
    try {
      const r = await M.api("productos_list", { categoria: "", q: "" });
      if (r.ok && Array.isArray(r.productos)) { baseProds = r.productos.map((p) => Object.assign({ pago: "consultar", local: false }, p)); }
      else throw new Error("x");
    } catch (e) {
      baseProds = [];
      toast("Modo demo: sin conexión al servidor, mostrando anuncios de ejemplo.");
    }
    if (!baseProds.length) {
      baseProds = M.demoList().map((p) => Object.assign({ pago: "consultar", local: true }, p));
    } else if (baseProds.length < 3) {
      // Pocos anuncios reales: se completa con ejemplos para mostrar el marketplace.
      // Cuando haya 3+ anuncios reales, los ejemplos desaparecen solos.
      const have = new Set(baseProds.map((p) => p.id));
      M.demoList().forEach((p) => { if (!have.has(p.id)) baseProds.push(Object.assign({ pago: "consultar", local: true }, p)); });
    }
    prods = baseProds.concat(bizOffers());
    withTransition(renderGrid);
  }
  function aplicarBusqueda(v) {
    q = v;
    const sb = $("sugBox");
    if (sb) sb.hidden = true;
    const sel = $("sortSel");
    if (q && sortBy === "ventas") { sortBy = "oferta"; if (sel) sel.value = "oferta"; }
    if (!q && sortBy === "oferta") { sortBy = "ventas"; if (sel) sel.value = "ventas"; }
    withTransition(renderGrid);
  }
  const buscarAhora = debounce(() => { aplicarBusqueda($("q").value.trim()); pintarSugs(); }, 160);

  /* ---------- sugerencias mientras escribes ---------- */
  function matchesFor(t) {
    const terms = normK(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
    if (!terms.length) return [];
    const out = [];
    for (const p of prods) {
      const hay = normK((p.titulo || "") + " " + (p.descripcion || "") + " " + (p.categoria || "") + " " + (p.negocioNombre || ""));
      let ok = true, score = 0;
      for (const term of terms) {
        if (hay.includes(term)) { score += term.length >= 4 ? 3 : 2; continue; }
        let best = 99;
        for (const w of hay.split(/[^a-z0-9]+/)) {
          if (!w || Math.abs(w.length - term.length) > 2) continue;
          const d = lev(w, term);
          if (d < best) best = d;
          if (best <= 1) break;
        }
        if (best <= (term.length >= 6 ? 2 : 1)) score += 1;
        else { ok = false; break; }
      }
      if (ok) score += (p.destacado ? 2 : 0);
      if (ok) out.push({ p, score });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 6).map((x) => x.p);
  }
  function pintarSugs() {
    const box = $("sugBox");
    if (!box) return;
    const t = ($("q").value || "").trim();
    if (t.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
    const M = st();
    const list = matchesFor(t);
    if (!list.length) {
      box.innerHTML = `<div class="sug-empty">Sin coincidencias — pulsa 🔍 para buscar de todos modos</div>`;
      box.hidden = false;
      return;
    }
    box.innerHTML = list.map((p) =>
      `<button class="sug-item" data-sug="${M.esc(p.id)}">` +
      (p.mini ? `<img loading="lazy" src="${M.esc(p.mini)}" alt="" onerror="this.style.display='none'">` : `<span style="font-size:1.6rem">📦</span>`) +
      `<span class="t"><b>${M.esc(p.titulo)}</b><span>${M.precios(p).main}</span></span><span class="go">›</span></button>`
    ).join("");
    box.hidden = false;
    box.querySelectorAll("[data-sug]").forEach((b) => b.addEventListener("mousedown", (e) => {
      e.preventDefault();
      box.hidden = true;
      viewProduct(b.dataset.sug);
    }));
  }
  function hideSugs() { const box = $("sugBox"); if (box) { box.hidden = true; } }

  /* ---------- navegación ---------- */
  function mostrar(v) {
    ["inicio", "mios", "pedidos", "admin", "negocios", "negocio", "afiliado", "tienda"].forEach((x) => { $("v-" + x).className = "vista" + (x === v ? " act" : ""); });
    if (v === "mios") cargarMios();
    if (v === "pedidos") cargarPedidos();
    if (v === "admin") cargarAdmin();
    if (v === "negocios") cargarNegocios();
    if (v === "negocio") pintarNegocio();
    if (v === "afiliado") cargarAfiliado();
    if (v === "tienda") cargarTienda();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function goHome() { cat = ""; const i = $("q"); if (i) i.value = ""; hideSugs(); sortBy = "ventas"; const s = $("sortSel"); if (s) s.value = "ventas"; q = ""; mostrar("inicio"); pintarCats(); renderGrid(); }

  async function shareProduct(p) {
    const M = st();
    const url = M.Afiliados.linkFor(p.id);
    const text = `${p.titulo} — ${M.precios(p).main} en Mercado Ciénega`;
    try {
      if (navigator.share) await navigator.share({ title: p.titulo, text, url });
      else { await navigator.clipboard.writeText(text + " " + url); toast("Enlace copiado 📋"); }
      M.Engagement.bump(p.id, "c", 1);
      const ms = $("mStats");
      if (ms) { const eg = M.Engagement.get(p.id); ms.textContent = `👁 ${eg.v} · 🛒 ${eg.s} vendidos · ↗ ${eg.c} compartidos`; }
      renderGrid();
    } catch (e) { /* cancelado por el usuario */ }
  }

  /* ---------- kit de promoción para colaboradores ---------- */
  function bizOfOffer(p) {
    if (!p.negocioId) return null;
    try { return st().Negocios.get(p.negocioId); } catch (e) { return null; }
  }
  function pctOf(p) {
    const b = bizOfOffer(p);
    if (b && b.afiliados && b.afiliados.activo) return Number(b.afiliados.pct) || 0;
    return p.negocioId ? 0 : 5; // productos generales: 5% base
  }
  function openPromo(pid) {
    const M = st();
    if (!S().user) { cerrarModal(); openAuth("Entra para promocionar y ganar comisión con tu enlace."); return; }
    const p = prods.find((x) => x.id === pid);
    if (!p) return;
    const b = bizOfOffer(p);
    if (b && b.afiliados && !b.afiliados.activo) { toast("Este negocio pausó su programa de afiliados"); return; }
    const pct = pctOf(p);
    const link = M.Afiliados.linkFor(pid);
    const pr = M.precios(p);
    const bizName = b ? b.nombre : "Mercado Ciénega";
    const shareMsg = `🛒 ${p.titulo} — ${pr.main} en ${bizName} 👉 ${link}`;
    abrirModal(`<h3>🤝 Promociona y gana ${pct}%</h3>` +
      `<div class="alerta">Sin duplicar anuncios ni tocar precios: comparte <b>tu enlace</b>. Si alguien compra en 30 días, la tienda ve que fue gracias a ti y te paga el <b>${pct}%</b> (≈ ${M.fmtCUP(M.cupOf(p) * pct / 100)} CUP por unidad).</div>` +
      `<label>Tu enlace de colaborador</label>` +
      `<div style="display:flex;gap:8px"><input type="text" id="afLink" readonly value="${M.esc(link)}" style="flex:1"><button class="mini-btn ok" id="afCopy" style="margin:0">Copiar</button></div>` +
      `<div id="afPrev" class="vacio">🎨 Generando imagen de promoción…</div>` +
      `<div class="share-row"><button class="btn" id="afDl">⬇️ Descargar imagen</button>` +
      `<button class="wa" id="afWa" style="margin-top:14px;border:none;cursor:pointer;font:inherit">💬 Enviar por WhatsApp</button></div>` +
      `<div class="nota" id="afWaNota" style="text-align:center">En el celular se adjunta la imagen sola; en computadora se descarga y solo tienes que subirla al chat.</div>` +
      `<button class="btn gris bloque" id="afMine">📊 Ver mis promociones</button>`, true);
    M.Afiliados.addLink(pid, p.titulo);
    let canvas = null;
    promoCanvas(p, link).then((c) => {
      canvas = c;
      const box = $("afPrev");
      if (box) { box.className = ""; box.innerHTML = ""; box.appendChild(c); }
    }).catch(() => {
      const box = $("afPrev");
      if (box) box.textContent = "No se pudo generar la imagen, pero tu enlace funciona igual.";
    });
    $("afCopy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(link); toast("Enlace copiado 📋"); }
      catch (e) { $("afLink").select(); document.execCommand("copy"); toast("Enlace copiado 📋"); }
    });
    $("afDl").addEventListener("click", () => {
      if (!canvas) { toast("Espera a que se genere…"); return; }
      const a = document.createElement("a");
      a.download = "promo-" + pid + ".png";
      a.href = canvas.toDataURL("image/png");
      a.click();
      toast("Imagen descargada ✅");
    });
    $("afWa").addEventListener("click", async () => {
      if (!canvas) { toast("Espera a que se genere la imagen…"); return; }
      const btn = $("afWa");
      const old = btn.textContent;
      btn.textContent = "⏳ Preparando imagen…";
      try {
        const file = await new Promise((res) => {
          try { canvas.toBlob((bb) => res(bb), "image/png"); }
          catch (e) { res(null); }
        }).then((blob) => blob ? new File([blob], "promo-" + pid + ".png", { type: "image/png" }) : null)
          .catch(() => null);
        // 1) Celular / navegador con Web Share + archivos: la imagen VA adjunta al compartir
        //    (el usuario elige WhatsApp y llega foto + texto + enlace juntos).
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: p.titulo, text: shareMsg });
            try { M.Engagement.bump(pid, "c", 1); renderGrid(); } catch (e) {}
            toast("¡Imagen compartida! Elige WhatsApp ✅");
            return;
          } catch (e) { /* usuario canceló: no hacer nada más */ return; }
          finally { btn.textContent = old; }
        }
        // 2) Sin Web Share con archivos (PC): descargar imagen + abrir WhatsApp con el texto.
        //    wa.me no acepta fotos por URL, así que la dejamos descargada para adjuntarla.
        const a = document.createElement("a");
        a.download = "promo-" + pid + ".png";
        a.href = canvas.toDataURL("image/png");
        a.click();
        try { await navigator.clipboard.writeText(shareMsg); } catch (e) {}
        window.open("https://wa.me/?text=" + encodeURIComponent(shareMsg), "_blank");
        try { M.Engagement.bump(pid, "c", 1); renderGrid(); } catch (e) {}
        toast("Imagen descargada 🖼️: adjúntala en el chat de WhatsApp");
      } finally {
        try { if ($("afWa")) $("afWa").textContent = old; } catch (e) {}
      }
    });
    $("afMine").addEventListener("click", () => { cerrarModal(); mostrar("afiliado"); });
  }
  function loadImgPromo(src) {
    return new Promise((resolve) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = src;
      setTimeout(() => resolve(null), 8000);
    });
  }
  // Tarjeta promo 720x900 lista para WhatsApp/Facebook/Instagram
  async function promoCanvas(p, link) {
    const M = st();
    const W = 720, H = 900;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    c.style.cssText = "max-width:100%;border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.25)";
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#093f31"); grad.addColorStop(1, "#0d5c46");
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.fillStyle = "#ffb300"; g.fillRect(0, 0, W, 10);
    g.fillStyle = "#fff"; g.textAlign = "center";
    g.font = "800 40px system-ui,sans-serif";
    g.fillText("🛒 Mercado Ciénega", W / 2, 70);
    g.font = "600 30px system-ui,sans-serif"; g.fillStyle = "#ffe9b0";
    const bizN = p.negocioNombre || "Vendedor local";
    g.fillText(String(bizN).slice(0, 34), W / 2, 112);
    // foto (misma-origen = canvas limpio; remota con CORS, si falla usa banner)
    let im = (p.mini && !/^https?:/.test(p.mini)) ? await loadImgPromo(p.mini) : null;
    if (!im && p.mini) im = await loadImgPromo(p.mini);
    if (!im) im = await loadImgPromo("src/assets/banner1.jpg");
    if (im) {
      const iw = 640, ih = 380, ix = 40, iy = 140;
      g.save();
      g.beginPath();
      if (g.roundRect) g.roundRect(ix, iy, iw, ih, 24); else g.rect(ix, iy, iw, ih);
      g.clip();
      const sc = Math.max(iw / im.width, ih / im.height);
      g.drawImage(im, ix + (iw - im.width * sc) / 2, iy + (ih - im.height * sc) / 2, im.width * sc, im.height * sc);
      g.restore();
    }
    // título multilínea
    g.fillStyle = "#fff"; g.font = "700 38px system-ui,sans-serif";
    const words = String(p.titulo).split(" ");
    const lines = []; let cur = "";
    words.forEach((w) => { if ((cur + " " + w).trim().length > 30) { lines.push(cur.trim()); cur = w; } else cur += " " + w; });
    if (cur.trim()) lines.push(cur.trim());
    lines.slice(0, 2).forEach((ln, i) => g.fillText(ln.slice(0, 34), W / 2, 570 + i * 46));
    // precio
    const pr = M.precios(p);
    g.fillStyle = "#ffb300"; g.font = "800 64px system-ui,sans-serif";
    g.fillText(pr.main.slice(0, 24), W / 2, 690);
    g.fillStyle = "#cfe0d8"; g.font = "400 30px system-ui,sans-serif";
    g.fillText(pr.sub.slice(0, 30), W / 2, 730);
    // QR del enlace
    try {
      const tmp = document.createElement("div");
      if (window.QRCode) {
        new QRCode(tmp, { text: link, width: 150, height: 150, correctLevel: QRCode.CorrectLevel.M });
        await new Promise((r) => setTimeout(r, 200));
        const qi = tmp.querySelector("canvas") || tmp.querySelector("img");
        if (qi) {
          g.fillStyle = "#fff";
          if (g.roundRect) { g.beginPath(); g.roundRect(W / 2 - 85, 750, 170, 170, 16); g.fill(); } else g.fillRect(W / 2 - 85, 750, 170, 170);
          g.drawImage(qi, W / 2 - 75, 760, 150, 150);
        }
      }
    } catch (e) {}
    return c;
  }

  /* ---------- deep link + atribución por enlace ---------- */
  function checkRef() {
    const M = st();
    let r = null;
    try { r = M.Afiliados.parseHash(); } catch (e) {}
    if (!r) return;
    if (r.ref) {
      M.Afiliados.setRef(r.ref, r.pid);
      M.Afiliados.bumpClick(r.ref, r.pid);
      toast("Llegaste por el enlace de @" + r.ref + " 🤝");
    }
    const t = prods.find((x) => x.id === r.pid);
    if (t) setTimeout(() => viewProduct(r.pid), 600);
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  }

  /* ---------- producto ---------- */
  async function viewProduct(id) {
    const M = st();
    let p = prods.find((x) => x.id === id);
    if (!p) { toast("Anuncio no encontrado"); return; }
    if (p.negocioId) {
      const bz = M.Negocios.get(p.negocioId);
      if (bz && M.Negocios.suspendida(bz)) { toast("⛔ Este anuncio no está disponible"); return; }
    }
    try {
      const r = await M.api("producto_get", { id });
      if (r.ok) p = Object.assign({ pago: p.pago || "consultar", pagos: p.pagos, negocioId: p.negocioId, negocioNombre: p.negocioNombre, stock: p.stock, local: p.local }, r.producto);
    } catch (e) {}
    M.Engagement.bump(p.id, "v", 1);
    const eg = M.Engagement.get(p.id);
    const pr = M.precios(p);
    const imgs = p.imagenes && p.imagenes.length ? p.imagenes : [];
    let h = `<div class="galeria"><div class="ppal">` +
      (imgs.length ? `<img id="gImg" src="${M.esc(imgs[0])}" alt="" onerror="this.onerror=null;this.src='src/assets/banner1.jpg'">` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:4rem">📦</div>`) +
      `</div>`;
    if (imgs.length > 1) {
      h += `<div class="minis">` + imgs.map((s, i) =>
        `<img loading="lazy" src="${M.esc(s)}" class="${i === 0 ? "act" : ""}" data-src="${M.esc(s)}" alt="" onerror="this.onerror=null;this.src='src/assets/banner1.jpg'">`).join("") + `</div>`;
    }
    h += `</div>` + (p.destacado ? `<span class="badge-dest">⭐ Destacado</span> ` : "") +
      `<div class="p-titulo">${M.esc(p.titulo)}</div><div class="p-precio">${pr.main}</div><div class="p-conv">${pr.sub}</div>` +
      `<div class="stat-row" id="mStats">👁 ${eg.v} · 🛒 ${eg.s} vendidos · ↗ ${eg.c} compartidos</div>` +
      `<div class="nota">Tasa: ${M.S.tasa.tasa} CUP/USD · ${M.esc(M.S.tasa.fuente)} (${M.esc(M.S.tasa.fecha)})</div>` +
      (p.negocioNombre ? `<p class="p-dato">🏪 <a href="#" id="mBiz">${M.esc(p.negocioNombre)}</a></p>` : "") +
      payBadgesHTML(p) +
      (typeof p.stock === "number" ? (p.stock <= 0 ? `<div class="error">Agotado por ahora.</div>` : `<p class="p-dato">📦 Disponibles: <b>${p.stock}</b></p>`) : "") +
      (p.descripcion ? `<div class="p-desc">${M.esc(p.descripcion)}</div>` : "") +
      `<p class="p-dato">🏷️ ${M.esc(p.categoria)}</p><p class="p-dato">📍 ${M.esc(p.municipio) || "—"}</p><p class="p-dato">👤 ${M.esc(p.vendedor)}</p>`;
    if (p.telefono) h += `<p class="p-dato">📞 ${M.esc(p.telefono)}</p>`;
    const wa = p.telefono ? M.waLink(p.telefono) : "";
    if (wa) h += `<a class="wa" target="_blank" rel="noopener" href="${wa}">💬 WhatsApp del vendedor</a><br>`;
    h += `<div class="share-row"><button class="btn" id="mAdd"${typeof p.stock === "number" && p.stock <= 0 ? " disabled style='opacity:.5'" : ""}>🛒 Agregar al carrito</button>` +
      `<button class="btn gris" id="mShare">↗ Compartir</button> <button class="btn gris" id="mPromo">🤝 Promocionar</button> <button class="btn gris" id="mAsk">✨ Asistente</button></div>`;
    abrirModal(h, true);
    document.querySelectorAll(".minis img").forEach((im) => im.addEventListener("click", () => {
      $("gImg").src = im.dataset.src;
      document.querySelectorAll(".minis img").forEach((x) => x.className = "");
      im.className = "act";
    }));
    setTimeout(() => {
      try { const g = $("gImg"); if (g && g.naturalWidth === 0 && /^https?:/.test(g.src)) g.src = "src/assets/banner1.jpg"; } catch (e) {}
    }, 6000);
    $("mAdd").addEventListener("click", () => addToCart(p.id));
    $("mShare").addEventListener("click", () => shareProduct(p));
    $("mPromo").addEventListener("click", () => openPromo(p.id));
    const mb = $("mBiz");
    if (mb) mb.addEventListener("click", (e) => { e.preventDefault(); cerrarModal(); openNegocio(p.negocioId); });
    $("mAsk").addEventListener("click", () => { cerrarModal(); window.CF.open(); window.CF.search(p.titulo); });
  }

  /* ---------- modal ---------- */
  function abrirModal(html, ancho) {
    $("modalCont").innerHTML = html;
    $("modalBox").className = "modal" + (ancho ? " ancho" : "");
    $("fondoModal").style.display = "flex";
  }
  function cerrarModal() {
    $("fondoModal").style.display = "none";
    $("fondoModal").classList.remove("authfondo");
    $("modalBox").classList.remove("authglass");
  }

  /* ---------- carrito + checkout ---------- */
  function toggleCart(force) {
    const d = $("drawer");
    const abrir = force !== undefined ? force : !d.classList.contains("abierto");
    if (abrir && !S().user) { openAuth("Entra o crea tu cuenta para usar el carrito."); return; }
    d.classList.toggle("abierto", abrir);
    if (abrir) pintarCarrito();
  }
  async function addToCart(id) {
    const M = st();
    if (!S().user) { cerrarModal(); openAuth("Entra o crea tu cuenta para usar el carrito."); return; }
    let p = prods.find((x) => x.id === id);
    try { const r = await M.api("producto_get", { id }); if (r.ok) p = r.producto; } catch (e) {}
    if (!p) return;
    const ex = S().carrito.find((x) => x.id === id);
    if (ex) ex.cantidad = Math.min(99, ex.cantidad + 1);
    else S().carrito.push({ id: p.id, titulo: p.titulo, precio: p.precio, moneda: p.moneda, mini: p.mini, categoria: p.categoria, cantidad: 1, telefono: p.telefono || null, negocioId: p.negocioId || null, negocioNombre: p.negocioNombre || null, local: !!p.local });
    M.guardarCarrito(); actualizarN(); pintarCarrito();
    cerrarModal(); toggleCart(true);
    M.Marketing.markAbandoned();
    toast("Agregado al carrito ✅");
  }
  function cambiarCant(id, d) {
    const it = S().carrito.find((x) => x.id === id);
    if (!it) return;
    it.cantidad += d;
    if (it.cantidad < 1) S().carrito = S().carrito.filter((x) => x.id !== id);
    st().guardarCarrito(); pintarCarrito(); actualizarN();
  }
  function quitarItem(id) { S().carrito = S().carrito.filter((x) => x.id !== id); st().guardarCarrito(); pintarCarrito(); actualizarN(); }
  function totales() {
    const M = st();
    let cup = 0;
    S().carrito.forEach((x) => { cup += (x.moneda === "USD" ? x.precio * M.S.tasa.tasa : x.precio) * x.cantidad; });
    return { cup, usd: cup / M.S.tasa.tasa };
  }
  function actualizarN() {
    const n = S().carrito.reduce((a, x) => a + x.cantidad, 0);
    const el = $("cartN");
    el.style.display = n ? "inline" : "none"; el.textContent = n;
  }
  function pintarCarrito() {
    const M = st();
    const box = $("cartItems");
    if (!S().carrito.length) { box.innerHTML = `<div class="vacio">Tu carrito está vacío.</div>`; $("cartPie").innerHTML = ""; return; }
    box.innerHTML = S().carrito.map((x) => {
      const pr = M.precios(x);
      return `<div class="citem">${x.mini ? `<img loading="lazy" src="${M.esc(x.mini)}" alt="" onerror="this.onerror=null;this.src='src/assets/banner1.jpg'">` : `<span style="font-size:2rem">📦</span>`}` +
        `<div class="t"><b>${M.esc(x.titulo)}</b>${x.negocioNombre ? `<br><span style="font-size:.78rem;color:var(--verde-osc)">🏪 ${M.esc(x.negocioNombre)}</span>` : ""}<br><span style="color:var(--gris);font-size:.82rem">${pr.main}</span>` +
        `<div class="cant"><button data-a="-" data-id="${M.esc(x.id)}">−</button>${x.cantidad}<button data-a="+" data-id="${M.esc(x.id)}">＋</button>` +
        `<button class="mini-btn" data-a="x" data-id="${M.esc(x.id)}">🗑</button></div></div></div>`;
    }).join("");
    box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.id;
      if (b.dataset.a === "+") cambiarCant(id, 1);
      else if (b.dataset.a === "-") cambiarCant(id, -1);
      else quitarItem(id);
    }));
    const t = totales();
    $("cartPie").innerHTML =
      `<div style="font-size:1.2rem;font-weight:800">Total: ${M.fmtCUP(t.cup)} CUP</div>` +
      `<div style="color:var(--gris)">≈ $${M.fmtUSD(t.usd)} USD</div>` +
      `<button class="btn verde bloque" id="checkoutBtn">✅ Finalizar pedido</button>`;
    $("checkoutBtn").addEventListener("click", openCheckout);
  }

  // Negocios del carrito que ofrecen domicilio
  function bizInCart() {
    const M = st();
    const map = {};
    S().carrito.forEach((x) => {
      if (!x.negocioId) return;
      const b = M.Negocios.get(x.negocioId);
      if (!b || M.Negocios.suspendida(b)) return; // suspendida: sin domicilio
      if (b.delivery && b.delivery.activo) {
        if (!map[b.id]) map[b.id] = { biz: b, n: 0 };
        map[b.id].n += x.cantidad;
      }
    });
    return Object.values(map);
  }

  function openCheckout() {
    const M = st();
    if (!S().carrito.length) return;
    toggleCart(false);
    const t = totales();
    const ship = M.Shipping;
    const q0 = ship.quote(5, "moto");
    const shipHTML = ship.methods.map((m) => {
      const qq = ship.quote(5, m.id);
      return `<div class="ship-card${m.id === "moto" ? " sel" : ""}" data-ship="${m.id}">` +
        `<div style="font-size:1.5rem">${m.nombre.split(" ")[0]}</div><div><b>${M.esc(m.nombre)}</b><br>` +
        `<span class="nota">${M.esc(m.eta)} · base ${M.fmtCUP(qq.cup)} CUP (≈ $${M.fmtUSD(qq.usd)}) para 5 km</span></div></div>`;
    }).join("");
    abrirModal(
      `<h3>💳 Checkout — total ${M.fmtCUP(t.cup)} CUP (≈ $${M.fmtUSD(t.usd)} USD)</h3>` +
      `<div class="nota">Estructura lista para <b>Stripe / PayPal</b> (requiere backend; hoy se simula) + métodos locales reales por transferencia.</div>` +
      `<div class="pay-tabs" id="payTabs">` +
      `<button data-pay="card" class="act">💳 Tarjeta (Stripe)</button>` +
      `<button data-pay="paypal">🅿️ PayPal</button>` +
      `<button data-pay="transfermovil">📱 Transfermóvil</button>` +
      `<button data-pay="usdt">💠 USDT</button>` +
      `<button data-pay="efectivo">🤝 Efectivo</button></div>` +
      `<div id="payBody"></div>` +
      `<h4 style="margin-top:14px">🚚 Envío (estructura Shippo/EasyPost)</h4>` +
      `<label>Distancia aprox. (km)</label><input type="number" id="shipKm" value="5" min="1" max="120">` +
      `<div id="shipList">${shipHTML}</div><div id="shipTotal" class="alerta"></div>` +
      `<div id="bizDelWrap"></div>` +
      `<label>Nota para los vendedores (opcional)</label><input type="text" id="ordNota" maxlength="200">` +
      `<button class="btn verde bloque" id="payNow">Pagar y crear pedido</button><div id="payErr"></div>` +
      `<div class="nota">Al pagar aceptas coordinar la entrega por WhatsApp con cada vendedor. Recibirás el # de pedido para rastrearlo con el asistente.</div>`,
      true);
    let pay = "card", shipId = "moto";
    // Domicilio por negocio: checkbox + km por cada negocio del carrito que lo ofrece
    const paintBizDel = () => {
      const wrap = $("bizDelWrap");
      const groups = bizInCart();
      if (!groups.length) { if (wrap) wrap.innerHTML = ""; return { extra: 0, detalle: "" }; }
      if (wrap && !wrap.dataset.built) {
        wrap.dataset.built = "1";
        wrap.innerHTML = `<h4 style="margin-top:14px">🏠 Domicilio del negocio</h4>` + groups.map((g) =>
          `<div class="delivery-card"><label style="margin:0;font-weight:700"><input type="checkbox" data-bizdel="${M.esc(g.biz.id)}" checked> 🏪 ${M.esc(g.biz.nombre)} a domicilio</label>` +
          `<div class="nota">${M.esc(g.biz.delivery.nota || "")} Base ${M.fmtCUP(g.biz.delivery.base)} CUP + ${M.fmtCUP(g.biz.delivery.porKm)} CUP/km.</div>` +
          `<label>Distancia (km)</label><input type="number" data-bizkm="${M.esc(g.biz.id)}" value="5" min="1" max="120"></div>`
        ).join("");
        wrap.querySelectorAll("input").forEach((i) => i.addEventListener("input", paintTotals));
      }
      let extra = 0; const det = [];
      groups.forEach((g) => {
        const cb = wrap.querySelector(`[data-bizdel="${g.biz.id}"]`);
        const kmI = wrap.querySelector(`[data-bizkm="${g.biz.id}"]`);
        if (cb && cb.checked) {
          const km = Number(kmI ? kmI.value : 5) || 5;
          const cup = (Number(g.biz.delivery.base) || 0) + km * (Number(g.biz.delivery.porKm) || 0);
          extra += cup;
          det.push(`${g.biz.nombre}: ${km}km = ${M.fmtCUP(cup)} CUP`);
        }
      });
      return { extra, detalle: det.join("; ") };
    };
    const paintTotals = () => {
      const km = Number($("shipKm").value) || 5;
      const qq = ship.quote(km, shipId);
      const bd = paintBizDel();
      $("shipTotal").textContent = `Envío ${qq.method.nombre}: ${M.fmtCUP(qq.cup)} CUP (≈ $${M.fmtUSD(qq.usd)} USD) · ${qq.method.eta}` +
        (bd.extra ? ` + domicilio ${M.fmtCUP(bd.extra)} CUP.` : `.`) +
        ` Total: ${M.fmtCUP(t.cup + qq.cup + bd.extra)} CUP.`;
      return { qq, bd };
    };
    const paintShip = () => paintTotals().qq;
    const paintPay = () => {
      const b = $("payBody");
      if (pay === "card") b.innerHTML = `<div class="metodo"><h4>💳 Tarjeta (simulado Stripe)</h4><label>Número</label><input id="ccN" inputmode="numeric" placeholder="4242 4242 4242 4242" maxlength="19"><div style="display:flex;gap:8px"><div style="flex:1"><label>Vence</label><input placeholder="12/28"></div><div style="flex:1"><label>CVC</label><input placeholder="123" maxlength="4"></div></div><div class="nota">Demo: ningún cargo real. Con backend, aquí va Stripe Elements con tu pk_…</div></div>`;
      else if (pay === "paypal") b.innerHTML = `<div class="metodo"><h4>🅿️ PayPal (simulado)</h4><div class="nota">Demo: te redirigiríamos a PayPal con tu client-id. Hoy se registra como pedido y coordinas por WhatsApp.</div></div>`;
      else if (pay === "transfermovil") b.innerHTML = `<div class="metodo"><h4>📱 Transfermóvil</h4><div class="nota">Transfiere y escribe el # de transacción abajo. El pedido se crea al instante para coordinar.</div><label># de transacción</label><input id="payRef" placeholder="Ej: 12345678"></div>`;
      else if (pay === "usdt") b.innerHTML = `<div class="metodo"><h4>💠 USDT (TRC20)</h4><div class="nota">Envía a la dirección del admin (ver en publicar) y pega la referencia.</div><label>Referencia / hash</label><input id="payRef" placeholder="Ej: 0x…"></div>`;
      else b.innerHTML = `<div class="metodo"><h4>🤝 Efectivo</h4><div class="nota">Pagas al recibir. Coordinas por WhatsApp con cada vendedor.</div></div>`;
    };
    paintPay(); paintShip();
    document.querySelectorAll("#payTabs button").forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll("#payTabs button").forEach((x) => x.className = "");
      b.className = "act"; pay = b.dataset.pay; paintPay();
    }));
    document.querySelectorAll("[data-ship]").forEach((el) => el.addEventListener("click", () => {
      document.querySelectorAll("[data-ship]").forEach((x) => x.classList.remove("sel"));
      el.classList.add("sel"); shipId = el.dataset.ship; paintShip();
    }));
    $("shipKm").addEventListener("input", paintShip);
    $("payNow").addEventListener("click", async () => {
      const M2 = st();
      const btn = $("payNow");
      btn.disabled = true; btn.textContent = "⏳ Procesando…";
      try {
        const { qq, bd } = paintTotals();
        await M2.Payments.createIntent(t.cup + qq.cup + bd.extra, { pay, ship: shipId, domicilio: bd.detalle });
        const nota = $("ordNota").value || "";
        const ref = ($("payRef") || {}).value || "";
        const colab = M2.Afiliados.getRef(); // colaborador que trajo esta compra (30 días)
        const notaFull = nota + ` [pago:${pay}${ref ? " ref:" + ref : ""} envio:${shipId} ${qq.cup}CUP${bd.detalle ? " domicilio:" + bd.detalle : ""}${colab ? " colab:@" + colab.by : ""}]`;
        const refExtra = colab ? { ref: colab.by, ref_pid: colab.pid || "" } : {};
        const itemsBack = S().carrito.filter((x) => !x.local);
        const itemsLocal = S().carrito.filter((x) => x.local);
        // ventas para el ranking (vale para backend y locales)
        S().carrito.forEach((x) => M2.Engagement.bump(x.id, "s", x.cantidad));
        // atribución al colaborador: la tienda ve que vendió gracias a su enlace
        if (colab) {
          S().carrito.forEach((x) => {
            let pct = 0, activo = false;
            if (x.negocioId) {
              const bz = M2.Negocios.get(x.negocioId);
              if (bz && bz.afiliados && bz.afiliados.activo) { activo = true; pct = Number(bz.afiliados.pct) || 0; }
            } else { activo = true; pct = 5; }
            if (activo && pct > 0) {
              const cup = (x.moneda === "USD" ? x.precio * M2.S.tasa.tasa : x.precio) * x.cantidad;
              M2.Afiliados.recordSale({ pid: x.id, titulo: x.titulo, by: colab.by, buyer: (S().user || {}).username || "", cup: Math.round(cup), pct, negocioId: x.negocioId || null, negocioNombre: x.negocioNombre || null, pedido: "carrito-" + Date.now().toString(36) });
            }
          });
        }
        let h = "";
        if (itemsBack.length) {
          const r = await M2.api("pedido_create", Object.assign({ items: itemsBack.map((x) => ({ id: x.id, cantidad: x.cantidad })), nota: notaFull }, refExtra));
          if (!r.ok) throw new Error(r.error || "No se pudo crear el pedido");
          h += `<h3>✅ Pedido ${M2.esc(r.pedido)} creado</h3><div class="okmsg">Total productos: ${M2.fmtCUP(t.cup)} CUP + envío ${M2.fmtCUP(qq.cup)} CUP${bd.extra ? " + domicilio " + M2.fmtCUP(bd.extra) + " CUP" : ""}. Contacta a cada vendedor:</div>`;
          (r.items || []).forEach((it) => {
            h += `<div class="metodo"><b>${M2.esc(it.titulo)}</b> × ${it.cantidad}<br>👤 ${M2.esc(it.vendedor)}` +
              (it.telefono ? ` · 📞 ${M2.esc(it.telefono)}` : "") +
              (M2.waLink(it.telefono) ? `<br><a class="wa" target="_blank" rel="noopener" href="${M2.waLink(it.telefono)}">💬 WhatsApp</a>` : "") + `</div>`;
          });
        }
        if (itemsLocal.length) {
          if (!h) h += `<h3>✅ Pedido registrado</h3><div class="okmsg">Total productos: ${M2.fmtCUP(t.cup)} CUP${bd.extra ? " + domicilio " + M2.fmtCUP(bd.extra) + " CUP" : ""}. Coordina por WhatsApp con cada negocio:</div>`;
          else h += `<div class="okmsg">Y estos productos de negocios se coordinan directo:</div>`;
          itemsLocal.forEach((x) => {
            const tel = x.telefono || "";
            const wa = M2.waLink(tel);
            h += `<div class="metodo"><b>${M2.esc(x.titulo)}</b> × ${x.cantidad} — ${M2.precios(x).main}` +
              (x.negocioNombre ? `<br>🏪 ${M2.esc(x.negocioNombre)}` : "") +
              (tel ? ` · 📞 ${M2.esc(tel)}` : "") +
              (wa ? `<br><a class="wa" target="_blank" rel="noopener" href="${wa}?text=${encodeURIComponent("Hola, quiero comprar «" + x.titulo + "» (Mercado Ciénega)")}">💬 WhatsApp</a>` : "") + `</div>`;
          });
        }
        h += `<button class="btn bloque" id="okClose">Cerrar</button>`;
        S().carrito = []; M2.guardarCarrito(); actualizarN(); pintarCarrito();
        refrescarOfertas();
        abrirModal(h);
        $("okClose").addEventListener("click", cerrarModal);
      } catch (e) {
        $("payErr").innerHTML = `<div class="error">${M2.esc(e.message || "Error de pago")}</div>`;
        btn.disabled = false; btn.textContent = "Pagar y crear pedido";
      }
    });
  }

  /* ---------- auth ---------- */
  function openAuth(msg) {
    const M = st();
    if (S().user) { menuUser(); return; }
    abrirModal(
      (msg ? `<div class="alerta">${M.esc(msg)}</div>` : "") +
      `<div style="text-align:center;font-size:44px">🛒</div><h3 style="text-align:center">Mercado Ciénega</h3>` +
      `<div class="tabs"><button class="act" id="tabL">Entrar</button><button id="tabR">Crear cuenta</button></div>` +
      `<div id="authL"><label>Usuario</label><input type="text" id="a_user" autocomplete="username">` +
      `<label>Clave</label><input type="password" id="a_pass" autocomplete="current-password">` +
      `<button class="btn bloque" id="doLogin">Entrar</button></div>` +
      `<div id="authR" style="display:none"><label>Usuario</label><input type="text" id="r_user">` +
      `<label>Nombre</label><input type="text" id="r_nom"><label>Teléfono / WhatsApp</label><input type="tel" id="r_tel" placeholder="5XXXXXXXX">` +
      `<label>Clave</label><input type="password" id="r_pass" autocomplete="new-password">` +
      `<button class="btn bloque" id="doReg">Crear cuenta</button></div><div id="authErr"></div>`);
    $("modalBox").classList.add("authglass");
    $("fondoModal").classList.add("authfondo");
    const tab = (n) => {
      $("authL").style.display = n ? "none" : "block";
      $("authR").style.display = n ? "block" : "none";
      $("tabL").className = n ? "" : "act"; $("tabR").className = n ? "act" : "";
    };
    $("tabL").addEventListener("click", () => tab(0));
    $("tabR").addEventListener("click", () => tab(1));
    $("doLogin").addEventListener("click", async () => {
      const M2 = st();
      const btn = $("doLogin");
      const oldTxt = btn.textContent;
      btn.disabled = true; btn.textContent = "⏳ Entrando…";
      const username = $("a_user").value.trim().toLowerCase();
      const password = $("a_pass").value;
      const fail = (m) => { $("authErr").innerHTML = `<div class="error">${M2.esc(m)}</div>`; btn.disabled = false; btn.textContent = oldTxt; };
      const localSession = (u, saludo) => {
        S().token = "local-" + Date.now().toString(36);
        S().user = { username: u.username, nombre: u.nombre || u.username, telefono: u.telefono || "", rol: u.rol || "usuario", negocioId: u.negocioId || null, local: true };
        M2.guardarSesion();
        try { S().carrito = JSON.parse(localStorage.getItem("mc_cart_" + u.username) || "[]"); } catch (e) { S().carrito = []; }
        pintarUser(); actualizarN(); cerrarModal(); toast(saludo);
        if ((u.rol || "usuario") === "admin") mostrar("admin");
      };
      try {
        // ① Administrador del sistema (acceso local, sin depender del servidor)
        if (username === "admin") {
          const h = await M2.sha256(password);
          if (h !== ADMIN_HASH) { fail("Credenciales inválidas"); return; }
          M2.Usuarios.upsert({ username: "admin", nombre: "Administrador", rol: "admin", origen: "local", password });
          localSession({ username: "admin", nombre: "Administrador", rol: "admin" }, "👑 Bienvenido, Admin");
          return;
        }
        // ①b Administrador de una tienda (usuario propio por negocio)
        const tbiz = await M2.Negocios.checkAdmin(username, password);
        if (tbiz) {
          localSession({ username: tbiz.adminUser, nombre: tbiz.nombre, rol: "tienda", negocioId: tbiz.id }, "🏪 Hola, " + tbiz.nombre);
          tiendaActual = tbiz.id;
          mostrar("tienda");
          return;
        }
        // ② Servidor (Google Sheets / backend)
        let r = null, offline = false;
        try { r = await M2.api("login", { username, password }); }
        catch (e) { offline = true; }
        if (!offline && r && r.ok) {
          S().token = r.token; S().user = r.user; M2.guardarSesion();
          M2.Usuarios.recordLogin({ username: r.user.username, nombre: r.user.nombre, telefono: r.user.telefono, rol: r.user.rol, origen: "backend" });
          try { S().carrito = JSON.parse(localStorage.getItem("mc_cart_" + S().user.username) || "[]"); } catch (e) { S().carrito = []; }
          pintarUser(); actualizarN();
          if (r.user.must_change) { pedirCambioClave(true); return; }
          cerrarModal(); toast("¡Hola, " + (r.user.nombre || r.user.username) + "! 👋");
          return;
        }
        // ③ Usuarios creados por el admin (funcionan con o sin conexión)
        const lu = await M2.Usuarios.check(username, password);
        if (lu) {
          if (lu.rol === "admin" && lu.origen !== "local") { fail("Credenciales inválidas"); return; }
          localSession(lu, lu.rol === "admin" ? "👑 Bienvenido, Admin" : ("¡Hola, " + (lu.nombre || lu.username) + "! 👋"));
          return;
        }
        fail((!offline && r && r.error) || "Usuario o clave incorrectos");
      } catch (e) { fail(e.message); }
    });
    $("doReg").addEventListener("click", async () => {
      const M2 = st();
      try {
        const un = $("r_user").value.trim().toLowerCase();
        if (un === "admin") throw new Error("Ese nombre está reservado");
        const r = await M2.api("register", { username: un, password: $("r_pass").value, nombre: $("r_nom").value, telefono: $("r_tel").value });
        if (!r.ok) throw new Error(r.error);
        S().token = r.token; S().user = r.user; M2.guardarSesion(); pintarUser(); actualizarN();
        M2.Usuarios.recordLogin({ username: r.user.username, nombre: r.user.nombre, telefono: r.user.telefono, rol: r.user.rol, origen: "backend" });
        cerrarModal(); toast("Cuenta creada ✅");
      } catch (e) { $("authErr").innerHTML = `<div class="error">${M2.esc(e.message)}</div>`; }
    });
  }
  function menuUser() {
    const M = st(); const u = S().user;
    abrirModal(`<h3>${u.rol === "tienda" ? "🏪" : "👤"} ${M.esc(u.nombre || u.username)}</h3><p class="p-dato">Usuario: <b>${M.esc(u.username)}</b></p>` +
      (u.telefono ? `<p class="p-dato">Tel: ${M.esc(u.telefono)}</p>` : "") +
      (u.rol === "tienda" && tiendaId() ? `<button class="btn bloque verde" id="uTienda">🏪 Mi tienda</button>` : "") +
      (u.rol !== "tienda" ? `<button class="btn bloque gris" id="uMios">📢 Mis anuncios</button>` : "") +
      (u.rol !== "tienda" ? `<button class="btn bloque gris" id="uPed">🧾 Mis pedidos</button>` : "") +
      (u.rol !== "tienda" ? `<button class="btn bloque gris" id="uAf">🤝 Mis promociones</button>` : "") +
      (u.rol === "admin" ? `<button class="btn bloque verde" id="uAdm">⚙️ Administración</button>` : "") +
      `<button class="btn bloque gris" id="uClave">🔑 Cambiar clave</button>` +
      `<button class="btn bloque rojo" id="uSalir">Salir</button>`);
    const t = $("uTienda"); if (t) t.addEventListener("click", () => { cerrarModal(); tiendaActual = tiendaId() || S().user.negocioId; mostrar("tienda"); });
    const m = $("uMios"); if (m) m.addEventListener("click", () => { cerrarModal(); mostrar("mios"); });
    const pd = $("uPed"); if (pd) pd.addEventListener("click", () => { cerrarModal(); mostrar("pedidos"); });
    const af = $("uAf"); if (af) af.addEventListener("click", () => { cerrarModal(); mostrar("afiliado"); });
    const a = $("uAdm"); if (a) a.addEventListener("click", () => { cerrarModal(); mostrar("admin"); });
    if (S().user && S().user.local) { const cb = $("uClave"); if (cb) cb.style.display = "none"; }
    else $("uClave").addEventListener("click", () => pedirCambioClave(false));
    $("uSalir").addEventListener("click", async () => {
      try { st().api("logout", {}).catch(() => {}); } catch (e) {}
      S().token = null; S().user = null; S().carrito = []; st().guardarSesion();
      pintarUser(); actualizarN(); cerrarModal(); goHome();
    });
  }
  function pedirCambioClave(oblig) {
    abrirModal(`<h3>🔑 ${oblig ? "Crea tu clave" : "Cambiar clave"}</h3>` +
      (oblig ? `<div class="alerta">Por seguridad, cambia la clave temporal.</div>` : "") +
      `<label>Clave actual</label><input type="password" id="c_act"><label>Clave nueva</label><input type="password" id="c_new">` +
      `<button class="btn bloque" id="cGo">Guardar</button><div id="cErr"></div>`);
    $("cGo").addEventListener("click", async () => {
      const M = st();
      try {
        const r = await M.api("pass_change", { actual: $("c_act").value, nueva: $("c_new").value });
        if (!r.ok) throw new Error(r.error);
        cerrarModal(); toast("Clave actualizada ✅");
      } catch (e) { $("cErr").innerHTML = `<div class="error">${M.esc(e.message)}</div>`; }
    });
  }
  function pintarUser() {
    const b = $("btnUser");
    if (!b) return;
    if (!S().user) b.textContent = "👤 Entrar";
    else if (S().user.rol === "admin") b.textContent = "👑 Admin";
    else if (S().user.rol === "tienda") b.textContent = "🏪 " + (S().user.nombre || S().user.username).split(" ")[0].slice(0, 12);
    else b.textContent = "👤 " + (S().user.nombre || S().user.username).split(" ")[0];
  }

  /* ---------- publicar ---------- */
  function detectarCategoria() {
    const keys = (window.MC_DATA.CAT_KEYS || {});
    const t0 = ($("p_tit") || {}).value || "", d0 = ($("p_desc") || {}).value || "";
    const txt = " " + normK(t0 + " " + d0 + " " + imgsNombres.join(" ")) + " ";
    const words = normK(t0 + " " + d0 + " " + imgsNombres.join(" ")).split(/[^a-z0-9]+/).filter(Boolean);
    let best = null, s1 = 0, s2 = 0;
    for (const cApi in keys) {
      let sc = 0;
      keys[cApi].forEach((k) => {
        if (k.indexOf(" ") >= 0) { if (txt.indexOf(" " + k + " ") >= 0) sc += 2; }
        else for (const w of words) { if (w === k || (w.indexOf(k) === 0 && w.length <= k.length + 2)) { sc += 1; break; } }
      });
      if (sc > s1) { s2 = s1; s1 = sc; best = cApi; } else if (sc > s2) s2 = sc;
    }
    return { cat: best, score: s1, margen: s1 - s2 };
  }
  function autoCategoria() {
    if (catManual) return;
    const d = detectarCategoria();
    const sel = $("p_cat"), nota = $("p_catnota");
    if (d.cat && d.score >= 1 && sel) { sel.value = d.cat; if (nota) nota.textContent = "🤖 Categoría detectada: " + d.cat + " — cámbiala si no es correcta."; }
    else if (nota) nota.textContent = "";
  }
  function openPublish() {
    const M = st();
    if (!S().user) { openAuth("Entra o crea tu cuenta para publicar tus productos."); return; }
    imgsSel = []; imgsNombres = []; catManual = false;
    const opts = cats.map((c) => `<option>${M.esc(c)}</option>`).join("");
    abrirModal(`<h3>📢 Publicar producto</h3>` +
      `<div class="alerta">Publicar cuesta <b id="p_precio_pub">…</b>. Tu anuncio se muestra al confirmarse tu pago y dura 1 mes.</div>` +
      `<label>Título</label><input type="text" id="p_tit" maxlength="80">` +
      `<label>Categoría</label><select id="p_cat">${opts}</select><div class="nota" id="p_catnota"></div>` +
      `<div style="display:flex;gap:12px"><div style="flex:1"><label>Precio</label><input type="number" id="p_pre" min="1" step="any"></div>` +
      `<div><label>Moneda</label><div class="radiofila"><label><input type="radio" name="p_mon" value="CUP" checked> CUP</label><label><input type="radio" name="p_mon" value="USD"> USD</label></div></div></div>` +
      `<div class="nota" id="p_conv"></div><label>Descripción</label><textarea id="p_desc" maxlength="2000"></textarea>` +
      `<label>Foto del producto</label>` +
      `<button type="button" class="upcard" id="p_imgs_btn"><span class="up-ico">📷</span><span class="up-txt"><b>Toca para elegir la foto</b><small>Galería o cámara · se comprime sola</small></span><span class="up-file" id="p_imgs_nom">Sin foto</span></button>` +
      `<input type="file" id="p_imgs" class="upfile" accept="image/*" tabindex="-1"><div class="upprev" id="p_prev"></div><div class="nota" id="p_peso"></div>` +
      `<label>Teléfono</label><input type="tel" id="p_tel" value="${M.esc(S().user.telefono || "")}">` +
      `<label>Municipio</label><input type="text" id="p_mun" placeholder="Ej: Ciénaga de Zapata">` +
      `<button class="btn bloque" id="btnPub">Continuar al pago →</button><div id="pErr"></div>`);
    $("p_pre").addEventListener("input", () => {
      const v = Number($("p_pre").value) || 0;
      const m = document.querySelector('input[name=p_mon]:checked').value;
      $("p_conv").textContent = v > 0 ? (m === "CUP" ? `Se mostrará como ${M.fmtCUP(v)} CUP (≈ $${M.fmtUSD(v / M.S.tasa.tasa)} USD)` : `Se mostrará como $${M.fmtUSD(v)} USD (≈ ${M.fmtCUP(v * M.S.tasa.tasa)} CUP)`) : "";
    });
    document.querySelectorAll('input[name=p_mon]').forEach((r) => r.addEventListener("change", () => $("p_pre").dispatchEvent(new Event("input"))));
    $("p_imgs_btn").addEventListener("click", () => $("p_imgs").click());
    $("p_imgs").addEventListener("change", async () => {
      const files = Array.prototype.slice.call($("p_imgs").files, 0, 1);
      if (!files.length) { $("p_imgs_nom").textContent = "Sin foto"; $("p_prev").innerHTML = ""; $("p_peso").textContent = ""; return; }
      $("p_imgs_nom").textContent = "📎 " + (files[0].name || "foto elegida");
      $("p_prev").innerHTML = "⏳ Comprimiendo…"; imgsSel = [];
      for (const f of files) { try { const c = await comprimirImagen(f); imgsSel.push(c); } catch (e) {} }
      if (imgsSel.length) {
        const u = "data:" + imgsSel[0].tipo + ";base64," + imgsSel[0].datos;
        $("p_prev").innerHTML = `<img src="${u}" alt="Vista previa"><button type="button" class="mini-btn" id="p_imgs_q">✕ Quitar</button>`;
        $("p_imgs_q").addEventListener("click", () => { $("p_imgs").value = ""; imgsSel = []; imgsNombres = []; $("p_imgs_nom").textContent = "Sin foto"; $("p_prev").innerHTML = ""; $("p_peso").textContent = ""; });
      } else $("p_prev").innerHTML = "";
      $("p_peso").textContent = imgsSel.length ? "✅ 1 foto lista (comprimida)" : "";
      imgsNombres = files.map((f) => f.name); autoCategoria();
    });
    const sel = $("p_cat"); if (sel) { sel.value = cats.includes("Otros") ? "Otros" : cats[0]; sel.addEventListener("change", () => { catManual = true; $("p_catnota").textContent = ""; }); }
    $("p_tit").addEventListener("input", autoCategoria);
    $("p_desc").addEventListener("input", autoCategoria);
    M.api("destacar_info", {}).then((d) => { if (d.ok) $("p_precio_pub").textContent = M.fmtCUP(d.publicar_precio_cup) + " CUP"; }).catch(() => {});
    $("btnPub").addEventListener("click", irAPagoPublicar);
  }
  async function comprimirImagen(file) {
    const M = st();
    try {
      const bmp = await createImageBitmap(file);
      const sc = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * sc)), h = Math.max(1, Math.round(bmp.height * sc));
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(bmp, 0, 0, w, h);
      let blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.8));
      let tipo = "image/webp";
      if (!blob) { blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82)); tipo = "image/jpeg"; }
      const buf = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = ""; const PASO = 8192;
      for (let i = 0; i < bytes.length; i += PASO) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + PASO));
      return { tipo, datos: btoa(bin) };
    } catch (e) { throw e; }
  }
  async function irAPagoPublicar() {
    const M = st();
    const tit = $("p_tit").value.trim(), pre = Number($("p_pre").value);
    if (!tit) { $("pErr").innerHTML = `<div class="error">Escribe el título.</div>`; return; }
    if (!(pre > 0)) { $("pErr").innerHTML = `<div class="error">Precio inválido.</div>`; return; }
    const selCat = $("p_cat"), det = detectarCategoria();
    if (!catManual && det.cat && det.score >= 1) selCat.value = det.cat;
    else if (det.cat && det.score >= 2 && det.margen >= 1 && det.cat !== selCat.value) {
      if (confirm(`🤖 Parece ser "${det.cat}". ¿Moverlo?`)) selCat.value = det.cat;
    }
    const datos = { titulo: tit, categoria: selCat.value, precio: $("p_pre").value, moneda: document.querySelector('input[name=p_mon]:checked').value, descripcion: $("p_desc").value, telefono: $("p_tel").value, whatsapp: "1", municipio: $("p_mun").value, imagenes: imgsSel };
    let d;
    try { d = await M.api("destacar_info", {}); if (!d.ok) throw new Error(d.error); }
    catch (e) { $("pErr").innerHTML = `<div class="error">${M.esc(e.message)}</div>`; return; }
    window._pubDatos = datos;
    const prCUP = M.fmtCUP(d.publicar_precio_cup) + " CUP";
    abrirModal(`<h3>💰 Pagar publicación: ${M.esc(tit)}</h3><div class="alerta">Costo: <b>${prCUP}</b>. Se publica al confirmarse tu pago.</div>` +
      `<div class="metodo"><h4>📱 Transfermóvil</h4>${d.metodos.transfermovil ? `Transfiere a <code>${M.esc(d.metodos.transfermovil)}</code> y escribe el # abajo.` : "Número pendiente."}</div>` +
      `<div class="metodo"><h4>💠 USDT (TRC20)</h4><code>${M.esc(d.metodos.usdt)}</code></div>` +
      `<div class="metodo"><h4>🤝 Efectivo</h4>${M.esc(d.metodos.efectivo)}</div>` +
      `<label>Método</label><select id="pp_met"><option value="transfermovil">Transfermóvil</option><option value="usdt">USDT</option><option value="efectivo">Efectivo</option></select>` +
      `<label>Referencia</label><input type="text" id="pp_ref"><button class="btn bloque" id="btnEnvPub">Enviar solicitud</button><div id="ppErr"></div>`);
    $("btnEnvPub").addEventListener("click", async () => {
      const btn = $("btnEnvPub"); btn.disabled = true; btn.textContent = "⏳ Enviando…";
      try {
        const r = await M.api("producto_create", Object.assign({}, window._pubDatos, { metodo: $("pp_met").value, referencia: $("pp_ref").value }));
        if (!r.ok) throw new Error(r.error);
        cerrarModal(); toast("✅ " + r.msg); mostrar("mios");
      } catch (e) { $("ppErr").innerHTML = `<div class="error">${M.esc(e.message)}</div>`; btn.disabled = false; btn.textContent = "Enviar solicitud"; }
    });
  }

  /* ---------- mis anuncios / pedidos / admin ---------- */
  async function cargarMios() {
    const M = st();
    if (!S().user) { openAuth(); mostrar("inicio"); return; }
    const box = $("misLista");
    try {
      const r = await M.api("mis_productos", {});
      if (!r.ok) throw new Error(r.error);
      if (!r.productos.length) { box.innerHTML = `<div class="vacio">Aún no tienes anuncios.<br><button class="btn" id="mPub">📢 Publicar el primero</button></div>`; $("mPub").addEventListener("click", openPublish); return; }
      box.innerHTML = `<table><tr><th>Anuncio</th><th>Precio</th><th>Estado</th><th></th></tr>` + r.productos.map((p) => {
        const pr = M.precios(p);
        const est = p.estado === "pendiente" ? "⏳ En espera de pago" : p.activo ? `✅ Publicado (vence ${M.esc(p.fecha_exp)})` : "⌛ Vencido";
        return `<tr><td>${p.destacado ? "⭐ " : ""}${M.esc(p.titulo)}</td><td>${pr.main}</td><td>${est}</td><td>` +
          (p.activo ? `<button class="mini-btn" data-d="${p.id}">⭐ Destacar</button><button class="mini-btn" data-r="${p.id}">🔄</button>` : "") +
          `<button class="mini-btn no" data-x="${p.id}">🗑</button></td></tr>`;
      }).join("") + `</table>`;
      box.querySelectorAll("[data-x]").forEach((b) => b.addEventListener("click", async () => {
        if (!confirm("¿Eliminar?")) return;
        const rr = await M.api("producto_delete", { id: b.dataset.x });
        if (rr.ok) cargarMios(); else toast(rr.error);
      }));
      box.querySelectorAll("[data-r]").forEach((b) => b.addEventListener("click", () => renovar(b.dataset.r)));
      box.querySelectorAll("[data-d]").forEach((b) => b.addEventListener("click", () => destacarModal(b.dataset.d, "")));
    } catch (e) { box.innerHTML = `<div class="error">${M.esc(e.message)}</div>`; }
  }
  async function renovar(id) {
    const M = st();
    const d = await M.api("destacar_info", {});
    if (!d.ok) { toast(d.error); return; }
    abrirModal(`<h3>🔄 Renovar (1 mes): ${M.fmtCUP(d.publicar_precio_cup)} CUP</h3>` +
      `<div class="metodo"><h4>📱 Transfermóvil</h4>${M.esc(d.metodos.transfermovil || "")}</div>` +
      `<div class="metodo"><h4>💠 USDT</h4><code>${M.esc(d.metodos.usdt)}</code></div>` +
      `<label>Método</label><select id="rn_met"><option value="transfermovil">Transfermóvil</option><option value="usdt">USDT</option><option value="efectivo">Efectivo</option></select>` +
      `<label>Referencia</label><input type="text" id="rn_ref"><button class="btn bloque" id="rnGo">Enviar</button><div id="rnErr"></div>`);
    $("rnGo").addEventListener("click", async () => {
      const r = await M.api("producto_renovar", { id, metodo: $("rn_met").value, referencia: $("rn_ref").value });
      if (!r.ok) { $("rnErr").innerHTML = `<div class="error">${M.esc(r.error)}</div>`; return; }
      cerrarModal(); toast("✅ " + r.msg); mostrar("mios");
    });
  }
  async function destacarModal(id, titulo) {
    const M = st();
    const r = await M.api("destacar_info", {});
    if (!r.ok) { toast(r.error); return; }
    abrirModal(`<h3>⭐ Destacar: ${M.esc(titulo)}</h3><div class="alerta">Sale primero con ⭐ por <b>${r.dias} días</b>. Precio: <b>${M.fmtCUP(r.precio_cup)} CUP</b></div>` +
      `<label>Método</label><select id="d_met"><option value="transfermovil">Transfermóvil</option><option value="usdt">USDT</option><option value="efectivo">Efectivo</option></select>` +
      `<label>Referencia</label><input type="text" id="d_ref"><button class="btn bloque" id="dGo">Enviar</button><div id="dErr"></div>`);
    $("dGo").addEventListener("click", async () => {
      const rr = await M.api("destacar_solicitar", { producto_id: id, metodo: $("d_met").value, referencia: $("d_ref").value });
      if (!rr.ok) { $("dErr").innerHTML = `<div class="error">${M.esc(rr.error)}</div>`; return; }
      cerrarModal(); toast("✅ " + rr.msg);
    });
  }
  async function cargarPedidos() {
    const M = st();
    if (!S().user) { openAuth(); mostrar("inicio"); return; }
    const box = $("pedLista");
    try {
      const r = await M.api("pedidos_mios", {});
      if (!r.ok) throw new Error(r.error);
      if (!r.pedidos.length) { box.innerHTML = `<div class="vacio">No tienes pedidos todavía.</div>`; return; }
      box.innerHTML = r.pedidos.map((p) =>
        `<div class="metodo"><b>🧾 ${M.esc(p.id)}</b> · ${M.esc(p.fecha)} · ${M.esc(p.estado)}<br>` +
        p.items.map((it) => `• ${M.esc(it.titulo)} × ${it.cantidad}`).join("<br>") +
        `<br><b>Total: ${M.fmtCUP(p.total_cup)} CUP (≈ $${M.fmtUSD(p.total_usd)} USD)</b></div>`).join("");
    } catch (e) { box.innerHTML = `<div class="error">${M.esc(e.message)}</div>`; }
  }
  function adminTab(t, btn) {
    Array.prototype.forEach.call($("adminTabs").children, (b) => b.className = "");
    btn.className = "act";
    ["pend", "users", "biz", "pagos", "prods", "cats", "tasa", "ajustes"].forEach((x) => { $("adm-" + x).style.display = x === t ? "block" : "none"; });
    if (t === "pend") adminPendientes();
    if (t === "users") adminUsuarios();
    if (t === "biz") adminNegocios();
    if (t === "pagos") adminPagos();
    if (t === "prods") adminProds();
    if (t === "cats") adminCats();
    if (t === "tasa") adminTasa();
    if (t === "ajustes") adminAjustes();
  }
  async function cargarAdmin() {
    if (!S().user || S().user.rol !== "admin") { mostrar("inicio"); return; }
    adminPendientes();
  }
  /* ---------- pendientes de aprobación ---------- */
  async function adminPendientes() {
    const M = st(); const box = $("adm-pend");
    box.innerHTML = `<div class="vacio">⏳ Revisando pendientes…</div>`;
    let pagos = [], prods = [], offMsg = "";
    try {
      const r = await M.api("pagos_list", {});
      if (r.ok) pagos = (r.pagos || []).filter((p) => p.estado === "pendiente");
      else offMsg = r.error;
    } catch (e) { offMsg = "Sin conexión al servidor"; }
    try {
      const r = await M.api("productos_admin", {});
      if (r.ok) prods = (r.productos || []).filter((p) => p.estado === "pendiente");
    } catch (e) {}
    let h = `<h3>⏳ Por aprobar (${pagos.length + prods.length})</h3>`;
    if (offMsg && !pagos.length && !prods.length) h += `<div class="nota">${M.esc(offMsg)}. Los anuncios de negocios locales se publican al instante, sin aprobación.</div>`;
    if (pagos.length) {
      h += `<h4>💰 Pagos (al aprobar se publica el anuncio)</h4><table><tr><th>Fecha</th><th>Tipo</th><th>Anuncio</th><th>Usuario</th><th>Método</th><th>Monto</th><th></th></tr>` +
        pagos.map((p) => `<tr><td>${M.esc(p.fecha)}</td><td>${p.tipo === "publicar" ? "📢" : "⭐"}</td><td>${M.esc(p.titulo)}</td><td>${M.esc(p.usuario)}</td><td>${M.esc(p.metodo)} ${M.esc(p.referencia)}</td><td>${M.fmtCUP(p.monto_cup)} CUP</td>` +
          `<td style="white-space:nowrap"><button class="mini-btn ok" data-pok="${p.id}">✓ Aprobar</button> <button class="mini-btn no" data-pno="${p.id}">✕</button></td></tr>`).join("") + `</table>`;
    }
    if (prods.length) {
      h += `<h4>📦 Anuncios en espera</h4><table><tr><th>Anuncio</th><th>Precio</th><th>Vendedor</th><th></th></tr>` +
        prods.map((p) => `<tr><td>${M.esc(p.titulo)}</td><td>${M.precios(p).main}</td><td>${M.esc(p.vendedor || p.usuario || "—")}</td>` +
          `<td style="white-space:nowrap"><button class="mini-btn ok" data-aok="${p.id}">✓ Aprobar</button> <button class="mini-btn no" data-ano="${p.id}">✕ Rechazar</button></td></tr>`).join("") + `</table>`;
    }
    if (!pagos.length && !prods.length && !offMsg) h += `<div class="vacio">✅ Nada pendiente. Todo al día.</div>`;
    box.innerHTML = h;
    box.querySelectorAll("[data-pok]").forEach((b) => b.addEventListener("click", async () => { await M.api("pago_aprobar", { id: b.dataset.pok }); adminPendientes(); }));
    box.querySelectorAll("[data-pno]").forEach((b) => b.addEventListener("click", async () => { await M.api("pago_rechazar", { id: b.dataset.pno }); adminPendientes(); }));
    box.querySelectorAll("[data-aok]").forEach((b) => b.addEventListener("click", async () => {
      const r = await M.api("producto_aprobar", { id: b.dataset.aok });
      if (r.ok) { toast("✅ Anuncio aprobado"); adminPendientes(); }
      else toast("⚠️ " + (r.error || "el servidor no tiene aprobación directa; aprueba su pago"));
    }));
    box.querySelectorAll("[data-ano]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("¿Rechazar y eliminar este anuncio?")) return;
      await M.api("producto_delete", { id: b.dataset.ano });
      adminPendientes();
    }));
  }
  /* ---------- usuarios ---------- */
  function adminUsuarios() {
    const M = st(); const box = $("adm-users");
    const paint = (backend) => {
      const locales = M.Usuarios.all();
      let h = `<div style="display:flex;align-items:center;gap:8px"><h3 style="margin:0">👥 Usuarios (${(backend || []).length + locales.length})</h3><span style="flex:1"></span><button class="btn" id="uNew" style="margin:0">＋ Crear usuario</button></div>`;
      if (backend && backend.length) {
        h += `<h4>🌐 En el servidor (se gestionan en el backend)</h4><table><tr><th>Usuario</th><th>Nombre</th><th>Teléfono</th><th>Rol</th></tr>` +
          backend.map((u) => `<tr><td><b>${M.esc(u.username || u.usuario || "")}</b></td><td>${M.esc(u.nombre || "")}</td><td>${M.esc(u.telefono || "")}</td><td>${M.esc(u.rol || "usuario")}</td></tr>`).join("") + `</table>`;
      }
      h += `<h4>📱 En este dispositivo (crear, editar y eliminar aquí)</h4>` + (locales.length ?
        `<table><tr><th>Usuario</th><th>Nombre</th><th>Teléfono</th><th>Rol</th><th>Origen</th><th>Desde</th><th></th></tr>` +
        locales.map((u) => `<tr><td><b>${M.esc(u.username)}</b></td><td>${M.esc(u.nombre || "")}</td><td>${M.esc(u.telefono || "")}</td>` +
          `<td>${u.rol === "admin" ? "👑 admin" : "usuario"}</td><td>${M.esc(u.origen || "local")}</td><td>${M.esc(u.fecha || "")}</td>` +
          `<td style="white-space:nowrap"><button class="mini-btn" data-uedit="${M.esc(u.username)}">✎ Editar</button>` +
          (u.username === "admin" ? `` : ` <button class="mini-btn no" data-udel="${M.esc(u.username)}">🗑</button>`) + `</td></tr>`).join("") + `</table>`
        : `<div class="vacio">Aún no hay usuarios registrados aquí.</div>`);
      box.innerHTML = h;
      $("uNew").addEventListener("click", () => userForm(null));
      box.querySelectorAll("[data-uedit]").forEach((b) => b.addEventListener("click", () => userForm(b.dataset.uedit)));
      box.querySelectorAll("[data-udel]").forEach((b) => b.addEventListener("click", async () => {
        if (!confirm(`¿Eliminar al usuario "${b.dataset.udel}"?`)) return;
        M.Usuarios.remove(b.dataset.udel);
        if (S().user && S().user.username === b.dataset.udel) { S().token = null; S().user = null; M.guardarSesion(); pintarUser(); }
        adminUsuarios(); toast("Usuario eliminado");
      }));
    };
    paint(null); // local al instante, sin esperar al servidor
    M.api("usuarios_list", {}).then((r) => {
      if (r.ok && Array.isArray(r.usuarios) && r.usuarios.length && $("adm-users") === box) paint(r.usuarios);
    }).catch(() => {});
  }
  function userForm(username) {
    const M = st();
    const u = username ? M.Usuarios.get(username) : null;
    abrirModal(`<h3>👤 ${u ? "Editar usuario" : "Crear usuario"}</h3>` +
      (u
        ? `<div class="nota">Usuario: <b>${M.esc(u.username)}</b> (${M.esc(u.origen || "local")})</div>`
        : `<label>Usuario *</label><input type="text" id="fu_user" maxlength="30" placeholder="ej: juan_92">`) +
      `<label>Nombre</label><input type="text" id="fu_nom" maxlength="60" value="${M.esc(u ? u.nombre : "")}">` +
      `<label>Teléfono / WhatsApp</label><input type="tel" id="fu_tel" value="${M.esc(u ? u.telefono : "")}">` +
      `<label>Rol</label><select id="fu_rol"><option value="usuario"${u && u.rol !== "admin" ? " selected" : ""}>usuario</option><option value="admin"${u && u.rol === "admin" ? " selected" : ""}>👑 admin</option></select>` +
      `<label>${u ? "Nueva clave (vacío = no cambiar)" : "Clave *"}</label><input type="password" id="fu_pass" autocomplete="new-password">` +
      `<button class="btn bloque" id="fuGo">${u ? "Guardar" : "Crear"}</button><div id="fuErr"></div>`, true);
    $("fuGo").addEventListener("click", async () => {
      const btn = $("fuGo");
      btn.disabled = true; btn.textContent = "⏳ Guardando…";
      try {
        const un = u ? u.username : $("fu_user").value.trim().toLowerCase();
        if (!un) throw new Error("Escribe el usuario");
        const pass = $("fu_pass").value;
        if (!u && !pass) throw new Error("Ponle una clave");
        if (un === "admin" && !u) throw new Error("Ese nombre está reservado");
        await M.Usuarios.upsert({ username: un, nombre: $("fu_nom").value.trim(), telefono: $("fu_tel").value.trim(), rol: $("fu_rol").value, origen: (u && u.origen) || "local", ...(pass ? { password: pass } : {}) });
        cerrarModal(); adminUsuarios(); toast("✅ Usuario guardado");
      } catch (e) { $("fuErr").innerHTML = `<div class="error">${M.esc(e.message)}</div>`; btn.disabled = false; btn.textContent = u ? "Guardar" : "Crear"; }
    });
  }
  /* ---------- negocios (admin): cuotas, suspensión, CRUD ---------- */
  function adminNegocios() {
    const M = st(); const box = $("adm-biz");
    const list = M.Negocios.all();
    const mes = M.Negocios.mesKey();
    const susp = list.filter((b) => M.Negocios.suspendida(b)).length;
    let h = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><h3 style="margin:0">🏪 Negocios (${list.length})</h3>` +
      (susp ? `<span class="badge-dest">⛔ ${susp} suspendida${susp === 1 ? "" : "s"}</span>` : `<span class="nota">✅ Todas al día</span>`) +
      `<span style="flex:1"></span><span class="nota">Cuota: ${M.fmtCUP(M.Negocios.CUOTA_MENSUAL)} CUP/mes · se suspenden solas el día 1 si deben</span>` +
      `<button class="btn" id="bizNew" style="margin:0">＋ Crear negocio</button></div>`;
    h += list.length ? `<table><tr><th>Negocio</th><th>Dueño</th><th>Estado</th><th>Último pago</th><th>Productos</th><th>Afiliados</th><th></th></tr>` +
      list.map((b) => {
        const n = (b.items || []).length;
        const af = b.afiliados || {};
        const sus = M.Negocios.suspendida(b);
        const up = (b.cuota && b.cuota.ultimoPago) || "—";
        const debe = M.Negocios.debeCuota(b) ? `<br><span class="nota">debe ${mes}</span>` : "";
        return `<tr><td><b>🏪 ${M.esc(b.nombre)}</b>${M.Negocios.esDemo(b) ? `<br><span class="nota">demo (exenta)</span>` : ""}</td>` +
          `<td>${M.esc(b.createdBy || "demo")}${b.adminUser ? `<br><span class="nota">👤 ${M.esc(b.adminUser)}</span>` : ""}</td>` +
          `<td>${sus ? `⛔ Suspendida<br><span class="nota">${M.esc(M.Negocios.motivoSusp(b))}</span>` : "✅ Activa"}</td>` +
          `<td>${M.esc(up)}${debe}</td><td>${n}</td>` +
          `<td>${af.activo ? `✅ ${af.pct || 5}%` : "⏸"}</td>` +
          `<td style="white-space:nowrap"><button class="mini-btn" data-bver="${M.esc(b.id)}">Ver</button> <button class="mini-btn ok" data-bpanel="${M.esc(b.id)}">📊</button><br>` +
          `<button class="mini-btn ok" data-bcob="${M.esc(b.id)}">💰 Cobrar</button> ` +
          (b.suspendidaManual
            ? `<button class="mini-btn ok" data-bsus="${M.esc(b.id)}" data-on="0">✅ Reactivar</button>`
            : `<button class="mini-btn no" data-bsus="${M.esc(b.id)}" data-on="1">⛔</button>`) +
          ` <button class="mini-btn" data-bedit="${M.esc(b.id)}">✎</button> <button class="mini-btn no" data-bdel="${M.esc(b.id)}">🗑</button></td></tr>`;
      }).join("") + `</table>` : `<div class="vacio">Aún no hay negocios.</div>`;
    box.innerHTML = h;
    $("bizNew").addEventListener("click", () => openBizCreate(null));
    box.querySelectorAll("[data-bver]").forEach((b) => b.addEventListener("click", () => openNegocio(b.dataset.bver)));
    box.querySelectorAll("[data-bpanel]").forEach((b) => b.addEventListener("click", () => openTienda(b.dataset.bpanel)));
    box.querySelectorAll("[data-bedit]").forEach((b) => b.addEventListener("click", () => openBizCreate(b.dataset.bedit)));
    box.querySelectorAll("[data-bdel]").forEach((b) => b.addEventListener("click", () => {
      const biz = M.Negocios.get(b.dataset.bdel);
      if (!biz) return;
      if (!confirm(`¿Eliminar "${biz.nombre}" y su inventario?`)) return;
      M.Negocios.hide(biz.id);
      refrescarOfertas(); adminNegocios(); toast("Negocio eliminado");
    }));
    box.querySelectorAll("[data-bsus]").forEach((b) => b.addEventListener("click", () => {
      const on = b.dataset.on === "1";
      const biz = M.Negocios.get(b.dataset.bsus);
      let motivo = "";
      if (on) {
        motivo = prompt(`Motivo de la suspensión de "${biz ? biz.nombre : ""}" (ej: impago, reclamo):`, "impago") || "";
        if (motivo === null) return;
      }
      M.Negocios.setSuspendida(b.dataset.bsus, on, motivo);
      refrescarOfertas(); adminNegocios(); toast(on ? "⛔ Tienda suspendida" : "✅ Tienda reactivada");
    }));
    box.querySelectorAll("[data-bcob]").forEach((b) => b.addEventListener("click", () => cobrarCuota(b.dataset.bcob)));
  }
  // Registrar pago de mensualidad (reactiva al instante si estaba suspendida)
  function cobrarCuota(nid) {
    const M = st();
    const b = M.Negocios.get(nid);
    if (!b) return;
    const mes = M.Negocios.mesKey();
    const ya = b.cuota && b.cuota.meses && b.cuota.meses[mes];
    abrirModal(`<h3>💰 Cobrar mensualidad — ${M.esc(b.nombre)}</h3>` +
      (ya ? `<div class="alerta">${mes} ya está pagado (${M.esc(ya.fecha)}).</div>` : (M.Negocios.debeCuota(b) ? `<div class="alerta">Debe <b>${mes}</b>. Al cobrar se reactiva al instante.</div>` : "")) +
      `<label>Mes</label><input type="text" id="cq_mes" value="${mes}" maxlength="7" placeholder="AAAA-MM">` +
      `<label>Monto (CUP)</label><input type="number" id="cq_monto" min="1" value="${M.Negocios.CUOTA_MENSUAL}">` +
      `<label>Método</label><select id="cq_met"><option value="transfermovil">📱 Transfermóvil</option><option value="efectivo">🤝 Efectivo</option><option value="usdt">💠 USDT</option></select>` +
      `<button class="btn bloque" id="cqGo">Registrar pago</button><div id="cqErr"></div>`, true);
    $("cqGo").addEventListener("click", async () => {
      try {
        const mm = $("cq_mes").value.trim();
        if (!/^\d{4}-\d{2}$/.test(mm)) throw new Error("Mes inválido (AAAA-MM)");
        const monto = Number($("cq_monto").value);
        if (!(monto > 0)) throw new Error("Monto inválido");
        const hoy = new Date().toISOString().slice(0, 10);
        M.Negocios.setCuota(nid, mm, { fecha: hoy, monto, metodo: $("cq_met").value });
        cerrarModal(); refrescarOfertas(); adminNegocios();
        toast("✅ Cuota de " + mm + " registrada — tienda activa");
      } catch (e) { $("cqErr").innerHTML = `<div class="error">${M.esc(e.message)}</div>`; }
    });
  }
  async function adminPagos() {
    const M = st(); const box = $("adm-pagos");
    const r = await M.api("pagos_list", {});
    if (!r.ok) { box.innerHTML = `<div class="error">${M.esc(r.error)}</div>`; return; }
    const pend = r.pagos.filter((p) => p.estado === "pendiente");
    box.innerHTML = `<h3>Pendientes (${pend.length})</h3>` + (pend.length ?
      `<table><tr><th>Fecha</th><th>Tipo</th><th>Anuncio</th><th>Usuario</th><th>Método</th><th>Monto</th><th></th></tr>` +
      pend.map((p) => `<tr><td>${M.esc(p.fecha)}</td><td>${p.tipo === "publicar" ? "📢" : "⭐"}</td><td>${M.esc(p.titulo)}</td><td>${M.esc(p.usuario)}</td><td>${M.esc(p.metodo)} ${M.esc(p.referencia)}</td><td>${M.fmtCUP(p.monto_cup)} CUP</td>` +
        `<td><button class="mini-btn ok" data-ok="${p.id}">✓</button><button class="mini-btn no" data-no="${p.id}">✕</button></td></tr>`).join("") + `</table>`
      : `<div class="vacio">Sin pagos pendientes.</div>`);
    box.querySelectorAll("[data-ok]").forEach((b) => b.addEventListener("click", async () => { await M.api("pago_aprobar", { id: b.dataset.ok }); adminPagos(); }));
    box.querySelectorAll("[data-no]").forEach((b) => b.addEventListener("click", async () => { await M.api("pago_rechazar", { id: b.dataset.no }); adminPagos(); }));
  }
  async function adminProds() {
    const M = st(); const box = $("adm-prods");
    box.innerHTML = `<div class="vacio">⏳ Cargando anuncios…</div>`;
    let list = null, err = "";
    try {
      const r = await M.api("productos_admin", {});
      if (r.ok) list = r.productos;
      else err = r.error;
    } catch (e) { err = "Sin conexión al servidor"; }
    if (!list) { box.innerHTML = `<div class="error">${M.esc(err)}</div><div class="nota">Los anuncios de negocios locales se gestionan en la pestaña 🏪 Negocios.</div>`; return; }
    box.innerHTML = `<h3>📦 Anuncios (${list.length})</h3><table><tr><th>Título</th><th>Precio</th><th>Estado</th><th>Vence</th><th></th></tr>` +
      list.slice(0, 100).map((p) => `<tr><td>${p.destacado ? "⭐ " : ""}${M.esc(p.titulo)}</td><td>${M.precios(p).main}</td>` +
        `<td>${p.estado === "pendiente" ? "⏳ pendiente" : p.activo ? "✅ publicado" : "⌛ vencido"}</td><td>${M.esc(p.fecha_exp || "—")}</td>` +
        `<td style="white-space:nowrap">` +
        (p.estado === "pendiente" ? `<button class="mini-btn ok" data-pok="${p.id}">✓ Aprobar</button> ` : "") +
        `<button class="mini-btn no" data-x="${p.id}">🗑</button></td></tr>`).join("") + `</table>`;
    box.querySelectorAll("[data-pok]").forEach((b) => b.addEventListener("click", async () => {
      const r = await M.api("producto_aprobar", { id: b.dataset.pok });
      if (r.ok) { toast("✅ Anuncio aprobado"); adminProds(); }
      else toast("⚠️ " + (r.error || "el servidor no tiene aprobación directa; aprueba su pago"));
    }));
    box.querySelectorAll("[data-x]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("¿Eliminar?")) return;
      await M.api("producto_delete", { id: b.dataset.x }); adminProds();
    }));
  }
  async function adminCats() {
    const M = st(); const box = $("adm-cats");
    box.innerHTML = cats.map((c) => `<div class="metodo">🏷️ ${M.esc(c)}<button class="mini-btn no" style="float:right" data-c="${M.esc(c)}">Eliminar</button></div>`).join("") +
      `<label>Nueva categoría</label><input type="text" id="nc_cat"><button class="btn" id="ncGo">Agregar</button>`;
    box.querySelectorAll("[data-c]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm(`¿Eliminar "${b.dataset.c}"?`)) return;
      const r = await M.api("categoria_del", { nombre: b.dataset.c });
      if (r.ok) { await recargar(); adminCats(); } else toast(r.error);
    }));
    $("ncGo").addEventListener("click", async () => {
      const r = await M.api("categoria_add", { nombre: $("nc_cat").value });
      if (r.ok) { await recargar(); adminCats(); } else toast(r.error);
    });
  }
  async function adminTasa() {
    const M = st(); const box = $("adm-tasa");
    box.innerHTML = `<div class="metodo"><b>Tasa:</b> ${M.S.tasa.tasa} CUP/USD <span class="nota">${M.esc(M.S.tasa.fuente)} ${M.esc(M.S.tasa.fecha)}</span></div>` +
      `<label>Nueva tasa</label><input type="number" id="nt_tasa" value="${M.S.tasa.tasa}"><button class="btn" id="ntGo">Guardar</button> <button class="btn gris" id="ntAuto">🔄 Automática</button><div id="tErr"></div>`;
    $("ntGo").addEventListener("click", async () => {
      const r = await M.api("tasa_set", { tasa: $("nt_tasa").value });
      if (!r.ok) { $("tErr").innerHTML = `<div class="error">${M.esc(r.error)}</div>`; return; }
      await cargarTasa(); adminTasa();
    });
    $("ntAuto").addEventListener("click", async () => {
      const r = await M.api("tasa_auto", {});
      await cargarTasa(); adminTasa(); toast(r.auto ? "Tasa auto: " + r.tasa : "No se pudo contactar El Toque");
    });
  }
  async function adminAjustes() {
    const M = st(); const box = $("adm-ajustes");
    const r = await M.api("config_get", {});
    if (!r.ok) { box.innerHTML = `<div class="error">${M.esc(r.error)}</div>`; return; }
    const campos = [["publicar_precio_cup", "Precio anuncio (CUP)"], ["destacado_precio_cup", "Precio destacado (CUP)"], ["destacado_dias", "Días destacado"], ["pago_transfermovil_numero", "Transfermóvil"], ["pago_usdt_direccion", "USDT (TRC20)"], ["pago_efectivo_nota", "Efectivo nota"]];
    box.innerHTML = campos.map((f) => `<label>${f[1]}</label><input type="text" id="cfg_${f[0]}" value="${M.esc(r.config[f[0]])}">`).join("") + `<button class="btn" id="cfgGo">Guardar</button><div id="aErr"></div>`;
    $("cfgGo").addEventListener("click", async () => {
      for (const f of campos) {
        const rr = await M.api("config_set", { clave: f[0], valor: $("cfg_" + f[0]).value });
        if (!rr.ok) { $("aErr").innerHTML = `<div class="error">${M.esc(rr.error)}</div>`; return; }
      }
      $("aErr").innerHTML = `<div class="okmsg">✅ Guardado.</div>`;
    });
  }

  /* ================= NEGOCIOS ================= */
  function bizPayBadges(b) {
    const M = st();
    const p = b.pagos || {};
    return `<div class="pay-badges">` +
      (p.transfer ? `<span class="ok">📱 Transferencia</span>` : `<span class="no">📱 Sin transferencia</span>`) +
      (p.efectivoCUP ? `<span class="cash">💵 CUP</span>` : ``) +
      (p.efectivoUSD ? `<span class="cash">💵 USD</span>` : ``) +
      (p.cupAlCambio ? `<span>💱 CUP al cambio</span>` : ``) +
      (b.delivery && b.delivery.activo ? `<span class="ok">🏠 Domicilio</span>` : ``) + `</div>`;
  }
  function cargarNegocios() {
    const M = st();
    const box = $("negList");
    // Las suspendidas por impago no existen en la página (solo las ve el admin)
    const list = M.Negocios.all().filter((b) => !M.Negocios.suspendida(b));
    if (!list.length) { box.innerHTML = `<div class="vacio">Aún no hay negocios. ¡Crea el primero!</div>`; return; }
    box.innerHTML = list.map((b) => {
      const n = (b.items || []).length;
      return `<div class="biz-card" data-biz="${M.esc(b.id)}" tabindex="0" role="button">` +
        `<div class="cover">${b.logo ? `<img loading="lazy" decoding="async" src="${M.esc(b.logo)}" alt="" onerror="this.remove()">` : ""}</div>` +
        `<img class="logo" src="${M.esc(b.logo || "src/assets/banner1.jpg")}" alt="" onerror="this.onerror=null;this.src='src/assets/banner1.jpg'">` +
        `<div class="info"><b>🏪 ${M.esc(b.nombre)}</b><div class="nota">📍 ${M.esc(b.municipio || "—")} · ${n} producto${n === 1 ? "" : "s"}</div>` +
        bizPayBadges(b) + `</div></div>`;
    }).join("");
    box.querySelectorAll("[data-biz]").forEach((el) => {
      el.addEventListener("click", () => openNegocio(el.dataset.biz));
      el.addEventListener("keydown", (e) => { if (e.key === "Enter") openNegocio(el.dataset.biz); });
    });
  }
  function openNegocio(id) { bizActual = id; mostrar("negocio"); }
  function pintarQR(elId, texto) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = "";
    try {
      if (window.QRCode) new QRCode(el, { text: String(texto), width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M });
      else el.textContent = texto;
    } catch (e) { el.textContent = texto; }
  }
  function pintarNegocio() {
    const M = st();
    const box = $("negPerfil");
    const b = M.Negocios.get(bizActual);
    if (!b) { box.innerHTML = `<div class="vacio">Negocio no encontrado.</div>`; return; }
    if (M.Negocios.suspendida(b) && !canManageBiz(b)) {
      box.innerHTML = `<button class="mini-btn" id="bizBack">← Negocios</button>` +
        `<div class="vacio" style="margin-top:20px">⛔ Esta tienda está suspendida temporalmente.</div>`;
      $("bizBack").addEventListener("click", () => mostrar("negocios"));
      return;
    }
    const own = canManageBiz(b);
    const suspBanner = M.Negocios.suspendida(b)
      ? `<div class="alerta">⛔ <b>Tienda suspendida:</b> ${M.esc(M.Negocios.motivoSusp(b))}. Tus productos están ocultos. Ponte al día en tu 📊 Panel.</div>` : "";
    const items = b.items || [];
    let h = `<button class="mini-btn" id="bizBack">← Negocios</button>` + suspBanner +
      `<div class="biz-perfil-head" style="margin-top:10px">` +
      `<img class="logo" src="${M.esc(b.logo || "src/assets/banner1.jpg")}" alt="" onerror="this.onerror=null;this.src='src/assets/banner1.jpg'">` +
      `<div style="flex:1;min-width:200px"><h2 style="margin:0">🏪 ${M.esc(b.nombre)}</h2>` +
      `<div class="nota">📍 ${M.esc(b.municipio || "—")}${b.direccion ? " · " + M.esc(b.direccion) : ""}${b.telefono ? " · 📞 " + M.esc(b.telefono) : ""}</div>` +
      (b.desc ? `<p style="margin:6px 0 0">${M.esc(b.desc)}</p>` : "") + bizPayBadges(b) + `</div>`;
    const wa = b.telefono ? M.waLink(b.telefono) : "";
    if (wa) h += `<a class="wa" style="margin:0" target="_blank" rel="noopener" href="${wa}">💬 WhatsApp</a>`;
    h += `</div>`;
    // QR de transferencia
    if (b.pagos && b.pagos.transfer) {
      h += `<div class="flex flex-wrap gap-2" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px"><div class="qr-box"><b>📱 Paga por transferencia</b>` +
        (b.qr ? `<img src="${M.esc(b.qr)}" alt="QR del negocio">` : `<div id="bizQR" style="display:flex;justify-content:center"></div>`) +
        (b.transferCuenta ? `<div class="nota">Cuenta: <code>${M.esc(b.transferCuenta)}</code></div>` : "") + `</div>`;
      if (b.delivery && b.delivery.activo) {
        h += `<div class="delivery-card" style="flex:1;min-width:220px"><b>🏠 Domicilio disponible</b><div class="nota">${M.esc(b.delivery.nota || "")} Base ${M.fmtCUP(b.delivery.base)} CUP + ${M.fmtCUP(b.delivery.porKm)} CUP/km.</div>` +
          `<label>Tu distancia (km)</label><input type="number" id="bizKm" value="5" min="1" max="120"><button class="btn" style="margin-top:8px" id="bizQuote">Calcular</button><div id="bizQuoteOut" style="margin-top:8px;font-weight:700"></div></div>`;
      }
      h += `</div>`;
    } else if (b.delivery && b.delivery.activo) {
      h += `<div class="delivery-card"><b>🏠 Domicilio disponible (pago en efectivo al recibir)</b><div class="nota">${M.esc(b.delivery.nota || "")} Base ${M.fmtCUP(b.delivery.base)} CUP + ${M.fmtCUP(b.delivery.porKm)} CUP/km.</div>` +
        `<label>Tu distancia (km)</label><input type="number" id="bizKm" value="5" min="1" max="120" style="max-width:200px"><button class="btn" style="margin-top:8px" id="bizQuote">Calcular</button><div id="bizQuoteOut" style="margin-top:8px;font-weight:700"></div></div>`;
    }
    // Programa de afiliados (solo el dueño lo ve y configura)
    if (own) {
      const af = b.afiliados || { activo: true, pct: 5 };
      const stats = M.Afiliados.bizStats(b);
      h += `<div class="metodo"><h4>🤝 Programa de afiliados (colaboradores)</h4>` +
        `<div class="nota">Tus colaboradores promocionan tus productos <b>sin duplicar anuncios ni cambiar precios</b>: comparten su enlace con imagen promo. Si venden en 30 días, les pagas el % acordado.</div>` +
        `<div class="stat-row"><span>👁 ${stats.clicks} clics</span><span>🛒 ${stats.sales.length} ventas por enlace</span><span>💰 ${M.fmtCUP(Math.round(stats.owed))} CUP generados</span></div>` +
        `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end"><div><label style="font-weight:400"><input type="checkbox" id="afAct" ${af.activo ? "checked" : ""}> Programa activo</label></div>` +
        `<div><label>Comisión % por venta</label><input type="number" id="afPct" min="1" max="50" value="${af.pct || 5}" style="max-width:100px"></div>` +
        `<button class="mini-btn ok" id="afSave">Guardar</button></div>` +
        (stats.sales.length ? `<div style="margin-top:8px;font-size:.85rem">` + stats.sales.slice(-5).reverse().map((s) =>
          `• ${M.esc(s.titulo)} → <b>@${M.esc(s.by)}</b> = ${M.fmtCUP(Math.round(s.cup * s.pct / 100))} CUP (${s.pct}%)`).join("<br>") + `</div>`
          : `<div class="nota">Aún no hay ventas por enlace. Comparte tu tienda para atraer colaboradores.</div>`) +
        `</div>`;
    }
    // Inventario
    h += `<div class="flex flex-wrap items-center gap-2" style="display:flex;align-items:center;gap:8px;margin:16px 0 10px"><h2 class="sec" style="margin:0">📦 Inventario (${items.length})</h2><span style="flex:1"></span>` +
      (own ? `<button class="btn" style="margin:0" id="bizAddItem">＋ Agregar producto</button> <button class="mini-btn" id="bizEdit">✎ Editar negocio</button> <button class="mini-btn" id="bizPanel">📊 Panel</button> <button class="mini-btn no" id="bizDel">🗑</button>` : "") + `</div>`;
    h += items.length ? `<div class="grid">` + items.map((it) => {
      const full = Object.assign({}, it, { negocioId: b.id, negocioNombre: b.nombre, vendedor: b.nombre, telefono: it.telefono || b.telefono, municipio: it.municipio || b.municipio, pago: b.pagos.transfer ? "transfer" : "efectivo", pagos: b.pagos, delivery: b.delivery });
      return cardHTML(full) +
        (own ? `<div style="display:flex;gap:6px;margin:-6px 0 8px"><button class="mini-btn" data-eitem="${M.esc(it.id)}">✎</button><button class="mini-btn no" data-ditem="${M.esc(it.id)}">🗑</button></div>` : "");
    }).join("") + `</div>` : `<div class="vacio">Este negocio aún no publica productos.</div>`;
    box.innerHTML = h;
    bindCards();
    $("bizBack").addEventListener("click", () => mostrar("negocios"));
    if (!b.qr && b.pagos && b.pagos.transfer && b.transferCuenta) pintarQR("bizQR", b.transferCuenta);
    const qBtn = $("bizQuote");
    if (qBtn) qBtn.addEventListener("click", () => {
      const km = Number($("bizKm").value) || 5;
      const cup = (Number(b.delivery.base) || 0) + km * (Number(b.delivery.porKm) || 0);
      $("bizQuoteOut").textContent = `🏠 ${km} km = ${M.fmtCUP(cup)} CUP (≈ $${M.fmtUSD(cup / M.S.tasa.tasa)} USD)`;
    });
    const addB = $("bizAddItem");
    if (addB) addB.addEventListener("click", () => openBizItem(b.id, null));
    box.querySelectorAll("[data-eitem]").forEach((x) => x.addEventListener("click", (e) => { e.stopPropagation(); openBizItem(b.id, x.dataset.eitem); }));
    box.querySelectorAll("[data-ditem]").forEach((x) => x.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!confirm("¿Eliminar este producto?")) return;
      M.Negocios.removeItem(b.id, x.dataset.ditem);
      refrescarOfertas(); pintarNegocio(); toast("Producto eliminado");
    }));
    const eb = $("bizEdit");
    if (eb) eb.addEventListener("click", () => openBizCreate(b.id));
    const pb = $("bizPanel");
    if (pb) pb.addEventListener("click", () => openTienda(b.id));
    const db = $("bizDel");
    if (db) db.addEventListener("click", () => {
      if (!confirm(`¿Eliminar "${b.nombre}" y su inventario?`)) return;
      M.Negocios.hide(b.id); refrescarOfertas(); mostrar("negocios");
    });
    const afS = $("afSave");
    if (afS) afS.addEventListener("click", () => {
      const pct = Math.min(50, Math.max(1, Number($("afPct").value) || 5));
      M.Negocios.update(b.id, { afiliados: { activo: $("afAct").checked, pct } });
      refrescarOfertas(); pintarNegocio(); toast("✅ Programa actualizado");
    });
  }
  function vistaPreviaUp(inputId, nomId, prevId, textoVacio) {
    const inp = $(inputId), nom = $(nomId), prev = $(prevId);
    if (!inp) return;
    const f = inp.files && inp.files[0];
    const actual = inp.dataset.actual || "";
    if (!f) {
      if (nom) nom.textContent = actual ? "✅ Foto guardada" : textoVacio;
      if (prev) prev.innerHTML = actual ? `<img src="${actual}" alt="Foto actual">` : "";
      return;
    }
    if (nom) nom.textContent = "📎 " + (f.name || "foto elegida");
    if (prev) {
      const url = URL.createObjectURL(f);
      prev.innerHTML = `<img src="${url}" alt="Vista previa"><button type="button" class="mini-btn" id="${inputId}_q">✕ Quitar</button>`;
      const q = $(inputId + "_q");
      if (q) q.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); try { URL.revokeObjectURL(url); } catch (_) {} inp.value = ""; vistaPreviaUp(inputId, nomId, prevId, textoVacio); });
    }
  }
  async function fileToDataURL(file) {
    const c = await comprimirImagen(file);
    return "data:" + c.tipo + ";base64," + c.datos;
  }
  function openBizCreate(editId) {
    const M = st();
    if (!S().user) { openAuth("Entra o crea tu cuenta para registrar tu negocio."); return; }
    const b = editId ? M.Negocios.get(editId) : null;
    if (editId && !b) { toast("Negocio no encontrado"); return; }
    if (editId && S().user.rol === "admin") M.Negocios.ensureLocal(editId);
    if (editId && S().user.rol === "tienda") M.Negocios.ensureLocal(editId);
    if (editId && !canManageBiz(b)) { toast("No puedes editar este negocio"); return; }
    const p = (b && b.pagos) || {};
    const d = (b && b.delivery) || {};
    abrirModal(`<h3>🏪 ${b ? "Editar negocio" : "Crear mi negocio"}</h3>` +
      `<div class="alerta">Tu perfil muestra inventario, precios, formas de pago${" "}y tu QR de transferencia. Los productos aparecen en la búsqueda general.</div>` +
      `<label>Nombre del negocio *</label><input type="text" id="bz_nom" maxlength="60" value="${M.esc(b ? b.nombre : "")}">` +
      `<label>Descripción</label><textarea id="bz_desc" maxlength="500">${M.esc(b ? b.desc : "")}</textarea>` +
      `<div style="display:flex;gap:8px"><div style="flex:1"><label>Teléfono / WhatsApp *</label><input type="tel" id="bz_tel" value="${M.esc(b ? b.telefono : (S().user.telefono || ""))}"></div>` +
      `<div style="flex:1"><label>Municipio</label><input type="text" id="bz_mun" value="${M.esc(b ? b.municipio : "")}"></div></div>` +
      `<label>Dirección</label><input type="text" id="bz_dir" maxlength="120" value="${M.esc(b ? b.direccion : "")}">` +
      `<label>Tipos de pago que aceptas</label>` +
      `<div class="radiofila" style="flex-wrap:wrap"><label><input type="checkbox" id="bz_transfer" ${p.transfer ? "checked" : ""}> 📱 Transferencia</label>` +
      `<label><input type="checkbox" id="bz_cup" ${p.efectivoCUP ? "checked" : ""}> 💵 Efectivo CUP</label>` +
      `<label><input type="checkbox" id="bz_usd" ${p.efectivoUSD ? "checked" : ""}> 💵 Efectivo USD</label>` +
      `<label><input type="checkbox" id="bz_cambio" ${p.cupAlCambio ? "checked" : ""}> 💱 CUP al cambio USD</label></div>` +
      `<label>Cuenta de transferencia (para generar tu QR)</label><input type="text" id="bz_cuenta" placeholder="Ej: 9225 1234 5678" value="${M.esc(b ? b.transferCuenta : "")}">` +
      `<label>Foto del negocio / logo</label>` +
      `<button type="button" class="upcard" id="bz_logo_btn"><span class="up-ico">📷</span><span class="up-txt"><b>Toca para elegir el logo</b><small>Galería o cámara · se verá en tu perfil</small></span><span class="up-file" id="bz_logo_nom">Sin foto</span></button>` +
      `<input type="file" id="bz_logo" class="upfile" accept="image/*" tabindex="-1"><div class="upprev" id="bz_logo_prev"></div>` +
      `<label>Tu QR de transferencia (foto) — opcional si ya tienes uno</label>` +
      `<button type="button" class="upcard" id="bz_qr_btn"><span class="up-ico">📱</span><span class="up-txt"><b>Toca para subir tu QR</b><small>Foto de tu QR · si no tienes, lo creamos con tu cuenta</small></span><span class="up-file" id="bz_qr_nom">Sin foto</span></button>` +
      `<input type="file" id="bz_qr" class="upfile" accept="image/*" tabindex="-1"><div class="upprev" id="bz_qr_prev"></div>` +
      `<label style="font-weight:700"><input type="checkbox" id="bz_del" ${d.activo ? "checked" : ""}> 🏠 Ofrezco domicilio (precio según distancia)</label>` +
      `<div style="display:flex;gap:8px"><div style="flex:1"><label>Base (CUP)</label><input type="number" id="bz_base" min="0" value="${d.base || 100}"></div>` +
      `<div style="flex:1"><label>CUP por km</label><input type="number" id="bz_porkm" min="0" value="${d.porKm || 20}"></div></div>` +
      `<label>Nota de entrega</label><input type="text" id="bz_nota" maxlength="140" value="${M.esc(d.nota || "")}" placeholder="Ej: Entrega en el día en la zona">` +
      `<button class="btn bloque" id="bzGo">Guardar negocio</button><div id="bzErr"></div>`, true);
    $("bz_logo_btn").addEventListener("click", () => $("bz_logo").click());
    $("bz_qr_btn").addEventListener("click", () => $("bz_qr").click());
    if (b && b.logo && b.logo !== "src/assets/banner1.jpg") { try { $("bz_logo").dataset.actual = b.logo; } catch (_) {} }
    if (b && b.qr) { try { $("bz_qr").dataset.actual = b.qr; } catch (_) {} }
    vistaPreviaUp("bz_logo", "bz_logo_nom", "bz_logo_prev", "Sin foto — puedes guardar sin foto");
    vistaPreviaUp("bz_qr", "bz_qr_nom", "bz_qr_prev", "Sin foto — lo generamos con tu cuenta");
    $("bz_logo").addEventListener("change", () => vistaPreviaUp("bz_logo", "bz_logo_nom", "bz_logo_prev", "Sin foto — puedes guardar sin foto"));
    $("bz_qr").addEventListener("change", () => vistaPreviaUp("bz_qr", "bz_qr_nom", "bz_qr_prev", "Sin foto — lo generamos con tu cuenta"));
    $("bzGo").addEventListener("click", async () => {
      try {
        const nom = $("bz_nom").value.trim();
        if (nom.length < 2) throw new Error("Ponle nombre a tu negocio.");
        const tel = $("bz_tel").value.trim();
        if (!tel) throw new Error("El teléfono es obligatorio.");
        let logo = b ? b.logo : "src/assets/banner1.jpg";
        let qr = b ? b.qr : null;
        const lf = $("bz_logo").files[0];
        if (lf) logo = await fileToDataURL(lf);
        const qf = $("bz_qr").files[0];
        if (qf) qr = await fileToDataURL(qf);
        const data = {
          nombre: nom, desc: $("bz_desc").value.trim(), telefono: tel,
          municipio: $("bz_mun").value.trim(), direccion: $("bz_dir").value.trim(),
          pagos: { transfer: $("bz_transfer").checked, efectivoCUP: $("bz_cup").checked, efectivoUSD: $("bz_usd").checked, cupAlCambio: $("bz_cambio").checked },
          transferCuenta: $("bz_cuenta").value.trim(), logo, qr,
          delivery: { activo: $("bz_del").checked, base: Number($("bz_base").value) || 0, porKm: Number($("bz_porkm").value) || 0, nota: $("bz_nota").value.trim() },
        };
        if (!data.pagos.transfer && !data.pagos.efectivoCUP && !data.pagos.efectivoUSD) throw new Error("Elige al menos una forma de pago.");
        if (data.pagos.transfer && !data.transferCuenta && !data.qr) throw new Error("Si aceptas transferencia, pon tu cuenta o sube tu QR.");
        if (b) M.Negocios.update(b.id, data);
        else { const nb = M.Negocios.create(data); bizActual = nb.id; }
        cerrarModal(); refrescarOfertas();
        if (bizReturnTo === "tienda") { bizReturnTo = null; mostrar("tienda"); }
        else mostrar("negocio");
        toast("✅ Negocio guardado");
      } catch (e) { $("bzErr").innerHTML = `<div class="error">${M.esc(e.message)}</div>`; }
    });
  }
  function openBizItem(nid, iid) {
    const M = st();
    if (S().user && (S().user.rol === "admin" || S().user.rol === "tienda")) M.Negocios.ensureLocal(nid);
    const b = M.Negocios.get(nid);
    if (!b) return;
    if (!canManageBiz(b)) { toast("Solo el dueño puede editar este inventario"); return; }
    const it = iid ? (b.items || []).find((x) => x.id === iid) : null;
    const opts = cats.map((c) => `<option${it && it.categoria === c ? " selected" : ""}>${M.esc(c)}</option>`).join("");
    abrirModal(`<h3>📦 ${it ? "Editar producto" : "Agregar producto"} — ${M.esc(b.nombre)}</h3>` +
      `<label>Producto *</label><input type="text" id="bi_tit" maxlength="80" value="${M.esc(it ? it.titulo : "")}">` +
      `<label>Categoría</label><select id="bi_cat">${opts}</select>` +
      `<div style="display:flex;gap:8px"><div style="flex:1"><label>Precio *</label><input type="number" id="bi_pre" min="1" step="any" value="${it ? it.precio : ""}"></div>` +
      `<div><label>Moneda</label><div class="radiofila"><label><input type="radio" name="bi_mon" value="CUP" ${(it ? it.moneda : "CUP") === "CUP" ? "checked" : ""}> CUP</label><label><input type="radio" name="bi_mon" value="USD" ${(it && it.moneda === "USD") ? "checked" : ""}> USD</label></div></div>` +
      `<div style="flex:1"><label>Cantidad</label><input type="number" id="bi_stock" min="0" value="${it ? it.stock : 10}"></div></div>` +
      `<label>Descripción</label><textarea id="bi_desc" maxlength="500">${M.esc(it ? it.descripcion : "")}</textarea>` +
      `<label>Foto del producto</label>` +
      `<button type="button" class="upcard" id="bi_img_btn"><span class="up-ico">📷</span><span class="up-txt"><b>Toca para elegir la foto</b><small>Galería o cámara</small></span><span class="up-file" id="bi_img_nom">Sin foto</span></button>` +
      `<input type="file" id="bi_img" class="upfile" accept="image/*" tabindex="-1"><div class="upprev" id="bi_img_prev"></div>` +
      `<div class="nota">Hereda los pagos y domicilio del negocio: ${M.esc([b.pagos.transfer && "transferencia", b.pagos.efectivoCUP && "CUP", b.pagos.efectivoUSD && "USD"].filter(Boolean).join(", "))}.</div>` +
      `<button class="btn bloque" id="biGo">Guardar</button><div id="biErr"></div>`);
    $("bi_img_btn").addEventListener("click", () => $("bi_img").click());
    if (it && it.mini) { try { $("bi_img").dataset.actual = it.mini; } catch (_) {} }
    vistaPreviaUp("bi_img", "bi_img_nom", "bi_img_prev", "Sin foto");
    $("bi_img").addEventListener("change", () => vistaPreviaUp("bi_img", "bi_img_nom", "bi_img_prev", "Sin foto"));
    $("biGo").addEventListener("click", async () => {
      try {
        const tit = $("bi_tit").value.trim();
        if (tit.length < 2) throw new Error("Escribe el producto.");
        const pre = Number($("bi_pre").value);
        if (!(pre > 0)) throw new Error("Precio inválido.");
        let mini = it ? it.mini : null, imagenes = it ? it.imagenes : [];
        const f = $("bi_img").files[0];
        if (f) { const u = await fileToDataURL(f); mini = u; imagenes = [u]; }
        const data = { titulo: tit, categoria: $("bi_cat").value, precio: pre, moneda: document.querySelector('input[name=bi_mon]:checked').value, stock: Math.max(0, Number($("bi_stock").value) || 0), descripcion: $("bi_desc").value.trim(), mini, imagenes, municipio: b.municipio };
        if (iid) M.Negocios.updateItem(nid, iid, data);
        else M.Negocios.addItem(nid, data);
        cerrarModal(); refrescarOfertas();
        if ($("v-tienda").className.includes("act") && tiendaActual === nid) cargarTienda();
        else { bizActual = nid; pintarNegocio(); }
        toast("✅ Inventario actualizado");
      } catch (e) { $("biErr").innerHTML = `<div class="error">${M.esc(e.message)}</div>`; }
    });
  }

  /* ================= TIENDA: panel del administrador del negocio ================= */
  // Aquí la tienda ve qué vendieron los colaboradores por otras redes
  // (WhatsApp/Facebook/Instagram), cuánto debe pagarles, y gestiona todo:
  // inventario, perfil, pagos/QR, domicilio y programa de afiliados.
  function cargarTienda() {
    const M = st();
    const box = $("tiendaPanel");
    const u = S().user;
    if (u && u.rol === "tienda") { const tid = tiendaId(); if (tid) tiendaActual = tid; else if (u.negocioId) tiendaActual = u.negocioId; }
    const b = tiendaActual && M.Negocios.get(tiendaActual);
    if (!b) { box.innerHTML = `<div class="vacio">Tienda no encontrada.</div>`; return; }
    const ok = u && (u.rol === "admin" || (b.createdBy && b.createdBy === u.username) || (u.rol === "tienda" && (u.negocioId === b.id || tiendaId() === b.id)));
    if (!ok) { box.innerHTML = `<div class="error">Solo el administrador de esta tienda.</div>`; return; }
    // ⛔ Suspendida por impago: cartel que no deja hacer nada (solo el admin global ve el panel)
    if (M.Negocios.suspendida(b) && u.rol !== "admin") {
      box.innerHTML = `<div class="metodo" style="text-align:center;padding:32px 20px;max-width:560px;margin:20px auto">` +
        `<div style="font-size:3rem">⛔</div><h2 style="margin:8px 0">Tienda suspendida</h2>` +
        `<p><b>${M.esc(M.Negocios.motivoSusp(b))}</b></p>` +
        `<div class="alerta">Tus productos están ocultos en la página, como si la tienda no existiera. Para seguir utilizando los servicios debes ponerte al día con la mensualidad.</div>` +
        `<div class="nota">Cuota mensual: <b>${M.fmtCUP(M.Negocios.CUOTA_MENSUAL)} CUP</b> · Contacta al administrador general para pagar y reactivar tu tienda.</div>` +
        `<button class="btn gris" id="tSalir">Salir</button></div>`;
      $("tSalir").addEventListener("click", () => { S().token = null; S.user = null; M.guardarSesion(); pintarUser(); mostrar("inicio"); });
      return;
    }
    const suspWarn = (M.Negocios.suspendida(b) && u.rol === "admin")
      ? `<div class="alerta">⛔ Suspendida: ${M.esc(M.Negocios.motivoSusp(b))}. Cobra la cuota en 🏪 Negocios.</div>` : "";
    const items = b.items || [];
    const af = M.Afiliados.affilStats(b);
    const paid = M.Afiliados.paidFor(b.id);
    const ventas = M.Afiliados.salesForBiz(b.id).slice().reverse();
    const totVentas = ventas.reduce((a, x) => a + (Number(x.cup) || 0), 0);
    const totOwed = af.reduce((a, x) => a + x.owed, 0);
    const totPaid = Object.values(paid).reduce((a, x) => a + (Number(x) || 0), 0);
    const totClicks = af.reduce((a, x) => a + x.clicks, 0);
    const pctCfg = (b.afiliados && b.afiliados.pct) || 5;
    const activoCfg = !(b.afiliados && b.afiliados.activo === false);
    const canAccess = u.rol === "admin" || (b.createdBy && b.createdBy === u.username);
    const fmtF = (ts) => { try { return new Date(ts).toISOString().slice(0, 10); } catch (e) { return ""; } };

    let h = `<button class="mini-btn" id="tBack">← ${u.rol === "admin" ? "Panel admin" : "Tiendas"}</button>` + suspWarn +
      `<div class="biz-perfil-head" style="margin-top:10px">` +
      `<img class="logo" src="${M.esc(b.logo || "src/assets/banner1.jpg")}" alt="" onerror="this.onerror=null;this.src='src/assets/banner1.jpg'">` +
      `<div style="flex:1;min-width:200px"><h2 style="margin:0">🏪 ${M.esc(b.nombre)}</h2>` +
      `<div class="nota">Panel de la tienda · logueado como <b>${M.esc(u.username)}</b></div>` + bizPayBadges(b) + `</div>` +
      `<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="mini-btn" id="tVer">👁 Pública</button> <button class="mini-btn" id="tEdit">✎ Perfil</button></div></div>`;

    h += `<div class="stat-row" style="font-size:1rem;margin:12px 0"><span>👁 ${totClicks} clics</span><span>🛒 ${ventas.length} ventas</span>` +
      `<span>💰 ${M.fmtCUP(Math.round(totVentas))} CUP</span><span>🤝 A pagar: <b>${M.fmtCUP(Math.round(totOwed - totPaid))} CUP</b></span></div>`;

    // Comisiones por colaborador
    h += `<h3>🤝 Lo que vendieron tus colaboradores (otras redes)</h3>`;
    if (!af.length) h += `<div class="vacio">Aún nadie vende por ti. Comparte tu tienda para atraer colaboradores.</div>`;
    else h += `<table><tr><th>Colaborador</th><th>Clics</th><th>Ventas</th><th>Vendido</th><th>Comisión</th><th>Pagado</th><th>A pagar</th><th></th></tr>` +
      af.map((a) => {
        const pg = Number(paid[a.by]) || 0;
        const debe = Math.max(0, Math.round(a.owed - pg));
        return `<tr><td><b>@${M.esc(a.by)}</b></td><td>${a.clicks}</td><td>${a.sales.length}</td>` +
          `<td>${M.fmtCUP(Math.round(a.cup))}</td><td>${M.fmtCUP(Math.round(a.owed))} CUP</td><td>${M.fmtCUP(pg)}</td>` +
          `<td><b>${M.fmtCUP(debe)}</b></td>` +
          `<td>${debe > 0 ? `<button class="mini-btn ok" data-paid="${M.esc(a.by)}" data-amt="${Math.round(a.owed)}">✓ Pagado</button>` : `<span class="ok">✅</span>`}</td></tr>`;
      }).join("") + `</table>`;

    // Detalle de ventas
    if (ventas.length) {
      h += `<h3>🧾 Detalle de ventas</h3><table><tr><th>Fecha</th><th>Producto</th><th>Colaborador</th><th>Comprador</th><th>Total</th><th>Comisión</th></tr>` +
        ventas.slice(0, 50).map((x) => `<tr><td>${fmtF(x.ts)}</td><td>${M.esc(x.titulo || x.pid)}</td><td>@${M.esc(x.by)}</td>` +
          `<td>${M.esc(x.buyer || "—")}</td><td>${M.fmtCUP(x.cup)}</td><td>${M.fmtCUP(Math.round(x.cup * (x.pct != null ? x.pct : pctCfg) / 100))} (${x.pct != null ? x.pct : pctCfg}%)</td></tr>`).join("") + `</table>`;
    }

    // Inventario
    h += `<div style="display:flex;align-items:center;gap:8px;margin:14px 0 8px"><h3 style="margin:0">📦 Inventario (${items.length})</h3><span style="flex:1"></span>` +
      `<button class="btn" id="tAddItem" style="margin:0">＋ Agregar</button></div>`;
    h += items.length ? `<table><tr><th>Producto</th><th>Precio</th><th>Stock</th><th></th></tr>` +
      items.map((it) => `<tr><td><b>${M.esc(it.titulo)}</b><br><span class="nota">${M.esc(it.categoria || "")}</span></td>` +
        `<td>${M.precios(Object.assign({ pagos: b.pagos }, it)).main}</td><td>${it.stock != null ? it.stock : "—"}</td>` +
        `<td style="white-space:nowrap"><button class="mini-btn" data-teitem="${M.esc(it.id)}">✎</button> <button class="mini-btn no" data-tditem="${M.esc(it.id)}">🗑</button></td></tr>`).join("") + `</table>`
      : `<div class="vacio">Sin productos. Agrega el primero.</div>`;

    // Programa de afiliados
    h += `<div class="metodo"><h4>🤝 Programa de afiliados</h4><div class="nota">Tus colaboradores promocionan con su enlace + imagen promo. Si venden en 30 días, les pagas el %.</div>` +
      `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end"><div><label style="font-weight:400"><input type="checkbox" id="tAfAct" ${activoCfg ? "checked" : ""}> Programa activo</label></div>` +
      `<div><label>Comisión % por venta</label><input type="number" id="tAfPct" min="1" max="50" value="${pctCfg}" style="max-width:100px"></div>` +
      `<button class="mini-btn ok" id="tAfSave">Guardar</button></div></div>`;

    // Acceso del admin de la tienda
    if (canAccess) {
      h += `<div class="metodo"><h4>🔑 Acceso admin de la tienda</h4><div class="nota">Usuario actual: <b>${M.esc(b.adminUser || "(sin definir)")}</b>. Con ese usuario+clave se entra directo a este panel.</div>` +
        `<div style="display:flex;gap:8px;flex-wrap:wrap"><div style="flex:1;min-width:140px"><label>Usuario admin</label><input type="text" id="tAdmUser" value="${M.esc(b.adminUser || "")}" placeholder="ej: tienda-lapalma"></div>` +
        `<div style="flex:1;min-width:140px"><label>Clave nueva (vacío = no cambiar)</label><input type="password" id="tAdmPass" autocomplete="new-password"></div></div>` +
        `<button class="mini-btn ok" id="tAdmSave" style="margin-top:8px">Guardar acceso</button></div>`;
    } else if (u.rol === "tienda") {
      h += `<div class="metodo"><h4>🔑 Mi clave</h4><label>Clave nueva</label><input type="password" id="tMyPass" autocomplete="new-password">` +
        `<button class="mini-btn ok" id="tMyPassGo" style="margin-top:8px">Cambiar mi clave</button></div>`;
    }

    box.innerHTML = h;
    $("tBack").addEventListener("click", () => mostrar(u.rol === "admin" ? "admin" : "negocios"));
    $("tVer").addEventListener("click", () => openNegocio(b.id));
    $("tEdit").addEventListener("click", () => { bizReturnTo = "tienda"; openBizCreate(b.id); });
    box.querySelectorAll("[data-paid]").forEach((x) => x.addEventListener("click", () => {
      if (!confirm(`¿Marcar pagados ${M.fmtCUP(x.dataset.amt)} CUP a @${x.dataset.paid}?`)) return;
      M.Afiliados.markPaid(b.id, x.dataset.paid, Number(x.dataset.amt));
      cargarTienda(); toast("✅ Pago registrado");
    }));
    $("tAddItem").addEventListener("click", () => openBizItem(b.id, null));
    box.querySelectorAll("[data-teitem]").forEach((x) => x.addEventListener("click", () => openBizItem(b.id, x.dataset.teitem)));
    box.querySelectorAll("[data-tditem]").forEach((x) => x.addEventListener("click", () => {
      if (!confirm("¿Eliminar este producto?")) return;
      M.Negocios.removeItem(b.id, x.dataset.tditem);
      refrescarOfertas(); cargarTienda(); toast("Producto eliminado");
    }));
    $("tAfSave").addEventListener("click", () => {
      const pct = Math.min(50, Math.max(1, Number($("tAfPct").value) || 5));
      M.Negocios.update(b.id, { afiliados: { activo: $("tAfAct").checked, pct } });
      refrescarOfertas(); cargarTienda(); toast("✅ Programa actualizado");
    });
    const admSave = $("tAdmSave");
    if (admSave) admSave.addEventListener("click", async () => {
      const nu = $("tAdmUser").value.trim().toLowerCase();
      if (!nu) { toast("Escribe el usuario admin"); return; }
      if (nu === "admin") { toast("Ese nombre está reservado"); return; }
      if (!$("tAdmPass").value && !b.adminHash) { toast("Ponle una clave la primera vez"); return; }
      await M.Negocios.setAdmin(b.id, nu, $("tAdmPass").value || null);
      cargarTienda(); toast("✅ Acceso actualizado (entra con ese usuario+clave)");
    });
    const myPass = $("tMyPassGo");
    if (myPass) myPass.addEventListener("click", async () => {
      if (!$("tMyPass").value) { toast("Escribe la clave nueva"); return; }
      await M.Negocios.setAdmin(b.id, b.adminUser, $("tMyPass").value);
      cargarTienda(); toast("✅ Clave cambiada");
    });
  }

  /* ================= COLABORADOR: mis promociones ================= */
  function cargarAfiliado() {
    const M = st();
    const box = $("afLista");
    if (!S().user) { box.innerHTML = `<div class="vacio">Entra a tu cuenta para ver tus promociones.</div>`; openAuth("Entra para ver tus enlaces y comisiones."); return; }
    const me = S().user.username;
    const links = M.Afiliados.myLinks();
    const sales = M.Afiliados.salesFor(me, null);
    const clicks = links.reduce((a, l) => {
      let n = 0; const s = M.Afiliados._stats();
      for (const k in s.clicks) if (k === me + "|" + l.pid) n += s.clicks[k];
      return a + n;
    }, 0);
    const earned = sales.reduce((a, x) => a + x.cup * x.pct / 100, 0);
    let h = `<div class="nota">Comparte tus enlaces (30 días de atribución). La tienda ve cada venta tuya y te paga el % acordado por WhatsApp.</div>` +
      `<div class="stat-row" style="font-size:1rem;margin:10px 0"><span>🔗 ${links.length} enlaces</span><span>👁 ${clicks} clics</span><span>🛒 ${sales.length} ventas</span><span>💰 ${M.fmtCUP(Math.round(earned))} CUP generados</span></div>`;
    if (!links.length) {
      h += `<div class="vacio">Aún no promocionas nada.<br>Abre un producto y toca <b>🤝 Promocionar</b> para crear tu primer enlace con imagen.</div>`;
    } else {
      h += links.map((l) => {
        const ls = M.Afiliados.salesFor(me, l.pid);
        const le = ls.reduce((a, x) => a + x.cup * x.pct / 100, 0);
        let cl = 0; const s = M.Afiliados._stats();
        for (const k in s.clicks) if (k === me + "|" + l.pid) cl += s.clicks[k];
        return `<div class="metodo"><b>${M.esc(l.titulo)}</b><br>` +
          `<span class="nota">👁 ${cl} · 🛒 ${ls.length} · 💰 ${M.fmtCUP(Math.round(le))} CUP</span><br>` +
          `<button class="mini-btn ok" data-cp="${M.esc(l.pid)}">📋 Copiar enlace</button>` +
          `<button class="mini-btn" data-vp="${M.esc(l.pid)}">Ver producto</button>` +
          `<button class="mini-btn" data-pp="${M.esc(l.pid)}">🤝 Kit promo</button></div>`;
      }).join("");
    }
    box.innerHTML = h;
    box.querySelectorAll("[data-cp]").forEach((b) => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(M.Afiliados.linkFor(b.dataset.cp)); toast("Enlace copiado 📋"); }
      catch (e) { toast("Copia el enlace desde el producto"); }
    }));
    box.querySelectorAll("[data-vp]").forEach((b) => b.addEventListener("click", () => viewProduct(b.dataset.vp)));
    box.querySelectorAll("[data-pp]").forEach((b) => b.addEventListener("click", () => openPromo(b.dataset.pp)));
  }

  /* ---------- carrusel ---------- */
  function carrPintar() {
    document.querySelectorAll("#carrusel .slide").forEach((s, i) => s.className = "slide" + (i === carrI ? " act" : ""));
    const pts = $("carrPuntos").children;
    for (let i = 0; i < pts.length; i++) pts[i].className = i === carrI ? "act" : "";
  }
  function carrMover(d) { carrI = (carrI + d + CARR_N) % CARR_N; carrPintar(); carrReiniciar(); }
  function carrReiniciar() { clearInterval(carrT); carrT = setInterval(() => { carrI = (carrI + 1) % CARR_N; carrPintar(); }, 5000); }

  /* ---------- tasa / init ---------- */
  async function recargar() { const M = st(); try { const r = await M.api("categorias_list", {}); if (r.ok) cats = r.categorias; } catch (e) {} pintarCats(); }
  async function cargarTasa() {
    const M = st();
    const paint = () => {
      $("tasaBadge").textContent = `💱 USD: ${M.S.tasa.tasa} CUP`;
      const f = $("footTasa");
      if (f) f.textContent = `Tasa: ${M.S.tasa.tasa} CUP/USD · ${M.S.tasa.fuente} (${M.S.tasa.fecha})`;
    };
    // caché al instante (si hay) para no mostrar "…" mientras llega el vivo
    try {
      const c = M.cachedTasa();
      if (c && Number(c.tasa) > 0) {
        M.S.tasa = { tasa: Number(c.tasa), fecha: c.fecha || "", fuente: "El Toque (caché)" };
        paint();
      }
    } catch (e) {}
    await M.cargarTasa();
    paint();
    try { renderGrid(); } catch (e) {} // reconvierte precios con la tasa fresca
  }
  function newsletterInit() {
    const M = st();
    const form = $("newsForm");
    if (!form) return;
    if (M.Marketing.subscribed()) { $("newsWrap").innerHTML = `<div class="okmsg" style="margin:0">✅ Ya estás suscrito. Te avisaremos de ofertas.</div>`; return; }
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const r = M.Marketing.subscribe($("newsEmail").value);
      if (!r.ok) { toast(r.error); return; }
      $("newsWrap").innerHTML = `<div class="okmsg" style="margin:0">✅ ¡Gracias! Revisa tu correo (y el spam).</div>`;
      toast("Suscripción lista ✅");
    });
  }

  async function init() {
    const M = st();
    M.cargarSesion(); M.Engagement.seed(); pintarUser(); actualizarN();
    // favicon dinámico (index.html es fragmento body)
    try {
      const l = document.createElement("link"); l.rel = "icon"; l.type = "image/svg+xml"; l.href = "src/favicon.svg";
      document.head.appendChild(l);
    } catch (e) {}
    $("q").addEventListener("input", buscarAhora);
    $("q").addEventListener("focus", pintarSugs);
    $("q").addEventListener("keydown", (e) => {
      if (e.key === "Enter") aplicarBusqueda($("q").value.trim());
      else if (e.key === "Escape") hideSugs();
    });
    $("searchBtn").addEventListener("click", () => aplicarBusqueda($("q").value.trim()));
    document.addEventListener("click", (e) => { if (!e.target.closest(".buscador")) hideSugs(); });
    $("sortSel").addEventListener("change", (e) => { sortBy = e.target.value; renderGrid(); });
    $("priceSel").addEventListener("change", (e) => { maxPrice = Number(e.target.value) || 0; renderGrid(); });
    // carrusel
    for (let i = 0; i < CARR_N; i++) {
      const s = document.createElement("span");
      if (i === 0) s.className = "act";
      s.addEventListener("click", () => { carrI = i; carrPintar(); carrReiniciar(); });
      $("carrPuntos").appendChild(s);
    }
    document.querySelectorAll("#carrusel .flecha").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); carrMover(b.dataset.d === "1" ? 1 : -1); }));
    carrReiniciar();
    newsletterInit();
    await cargarTasa();
    await recargar();
    if (!cats.length) cats = (window.MC_DATA.CATEGORIES || []).map((c) => c.nombre);
    pintarCats();
    // skeleton primero (LCP), luego datos
    $("grid").innerHTML = `<div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div>`;
    await cargarProductos();
    checkRef(); // deep link #p-ID-r-usuario: abre el producto y atribuye clic
    try { const r = await M.api("tasa_auto", {}); if (r.auto) await cargarTasa(); } catch (e) {}
  }

  window.MC_APP = { init, goHome, mostrar, viewProduct, openPublish, openAuth, toggleCart, addToCart, products, openCheckout, adminTab, carrMover, openNegocio, openBizCreate, openBizItem, shareProduct, openPromo, checkRef, cargarAfiliado, openTienda, buscar: (t) => { const i = $("q"); if (i) i.value = t; mostrar("inicio"); aplicarBusqueda(t); } };
  document.addEventListener("DOMContentLoaded", init);
  if (document.readyState !== "loading") init();
})();
