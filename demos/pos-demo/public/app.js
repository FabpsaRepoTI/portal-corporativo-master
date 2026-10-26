// Mostrador · cliente web. Habla con la API (server.js); los datos viven en SQLite.
// Lector de código de barras: funciona como teclado (USB/Bluetooth) en cualquier
// pantalla de cobro, o con la cámara (BarcodeDetector del navegador).
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const mx = (n) => "$" + Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fechaCorta = (iso) => new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
  const IVA = 0.16;

  // ── Sesión ─────────────────────────────────────────────
  let token = sessionStorage.getItem("mostrador_token");
  let usuario = JSON.parse(sessionStorage.getItem("mostrador_usuario") || "null");
  async function api(ruta, opts = {}) {
    const r = await fetch("/api" + ruta, {
      method: opts.method || "GET",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && ruta !== "/login") { salir(); throw new Error(d.error || "Sesión expirada"); }
    if (!r.ok || d.ok === false) throw new Error(d.error || "Error de conexión");
    return d.data ?? d;
  }
  function mostrarSesion() {
    const dentro = !!(token && usuario);
    $("#acceso").hidden = dentro;
    if (!dentro) return setTimeout(() => $("#pin").focus(), 50);
    $("#nombreUsuario").textContent = usuario.nombre;
    $("#rolUsuario").textContent = " · " + usuario.rol;
    $("#avatar").textContent = usuario.nombre.split(" ").map((p) => p[0]).join("").slice(0, 2);
    document.body.classList.toggle("es-gerente", usuario.rol === "gerente");
  }
  $("#formPin").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const r = await api("/login", { method: "POST", body: { pin: $("#pin").value } });
      token = r.token; usuario = r.usuario;
      sessionStorage.setItem("mostrador_token", token);
      sessionStorage.setItem("mostrador_usuario", JSON.stringify(usuario));
      $("#pin").value = "";
      mostrarSesion();
      render(location.hash.slice(1) || "inicio");
    } catch (er) { toast(er.message); $("#pin").select(); }
  });
  function salir() { token = null; usuario = null; sessionStorage.clear(); mostrarSesion(); }
  $("#salir").onclick = salir;

  // ── Interfaz común ─────────────────────────────────────
  function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 2600); }
  function modal(html) { const m = $("#modal"); m.innerHTML = `<div class="dialogo">${html}</div>`; m.hidden = false; return m; }
  function cerrar() { $("#modal").hidden = true; detenerCamara(); }
  $("#modal").addEventListener("mousedown", (e) => { if (e.target.id === "modal") cerrar(); });
  const estado = (p) => (p.stock <= 0 ? ["mal", "Agotado"] : p.stock < p.minimo ? ["warn", "Bajo"] : ["ok", "Disponible"]);
  const beep = () => { try { const c = new AudioContext(), o = c.createOscillator(); o.frequency.value = 1400; o.connect(c.destination); o.start(); o.stop(c.currentTime + 0.07); } catch { /* sin audio */ } };

  // ── Vistas ─────────────────────────────────────────────
  const vistas = {
    async inicio() {
      const t = await api("/tablero");
      const max = Math.max(1, ...t.porDia.map((d) => d.total));
      const delta = t.ayer ? Math.round(((t.hoy.total - t.ayer) / t.ayer) * 100) : 0;
      return `<div class="kpis">
          <div class="card kpi"><small>Ventas de hoy</small><b>${mx(t.hoy.total)}</b><span class="${delta >= 0 ? "sube" : "baja"}">${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}% vs ayer · ${t.hoy.tickets} tickets</span></div>
          <div class="card kpi"><small>Utilidad estimada hoy</small><b>${mx(t.utilidadHoy)}</b><span class="muted">precio − costo</span></div>
          <div class="card kpi"><small>Por cobrar a clientes</small><b>${mx(t.porCobrar)}</b><span style="color:var(--warn)">ventas a crédito</span></div>
          <div class="card kpi"><small>Productos por reabastecer</small><b>${t.bajos.length}</b><span style="color:var(--mal)">bajo el mínimo</span></div>
        </div>
        <div class="copiloto-cta card"><span class="ia-ico"><i class="ti ti-sparkles"></i></span>
          <div><b>Pregúntale al Copiloto IA</b><span class="muted">"¿Qué debo reabastecer esta semana?" · "¿Cómo vamos vs la semana pasada?" · "¿Quién me debe más?"</span></div>
          <button class="btn pri" data-ir="copiloto">Abrir Copiloto</button></div>
        <div class="grid2">
          <div class="card"><h3>Ventas de los últimos 14 días</h3>
            <div class="barras">${t.porDia.map((d) => `<div class="barra" title="${d.dia}: ${mx(d.total)}"><i style="height:${Math.max(4, (d.total / max) * 100)}%"></i><small>${new Date(d.dia + "T12:00").toLocaleDateString("es-MX", { day: "numeric" })}</small></div>`).join("")}</div>
          </div>
          <div class="card"><h3>Más vendidos · 7 días</h3><ul class="lista">${t.top.map((p) => `<li><span>${esc(p.nombre)}</span><b>${p.piezas} pzas</b></li>`).join("")}</ul></div>
        </div>
        <div class="card" style="margin-top:16px"><h3>Alertas de inventario</h3>
          ${t.bajos.length ? `<ul class="lista">${t.bajos.map((p) => `<li><span>${p.emoji} ${esc(p.nombre)} <span class="muted">· ${p.sku}</span></span><span><span class="tag ${p.stock <= 0 ? "mal" : "warn"}">${p.stock <= 0 ? "Agotado" : "Bajo"}</span> &nbsp;${p.stock} / mín ${p.minimo}</span></li>`).join("")}</ul>` : `<p class="muted">Todo en orden.</p>`}</div>`;
    },

    async pos() {
      [pos.productos, pos.clientes] = await Promise.all([api("/productos"), api("/clientes")]);
      pos.cats = ["Todos", ...new Set(pos.productos.map((p) => p.categoria))];
      return `<div class="pos">
        <div>
          <div class="barra-herr">
            <div class="escaner-campo"><i class="ti ti-barcode"></i><input class="in" id="buscaProd" placeholder="Escanea o escribe nombre, SKU o código de barras…" value="${esc(pos.q)}" autocomplete="off" /></div>
            <button class="btn" id="camara" title="Escanear con la cámara"><i class="ti ti-camera"></i> Cámara</button>
          </div>
          <div class="chips">${pos.cats.map((c) => `<button class="chip ${pos.cat === c ? "on" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}</div>
          <div class="prods" id="prods"></div>
        </div>
        <div class="card ticket">
          <div class="ticket-head"><h3>Ticket</h3>
            <select class="in" id="clienteVenta">${pos.clientes.map((c) => `<option value="${c.id}" ${pos.cliente == c.id ? "selected" : ""}>${esc(c.nombre)}</option>`).join("")}</select></div>
          <div class="items" id="items"></div>
          <div class="totales" id="totales"></div>
          <div class="metodos">${[["efectivo", "ti-cash", "Efectivo"], ["tarjeta", "ti-credit-card", "Tarjeta"], ["transferencia", "ti-building-bank", "Transf."], ["credito", "ti-calendar-dollar", "Crédito"]]
            .map(([k, i, l]) => `<button class="metodo ${pos.metodo === k ? "on" : ""}" data-metodo="${k}"><i class="ti ${i}"></i>${l}</button>`).join("")}</div>
          <button class="btn pri grande" id="cobrar"><i class="ti ti-check"></i> Cobrar <kbd>F12</kbd></button>
        </div>
      </div>`;
    },

    async copiloto() {
      return `<div class="copiloto">
        <div class="card chat">
          <div class="chat-msgs" id="chatMsgs">
            <div class="msg ia"><span class="ia-ico"><i class="ti ti-sparkles"></i></span><div><b>Copiloto</b><p>Hola ${esc(usuario.nombre.split(" ")[0])}. Soy tu asistente con IA: consulto tus ventas, inventario y clientes en tiempo real y te ayudo a decidir. ¿Qué quieres saber?</p></div></div>
          </div>
          <div class="sugerencias">${["¿Cómo vamos hoy comparado con la semana?", "¿Qué debo reabastecer para 14 días?", "¿Cuáles son mis productos más rentables?", "¿Quién me debe más dinero?"]
            .map((s) => `<button class="chip" data-pregunta="${esc(s)}">${esc(s)}</button>`).join("")}</div>
          <form id="chatForm" class="chat-form"><input class="in" id="chatIn" placeholder="Pregunta lo que quieras sobre tu negocio…" maxlength="2000" autocomplete="off" />
            <button class="btn pri" id="chatEnviar"><i class="ti ti-send"></i></button></form>
        </div>
        <div class="card agente-info"><h3><i class="ti ti-robot"></i> Cómo trabaja el agente</h3>
          <ul class="lista">
            <li><span>Consulta ventas por periodo</span><i class="ti ti-check ok"></i></li>
            <li><span>Ranking y margen por producto</span><i class="ti ti-check ok"></i></li>
            <li><span>Días de inventario restantes</span><i class="ti ti-check ok"></i></li>
            <li><span>Cuentas por cobrar</span><i class="ti ti-check ok"></i></li>
            <li><span>Propone órdenes de compra</span><i class="ti ti-check ok"></i></li>
          </ul>
          <p class="muted" style="font-size:12.5px">El agente solo lee datos. Las órdenes de compra que propone las aplicas tú con un clic.</p></div>
      </div>`;
    },

    async ventas() {
      const ventas = await api("/ventas");
      return `<div class="card tabla"><table><thead><tr><th>Folio</th><th>Fecha</th><th>Cliente</th><th>Cajero</th><th>Método</th><th>Estado</th><th class="num">Total</th><th></th></tr></thead><tbody>
        ${ventas.map((v) => `<tr class="${v.cancelada ? "tachado" : ""}"><td><b>#${v.folio}</b></td><td>${fechaCorta(v.fecha)}</td><td>${esc(v.cliente)}</td><td class="muted">${esc(v.cajero)}</td>
          <td><span class="tag pri">${v.metodo}</span></td><td>${v.cancelada ? '<span class="tag mal">Cancelada</span>' : v.facturada ? '<span class="tag ok">Facturada</span>' : '<span class="muted">—</span>'}</td>
          <td class="num"><b>${mx(v.total)}</b></td><td class="num">${!v.cancelada && !v.facturada ? `<button class="btn chico solo-gerente" data-cancelar="${v.folio}">Cancelar</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>`;
    },

    async productos() {
      pos.productos = await api("/productos");
      return `<div class="barra-herr"><input class="in" id="filtroProd" placeholder="Buscar producto…" style="flex:1" />
        <button class="btn pri solo-gerente" id="nuevoProd"><i class="ti ti-plus"></i> Nuevo producto</button></div>
        <div class="card tabla"><table><thead><tr><th>Producto</th><th>SKU</th><th>Código de barras</th><th>Categoría</th><th class="num">Costo</th><th class="num">Precio</th><th class="num">Margen</th><th class="num">Existencia</th></tr></thead>
        <tbody id="tablaProd">${filasProd(pos.productos)}</tbody></table></div>`;
    },

    async inventario() {
      const ps = await api("/productos");
      const valor = ps.reduce((s, p) => s + p.costo * Math.max(0, p.stock), 0);
      return `<div class="kpis">
          <div class="card kpi"><small>Valor del inventario (a costo)</small><b>${mx(valor)}</b></div>
          <div class="card kpi"><small>Productos</small><b>${ps.length}</b></div>
          <div class="card kpi"><small>Stock bajo</small><b>${ps.filter((p) => p.stock > 0 && p.stock < p.minimo).length}</b></div>
          <div class="card kpi"><small>Agotados</small><b>${ps.filter((p) => p.stock <= 0).length}</b></div>
        </div>
        <div class="card tabla"><table><thead><tr><th>Producto</th><th class="num">Existencia</th><th class="num">Mínimo</th><th>Estado</th><th></th></tr></thead><tbody>
        ${ps.map((p) => { const [c, l] = estado(p); return `<tr><td>${p.emoji} ${esc(p.nombre)} <span class="muted">· ${p.sku}</span></td><td class="num">${p.stock}</td><td class="num">${p.minimo}</td>
          <td><span class="tag ${c}">${l}</span></td><td class="num"><button class="btn chico solo-gerente" data-entrada="${p.sku}" data-nombre="${esc(p.nombre)}"><i class="ti ti-truck-delivery"></i> Entrada</button></td></tr>`; }).join("")}
        </tbody></table></div>`;
    },

    async clientes() {
      const cs = await api("/clientes");
      return `<div class="card tabla"><table><thead><tr><th>Cliente</th><th>RFC</th><th>Teléfono</th><th class="num">Saldo por cobrar</th><th></th></tr></thead><tbody>
        ${cs.map((c) => `<tr><td><b>${esc(c.nombre)}</b></td><td>${esc(c.rfc)}</td><td>${esc(c.telefono) || '<span class="muted">—</span>'}</td>
          <td class="num">${c.saldo ? `<b style="color:var(--warn)">${mx(c.saldo)}</b>` : '<span class="muted">$0.00</span>'}</td>
          <td class="num">${c.saldo ? `<button class="btn chico" data-abono="${c.id}" data-saldo="${c.saldo}" data-nombre="${esc(c.nombre)}"><i class="ti ti-coin"></i> Abono</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>`;
    },

    async caja() {
      const c = await api("/caja");
      const por = (m) => c.porMetodo.find((x) => x.metodo === m)?.total || 0;
      const esperado = c.fondo + por("efectivo");
      return `<div class="grid2"><div class="card"><h3>Corte de caja · ${new Date().toLocaleDateString("es-MX", { dateStyle: "full" })}</h3>
        <ul class="lista"><li><span>Fondo inicial</span><b>${mx(c.fondo)}</b></li><li><span>Efectivo</span><b>${mx(por("efectivo"))}</b></li>
        <li><span>Tarjeta</span><b>${mx(por("tarjeta"))}</b></li><li><span>Transferencia</span><b>${mx(por("transferencia"))}</b></li><li><span>Crédito</span><b>${mx(por("credito"))}</b></li>
        <li><span><b>Efectivo esperado en caja</b></span><b class="grande-num">${mx(esperado)}</b></li></ul></div>
        <div class="card"><h3>Cerrar turno</h3>
          <div class="campo"><label for="contado">Efectivo contado</label><input class="in" id="contado" type="number" min="0" step="0.5" data-esperado="${esperado}" placeholder="0.00" /></div>
          <p id="difer" style="margin:10px 0;min-height:24px"></p>
          <button class="btn pri grande" id="hacerCorte"><i class="ti ti-lock"></i> Hacer corte</button>
          ${c.cortes.length ? `<h3 style="margin-top:18px">Cortes anteriores</h3><ul class="lista">${c.cortes.map((k) => `<li><span>${fechaCorta(k.fecha)} · ${esc(k.usuario)}</span><span class="tag ${k.diferencia === 0 ? "ok" : k.diferencia > 0 ? "warn" : "mal"}">${k.diferencia === 0 ? "Cuadró" : (k.diferencia > 0 ? "+" : "") + mx(k.diferencia)}</span></li>`).join("")}</ul>` : ""}
        </div></div>`;
    },

    async facturas() {
      const vs = (await api("/ventas")).filter((v) => !v.cancelada);
      return `<div class="card aviso"><i class="ti ti-info-circle"></i> Facturación simulada: genera un folio fiscal ficticio, no timbra ante el SAT.</div>
        <div class="card tabla"><table><thead><tr><th>Venta</th><th>Fecha</th><th>Cliente</th><th class="num">Total</th><th>Factura</th></tr></thead><tbody>
        ${vs.map((v) => `<tr><td><b>#${v.folio}</b></td><td>${fechaCorta(v.fecha)}</td><td>${esc(v.cliente)}</td><td class="num">${mx(v.total)}</td>
          <td>${v.facturada ? `<span class="tag ok" title="${v.uuid_factura || ""}">Facturada</span>` : `<button class="btn chico" data-facturar="${v.folio}"><i class="ti ti-file-invoice"></i> Facturar</button>`}</td></tr>`).join("")}
      </tbody></table></div>`;
    },
  };

  const filasProd = (lista) => lista.map((p) => `<tr><td>${p.emoji} <b>${esc(p.nombre)}</b></td><td class="muted">${p.sku}</td><td class="mono">${p.codigo_barras || ""}</td><td>${esc(p.categoria)}</td>
    <td class="num">${mx(p.costo)}</td><td class="num">${mx(p.precio)}</td><td class="num">${p.precio ? Math.round(((p.precio - p.costo) / p.precio) * 100) : 0}%</td><td class="num">${p.stock}</td></tr>`).join("");

  // ── Cobro ──────────────────────────────────────────────
  const pos = { q: "", cat: "Todos", carrito: [], metodo: "efectivo", cliente: 1, cats: [], productos: [], clientes: [] };
  function pintarProds() {
    const q = pos.q.toLowerCase();
    const lista = pos.productos.filter((p) => (pos.cat === "Todos" || p.categoria === pos.cat) && (!q || p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.codigo_barras || "").includes(q)));
    $("#prods").innerHTML = lista.map((p) => `<button class="prod ${p.stock <= 0 ? "agotado" : ""}" data-sku="${p.sku}" ${p.stock <= 0 ? "disabled" : ""}>
      <span class="em">${p.emoji}</span><b>${esc(p.nombre)}</b><span class="precio">${mx(p.precio)}</span><small>${p.stock <= 0 ? "Agotado" : p.stock + " en existencia"}</small></button>`).join("") || `<p class="muted">Sin resultados.</p>`;
  }
  function pintarTicket() {
    const it = pos.carrito;
    $("#items").innerHTML = it.length ? it.map((x, i) => `<div class="item ${x.flash ? "flash" : ""}"><span><b>${esc(x.nombre)}</b><br><small class="muted">${mx(x.precio)} c/u</small></span>
      <span class="cant"><button data-menos="${i}">−</button>${x.cantidad}<button data-mas="${i}">+</button></span><b>${mx(x.precio * x.cantidad)}</b></div>`).join("")
      : `<div class="vacio"><i class="ti ti-barcode"></i>Escanea un producto o tócalo para agregarlo</div>`;
    it.forEach((x) => (x.flash = false));
    const total = it.reduce((s, x) => s + x.precio * x.cantidad, 0), sub = total / (1 + IVA);
    $("#totales").innerHTML = `<div><span>Subtotal</span><span>${mx(sub)}</span></div><div><span>IVA 16%</span><span>${mx(total - sub)}</span></div><div class="total"><span>Total</span><span>${mx(total)}</span></div>`;
    $("#cobrar").disabled = !it.length;
  }
  function agregar(p) {
    if (!p) return toast("Producto no encontrado");
    const x = pos.carrito.find((c) => c.sku === p.sku);
    if ((x?.cantidad || 0) + 1 > p.stock) return toast("Sin más existencia de " + p.nombre);
    if (x) { x.cantidad++; x.flash = true; } else pos.carrito.unshift({ sku: p.sku, nombre: p.nombre, precio: p.precio, cantidad: 1, flash: true });
    beep();
    pintarTicket();
  }
  async function agregarPorCodigo(codigo) {
    const local = pos.productos.find((p) => p.codigo_barras === codigo || p.sku.toUpperCase() === codigo.toUpperCase());
    if (local) return agregar(local);
    try { agregar(await api("/productos/codigo/" + encodeURIComponent(codigo))); } catch (e) { toast(`Código ${codigo}: ${e.message}`); }
  }
  function cobrar() {
    if (!pos.carrito.length) return;
    const total = pos.carrito.reduce((s, x) => s + x.precio * x.cantidad, 0);
    const cli = pos.clientes.find((c) => c.id == pos.cliente);
    const sugeridos = [...new Set([total, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500])].slice(0, 4);
    const m = modal(`<h2>Cobrar ${mx(total)}</h2>
      ${pos.metodo === "efectivo" ? `<div class="campo"><label for="recibe">Efectivo recibido</label><input class="in grande-in" id="recibe" type="number" step="0.5" min="0" value="${sugeridos[1] || total}" />
        <div class="chips">${sugeridos.map((s) => `<button type="button" class="chip" data-recibe="${s}">${mx(s)}</button>`).join("")}</div></div><p class="cambio" id="cambio"></p>`
        : `<p class="muted">Método: <b>${pos.metodo}</b>${pos.metodo === "credito" ? ` · se cargará a <b>${esc(cli?.nombre)}</b>` : ""}</p>`}
      <div class="fila-botones"><button class="btn" id="cancelarCobro">Cancelar</button><button class="btn pri" id="confirmar"><i class="ti ti-check"></i> Confirmar venta</button></div>`);
    const rec = $("#recibe", m);
    const act = () => { if (!rec) return; const r = Number(rec.value || 0); $("#cambio", m).innerHTML = r >= total ? `Cambio <b>${mx(r - total)}</b>` : `<span style="color:var(--mal)">Faltan ${mx(total - r)}</span>`; $("#confirmar", m).disabled = r < total; };
    rec?.addEventListener("input", act); act(); rec?.select();
    m.addEventListener("click", (e) => { const b = e.target.closest("[data-recibe]"); if (b) { rec.value = b.dataset.recibe; act(); } });
    $("#cancelarCobro", m).onclick = cerrar;
    $("#confirmar", m).onclick = async () => {
      try {
        $("#confirmar", m).disabled = true;
        const v = await api("/ventas", { method: "POST", body: { cliente_id: pos.cliente, metodo: pos.metodo, recibido: Number(rec?.value || total), items: pos.carrito.map((x) => ({ sku: x.sku, cantidad: x.cantidad })) } });
        modal(`<div class="ok-grande"><i class="ti ti-check"></i></div><h2 style="text-align:center">Venta #${v.folio}</h2>
          <div class="recibo"><div><b>MOSTRADOR · Sucursal Centro</b></div><div><span>${new Date(v.fecha).toLocaleString("es-MX")}</span></div><div><span>Atendió: ${esc(v.cajero)}</span></div><hr>
          ${v.items.map((x) => `<div><span>${x.cantidad} × ${esc(x.nombre)}</span><span>${mx(x.precio * x.cantidad)}</span></div>`).join("")}<hr>
          <div><span>Subtotal</span><span>${mx(v.subtotal)}</span></div><div><span>IVA</span><span>${mx(v.iva)}</span></div><div><b>TOTAL</b><b>${mx(v.total)}</b></div>
          ${pos.metodo === "efectivo" ? `<div><span>Recibido</span><span>${mx(v.recibido)}</span></div><div><b>Cambio</b><b>${mx(v.cambio)}</b></div>` : `<div><span>Pago</span><span>${pos.metodo}</span></div>`}</div>
          <button class="btn pri grande" id="nueva"><i class="ti ti-plus"></i> Nueva venta <kbd>Enter</kbd></button>`);
        $("#nueva").focus();
        $("#nueva").onclick = async () => { cerrar(); pos.carrito = []; pos.cliente = 1; await render("pos"); };
      } catch (e) { toast(e.message); $("#confirmar", m).disabled = false; }
    };
  }

  // Escáner por cámara (BarcodeDetector: Chrome/Edge)
  let stream = null, lazo = null;
  function detenerCamara() { cancelAnimationFrame(lazo); stream?.getTracks().forEach((t) => t.stop()); stream = null; }
  async function abrirCamara() {
    if (!("BarcodeDetector" in window)) return toast("Este navegador no soporta escaneo con cámara; usa Chrome o Edge, o un lector USB");
    const m = modal(`<h2>Escanear con cámara</h2><video id="video" class="video" playsinline muted></video><p class="muted">Apunta al código de barras del producto.</p><button class="btn" id="cerrarCam">Cerrar</button>`);
    $("#cerrarCam", m).onclick = cerrar;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const video = $("#video", m); video.srcObject = stream; await video.play();
      const det = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "code_128", "qr_code"] });
      let ultimo = "";
      const leer = async () => {
        try { const [c] = await det.detect(video); if (c && c.rawValue !== ultimo) { ultimo = c.rawValue; await agregarPorCodigo(c.rawValue); setTimeout(() => (ultimo = ""), 1500); } } catch { /* frame sin código */ }
        if (stream) lazo = requestAnimationFrame(leer);
      };
      leer();
    } catch { toast("No se pudo abrir la cámara"); cerrar(); }
  }

  // Lector USB/Bluetooth = teclado muy rápido + Enter. Se captura en la pantalla
  // de cobro aunque el foco no esté en el campo.
  let buffer = "", ultimaTecla = 0;
  window.addEventListener("keydown", (e) => {
    if (vistaActual !== "pos" || !$("#modal").hidden) return;
    if (e.key === "F12") { e.preventDefault(); return cobrar(); }
    const enCampo = e.target.matches?.("input, select, textarea") && e.target.id !== "buscaProd";
    if (enCampo) return;
    const t = performance.now();
    if (t - ultimaTecla > 60) buffer = "";
    ultimaTecla = t;
    if (e.key === "Enter") {
      const cod = (buffer || ($("#buscaProd")?.value || "")).trim();
      buffer = "";
      if (cod.length >= 3) { e.preventDefault(); $("#buscaProd").value = ""; pos.q = ""; pintarProds(); agregarPorCodigo(cod); $("#lector").classList.add("leyendo"); setTimeout(() => $("#lector").classList.remove("leyendo"), 300); }
    } else if (e.key.length === 1) buffer += e.key;
  });

  // ── Copiloto (agente IA) ───────────────────────────────
  const chat = { msgs: [], ocupado: false };
  async function preguntar(texto) {
    texto = String(texto || "").trim();
    if (!texto || chat.ocupado) return;
    chat.ocupado = true;
    chat.msgs.push({ role: "user", content: texto });
    const cont = $("#chatMsgs");
    cont.insertAdjacentHTML("beforeend", `<div class="msg tu"><p>${esc(texto)}</p></div><div class="msg ia pensando" id="pensando"><span class="ia-ico"><i class="ti ti-sparkles"></i></span><div><b>Copiloto</b><p><span class="dots"><i></i><i></i><i></i></span> Analizando tus datos…</p></div></div>`);
    cont.scrollTop = cont.scrollHeight;
    $("#chatIn").value = "";
    try {
      const r = await api("/agente", { method: "POST", body: { messages: chat.msgs.slice(-12) } });
      chat.msgs.push({ role: "assistant", content: r.respuesta });
      $("#pensando").outerHTML = `<div class="msg ia"><span class="ia-ico"><i class="ti ti-sparkles"></i></span><div><b>Copiloto</b><p>${esc(r.respuesta).replace(/\n/g, "<br>").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</p>
        ${r.propuesta?.lineas?.length ? `<div class="propuesta"><b>Orden de compra propuesta · ${mx(r.propuesta.costo_estimado)}</b>
          ${r.propuesta.lineas.map((l) => `<div><span>${esc(l.nombre)}</span><span>+${l.cantidad} pzas</span></div>`).join("")}
          <button class="btn pri chico solo-gerente" data-aplicar='${esc(JSON.stringify(r.propuesta.lineas.map((l) => ({ sku: l.sku, cantidad: l.cantidad }))))}'><i class="ti ti-truck-delivery"></i> Aplicar orden (registrar entrada)</button></div>` : ""}</div></div>`;
    } catch (e) {
      chat.msgs.pop();
      $("#pensando").outerHTML = `<div class="msg ia"><span class="ia-ico"><i class="ti ti-alert-triangle"></i></span><div><p>${esc(e.message)}</p></div></div>`;
    } finally {
      chat.ocupado = false;
      cont.scrollTop = cont.scrollHeight;
    }
  }

  // ── Navegación y eventos ───────────────────────────────
  const TITULOS = { inicio: "Inicio", pos: "Cobrar", copiloto: "Copiloto IA", ventas: "Ventas", productos: "Productos", inventario: "Inventario", clientes: "Clientes", caja: "Corte de caja", facturas: "Facturación" };
  let vistaActual = "inicio";
  async function render(v) {
    if (!TITULOS[v]) v = "inicio";
    vistaActual = v;
    document.querySelectorAll("#menu a").forEach((a) => a.classList.toggle("on", a.dataset.v === v));
    $("#titulo").textContent = TITULOS[v];
    history.replaceState(null, "", "#" + v);
    $("#vista").innerHTML = `<div class="cargando"><i class="ti ti-loader-2 gira"></i></div>`;
    try {
      $("#vista").innerHTML = await vistas[v]();
      if (v === "pos") { pintarProds(); pintarTicket(); $("#buscaProd").focus(); }
      if (v === "copiloto") { for (const m of chat.msgs) $("#chatMsgs").insertAdjacentHTML("beforeend", m.role === "user" ? `<div class="msg tu"><p>${esc(m.content)}</p></div>` : `<div class="msg ia"><span class="ia-ico"><i class="ti ti-sparkles"></i></span><div><p>${esc(m.content).replace(/\n/g, "<br>")}</p></div></div>`); $("#chatIn").focus(); }
    } catch (e) { $("#vista").innerHTML = `<div class="card aviso"><i class="ti ti-alert-circle"></i> ${esc(e.message)}</div>`; }
  }
  $("#menu").addEventListener("click", (e) => { const a = e.target.closest("a[data-v]"); if (a) render(a.dataset.v); });
  $("#reiniciar").onclick = async () => { try { await api("/demo/reiniciar", { method: "POST" }); pos.carrito = []; chat.msgs = []; toast("Datos de demo reiniciados"); render("inicio"); } catch (e) { toast(e.message); } };

  $("#vista").addEventListener("click", async (e) => {
    const t = e.target.closest("button"); if (!t) return;
    try {
      if (t.dataset.ir) render(t.dataset.ir);
      else if (t.dataset.sku) agregar(pos.productos.find((p) => p.sku === t.dataset.sku));
      else if (t.dataset.cat) { pos.cat = t.dataset.cat; document.querySelectorAll(".chips .chip").forEach((c) => c.classList.toggle("on", c.dataset.cat === pos.cat)); pintarProds(); }
      else if (t.dataset.mas) { const x = pos.carrito[t.dataset.mas]; const p = pos.productos.find((q) => q.sku === x.sku); if (x.cantidad < p.stock) x.cantidad++; else toast("Sin más existencia"); pintarTicket(); }
      else if (t.dataset.menos) { const i = +t.dataset.menos; if (--pos.carrito[i].cantidad <= 0) pos.carrito.splice(i, 1); pintarTicket(); }
      else if (t.dataset.metodo) { pos.metodo = t.dataset.metodo; document.querySelectorAll(".metodo").forEach((m) => m.classList.toggle("on", m.dataset.metodo === pos.metodo)); }
      else if (t.id === "cobrar") cobrar();
      else if (t.id === "camara") abrirCamara();
      else if (t.dataset.pregunta) preguntar(t.dataset.pregunta);
      else if (t.dataset.aplicar) { await api("/inventario/entradas", { method: "POST", body: { lineas: JSON.parse(t.dataset.aplicar), referencia: "Orden sugerida por Copiloto" } }); t.disabled = true; t.textContent = "Orden aplicada ✓"; toast("Inventario actualizado"); }
      else if (t.dataset.cancelar) { await api(`/ventas/${t.dataset.cancelar}/cancelar`, { method: "POST" }); toast(`Venta #${t.dataset.cancelar} cancelada; inventario devuelto`); render("ventas"); }
      else if (t.dataset.facturar) { const r = await api(`/ventas/${t.dataset.facturar}/facturar`, { method: "POST" }); toast("Factura generada · " + r.uuid.slice(0, 8)); render("facturas"); }
      else if (t.dataset.entrada) {
        const m = modal(`<h2>Entrada de mercancía</h2><p class="muted">${esc(t.dataset.nombre)}</p><div class="campo"><label for="cantEnt">Piezas recibidas</label><input class="in" id="cantEnt" type="number" min="1" value="24" /></div><button class="btn pri grande" id="okEnt">Registrar entrada</button>`);
        $("#okEnt", m).onclick = async () => { try { await api("/inventario/entradas", { method: "POST", body: { lineas: [{ sku: t.dataset.entrada, cantidad: $("#cantEnt", m).value }] } }); cerrar(); toast("Entrada registrada"); render("inventario"); } catch (er) { toast(er.message); } };
      } else if (t.dataset.abono) {
        const m = modal(`<h2>Abono de ${esc(t.dataset.nombre)}</h2><p class="muted">Saldo: ${mx(t.dataset.saldo)}</p><div class="campo"><label for="montoAb">Monto</label><input class="in" id="montoAb" type="number" min="1" value="${t.dataset.saldo}" /></div><button class="btn pri grande" id="okAb">Registrar abono</button>`);
        $("#okAb", m).onclick = async () => { try { await api(`/clientes/${t.dataset.abono}/abonos`, { method: "POST", body: { monto: $("#montoAb", m).value } }); cerrar(); toast("Abono registrado"); render("clientes"); } catch (er) { toast(er.message); } };
      } else if (t.id === "nuevoProd") {
        const m = modal(`<h2>Nuevo producto</h2>
          <div class="campo"><label for="npN">Nombre</label><input class="in" id="npN" maxlength="80" /></div>
          <div class="dos"><div class="campo"><label for="npP">Precio</label><input class="in" id="npP" type="number" min="0" step="0.5" /></div><div class="campo"><label for="npK">Costo</label><input class="in" id="npK" type="number" min="0" step="0.5" /></div></div>
          <div class="dos"><div class="campo"><label for="npC">Categoría</label><input class="in" id="npC" value="Abarrotes" maxlength="30" /></div><div class="campo"><label for="npS">Existencia</label><input class="in" id="npS" type="number" min="0" value="0" /></div></div>
          <div class="campo"><label for="npB">Código de barras (opcional: escanéalo aquí)</label><input class="in" id="npB" maxlength="40" /></div>
          <button class="btn pri grande" id="okNp">Guardar producto</button>`);
        $("#okNp", m).onclick = async () => { try { await api("/productos", { method: "POST", body: { nombre: $("#npN", m).value, precio: $("#npP", m).value, costo: $("#npK", m).value, categoria: $("#npC", m).value, stock: $("#npS", m).value, codigo_barras: $("#npB", m).value } }); cerrar(); toast("Producto creado"); render("productos"); } catch (er) { toast(er.message); } };
      } else if (t.id === "hacerCorte") {
        const v = $("#contado").value;
        if (v === "") return toast("Captura el efectivo contado");
        const r = await api("/caja/corte", { method: "POST", body: { contado: v } });
        toast(r.diferencia === 0 ? "Corte registrado: cuadró exacto" : `Corte registrado: ${r.diferencia > 0 ? "sobrante" : "faltante"} ${mx(Math.abs(r.diferencia))}`);
        render("caja");
      }
    } catch (er) { toast(er.message); }
  });
  $("#vista").addEventListener("submit", (e) => { if (e.target.id === "chatForm") { e.preventDefault(); preguntar($("#chatIn").value); } });
  $("#vista").addEventListener("input", (e) => {
    if (e.target.id === "buscaProd") { pos.q = e.target.value; pintarProds(); }
    if (e.target.id === "filtroProd") { const q = e.target.value.toLowerCase(); $("#tablaProd").innerHTML = filasProd(pos.productos.filter((p) => p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.codigo_barras || "").includes(q))); }
    if (e.target.id === "contado") { const d = Number(e.target.value || 0) - Number(e.target.dataset.esperado); $("#difer").innerHTML = d === 0 ? '<span class="tag ok">Cuadra exacto</span>' : d > 0 ? `<span class="tag warn">Sobrante ${mx(d)}</span>` : `<span class="tag mal">Faltante ${mx(-d)}</span>`; }
  });
  $("#vista").addEventListener("change", (e) => { if (e.target.id === "clienteVenta") pos.cliente = e.target.value; });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cerrar();
    if (e.key === "Enter" && document.activeElement?.id === "nueva") document.activeElement.click();
  });

  mostrarSesion();
  if (token) render(location.hash.slice(1) || "inicio");
})();
