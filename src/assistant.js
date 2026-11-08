/* Mercado Ciénega — src/assistant.js
 * Asistente virtual con IA: búsqueda semántica + recomendaciones proactivas + soporte post-venta.
 * Motor híbrido: intenta LLM (ai-text-plugin con prefix-cache + streaming) y cae a motor local.
 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  function store() { return window.MercadoStore; }
  function data() { return window.MC_DATA || { DEMO_PRODUCTS: [], SYNONYMS: {}, COMPLEMENTS: {}, FAQ: [], CAT_KEYS: {}, CATEGORIES: [] }; }
  function norm(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  const state = { opened: false, mode: "menu", datos: { interes: "", detalle: "", nombre: "", telefono: "" }, hist: [] };

  function msgsEl() { return $("cfMsgs"); }
  function scroll() { const m = msgsEl(); if (m) m.scrollTop = m.scrollHeight; }
  function say(text, mine) {
    const d = document.createElement("div");
    d.className = "cf-m " + (mine ? "cf-user" : "cf-bot");
    d.textContent = text; // textContent = XSS-safe por diseño
    msgsEl().appendChild(d); scroll();
  }
  function typing() {
    const d = document.createElement("div");
    d.className = "cf-escribiendo"; d.id = "cfTyp";
    d.innerHTML = '<span class="cf-typing-dots"><span></span><span></span><span></span></span> escribiendo…';
    msgsEl().appendChild(d); scroll();
  }
  function untype() { const t = $("cfTyp"); if (t) t.remove(); }
  // streaming letra por letra (efecto typewriter)
  function streamText(text, done) {
    const d = document.createElement("div");
    d.className = "cf-m cf-bot"; msgsEl().appendChild(d); scroll();
    let i = 0;
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { d.textContent = text; scroll(); if (done) done(); return; }
    const step = () => {
      i += 2;
      d.textContent = text.slice(0, i);
      scroll();
      if (i < text.length) setTimeout(step, 14);
      else if (done) done();
    };
    step();
  }
  function chips(lista) {
    const c = $("cfChips"); if (!c) return;
    c.innerHTML = "";
    (lista || []).forEach((ch) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = ch.t;
      b.onclick = () => { say(ch.t, true); route(ch.v, true); };
      c.appendChild(b);
    });
  }
  function respond(text, chipList) {
    typing();
    setTimeout(() => { untype(); streamText(text, () => chips(chipList || [])); }, 380);
  }

  /* ---------- utilidades semánticas locales ---------- */
  function lev(a, b) {
    a = norm(a); b = norm(b);
    if (!a || !b) return 99;
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 3) return 99;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[m][n];
  }
  function expandTerms(q) {
    const syn = data().SYNONYMS || {};
    const words = norm(q).split(/[^a-z0-9]+/).filter(Boolean);
    const out = new Set(words);
    words.forEach((w) => {
      Object.keys(syn).forEach((k) => {
        if (k === w || (syn[k] || []).includes(w)) { out.add(k); (syn[k] || []).forEach((x) => out.add(x)); }
      });
    });
    return [...out];
  }
  function parseBudget(q) {
    const t = norm(q).replace(/,/g, "");
    let m = t.match(/\$?\s*(\d+(?:\.\d+)?)\s*(usd|dolares?|cup|pesos?)?/);
    if (!m) return null;
    let n = parseFloat(m[1]); if (!(n > 0)) return null;
    let cur = (m[2] || "").includes("usd") || (m[2] || "").includes("dolar") || t.includes("$") ? "USD" : "CUP";
    if (/menos de|hasta|presupuesto|maximo|por debajo/.test(t)) return { max: n, cur };
    if (/regalo.*(por|de)/.test(t)) return { max: n, cur };
    return null;
  }
  function detectGift(q) { return /(regalo|obsequio|cumple|madre|mama|papa|novia|esposa|nino|nina|sorpresa)/.test(norm(q)); }
  function scoreProduct(p, terms, rawQ) {
    const hay = norm((p.titulo || "") + " " + (p.descripcion || "") + " " + (p.categoria || ""));
    let sc = 0;
    terms.forEach((t) => {
      if (!t || t.length < 2) return;
      if (hay.includes(t)) sc += t.length >= 5 ? 3 : 2;
      else {
        const ws = hay.split(/[^a-z0-9]+/);
        for (const w of ws) { if (lev(w, t) <= (t.length >= 6 ? 2 : 1)) { sc += 1.5; break; } }
      }
    });
    // intención regalo: prioriza belleza/juguetes/ropa
    if (detectGift(rawQ) && /belleza|juguete|ropa|hogar/i.test(p.categoria || "")) sc += 2;
    if (p.destacado) sc += 0.5;
    return sc;
  }
  function localSearch(q, limit) {
    const all = (window.MC_APP && window.MC_APP.products()) || data().DEMO_PRODUCTS || [];
    const terms = expandTerms(q);
    const budget = parseBudget(q);
    const st = store();
    let ranked = all.map((p) => ({ p, sc: scoreProduct(p, terms, q) })).filter((x) => x.sc > 0)
      .sort((a, b) => b.sc - a.sc).map((x) => x.p);
    if (budget) {
      const tasa = (st && st.S.tasa.tasa) || 770;
      ranked = ranked.filter((p) => {
        const cup = p.moneda === "USD" ? p.precio * tasa : p.precio;
        const maxCup = budget.cur === "USD" ? budget.max * tasa : budget.max;
        return cup <= maxCup * 1.15;
      });
    }
    return { items: ranked.slice(0, limit || 3), budget, total: ranked.length };
  }
  function complementsFor(cart) {
    const all = (window.MC_APP && window.MC_APP.products()) || [];
    const comp = data().COMPLEMENTS || {};
    const wanted = new Set();
    (cart || []).forEach((it) => {
      const p = all.find((x) => x.id === it.id);
      const cat = p ? p.categoria : it.categoria;
      (comp[cat] || []).forEach((c) => wanted.add(c));
    });
    const ids = new Set((cart || []).map((x) => x.id));
    return all.filter((p) => wanted.has(p.categoria) && !ids.has(p.id)).slice(0, 3);
  }

  /* ---------- LLM con prefix-cache (ai-text-plugin) ---------- */
  function llmAvailable() {
    try { const r = globalThis.root || window.root; return !!(r && r.generateText); }
    catch (e) { return false; }
  }
  async function llmAnswer(userText) {
    const r = (globalThis.root || window.root);
    const st = store();
    const prods = ((window.MC_APP && window.MC_APP.products()) || []).slice(0, 30)
      .map((p) => `- ${p.titulo} | ${p.categoria} | ${st.precios(p).main} | id:${p.id}`).join("\n");
    const faq = (data().FAQ || []).map((f) => `P: ${f.q}\nR: ${f.a}`).join("\n");
    const cart = ((st && st.S.carrito) || []).map((x) => `${x.titulo} x${x.cantidad}`).join("; ") || "vacío";
    const prompt = {
      instruction: [
        "Eres el asistente del Mercado Ciénega (Ciénaga de Zapata, Cuba). Hablas español cubano, amable y breve (máx 90 palabras). Nunca inventes productos ni precios: usa solo el catálogo y la base de conocimiento.\n\nCATÁLOGO:\n" + prods +
        "\n\nBASE DE CONOCIMIENTO:\n" + faq +
        "\n\nCARRITO ACTUAL: " + cart +
        "\n\nHistorial:\n" + state.hist.slice(-6).join("\n") +
        "\n\nTAREA: responde al cliente:",
        String(userText),
      ].join("\n"),
      onChunk: null,
    };
    // streaming real del LLM hacia una burbuja
    const d = document.createElement("div");
    d.className = "cf-m cf-bot"; msgsEl().appendChild(d); scroll();
    let full = "";
    prompt.onChunk = (ev) => { full += (ev && ev.textChunk) || ""; d.textContent = full; scroll(); };
    const out = await r.generateText(prompt);
    const txt = String((out && out.text) || out || full || "").trim();
    if (!txt) { d.remove(); throw new Error("empty"); }
    d.textContent = txt;
    scroll();
    return txt;
  }

  /* ---------- render de productos en el chat ---------- */
  function productCard(p) {
    const st = store();
    const pr = st.precios(p);
    const d = document.createElement("div");
    d.className = "cf-prod";
    const wa = p.telefono ? st.waLink(p.telefono) : "";
    const b = document.createElement("b"); b.textContent = p.titulo; d.appendChild(b);
    const meta = document.createElement("div");
    const pre = document.createElement("span"); pre.className = "cf-pre"; pre.textContent = pr.main + " ";
    const mun = document.createElement("span"); mun.textContent = "· 📍 " + (p.municipio || "Ciénaga de Zapata");
    meta.appendChild(pre); meta.appendChild(mun); d.appendChild(meta);
    const btns = document.createElement("div"); btns.className = "cf-btns";
    const ver = document.createElement("button"); ver.type = "button"; ver.textContent = "Ver anuncio";
    ver.onclick = () => { close(); window.MC_APP.viewProduct(p.id); };
    btns.appendChild(ver);
    if (wa) {
      const a = document.createElement("a"); a.className = "cf-dueno"; a.target = "_blank";
      a.href = wa + "?text=" + encodeURIComponent("Hola, vi tu anuncio «" + p.titulo + "» en Mercado Ciénega y me interesa.");
      a.textContent = "💬 Dueño del anuncio"; btns.appendChild(a);
    }
    const add = document.createElement("button"); add.type = "button"; add.textContent = "＋ Carrito";
    add.onclick = () => { window.MC_APP.addToCart(p.id); };
    btns.appendChild(add);
    d.appendChild(btns);
    msgsEl().appendChild(d); scroll();
  }

  /* ---------- flujos ---------- */
  function menu() {
    state.mode = "menu";
    respond("¿En qué te ayudo hoy?", [
      { t: "🛒 Buscar productos", v: "ofertas" },
      { t: "🎁 Regalo por presupuesto", v: "regalo" },
      { t: "🏪 Negocios", v: "negocios" },
      { t: "🏷️ Quiero vender aquí", v: "vender" },
      { t: "📦 Rastrear mi pedido", v: "rastrear" },
      { t: "👥 Equipo del Mercado", v: "equipo" },
    ]);
  }
  async function doSearch(term) {
    state.mode = "buscar_texto";
    // 1) intenta LLM (semántica real) sin bloquear: timeout 25s
    if (llmAvailable()) {
      typing();
      try {
        const txt = await Promise.race([
          llmAnswer("Busco: " + term),
          new Promise((_, rej) => setTimeout(() => rej(new Error("t")), 25000)),
        ]);
        untype();
        // El LLM ya respondió; además mostramos hasta 3 fichas locales
        const r = localSearch(term, 3);
        if (r.items.length) {
          say("Te dejo las fichas para que compres directo con el dueño:", false);
          r.items.forEach(productCard);
        }
        chips([{ t: "🔎 Buscar otra cosa", v: "ofertas" }, { t: "✨ Recomiéndame algo", v: "recomendar" }, { t: "↩️ Menú", v: "menu" }]);
        void txt;
        return;
      } catch (e) { untype(); /* cae a motor local */ }
    }
    // 2) motor local semántico (offline-first, tolerante a faltas)
    typing();
    setTimeout(() => {
      untype();
      const r = localSearch(term, 3);
      if (!r.items.length) {
        respond(`Ahora mismo no hay anuncios de «${term}». Prueba con otra palabra (ej: “celular”, “mango”, “taladro”) o mira las categorías.`, [
          { t: "🔎 Probar otra búsqueda", v: "ofertas" },
          { t: "🗂️ Ver todo", v: "ver_ofertas" },
          { t: "↩️ Menú", v: "menu" },
        ]);
        return;
      }
      const extra = r.budget ? ` por menos de ${r.budget.max} ${r.budget.cur}` : "";
      say(`Esto hay de «${term}»${extra} (${r.total} resultado${r.total > 1 ? "s" : ""}). Compras directo con el dueño:`, false);
      r.items.forEach(productCard);
      chips([{ t: "🔎 Buscar otra cosa", v: "ofertas" }, { t: "✨ Recomiéndame algo", v: "recomendar" }, { t: "🏷️ Quiero vender aquí", v: "vender" }, { t: "↩️ Menú", v: "menu" }]);
    }, 350);
  }
  function recommend() {
    const st = store();
    const cart = (st && st.S.carrito) || [];
    const comp = complementsFor(cart);
    if (cart.length && comp.length) {
      say("Según tu carrito, esto te puede servir de complemento:", false);
      comp.forEach(productCard);
      chips([{ t: "🛒 Ver mi carrito", v: "ver_carrito" }, { t: "🔎 Buscar otra cosa", v: "ofertas" }, { t: "↩️ Menú", v: "menu" }]);
    } else {
      const dest = ((window.MC_APP && window.MC_APP.products()) || []).filter((p) => p.destacado).slice(0, 3);
      say("Estos destacados se están moviendo bien esta semana:", false);
      (dest.length ? dest : ((window.MC_APP && window.MC_APP.products()) || []).slice(0, 3)).forEach(productCard);
      chips([{ t: "🎁 Busco un regalo", v: "regalo" }, { t: "🔎 Buscar algo", v: "ofertas" }, { t: "↩️ Menú", v: "menu" }]);
    }
  }
  async function track() {
    const st = store();
    if (!st.S.user) {
      respond("Para rastrear tu pedido entra a tu cuenta primero (así veo tus compras).", [{ t: "👤 Entrar / crear cuenta", v: "login" }, { t: "↩️ Menú", v: "menu" }]);
      return;
    }
    typing();
    try {
      const r = await st.api("pedidos_mios", {});
      untype();
      if (!r.ok || !(r.pedidos || []).length) {
        respond("No veo pedidos en tu cuenta todavía. Cuando finalices una compra aparecerá aquí con su estado.", [{ t: "🛒 Buscar productos", v: "ofertas" }, { t: "↩️ Menú", v: "menu" }]);
        return;
      }
      const last = r.pedidos[0];
      say(`Tu último pedido ${last.id} (${last.fecha}) está: ${last.estado}. Total: ${st.fmtCUP(last.total_cup)} CUP.`, false);
      (last.items || []).slice(0, 4).forEach((it) => say(`• ${it.titulo} × ${it.cantidad}`, false));
      chips([{ t: "💬 Hablar con el equipo", v: "equipo" }, { t: "↩️ Menú", v: "menu" }]);
    } catch (e) {
      untype();
      respond("No pude contactar el servidor ahora. Revisa «🧾 Mis pedidos» en el menú de tu cuenta.", [{ t: "↩️ Menú", v: "menu" }]);
    }
  }
  function sellInfo() {
    state.mode = "menu";
    typing();
    store().api("destacar_info", {}).then((d) => {
      untype();
      if (!d || !d.ok) throw new Error("x");
      const st = store();
      let txt = `¡Buena idea! 🏷️ Publicar cuesta ${st.fmtCUP(d.publicar_precio_cup)} CUP (≈ $${st.fmtUSD(d.publicar_precio_cup / st.S.tasa.tasa)} USD) y queda visible 1 mes al confirmarse tu pago.`;
      if (d.destacado_precio_cup) txt += `\n⭐ Destacado: ${st.fmtCUP(d.destacado_precio_cup)} CUP${d.destacado_dias ? ` (${d.destacado_dias} días)` : ""}, sales arriba con estrella.`;
      const m = d.metodos || {};
      txt += "\n\nPagas por:" + (m.transfermovil ? `\n📱 Transfermóvil: ${m.transfermovil}` : "") + (m.usdt ? `\n💠 USDT (TRC20): ${m.usdt}` : "") + (m.efectivo ? `\n🤝 Efectivo: ${m.efectivo}` : "");
      streamText(txt, () => chips([{ t: "📢 Publicar mi anuncio", v: "publicar" }, { t: "💬 Que me asesoren", v: "asesor" }, { t: "↩️ Menú", v: "menu" }]));
    }).catch(() => {
      untype();
      respond("Ahora no pude cargar los precios. Déjame tus datos y el equipo te explica.", [{ t: "💬 Que me asesoren", v: "asesor" }, { t: "↩️ Menú", v: "menu" }]);
    });
  }
  function askContact() {
    let guard = null;
    try { guard = JSON.parse(localStorage.getItem("cf_datos") || "null"); } catch (e) {}
    if (guard && guard.nombre && guard.telefono) {
      state.datos.nombre = guard.nombre; state.datos.telefono = guard.telefono;
      state.mode = "confirmar";
      respond(`Ya tengo tus datos: ${guard.nombre} · ${guard.telefono}. ¿Te contactamos ahí?`, [{ t: "✅ Sí, esos mismos", v: "confirmar" }, { t: "✏️ Usar otros", v: "otros" }]);
      return;
    }
    state.mode = "nombre";
    respond("Para contactarte enseguida, dime tu nombre.", [{ t: "↩️ Menú", v: "menu" }]);
  }
  function saveLead() {
    const st = store();
    state.mode = "fin";
    try { localStorage.setItem("cf_datos", JSON.stringify({ nombre: state.datos.nombre, telefono: state.datos.telefono })); } catch (e) {}
    const done = () => respond(`¡Listo, ${state.datos.nombre.split(" ")[0]}! ✅ Ya tomé tus datos y te contactan por WhatsApp. ¿Algo más?`, [{ t: "🛒 Buscar productos", v: "ofertas" }, { t: "🏷️ Quiero vender aquí", v: "vender" }, { t: "↩️ Menú", v: "menu" }]);
    const fail = () => { state.mode = "fin"; respond("No pude guardar tus datos ahora. Inténtalo en un ratico.", [{ t: "↩️ Menú", v: "menu" }]); };
    if (!st.CFG.leadsUrl) { done(); return; }
    fetch(st.CFG.leadsUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify({ a: "lead", nombre: state.datos.nombre, telefono: state.datos.telefono, interes: state.datos.interes || "Contacto", detalle: state.datos.detalle || "", hp: ($("cfHp") || {}).value || "" }) })
      .then((r) => r.json()).then((r) => (r && r.ok ? done() : fail())).catch(fail);
  }
  function faqAnswer(q) {
    const faqs = data().FAQ || [];
    let best = null, bs = 0;
    const nq = norm(q);
    faqs.forEach((f) => {
      const nqq = norm(f.q);
      let sc = 0;
      nq.split(/[^a-z0-9]+/).forEach((w) => { if (w.length > 3 && nqq.includes(w)) sc++; });
      if (sc > bs) { bs = sc; best = f; }
    });
    return bs >= 1 ? best.a : null;
  }

  /* ---------- router ---------- */
  function route(v, isBtn) {
    const n = norm(v);
    if (isBtn) {
      if (v === "menu") return menu();
      if (v === "equipo") { state.datos.interes = "Equipo del Mercado"; state.datos.detalle = ""; state.mode = "detalle"; return respond("Perfecto, te conecto con el equipo. Cuéntame en una línea qué necesitas.", [{ t: "↩️ Menú", v: "menu" }]); }
      if (v === "vender") return sellInfo();
      if (v === "publicar") { close(); window.MC_APP.openPublish(); return; }
      if (v === "asesor") { state.datos.interes = "Quiere vender"; state.datos.detalle = "Pidió asesoría para publicar"; return askContact(); }
      if (v === "ofertas") { state.mode = "buscar_texto"; return respond("🛒 Dime qué buscas y lo reviso en los anuncios publicados.", [{ t: "↩️ Menú", v: "menu" }]); }
      if (v === "regalo") { state.mode = "buscar_texto"; return respond("🎁 ¡Vamos! Dime para quién es y tu presupuesto (ej: «regalo para mi mamá por menos de $50»).", [{ t: "↩️ Menú", v: "menu" }]); }
      if (v === "recomendar") return recommend();
      if (v === "rastrear") return track();
      if (v === "donde") return respond("📍 Somos la plataforma de la Ciénaga de Zapata, Matanzas. Los vendedores son de la zona. ¿Te ayudo con algo más?", [{ t: "🛒 Buscar productos", v: "ofertas" }, { t: "↩️ Menú", v: "menu" }]);
      if (v === "contacto") return askContact();
      if (v === "confirmar") return saveLead();
      if (v === "otros") { state.mode = "nombre"; return respond("Dime tu nombre.", []); }
      if (v === "login") { close(); window.MC_APP.openAuth(); return; }
    if (v === "negocios") { close(); window.MC_APP.mostrar("negocios"); return; }
      if (v === "ver_ofertas") { close(); window.MC_APP.goHome(); return; }
      if (v === "ver_carrito") { close(); window.MC_APP.toggleCart(true); return; }
      return;
    }
    // texto libre
    state.hist.push("cliente: " + v);
    if (state.mode === "detalle") { state.datos.detalle = v; return askContact(); }
    if (state.mode === "nombre") {
      if (v.trim().length < 2) return respond("¿Me repites tu nombre?", []);
      state.datos.nombre = v.trim(); state.mode = "telefono";
      return respond(`Gracias, ${state.datos.nombre.split(" ")[0]}. ¿Y tu número de WhatsApp?`, []);
    }
    if (state.mode === "telefono") {
      if (v.replace(/\D/g, "").length < 7) return respond("Se ve incompleto. Escríbelo de nuevo (solo dígitos, con +53 si quieres).", []);
      state.datos.telefono = v.trim(); return saveLead();
    }
    if (state.mode === "buscar_texto") return doSearch(v.trim());
    if (state.mode === "confirmar") {
      if (/\b(si|ok|dale|esos|si esos)\b/.test(n)) return saveLead();
      state.mode = "nombre"; return respond("Dime tu nombre.", []);
    }
    if (/\b(menu|inicio|volver|atras)\b/.test(n)) return menu();
    if (/(public|anunci|destac)/.test(n) || /quiero vender/.test(n)) { say("🏷️ Quiero vender aquí", true); return sellInfo(); }
    if (/(donde|ubicac|llegar|direccion|quedan)/.test(n)) return route("donde", true);
    if (/(rastre|pedido|sigue|dond[eé] va|devol|cambio|reembolso|garantia)/.test(n)) return track();
    if (/(recomienda|sugiere|que me sirve|complement)/.test(n)) return recommend();
    if (/(horario|abren|abierto|hora|envio|tasa|pago|devol|quienes|contacto|telefono)/.test(n)) {
      const a = faqAnswer(v);
      if (a) return respond(a + "\n¿Te ayudo con algo más?", [{ t: "🛒 Buscar productos", v: "ofertas" }, { t: "👥 Equipo", v: "equipo" }, { t: "↩️ Menú", v: "menu" }]);
    }
    if (/(humano|persona|equipo|soporte|ayuda con|problema)/.test(n)) { say("👥 Equipo del Mercado", true); return route("equipo", true); }
    const cleaned = n.replace(/^(hola|buenas|oye|dime|por favor|favor)\s+/, "").replace(/\b(tienen|tienes|hay|venden|vende|busco|quiero|necesito|precio de|cuanto cuesta|cuesta|me puedes buscar)\b/g, "").trim();
    if (cleaned.length >= 3) return doSearch(cleaned);
    if (/(hola|buenas|saludos|que bola)/.test(n)) return menu();
    const a2 = faqAnswer(v);
    if (a2) return respond(a2, [{ t: "🛒 Buscar productos", v: "ofertas" }, { t: "↩️ Menú", v: "menu" }]);
    respond("No te entendí bien. Puedo ayudarte con esto:", [
      { t: "🛒 Buscar productos", v: "ofertas" },
      { t: "✨ Recomiéndame algo", v: "recomendar" },
      { t: "📦 Rastrear pedido", v: "rastrear" },
      { t: "👥 Equipo", v: "equipo" },
    ]);
  }

  function open() {
    $("cfPanel").classList.add("abierto");
    $("cfBurbuja").style.display = "none";
    if (!state.opened) {
      state.opened = true;
      respond("¡Hola! 👋 Soy Cienaguero 🦎, el asistente del Mercado Ciénega. Entiendo lo que buscas aunque lo escribas con tus palabras (ej: «regalo para mi mamá por menos de $50»).");
      setTimeout(menu, 600);
    }
  }
  function close() {
    $("cfPanel").classList.remove("abierto");
    $("cfBurbuja").style.display = "flex";
  }
  function send(ev) {
    ev.preventDefault();
    const inp = $("cfTexto");
    const t = (inp.value || "").trim();
    if (!t) return;
    if (($("cfHp") || {}).value) { inp.value = ""; return; } // honeypot anti-spam
    inp.value = "";
    say(t, true);
    route(t, false);
  }

  window.CF = { open, close, send, route, recommend, search: doSearch };
})();
