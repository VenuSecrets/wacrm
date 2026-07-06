/* ============================================================
   DIÁLOGO PERSONALIZADO (reemplaza alert / confirm / prompt nativos)
   ============================================================ */
function _dlg({ icono = "", mensaje, tipo = "alerta", placeholder = "" }){
  return new Promise(resolve => {
    document.getElementById("dlgIcono").textContent = icono;
    document.getElementById("dlgMsg").textContent = mensaje;
    const inp  = document.getElementById("dlgInput");
    const foot = document.getElementById("dlgFoot");
    foot.innerHTML = "";

    if(tipo === "prompt"){
      inp.style.display = "block";
      inp.placeholder = placeholder || "";
      inp.value = "";
      inp.onkeydown = e => { if(e.key === "Enter") cerrar(inp.value); };
      setTimeout(() => inp.focus(), 60);
    } else {
      inp.style.display = "none";
      inp.onkeydown = null;
    }

    const cerrar = val => {
      document.getElementById("overlayDialog").classList.remove("abierto");
      resolve(val);
    };

    if(tipo === "confirm" || tipo === "prompt"){
      const bCan = document.createElement("button");
      bCan.className = "btn btn-descartar"; bCan.textContent = "Cancelar";
      bCan.onclick = () => cerrar(tipo === "prompt" ? null : false);
      foot.appendChild(bCan);
    }

    const bOk = document.createElement("button");
    bOk.className = "btn btn-guardar"; bOk.textContent = "Aceptar";
    bOk.onclick = () => cerrar(tipo === "prompt" ? inp.value : true);
    foot.appendChild(bOk);

    document.getElementById("overlayDialog").classList.add("abierto");
  });
}
const dlgAlerta  = (msg, icono = "⚠️")  => _dlg({ icono, mensaje: msg, tipo: "alerta" });
const dlgError   = (msg)                 => _dlg({ icono: "❌", mensaje: msg, tipo: "alerta" });
const dlgConfirm = (msg, icono = "❓")  => _dlg({ icono, mensaje: msg, tipo: "confirm" });
const dlgPrompt  = (msg, placeholder="") => _dlg({ icono: "✏️", mensaje: msg, tipo: "prompt", placeholder });

/* ============================================================
   ESTADO GLOBAL
   ============================================================ */
let sb;
let CLIENTES = [], SERVICIOS = [], SERVICIOS_MAP = {}, TRABAJADORAS = [];
let SELECTED = new Date();              // dia mostrado
let MINI = new Date();                  // mes del mini-calendario
let VISTA = "dia";                      // 'dia' | 'semana' | 'mes'
let TRAB_OCULTAS = new Set();           // ids de trabajadoras ocultas (vista dia)
let ES_ADMIN = false;                   // true = puede editar; false = solo lectura
let VISTA_CANCELADAS = "normal";        // "normal" = agenda | "canceladas" = solo canceladas

// Configuracion de horario operativo (estado reactivo)
let CONFIG = cargarConfig();
let PXMIN = 1;                          // px por minuto: se recalcula para llenar la pantalla

function cargarConfig(){
  try{
    const raw = localStorage.getItem("venesecrets_config");
    if(raw) return Object.assign({}, DEFAULT_CONFIG, JSON.parse(raw));
  }catch(e){}
  return Object.assign({}, DEFAULT_CONFIG);
}
function guardarConfigLS(){ try{ localStorage.setItem("venesecrets_config", JSON.stringify(CONFIG)); }catch(e){} }

// Helpers de horario (todo en minutos absolutos desde medianoche)
function parseHM(t){ if(!t) return 0; const p=String(t).split(":"); return (parseInt(p[0],10)||0)*60 + (parseInt(p[1],10)||0); }
function apMin(){ return parseHM(CONFIG.horaApertura); }
function ciMin(){ return parseHM(CONFIG.horaCierre); }
function gridMin(){ return Math.max(60, ciMin() - apMin()); }   // al menos 1h de rango
function gridPx(){ return gridMin() * PXMIN; }

// Recalcula la escala para que el rango apertura->cierre llene el alto disponible
function calcularEscala(){
  const cont = document.getElementById("diaScroll");
  const disp = (cont && cont.clientHeight) ? cont.clientHeight : (window.innerHeight - 160);
  PXMIN = Math.max(0.8, (disp - 2) / gridMin());   // minimo 48px/hora para legibilidad
}

function configOk(){
  return SUPABASE_URL && SUPABASE_ANON_KEY &&
         !SUPABASE_URL.includes("PEGA_AQUI") && !SUPABASE_ANON_KEY.includes("PEGA_AQUI");
}

document.addEventListener("DOMContentLoaded", async () => {
  if(!configOk()){
    document.getElementById("avisoConfig").innerHTML =
      '<div class="aviso">⚠️ Falta configurar. Abre este archivo con el Bloc de notas y pega tu ' +
      '<b>Project URL</b> y tu <b>anon key</b> arriba (donde dice PEGA_AQUI…). Guarda y recarga.</div>';
    document.getElementById("estadoConexion").textContent = "Sin configurar";
    return;
  }
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ¿Hay sesión iniciada?
  const { data:{ session } } = await sb.auth.getSession();
  if(session){ await arrancarApp(); }
  else { mostrarLogin(); }
});

/* ============================================================
   LOGIN / ROLES
   ============================================================ */
function mostrarLogin(){
  const bg = document.getElementById("loginBg");
  if(bg) bg.style.display = "flex";
  document.getElementById("layout").style.display = "none";
  const sal = document.getElementById("btnSalir"); if(sal) sal.style.display = "none";
  const mBtn = document.getElementById("menuBtn"); if(mBtn) mBtn.style.display = "none";
  document.getElementById("estadoConexion").textContent = "";
}

async function hacerLogin(){
  const email = document.getElementById("loginEmail").value.trim();
  const pass  = document.getElementById("loginPass").value;
  const err   = document.getElementById("loginError");
  err.textContent = "";
  if(!email || !pass){ err.textContent = "Escribe usuario y contraseña."; return; }
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if(error){ err.textContent = "Usuario o contraseña incorrectos."; return; }
  document.getElementById("loginPass").value = "";
  const bg = document.getElementById("loginBg"); if(bg) bg.style.display = "none";
  await arrancarApp();
}

async function cerrarSesion(){
  await sb.auth.signOut();
  location.reload();
}

async function arrancarApp(){
  const bg = document.getElementById("loginBg"); if(bg) bg.style.display = "none";

  // ¿Quién entró? Solo el correo admin puede editar
  const { data:{ user } } = await sb.auth.getUser();
  // Admite varios correos administradores (lista CORREOS_ADMIN en config.js),
  // con retrocompatibilidad al antiguo CORREO_ADMIN único.
  const _admins = (typeof CORREOS_ADMIN !== "undefined" && Array.isArray(CORREOS_ADMIN))
    ? CORREOS_ADMIN
    : (typeof CORREO_ADMIN !== "undefined" ? [CORREO_ADMIN] : []);
  ES_ADMIN = !!(user && user.email &&
                _admins.map(e => String(e).trim().toLowerCase())
                       .includes(user.email.toLowerCase()));
  document.body.classList.toggle("solo-lectura", !ES_ADMIN);
  const sal = document.getElementById("btnSalir"); if(sal) sal.style.display = "inline-flex";
  const btnVista = document.getElementById("btnVista"); if(btnVista) btnVista.style.display = "inline-flex";
  const mBtn = document.getElementById("menuBtn"); if(mBtn) mBtn.style.display = "flex";

  SELECTED = new Date(); MINI = new Date();
  await cargarCatalogos();
  document.getElementById("layout").style.display = "flex";
  document.getElementById("estadoConexion").textContent =
    ES_ADMIN ? "Conectado · puede editar ✓" : "Solo lectura 👁️";
  construirEje();
  renderMini();
  renderFiltroTrab();
  aplicarVistaDOM();
  await loadDay();
  setInterval(renderNowLine, 60000);   // refresca el indicador de hora cada minuto
}

// Al redimensionar la ventana, recalcula la escala para que el grid siga llenando la pantalla
let resizeTimer = null;
window.addEventListener("resize", () => {
  if(VISTA === "mes") return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => loadDay(), 150);
});

/* ============================================================
   MODAL DE AJUSTES DE HORARIO
   ============================================================ */
function abrirConfig(){
  document.getElementById("cfgApertura").value = CONFIG.horaApertura;
  document.getElementById("cfgCierre").value = CONFIG.horaCierre;
  document.getElementById("cfgTieneDescanso").checked = !!CONFIG.tieneDescanso;
  document.getElementById("cfgInicioDescanso").value = CONFIG.inicioDescanso;
  document.getElementById("cfgFinDescanso").value = CONFIG.finDescanso;
  toggleDescansoFields();
  document.getElementById("overlayConfig").classList.add("abierto");
}
function cerrarConfig(){ document.getElementById("overlayConfig").classList.remove("abierto"); }
function toggleDescansoFields(){
  const on = document.getElementById("cfgTieneDescanso").checked;
  document.getElementById("cfgDescansoBox").style.opacity = on ? "1" : ".4";
  document.getElementById("cfgInicioDescanso").disabled = !on;
  document.getElementById("cfgFinDescanso").disabled = !on;
}
async function guardarConfig(){
  const ap = document.getElementById("cfgApertura").value || DEFAULT_CONFIG.horaApertura;
  const ci = document.getElementById("cfgCierre").value || DEFAULT_CONFIG.horaCierre;
  if(parseHM(ci) <= parseHM(ap)){ await dlgAlerta("La hora de cierre debe ser posterior a la de apertura."); return; }

  const tiene = document.getElementById("cfgTieneDescanso").checked;
  const di = document.getElementById("cfgInicioDescanso").value || DEFAULT_CONFIG.inicioDescanso;
  const df = document.getElementById("cfgFinDescanso").value || DEFAULT_CONFIG.finDescanso;
  if(tiene){
    if(parseHM(df) <= parseHM(di)){ await dlgAlerta("El fin del descanso debe ser posterior a su inicio."); return; }
    if(parseHM(di) < parseHM(ap) || parseHM(df) > parseHM(ci)){ await dlgAlerta("El descanso debe estar dentro del horario de apertura y cierre."); return; }
  }

  CONFIG = { horaApertura:ap, horaCierre:ci, tieneDescanso:tiene, inicioDescanso:di, finDescanso:df };
  guardarConfigLS();
  cerrarConfig();
  loadDay();   // re-render instantaneo con el nuevo horario
}

/* ============================================================
   EMPLEADOS Y TURNOS (gestion de trabajadoras)
   ============================================================ */
let EMP_ADMIN = [];
async function abrirEmpleados(){
  document.getElementById("empNuevoNombre").value = "";
  document.getElementById("empLista").innerHTML = '<div style="color:var(--muted);font-size:13px">Cargando…</div>';
  document.getElementById("overlayEmpleados").classList.add("abierto");
  const { data, error } = await sb.from("trabajadoras").select("*").order("orden");
  if(error){ document.getElementById("empLista").innerHTML = '<div style="color:#991b1b;font-size:13px">Error: '+escapeHtml(error.message)+'</div>'; return; }
  EMP_ADMIN = data || [];
  renderEmpLista();
}
function cerrarEmpleados(){ document.getElementById("overlayEmpleados").classList.remove("abierto"); }

function renderEmpLista(){
  const cont = document.getElementById("empLista");
  if(!EMP_ADMIN.length){ cont.innerHTML = '<div style="color:var(--muted);font-size:13px">Sin empleados todavía. Añade el primero arriba.</div>'; return; }
  cont.innerHTML = EMP_ADMIN.map(t => {
    const hm = v => v ? String(v).slice(0,5) : "";
    return `<div class="emp-card${t.activo?'':' inactivo'}">
      <div class="emp-row">
        <input type="color" class="emp-color" id="emp_color_${t.id}" value="${t.color||'#7c6ff0'}" title="Color">
        <input type="text" class="emp-nombre" id="emp_nombre_${t.id}" value="${escapeHtml(t.nombre||'')}" placeholder="Nombre del empleado">
        <label class="emp-activo"><input type="checkbox" id="emp_activo_${t.id}" ${t.activo?'checked':''}> Activo</label>
      </div>
      <div class="emp-grid">
        <div><label>Entrada</label><input type="time" id="emp_ini_${t.id}" value="${hm(t.hora_inicio)}"></div>
        <div><label>Salida</label><input type="time" id="emp_fin_${t.id}" value="${hm(t.hora_fin)}"></div>
        <div><label>Descanso ini.</label><input type="time" id="emp_dini_${t.id}" value="${hm(t.descanso_inicio)}"></div>
        <div><label>Descanso fin</label><input type="time" id="emp_dfin_${t.id}" value="${hm(t.descanso_fin)}"></div>
      </div>
      <div class="emp-actions">
        <button type="button" class="btn btn-eliminar" onclick="eliminarEmpleado('${t.id}')">Eliminar</button>
        <button type="button" class="btn btn-guardar" onclick="guardarEmpleado('${t.id}')">Guardar</button>
      </div>
    </div>`;
  }).join("");
}

async function guardarEmpleado(id){
  const g = sufijo => document.getElementById("emp_"+sufijo+"_"+id);
  const nombre = g("nombre").value.trim();
  if(!nombre){ await dlgAlerta("El empleado necesita un nombre."); return; }
  const ini = g("ini").value, fin = g("fin").value;
  if(ini && fin && parseHM(fin) <= parseHM(ini)){ await dlgAlerta("La salida debe ser posterior a la entrada."); return; }
  const fila = {
    nombre,
    color: g("color").value,
    activo: g("activo").checked,
    hora_inicio: ini || null,
    hora_fin: fin || null,
    descanso_inicio: g("dini").value || null,
    descanso_fin: g("dfin").value || null
  };
  const { error } = await sb.from("trabajadoras").update(fila).eq("id", id);
  if(error){ await dlgError("Error al guardar: "+error.message); return; }
  await refrescarTrasEmpleados();
}

async function nuevoEmpleado(){
  if(!ES_ADMIN) return;
  const nombre = document.getElementById("empNuevoNombre").value.trim() || "Nuevo empleado";
  const orden = EMP_ADMIN.length ? Math.max(...EMP_ADMIN.map(t => t.orden||0)) + 1 : 0;
  const fila = { nombre, activo:true, color:"#7c6ff0", orden,
                 hora_inicio:CONFIG.horaApertura, hora_fin:CONFIG.horaCierre };
  const { error } = await sb.from("trabajadoras").insert(fila);
  if(error){ await dlgError("Error al crear empleado: "+error.message); return; }
  document.getElementById("empNuevoNombre").value = "";
  await refrescarTrasEmpleados();
}

async function eliminarEmpleado(id){
  if(!await dlgConfirm("¿Eliminar este empleado?\nSi tiene citas asociadas, mejor desmárcalo como «Activo» en su lugar.", "🗑️")) return;
  const { error } = await sb.from("trabajadoras").delete().eq("id", id);
  if(error){ await dlgError("No se pudo eliminar (probablemente tiene citas). Desmárcalo como «Activo».\n\n"+error.message); return; }
  await refrescarTrasEmpleados();
}

// Recarga catalogos y refresca la lista del modal + el calendario y el filtro
async function refrescarTrasEmpleados(){
  await cargarCatalogos();
  const { data } = await sb.from("trabajadoras").select("*").order("orden");
  EMP_ADMIN = data || [];
  renderEmpLista();
  renderFiltroTrab();
  loadDay();
}

/* ============================================================
   VISTAS (Dia / Semana / Mes)
   ============================================================ */
function cambiarVista(v){
  VISTA = v;
  aplicarVistaDOM();
  loadDay();
}
// Muestra/oculta los contenedores y el filtro segun la vista activa
function aplicarVistaDOM(){
  const esMes = VISTA === "mes";
  document.getElementById("diaScroll").style.display = esMes ? "none" : "block";
  document.querySelector(".dia-header").style.display = esMes ? "none" : "flex";
  document.getElementById("mesView").style.display = esMes ? "flex" : "none";
  document.getElementById("filtroTrab").style.display = (VISTA === "dia") ? "block" : "none";
}
// Navegacion con flechas, dependiente de la vista
function navMover(dir){
  if(VISTA === "dia")      SELECTED.setDate(SELECTED.getDate() + dir);
  else if(VISTA === "semana") SELECTED.setDate(SELECTED.getDate() + dir*7);
  else                     SELECTED.setMonth(SELECTED.getMonth() + dir);
  MINI = new Date(SELECTED.getFullYear(), SELECTED.getMonth(), 1);
  renderMini();
  loadDay();
}
// Lunes de la semana que contiene a una fecha
function lunesDe(date){
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const off = (d.getDay()+6)%7;            // lunes=0
  d.setDate(d.getDate()-off);
  return d;
}

/* ============================================================
   CATALOGOS
   ============================================================ */
async function cargarCatalogos(){
  const { data: cli } = await sb.from("clientes").select("id,nombre,telefono,email").order("nombre");
  CLIENTES = cli || [];
  const { data: serv } = await sb.from("servicios").select("id,nombre,duracion_minutos,precio,color,activo").eq("activo",true).order("nombre");
  SERVICIOS = serv || [];
  SERVICIOS_MAP = {}; SERVICIOS.forEach(s => SERVICIOS_MAP[s.id]=s);
  const { data: trab } = await sb.from("trabajadoras").select("*").eq("activo",true).order("orden");
  TRABAJADORAS = trab || [];
  pintarSelectServicios(); pintarSelectTrabajadoras();
}
function pintarSelectClientes(filtro=""){
  const sel = document.getElementById("selCliente");
  const f = filtro.trim().toLowerCase();
  const lista = CLIENTES.filter(c => !f || c.nombre.toLowerCase().includes(f));
  sel.innerHTML = '<option value="">— Selecciona un cliente —</option>' +
    lista.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}${c.telefono?" · "+escapeHtml(c.telefono):""}${c.email?" · "+escapeHtml(c.email):""}</option>`).join("");
}
function filtrarClientes(){ pintarSelectClientes(document.getElementById("filtroCliente").value); }
function pintarSelectServicios(){
  document.getElementById("selServicio").innerHTML = '<option value="">— Selecciona un servicio —</option>' +
    SERVICIOS.map(s => `<option value="${s.id}">${escapeHtml(s.nombre)} (${s.duracion_minutos} min)</option>`).join("");
}
function pintarSelectTrabajadoras(){
  document.getElementById("selTrabajadora").innerHTML = '<option value="">— Sin asignar —</option>' +
    TRABAJADORAS.map(t => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join("");
}

/* ============================================================
   SIDEBAR: empleados, acordeones y saltos por semana
   ============================================================ */
function saltarSemanas(n){ moverDia(n*7); }

/* ============================================================
   BUSCADOR DE CLIENTES AGENDADOS
   ============================================================ */
let buscarTimer = null;
function toggleBuscador(){
  const b = document.getElementById("buscador");
  const abierto = b.classList.toggle("abierto");
  if(abierto) setTimeout(() => document.getElementById("buscadorInput").focus(), 30);
}
// Cerrar el buscador al hacer clic fuera
document.addEventListener("mousedown", e => {
  const b = document.getElementById("buscador");
  if(b && b.classList.contains("abierto") && !b.contains(e.target)) b.classList.remove("abierto");
});

function buscarAgendados(){
  clearTimeout(buscarTimer);
  buscarTimer = setTimeout(ejecutarBusqueda, 250);   // pequeño debounce
}
async function ejecutarBusqueda(){
  const cont = document.getElementById("buscadorRes");
  const q = document.getElementById("buscadorInput").value.trim();
  if(q.length < 2){
    cont.innerHTML = '<div class="buscador-hint">Escribe al menos 2 letras del nombre del cliente.</div>';
    return;
  }
  // Clientes cuyo nombre coincide
  const ids = CLIENTES.filter(c => c.nombre.toLowerCase().includes(q.toLowerCase())).map(c => c.id);
  if(!ids.length){
    cont.innerHTML = '<div class="buscador-hint">Ningún cliente coincide con “'+escapeHtml(q)+'”.</div>';
    return;
  }
  cont.innerHTML = '<div class="buscador-hint">Buscando citas…</div>';
  const { data, error } = await sb.from("citas")
    .select("id,inicio,fin,notas,estado,cliente_id,servicio_id,trabajadora_id,clientes(nombre),servicios(nombre,color)")
    .in("cliente_id", ids)
    .order("inicio", { ascending:false })
    .limit(40);
  if(error){ cont.innerHTML = '<div class="buscador-hint">Error: '+escapeHtml(error.message)+'</div>'; return; }
  if(!data || !data.length){
    cont.innerHTML = '<div class="buscador-hint">El cliente no tiene citas agendadas.</div>';
    return;
  }
  const dias = ["dom","lun","mar","mié","jue","vie","sáb"];
  const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  cont.innerHTML = data.map((c,i) => {
    const d = new Date(c.inicio);
    const nom = c.clientes ? c.clientes.nombre : "Cliente";
    const serv = c.servicios ? c.servicios.nombre : "";
    const fecha = `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()} · ${fmt(d)}`;
    const canc = c.estado==="cancelado" ? " cancelado" : "";
    return `<div class="res-item" onclick="irACita(${i})">
        <span class="punto">${escapeHtml((nom[0]||'?').toUpperCase())}</span>
        <div class="res-info">
          <div class="res-cli">${escapeHtml(nom)}</div>
          <div class="res-meta${canc}">${fecha}${serv?" · "+escapeHtml(serv):""}</div>
        </div>
      </div>`;
  }).join("");
  RESULTADOS_BUSQUEDA = data;
}
let RESULTADOS_BUSQUEDA = [];
function irACita(i){
  const c = RESULTADOS_BUSQUEDA[i]; if(!c) return;
  const d = new Date(c.inicio);
  document.getElementById("buscador").classList.remove("abierto");
  SELECTED = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  MINI = new Date(d.getFullYear(), d.getMonth(), 1);
  VISTA = "dia";
  document.getElementById("viewSelect").value = "dia";
  aplicarVistaDOM();
  renderMini();
  Promise.resolve(loadDay()).then(() => abrirModalEditar(c));
}

/* ============================================================
   EJE HORARIO + MINI CALENDARIO
   ============================================================ */
function construirEje(){
  const eje = document.getElementById("eje");
  eje.style.height = gridPx() + "px";
  const desde = Math.ceil(apMin()/60), hasta = Math.floor(ciMin()/60);
  let html = "";
  for(let h=desde; h<=hasta; h++){
    html += `<div class="h" style="top:${gridTop(h*60)}px">${String(h).padStart(2,"0")}:00</div>`;
  }
  eje.innerHTML = html;
}

function miniMover(n){ MINI.setMonth(MINI.getMonth()+n); renderMini(); }
function renderMini(){
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  document.getElementById("miniMes").textContent = meses[MINI.getMonth()] + " " + MINI.getFullYear();
  const y = MINI.getFullYear(), m = MINI.getMonth();
  const primero = new Date(y,m,1);
  let offset = (primero.getDay()+6)%7;            // lunes=0
  const inicio = new Date(y,m,1-offset);
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  let html = "";
  for(let semana=0; semana<6; semana++){
    html += "<tr>";
    for(let d=0; d<7; d++){
      const fecha = new Date(inicio); fecha.setDate(inicio.getDate()+semana*7+d);
      const otro = fecha.getMonth()!==m;
      const esHoy = fecha.getTime()===hoy.getTime();
      const esSel = sameDay(fecha, SELECTED);
      const cls = ["d"]; if(otro)cls.push("otro"); if(esHoy)cls.push("hoy"); if(esSel)cls.push("sel");
      html += `<td><span class="${cls.join(' ')}" onclick="elegirDia(${fecha.getFullYear()},${fecha.getMonth()},${fecha.getDate()})">${fecha.getDate()}</span></td>`;
    }
    html += "</tr>";
  }
  document.getElementById("miniBody").innerHTML = html;
}
function elegirDia(y,m,d){ SELECTED = new Date(y,m,d); MINI = new Date(y,m,1); renderMini(); loadDay(); }
function irHoy(){ SELECTED = new Date(); MINI = new Date(SELECTED.getFullYear(),SELECTED.getMonth(),1); renderMini(); loadDay(); }
function moverDia(n){ SELECTED.setDate(SELECTED.getDate()+n); MINI = new Date(SELECTED.getFullYear(),SELECTED.getMonth(),1); renderMini(); loadDay(); }

/* Cambia entre la agenda normal y la vista de citas canceladas (mismo día) */
function toggleVistaCanceladas(){
  VISTA_CANCELADAS = (VISTA_CANCELADAS === "normal") ? "canceladas" : "normal";
  const btn = document.getElementById("btnVista");
  if(VISTA_CANCELADAS === "canceladas"){
    btn.textContent = "🚫 Ocultar canceladas";
    btn.classList.add("activa");
  } else {
    btn.textContent = "🚫 Ver canceladas";
    btn.classList.remove("activa");
  }
  loadDay();
}

/* ============================================================
   CARGAR Y PINTAR EL DIA (columnas por trabajadora)
   ============================================================ */
// Despachador: refresca la vista activa
function loadDay(){
  if(VISTA === "semana") return loadSemana();
  if(VISTA === "mes")    return loadMes();
  return loadDia();
}

const SELECT_CITAS = "id,inicio,fin,notas,estado,motivo_cancelacion,cancelada_en,cancelada_por,cliente_id,servicio_id,trabajadora_id,clientes(nombre),servicios(nombre,color)";
const DIAS_LARGO = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const MESES_CORTO = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const MESES_LARGO = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

/* ---------- VISTA DIA ---------- */
async function loadDia(){
  document.getElementById("fechaLabel").textContent =
    `${DIAS_LARGO[SELECTED.getDay()]}, ${SELECTED.getDate()} ${MESES_CORTO[SELECTED.getMonth()]} ${SELECTED.getFullYear()}`;

  const dayStart = new Date(SELECTED.getFullYear(),SELECTED.getMonth(),SELECTED.getDate(),0,0,0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate()+1);

  const { data, error } = await sb.from("citas").select(SELECT_CITAS)
    .gte("inicio", dayStart.toISOString())
    .lt("inicio", dayEnd.toISOString());
  if(error){ console.error(error); await dlgError("Error al cargar citas: "+error.message); return; }

  const { data: bloqueos } = await sb.from("bloqueos").select("*")
    .gte("inicio", dayStart.toISOString())
    .lt("inicio", dayEnd.toISOString());

  calcularEscala();
  construirEje();
  renderColumnas(data || [], bloqueos || []);
}

/* ---------- VISTA SEMANA ---------- */
async function loadSemana(){
  const lunes = lunesDe(SELECTED);
  const domingo = new Date(lunes); domingo.setDate(lunes.getDate()+6);
  document.getElementById("fechaLabel").textContent =
    (lunes.getMonth()===domingo.getMonth()
      ? `${lunes.getDate()} – ${domingo.getDate()} ${MESES_CORTO[domingo.getMonth()]} ${domingo.getFullYear()}`
      : `${lunes.getDate()} ${MESES_CORTO[lunes.getMonth()]} – ${domingo.getDate()} ${MESES_CORTO[domingo.getMonth()]} ${domingo.getFullYear()}`);

  const weekStart = new Date(lunes.getFullYear(),lunes.getMonth(),lunes.getDate(),0,0,0);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate()+7);

  const { data, error } = await sb.from("citas").select(SELECT_CITAS)
    .gte("inicio", weekStart.toISOString())
    .lt("inicio", weekEnd.toISOString());
  if(error){ console.error(error); await dlgError("Error al cargar citas: "+error.message); return; }

  const { data: bloqueos } = await sb.from("bloqueos").select("*")
    .gte("inicio", weekStart.toISOString())
    .lt("inicio", weekEnd.toISOString());

  renderSemana(data || [], lunes, bloqueos || []);
}

function renderSemana(citas, lunes, bloqueos){
  bloqueos = bloqueos || [];
  calcularEscala();
  construirEje();
  const head = document.getElementById("colsHead");
  const cols = document.getElementById("cols");
  head.innerHTML = ""; cols.innerHTML = "";
  const dowCorto = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
  const hoy = new Date(); hoy.setHours(0,0,0,0);

  for(let i=0;i<7;i++){
    const fecha = new Date(lunes); fecha.setDate(lunes.getDate()+i);
    const esHoy = fecha.getTime()===hoy.getTime();

    // Cabecera del dia (clic = abrir ese dia en vista Dia)
    const th = document.createElement("div");
    th.className = "th-col";
    th.style.cursor = "pointer";
    th.innerHTML = `<div class="avatar"${esHoy?' style="background:var(--accent);color:#fff"':''}>${fecha.getDate()}</div>
        <div class="info"><div class="nom">${dowCorto[i]}</div><div class="hrs">${MESES_CORTO[fecha.getMonth()]}</div></div>
        <span class="chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span>`;
    th.addEventListener("click", () => abrirDiaDesde(fecha));
    head.appendChild(th);

    // Columna del dia
    const colEl = document.createElement("div");
    colEl.className = "col";
    const surf = document.createElement("div");
    surf.className = "col-surface";
    surf.style.height = gridPx() + "px";
    surf.__col = { _fecha:new Date(fecha), _trab:undefined };   // semana: cambia el dia, mantiene la trabajadora
    pintarFondoSurface(surf);

    addDescansoSurface(surf);   // descanso debajo de las citas

    const colObj = { _id:"__dia__", _fecha:new Date(fecha) };
    bloqueos.filter(b => sameDay(new Date(b.inicio), fecha)).forEach(b => surf.appendChild(crearBloqueoEl(b)));
    citas.filter(c => sameDay(new Date(c.inicio), fecha)).forEach(c => surf.appendChild(crearCitaEl(c)));
    surf.addEventListener("mousedown", e => iniciarDrag(e, colObj, surf));

    colEl.appendChild(surf);
    cols.appendChild(colEl);
  }
  renderNowLine();
}

/* ---------- VISTA MES ---------- */
async function loadMes(){
  document.getElementById("fechaLabel").textContent =
    `${MESES_LARGO[SELECTED.getMonth()]} ${SELECTED.getFullYear()}`;

  const y = SELECTED.getFullYear(), m = SELECTED.getMonth();
  const primero = new Date(y,m,1);
  const offset = (primero.getDay()+6)%7;            // lunes=0
  const inicioGrid = new Date(y,m,1-offset);
  const finGrid = new Date(inicioGrid); finGrid.setDate(inicioGrid.getDate()+42);

  const { data, error } = await sb.from("citas").select(SELECT_CITAS)
    .gte("inicio", inicioGrid.toISOString())
    .lt("inicio", finGrid.toISOString())
    .order("inicio", { ascending:true });
  if(error){ console.error(error); await dlgError("Error al cargar citas: "+error.message); return; }

  renderMes(data || [], inicioGrid, m);
}

function renderMes(citas, inicioGrid, mesActual){
  const cont = document.getElementById("mesView");
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const dow = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

  // Agrupa citas por dia (clave AAAA-MM-DD)
  const porDia = {};
  citas.forEach(c => {
    const d = new Date(c.inicio);
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    (porDia[k] = porDia[k] || []).push(c);
  });

  let html = '<div class="mes-dow">' + dow.map(d=>`<div>${d}</div>`).join("") + '</div><div class="mes-grid">';
  for(let i=0;i<42;i++){
    const fecha = new Date(inicioGrid); fecha.setDate(inicioGrid.getDate()+i);
    const otro = fecha.getMonth()!==mesActual;
    const esHoy = fecha.getTime()===hoy.getTime();
    const k = `${fecha.getFullYear()}-${fecha.getMonth()}-${fecha.getDate()}`;
    const lista = porDia[k] || [];
    const visibles = lista.slice(0,3).map(c => {
      const color = (c.servicios && c.servicios.color) ? c.servicios.color : "#374151";
      const nom = c.clientes ? c.clientes.nombre : "Cliente";
      const canc = c.estado==="cancelado" ? " cancelado" : "";
      return `<div class="mes-cita${canc}" onclick="event.stopPropagation();abrirCitaMes('${k}',${lista.indexOf(c)})">
          <span class="dot" style="background:${color}"></span>${fmt(new Date(c.inicio))} ${escapeHtml(nom)}</div>`;
    }).join("");
    const mas = lista.length>3 ? `<div class="mes-mas">+${lista.length-3} más</div>` : "";
    html += `<div class="mes-cell${otro?' otro':''}" onclick="abrirDiaDesde(new Date(${fecha.getFullYear()},${fecha.getMonth()},${fecha.getDate()}))">
        <span class="num${esHoy?' hoy':''}">${fecha.getDate()}</span>${visibles}${mas}</div>`;
  }
  html += '</div>';
  cont.innerHTML = html;
  MES_CITAS = porDia;
}
let MES_CITAS = {};
function abrirCitaMes(k, idx){
  const c = (MES_CITAS[k]||[])[idx]; if(!c) return;
  abrirModalEditar(c);
}
function abrirDiaDesde(fecha){
  SELECTED = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  MINI = new Date(SELECTED.getFullYear(), SELECTED.getMonth(), 1);
  VISTA = "dia";
  document.getElementById("viewSelect").value = "dia";
  aplicarVistaDOM();
  renderMini();
  loadDay();
}

/* ============================================================
   FILTRO DE TRABAJADORAS (vista Dia)
   ============================================================ */
function toggleFiltroTrab(){ document.getElementById("filtroTrab").classList.toggle("abierto"); }
document.addEventListener("mousedown", e => {
  const f = document.getElementById("filtroTrab");
  if(f && f.classList.contains("abierto") && !f.contains(e.target)) f.classList.remove("abierto");
});
function renderFiltroTrab(){
  const pop = document.getElementById("filtroTrabPop");
  let html = `<div class="filtro-acciones">
      <button type="button" onclick="todasTrab(true)">Todas</button>
      <button type="button" onclick="todasTrab(false)">Ninguna</button>
    </div>`;
  html += TRABAJADORAS.map(t => {
    const vis = !TRAB_OCULTAS.has(t.id);
    return `<div class="filtro-row">
        <label>
          <input type="checkbox" ${vis?"checked":""} onchange="toggleTrab('${t.id}')">
          <span class="punto" style="background:${t.color||'#9ca3af'}">${escapeHtml((t.nombre[0]||'?').toUpperCase())}</span>
          ${escapeHtml(t.nombre)}
        </label>
        <button type="button" class="solo" onclick="soloTrab('${t.id}')">solo</button>
      </div>`;
  }).join("");
  pop.innerHTML = html;
  actualizarFiltroLabel();
}
function actualizarFiltroLabel(){
  const visibles = TRABAJADORAS.filter(t => !TRAB_OCULTAS.has(t.id)).length;
  const total = TRABAJADORAS.length;
  document.getElementById("filtroTrabLabel").textContent =
    (visibles===total) ? "Trabajadoras" : `Trabajadoras (${visibles}/${total})`;
}
function toggleTrab(id){
  if(TRAB_OCULTAS.has(id)) TRAB_OCULTAS.delete(id); else TRAB_OCULTAS.add(id);
  actualizarFiltroLabel(); loadDay();
}
function soloTrab(id){
  TRAB_OCULTAS = new Set(TRABAJADORAS.filter(t => t.id!==id).map(t => t.id));
  renderFiltroTrab(); loadDay();
}
function todasTrab(mostrar){
  TRAB_OCULTAS = mostrar ? new Set() : new Set(TRABAJADORAS.map(t => t.id));
  renderFiltroTrab(); loadDay();
}

function renderColumnas(citasTodas, bloqueos){
  bloqueos = bloqueos || [];

  // Filtra según el toggle: normal = oculta canceladas; activo = muestra todas juntas
  const citas = (VISTA_CANCELADAS === "canceladas")
    ? citasTodas
    : citasTodas.filter(c => c.estado !== "cancelado");

  const head = document.getElementById("colsHead");
  const cols = document.getElementById("cols");
  const banner = document.getElementById("bannerCanceladas");

  // Banner informativo cuando se muestran las canceladas
  if(VISTA_CANCELADAS === "canceladas"){
    const nCanc = citasTodas.filter(c => c.estado === "cancelado").length;
    banner.style.display = "flex";
    banner.innerHTML = nCanc
      ? `🚫 Mostrando ${nCanc} cita(s) cancelada(s) · aparecen tachadas en el calendario`
      : `🎉 No hay citas canceladas este día`;
  } else {
    banner.style.display = "none";
  }

  // Columnas = trabajadoras activas no ocultas; + "Sin asignar" si hay citas sin trabajadora
  let columnas = TRABAJADORAS.filter(t => !TRAB_OCULTAS.has(t.id)).map(t => ({...t, _id:t.id, _fecha:new Date(SELECTED)}));
  if(citas.some(c => !c.trabajadora_id)){
    columnas.unshift({ _id:"__none__", nombre:"Sin asignar", color:"#94a3b8", hora_inicio:null, hora_fin:null, descanso_inicio:null, descanso_fin:null, _fecha:new Date(SELECTED) });
  }

  head.innerHTML = ""; cols.innerHTML = "";

  if(!columnas.length){
    cols.innerHTML = '<div class="cols-vacio">No hay trabajadoras seleccionadas. Usa el filtro «Trabajadoras» para mostrar columnas.</div>';
    return;
  }

  columnas.forEach(col => {
    // Cabecera (avatar circular gris claro con la inicial)
    const th = document.createElement("div");
    th.className = "th-col";
    const ini = col.hora_inicio ? col.hora_inicio.slice(0,5) : null;
    const fin = col.hora_fin ? col.hora_fin.slice(0,5) : null;
    let horario = "";
    if(ini && fin){
      if(col.descanso_inicio && col.descanso_fin){
        horario = `${ini}–${col.descanso_inicio.slice(0,5)}, ${col.descanso_fin.slice(0,5)}–${fin}`;
      } else horario = `${ini}–${fin}`;
    }
    th.innerHTML = `<div class="avatar">${escapeHtml((col.nombre[0]||"?").toUpperCase())}</div>
        <div class="info"><div class="nom">${escapeHtml(col.nombre)}</div><div class="hrs">${horario}</div></div>
        <span class="chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span>`;
    head.appendChild(th);

    // Columna
    const colEl = document.createElement("div");
    colEl.className = "col";
    const surf = document.createElement("div");
    surf.className = "col-surface";
    surf.style.height = gridPx() + "px";
    surf.__col = { _fecha:new Date(col._fecha||SELECTED), _trab:(col._id==="__none__"?null:col._id) };  // destino al mover citas
    pintarFondoSurface(surf);

    // Sombreado fuera de la jornada de la trabajadora (dentro del horario operativo)
    if(ini && fin){
      const wIni = clamp(hhmmToMin(col.hora_inicio), apMin(), ciMin());
      const wFin = clamp(hhmmToMin(col.hora_fin),    apMin(), ciMin());
      if(wIni > apMin()) addShade(surf, 0, gridTop(wIni));         // antes de abrir
      if(wFin < ciMin()) addShade(surf, gridTop(wFin), gridPx());  // despues de cerrar
    }
    // Descanso de esta columna (se pinta DEBAJO de las citas)
    addDescansoSurface(surf);

    // Bloqueos (falta/ausencia): de esta trabajadora o generales (sin trabajadora)
    bloqueos.filter(b => !b.trabajadora_id || b.trabajadora_id === col._id).forEach(b => {
      surf.appendChild(crearBloqueoEl(b));
    });

    // Citas de esta columna (van por encima del descanso y los sombreados)
    citas.filter(c => (c.trabajadora_id || "__none__") === col._id).forEach(c => {
      surf.appendChild(crearCitaEl(c));
    });

    // Crear cita arrastrando
    surf.addEventListener("mousedown", e => iniciarDrag(e, col, surf));

    colEl.appendChild(surf);
    cols.appendChild(colEl);
  });

  renderNowLine();
}

// Fondo del surface: blanco puro con subdivisiones de 15 min (suaves) y linea de hora marcada.
// La linea de hora (capa superior) se pinta encima de la de 15 min para mantener jerarquia.
function pintarFondoSurface(surf){
  const hp = 60 * PXMIN;          // alto de 1 hora en px
  const qp = 15 * PXMIN;          // alto de 15 min en px (4 subdivisiones por hora)
  surf.style.backgroundColor = "#fff";
  surf.style.backgroundImage =
      `repeating-linear-gradient(to bottom, transparent 0, transparent ${hp-1}px, #d1d5db ${hp-1}px, #d1d5db ${hp}px),`   // hora (visible pero no agresiva)
    + `repeating-linear-gradient(to bottom, transparent 0, transparent ${qp-1}px, #f3f4f6 ${qp-1}px, #f3f4f6 ${qp}px)`;   // 15 min (ultra sutil)
}

// Descanso dentro de una columna: rayas diagonales + rotulo, por debajo de las citas
function addDescansoSurface(surf){
  if(!CONFIG.tieneDescanso) return;
  const d0 = clamp(hhmmToMin(CONFIG.inicioDescanso), apMin(), ciMin());
  const d1 = clamp(hhmmToMin(CONFIG.finDescanso),    apMin(), ciMin());
  if(d1 <= d0) return;
  const b = document.createElement("div");
  b.className = "descanso-col";
  b.style.top = gridTop(d0) + "px";
  b.style.height = (gridTop(d1) - gridTop(d0)) + "px";
  b.innerHTML = '<span class="descanso-et">Descanso</span>';
  surf.appendChild(b);
}

/* Indicador de hora actual: punto rojo + linea roja que cruza las columnas */
function renderNowLine(){
  const cols = document.getElementById("cols");
  if(!cols) return;
  let line = document.getElementById("nowLine");
  if(line) line.remove();

  const now = new Date();
  let mostrar = false;
  if(VISTA === "dia") mostrar = sameDay(now, SELECTED);
  else if(VISTA === "semana"){
    const l = lunesDe(SELECTED), dom = new Date(l); dom.setDate(l.getDate()+7);
    mostrar = now >= l && now < dom;
  }
  if(!mostrar) return;                                // solo si la vista incluye el dia de hoy
  const min = minutosDelDia(now);
  if(min < apMin() || min > ciMin()) return;          // solo dentro del horario operativo

  line = document.createElement("div");
  line.className = "now-line";
  line.id = "nowLine";
  line.style.top = gridTop(min) + "px";
  line.innerHTML = '<span class="linea"></span><span class="punto"></span>';
  cols.appendChild(line);
}

function crearCitaEl(c){
  const ini = new Date(c.inicio), fin = new Date(c.fin);
  const top = gridTop(minutosDelDia(ini));
  const alto = Math.max(22, (fin - ini)/60000 * PXMIN);
  const color = (c.servicios && c.servicios.color) ? c.servicios.color : "#7C6FF0";
  const txt = textoContraste(color);
  const compacta = alto < 60;   // poco alto -> oculta la hora para priorizar nombre + servicio
  const el = document.createElement("div");
  el.className = "cita" + (compacta?" compacta":"") + (c.estado==="asistio"?" asistio":"") + (c.estado==="cancelado"?" cancelado":"");
  el.style.top = top+"px"; el.style.height = alto+"px";
  el.style.background = color; el.style.color = txt;
  const nomCli  = c.clientes  ? c.clientes.nombre  : "Sin cliente";
  const nomServ = c.servicios ? c.servicios.nombre : "";
  el.innerHTML =
    `<div class="t-hora">${fmt(ini)} – ${fmt(fin)}</div>
     <div class="t-cli"${c.cliente_id ? ` onclick="abrirFichaCliente('${c.cliente_id}');event.stopPropagation()"` : ""}>${escapeHtml(nomCli)}</div>
     ${nomServ ? `<div class="t-serv">${escapeHtml(nomServ)}</div>` : ""}
     <span class="cita-ic"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8A6 6 0 1 1 8 2"/><polyline points="10.5 2 14 2 14 5.5"/></svg></span>`;
  el.title = `${fmt(ini)}–${fmt(fin)} · ${c.clientes?c.clientes.nombre:"Sin cliente"} · ${c.servicios?c.servicios.nombre:""}`;
  // mousedown = posible arrastre para mover; si no se mueve, en mouseup se abre el editor
  el.addEventListener("mousedown", e => { e.stopPropagation(); iniciarMoverCita(e, c, el); });
  return el;
}

// Bloque de falta de disponibilidad / ausencia (color, clic para eliminar)
function crearBloqueoEl(b){
  const ini = new Date(b.inicio), fin = new Date(b.fin);
  const top = gridTop(minutosDelDia(ini));
  const alto = Math.max(22, (fin - ini)/60000 * PXMIN);
  const esAus = b.tipo === "ausencia";
  const compacta = alto < 44;   // poco alto -> oculta la hora y muestra solo el titulo
  const el = document.createElement("div");
  el.className = "bloqueo " + (esAus ? "ausencia" : "falta") + (compacta ? " compacta" : "");
  el.style.top = top+"px"; el.style.height = alto+"px";
  el.innerHTML =
    `<div class="b-tit">${esAus ? "Ausencia" : "Falta de disponibilidad"}</div>
     <div class="b-hora">${fmt(ini)} – ${fmt(fin)}</div>`;
  el.title = `${esAus?"Ausencia":"Falta de disponibilidad"} ${fmt(ini)}–${fmt(fin)} · clic para eliminar`;
  el.addEventListener("mousedown", e => e.stopPropagation());   // no iniciar arrastre de creacion
  el.addEventListener("click", e => { e.stopPropagation(); eliminarBloqueo(b.id); });
  return el;
}
async function crearBloqueo(tipo, col, mIni, mFin){
  const base = (col && col._fecha) ? col._fecha : SELECTED;
  const inicio = minToDate(mIni, base), fin = minToDate(mFin, base);
  const trabajadoraId = (col && col._id!=="__none__" && col._id!=="__dia__") ? col._id : null;
  const { error } = await sb.from("bloqueos").insert({
    trabajadora_id: trabajadoraId,
    inicio: inicio.toISOString(),
    fin: fin.toISOString(),
    tipo: tipo === "ausencia" ? "ausencia" : "falta"
  });
  if(error){ await dlgError("Error al crear el bloqueo: "+error.message); return; }
  loadDay();
}
async function eliminarBloqueo(id){
  if(!await dlgConfirm("¿Eliminar este bloqueo (falta/ausencia)?", "🗑️")) return;
  const { error } = await sb.from("bloqueos").delete().eq("id", id);
  if(error){ await dlgError("Error al eliminar: "+error.message); return; }
  loadDay();
}
// Devuelve texto blanco u oscuro segun la luminancia del color de fondo (contraste legible)
function textoContraste(hex){
  const h = String(hex).replace("#","");
  const c = h.length===3 ? h.split("").map(x=>x+x).join("") : h;
  const r=parseInt(c.slice(0,2),16), g=parseInt(c.slice(2,4),16), b=parseInt(c.slice(4,6),16);
  if([r,g,b].some(isNaN)) return "#fff";
  const lum = (0.299*r + 0.587*g + 0.114*b)/255;
  return lum > 0.62 ? "#1f2937" : "#ffffff";
}

function addShade(surf, top, bottom, etiqueta){
  const s = document.createElement("div");
  s.className = "shade";
  s.style.top = top+"px"; s.style.height = (bottom-top)+"px";
  if(etiqueta) s.innerHTML = `<span class="et">${etiqueta}</span>`;
  surf.appendChild(s);
}

/* ============================================================
   DRAG PARA CREAR
   ============================================================ */
let drag = null;
function iniciarDrag(e, col, surf){
  if(!ES_ADMIN) return;                   // solo lectura: no crear citas
  if(VISTA_CANCELADAS === "canceladas") return;   // en la vista de canceladas no se crean citas
  cerrarSlotMenu();                       // descarta cualquier seleccion previa
  const rect = surf.getBoundingClientRect();
  const y = clamp(e.clientY - rect.top, 0, gridPx());
  const sel = document.createElement("div"); sel.className = "seleccion";
  surf.appendChild(sel);
  drag = { col, surf, y0:y, y1:y, sel };
  pintarSel();
  e.preventDefault();
}
window.addEventListener("mousemove", e => {
  if(!drag) return;
  const rect = drag.surf.getBoundingClientRect();
  drag.y1 = clamp(e.clientY - rect.top, 0, gridPx());
  pintarSel();
});
window.addEventListener("mouseup", () => {
  if(!drag) return;
  const a = Math.min(drag.y0,drag.y1), b = Math.max(drag.y0,drag.y1);
  let mIni = snap15(yToMin(a)), mFin = snap15(yToMin(b));
  if(mFin - mIni < 15) mFin = mIni + 15;   // clic simple = una subseccion de 15 min
  const col = drag.col, sel = drag.sel;
  // Fija la seleccion a la rejilla de 15 min y muestra la etiqueta de hora
  const base = (col && col._fecha) ? col._fecha : SELECTED;
  sel.style.top = gridTop(mIni) + "px";
  sel.style.height = (gridTop(mFin) - gridTop(mIni)) + "px";
  sel.classList.add("fijada");
  sel.innerHTML = `<span class="sel-hora">${fmt(minToDate(mIni,base))} - ${fmt(minToDate(mFin,base))}</span>`;
  drag = null;
  mostrarSlotMenu(col, mIni, mFin, sel);
});
function pintarSel(){
  const a = Math.min(drag.y0,drag.y1), b = Math.max(drag.y0,drag.y1);
  drag.sel.style.top = a+"px"; drag.sel.style.height = (b-a)+"px";
}

/* ============================================================
   MOVER UNA CITA EXISTENTE (arrastrar y soltar)
   ============================================================ */
let citaDrag = null;
function iniciarMoverCita(e, c, el){
  if(!ES_ADMIN) return;                   // solo lectura: no mover citas
  if(c.estado === "cancelado") return;    // las citas canceladas no se pueden mover
  const ini = new Date(c.inicio), fin = new Date(c.fin);
  const durMin = Math.max(15, (fin - ini)/60000);
  const surf = el.parentElement;
  const rect = surf.getBoundingClientRect();
  const grabOffsetPx = (e.clientY - rect.top) - (parseFloat(el.style.top) || 0);   // donde agarramos dentro de la cita
  const lbl = document.createElement("div"); lbl.className = "move-hora"; lbl.style.display = "none";
  document.body.appendChild(lbl);
  citaDrag = { c, el, durMin, grabOffsetPx, x0:e.clientX, y0:e.clientY, moved:false, curSurf:surf, curStartMin:minutosDelDia(ini), lbl };
  el.classList.add("moviendo");
  e.preventDefault();
}
window.addEventListener("mousemove", e => {
  if(!citaDrag) return;
  if(Math.abs(e.clientX-citaDrag.x0) + Math.abs(e.clientY-citaDrag.y0) > 4) citaDrag.moved = true;
  if(!citaDrag.moved) return;

  // Columna bajo el cursor (para cambiar de trabajadora/dia)
  let target = null;
  document.querySelectorAll("#cols .col-surface").forEach(s => {
    const r = s.getBoundingClientRect();
    if(e.clientX >= r.left && e.clientX < r.right){ target = { surf:s, rect:r }; }
  });
  if(!target){ const s=citaDrag.curSurf; target = { surf:s, rect:s.getBoundingClientRect() }; }
  if(citaDrag.el.parentElement !== target.surf) target.surf.appendChild(citaDrag.el);

  // Nueva hora de inicio (alineada a 15 min, dentro del horario)
  const yTop = e.clientY - target.rect.top - citaDrag.grabOffsetPx;
  let startMin = snap15(yToMin(yTop));
  startMin = clamp(startMin, apMin(), ciMin() - citaDrag.durMin);
  citaDrag.el.style.top = gridTop(startMin) + "px";
  citaDrag.curStartMin = startMin;
  citaDrag.curSurf = target.surf;

  // Etiqueta flotante con la nueva hora (sigue al cursor)
  const finMin = startMin + citaDrag.durMin;
  citaDrag.lbl.textContent = `${fmt(minToDate(startMin))} – ${fmt(minToDate(finMin))}`;
  citaDrag.lbl.style.display = "block";
  citaDrag.lbl.style.left = (e.clientX + 14) + "px";
  citaDrag.lbl.style.top  = (e.clientY - 10) + "px";
});
window.addEventListener("mouseup", async () => {
  if(!citaDrag) return;
  const cd = citaDrag; citaDrag = null;
  cd.el.classList.remove("moviendo");
  if(cd.lbl) cd.lbl.remove();
  if(!cd.moved){ abrirModalEditar(cd.c); return; }   // sin desplazamiento = clic -> editar

  const meta = cd.curSurf.__col || {};
  const fecha = meta._fecha ? new Date(meta._fecha) : new Date(SELECTED);
  const inicio = new Date(fecha); inicio.setHours(0,0,0,0); inicio.setMinutes(cd.curStartMin);
  const fin = new Date(inicio.getTime() + cd.durMin*60000);
  const trabajadoraId = (meta._trab !== undefined) ? meta._trab : (cd.c.trabajadora_id || null);

  const { error } = await sb.from("citas")
    .update({ inicio:inicio.toISOString(), fin:fin.toISOString(), trabajadora_id:trabajadoraId })
    .eq("id", cd.c.id);
  if(error){ await dlgError("Error al mover la cita: "+error.message); }
  loadDay();
});

/* ============================================================
   MENU CONTEXTUAL AL SELECCIONAR UN HUECO
   ============================================================ */
let SLOT_PEND = null;   // { col, mIni, mFin, sel }
function mostrarSlotMenu(col, mIni, mFin, sel){
  SLOT_PEND = { col, mIni, mFin, sel };
  const menu = document.getElementById("slotMenu");
  menu.classList.add("abierto");
  // Posiciona el menu a la derecha de la seleccion, centrado verticalmente y dentro del viewport
  const r = sel.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let left = r.right + 10;
  if(left + mw > window.innerWidth - 10) left = r.left - mw - 10;   // si no cabe, a la izquierda
  left = Math.max(10, left);
  let top = r.top + r.height/2 - mh/2;
  top = clamp(top, 10, window.innerHeight - mh - 10);
  menu.style.left = left + "px";
  menu.style.top = top + "px";
}
function cerrarSlotMenu(){
  const menu = document.getElementById("slotMenu");
  if(menu) menu.classList.remove("abierto");
  if(SLOT_PEND && SLOT_PEND.sel) SLOT_PEND.sel.remove();
  SLOT_PEND = null;
}
function slotAccion(tipo){
  if(!SLOT_PEND) return;
  const { col, mIni, mFin } = SLOT_PEND;
  document.getElementById("slotMenu").classList.remove("abierto");
  if(SLOT_PEND.sel) SLOT_PEND.sel.remove();
  SLOT_PEND = null;
  if(tipo === "cita")       abrirModalNueva(col, mIni, mFin);
  else if(tipo === "falta")    crearBloqueo("falta", col, mIni, mFin);
  else if(tipo === "ausencia") crearBloqueo("ausencia", col, mIni, mFin);
}
// Cerrar el menu al hacer clic fuera o con Escape
document.addEventListener("mousedown", e => {
  const menu = document.getElementById("slotMenu");
  if(SLOT_PEND && menu && !menu.contains(e.target)) cerrarSlotMenu();
});
document.addEventListener("keydown", e => { if(e.key==="Escape") cerrarSlotMenu(); });

/* ============================================================
   MODAL
   ============================================================ */
function nuevaCitaRapida(){
  if(!ES_ADMIN) return;                   // solo lectura
  // FAB: abre una cita nueva de 1h a la siguiente hora en punto del dia mostrado
  const apH = Math.floor(apMin()/60), ciH = Math.ceil(ciMin()/60);
  let h = sameDay(new Date(), SELECTED) ? new Date().getHours()+1 : apH;
  h = clamp(h, apH, ciH-1);
  const mIni = h*60;   // minutos absolutos del dia
  abrirModalNueva(null, mIni, mIni+60);
}
function abrirModalNueva(col, mIni, mFin){
  if(!ES_ADMIN) return;                   // solo lectura
  document.getElementById("modalTitulo").textContent = "Nueva cita";
  document.getElementById("citaId").value = "";
  document.getElementById("estadoPill").innerHTML = "";
  const trabId = (col && col._id!=="__none__" && col._id!=="__dia__") ? col._id : "";
  document.getElementById("selTrabajadora").value = trabId;
  resetCliente();
  document.getElementById("selServicio").value = "";
  document.getElementById("precioInfo").textContent = "";
  document.getElementById("inpNotas").value = "";
  const base = (col && col._fecha) ? col._fecha : SELECTED;
  setFechaHora(minToDate(mIni, base), minToDate(mFin, base));
  document.getElementById("btnAsistio").style.display = "none";
  document.getElementById("btnDesasistio").style.display = "none";
  document.getElementById("btnCancelarCita").style.display = "none";
  document.getElementById("btnReactivar").style.display = "none";
  document.getElementById("boxMotivo").style.display = "none";
  document.getElementById("btnGuardar").style.display = "inline-block";
  abrir();
}
function abrirModalEditar(c){
  document.getElementById("modalTitulo").textContent = "Editar cita";
  document.getElementById("citaId").value = c.id;
  document.getElementById("selTrabajadora").value = c.trabajadora_id || "";
  resetCliente();
  document.getElementById("selCliente").value = c.cliente_id || "";
  onClienteChange();
  document.getElementById("selServicio").value = c.servicio_id || "";
  mostrarPrecio(c.servicio_id);
  document.getElementById("inpNotas").value = c.notas || "";
  setFechaHora(new Date(c.inicio), new Date(c.fin));
  const est = c.estado || "pendiente";
  const cancelada = (est === "cancelado");
  const colores = { pendiente:"#e0e7ff;color:#3730a3", asistio:"#dcfce7;color:#166534", cancelado:"#fee2e2;color:#991b1b" };
  document.getElementById("estadoPill").innerHTML = `<span class="estado-pill" style="background:${colores[est]}">${est.toUpperCase()}</span>`;

  // Caja con el motivo (solo si la cita está cancelada)
  const boxMotivo = document.getElementById("boxMotivo");
  if(cancelada){
    document.getElementById("motivoTexto").textContent = c.motivo_cancelacion || "(sin motivo indicado)";
    let meta = "";
    if(c.cancelada_en){ meta += "Cancelada el " + new Date(c.cancelada_en).toLocaleString("es-ES"); }
    if(c.cancelada_por){ meta += (meta ? " · por " : "Cancelada por ") + escapeHtml(c.cancelada_por); }
    document.getElementById("motivoMeta").textContent = meta;
    boxMotivo.style.display = "block";
  } else {
    boxMotivo.style.display = "none";
  }

  // Botones según estado y permisos
  document.getElementById("btnAsistio").style.display      = (ES_ADMIN && !cancelada && est!=="asistio") ? "inline-block" : "none";
  document.getElementById("btnDesasistio").style.display   = (ES_ADMIN && !cancelada && est==="asistio") ? "inline-block" : "none";
  document.getElementById("btnCancelarCita").style.display = (ES_ADMIN && !cancelada) ? "inline-block" : "none";
  document.getElementById("btnReactivar").style.display    = (ES_ADMIN &&  cancelada) ? "inline-block" : "none";
  document.getElementById("btnGuardar").style.display      = (ES_ADMIN && !cancelada) ? "inline-block" : "none";
  document.getElementById("modalTitulo").textContent =
    !ES_ADMIN ? "Detalle de la cita" : (cancelada ? "Cita cancelada" : "Editar cita");
  abrir();
}
// Escribe fecha (date) y horas (24h) en los selectores del drawer
function setFechaHora(dIni, dFin){
  document.getElementById("inpFecha").value = toDateInput(dIni);
  pintarHorasSelects();
  setSelectHora("inpInicio", toTimeInput(dIni));
  setSelectHora("inpFin", toTimeInput(dFin));
}
// Genera las opciones de hora en formato 24h dentro del horario operativo
function horaOpciones(stepMin){
  const a = apMin(), c = ciMin();
  let html = "";
  for(let m=a; m<=c; m+=stepMin){
    const v = `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
    html += `<option value="${v}">${v}</option>`;
  }
  return html;
}
function pintarHorasSelects(){
  document.getElementById("inpInicio").innerHTML = horaOpciones(15);   // inicio a intervalos de 15 min
  document.getElementById("inpFin").innerHTML    = horaOpciones(5);    // fin a intervalos de 5 min
}
// Asegura que el valor exista como opcion (p.ej. horas heredadas fuera del horario) y lo selecciona
function setSelectHora(id, val){
  const s = document.getElementById(id);
  if(val && ![...s.options].some(o => o.value===val)){
    const o = document.createElement("option"); o.value = val; o.textContent = val; s.appendChild(o);
  }
  s.value = val;
}
// Reconstruye los Date a partir de fecha + hora
function getInicioDate(){ return new Date(`${document.getElementById("inpFecha").value}T${document.getElementById("inpInicio").value}`); }
function getFinDate(){ return new Date(`${document.getElementById("inpFecha").value}T${document.getElementById("inpFin").value}`); }

function resetCliente(){
  document.getElementById("filtroCliente").value = "";
  pintarSelectClientes();
  document.getElementById("chkNuevo").checked = false;
  document.getElementById("boxNuevoCliente").classList.remove("visible");
  document.getElementById("nuevoNombre").value = "";
  document.getElementById("nuevoTelefono").value = "";
  document.getElementById("nuevoEmail").value = "";
  document.getElementById("selCliente").disabled = false;
  document.getElementById("selCliente").value = "";
  document.getElementById("clientePanel").classList.remove("abierto");
  onClienteChange();
}
function toggleClientePanel(){ document.getElementById("clientePanel").classList.toggle("abierto"); }
// Actualiza la linea-resumen del cliente en la cabecera del drawer
function onClienteChange(){
  const sel = document.getElementById("selCliente");
  const txt = document.getElementById("cliResumen");
  if(sel.value){
    const c = CLIENTES.find(x => x.id == sel.value);
    if(c){
      const sub = [c.telefono, c.email].filter(Boolean).join(" · ");
      txt.innerHTML = `<span class="cli-nombre-link" onclick="abrirFichaCliente('${c.id}');event.stopPropagation()">${escapeHtml(c.nombre)}</span>${sub ? `<br><span class="cli-sub">${escapeHtml(sub)}</span>` : ""}`;
      txt.classList.add("elegido");
    } else {
      txt.textContent = sel.options[sel.selectedIndex]?.textContent || "";
      txt.classList.add("elegido");
    }
  } else {
    txt.textContent = "Selecciona un cliente o déjalo en blanco";
    txt.classList.remove("elegido");
  }
}
function toggleNuevoCliente(){
  const on = document.getElementById("chkNuevo").checked;
  document.getElementById("boxNuevoCliente").classList.toggle("visible", on);
  document.getElementById("selCliente").disabled = on;
}

/* ============================================================
   PANTALLA DE BUSQUEDA DE CLIENTES
   ============================================================ */
function abrirBuscadorClientes(){
  document.getElementById("cbInput").value = "";
  volverListaClientes();
  renderListaClientes();
  document.getElementById("overlayClientes").classList.add("abierto");
  setTimeout(() => document.getElementById("cbInput").focus(), 40);
}
function cerrarBuscadorClientes(){ document.getElementById("overlayClientes").classList.remove("abierto"); }
function volverListaClientes(){
  document.getElementById("cbVistaNuevo").style.display = "none";
  document.getElementById("cbVistaLista").style.display = "block";
}
// Iniciales del cliente para el avatar (1-2 letras)
function inicialesCliente(nombre){
  const w = String(nombre||"").trim().split(/\s+/).filter(Boolean);
  if(!w.length) return "?";
  return ((w[0][0]||"") + (w[1] ? w[1][0] : "")).toUpperCase();
}
// Lista filtrada por nombre o telefono, agrupada por inicial
function renderListaClientes(){
  const q = (document.getElementById("cbInput").value || "").trim().toLowerCase();
  const lista = CLIENTES.filter(c =>
    !q || (c.nombre||"").toLowerCase().includes(q) || (c.telefono||"").toLowerCase().includes(q) || (c.email||"").toLowerCase().includes(q));
  const cont = document.getElementById("cbList");
  if(!lista.length){ cont.innerHTML = '<div class="cb-vacio">Sin resultados</div>'; return; }

  const grupos = {};
  lista.forEach(c => {
    const ch = (String(c.nombre||"?").trim()[0] || "?").toUpperCase();
    (grupos[ch] = grupos[ch] || []).push(c);
  });
  const keys = Object.keys(grupos).sort((a,b) => a.localeCompare(b,"es"));
  cont.innerHTML = keys.map(k =>
    `<div class="cb-group">${escapeHtml(k)}</div>` +
    grupos[k].map(c =>
      `<div class="cb-item" onclick="elegirCliente('${c.id}')">
        <span class="cb-ava">${escapeHtml(inicialesCliente(c.nombre))}</span>
        <div class="cb-info">
          <div class="cb-nom">${escapeHtml(c.nombre||"")}</div>
          ${c.telefono ? `<div class="cb-tel">${escapeHtml(c.telefono)}</div>` : ""}
          ${c.email ? `<div class="cb-tel">${escapeHtml(c.email)}</div>` : ""}
        </div>
      </div>`).join("")
  ).join("");
}
// Selecciona un cliente existente y vuelve al drawer
function elegirCliente(id){
  document.getElementById("chkNuevo").checked = false;
  toggleNuevoCliente();
  document.getElementById("selCliente").value = id;
  onClienteChange();
  cerrarBuscadorClientes();
}
// Muestra el formulario de nuevo cliente (prefill con lo buscado)
function nuevoClienteDesdeBuscador(){
  document.getElementById("cbNuevoNombre").value = document.getElementById("cbInput").value.trim();
  document.getElementById("cbNuevoTelefono").value = "";
  document.getElementById("cbNuevoEmail").value = "";
  document.getElementById("cbVistaLista").style.display = "none";
  document.getElementById("cbVistaNuevo").style.display = "block";
  setTimeout(() => document.getElementById("cbNuevoNombre").focus(), 40);
}
// Confirma el nuevo cliente: rellena los campos ocultos que usa guardarCita()
async function confirmarNuevoCliente(){
  const nombre = document.getElementById("cbNuevoNombre").value.trim();
  if(!nombre){ await dlgAlerta("Escribe el nombre del nuevo cliente."); return; }
  const tel = document.getElementById("cbNuevoTelefono").value.trim();
  const email = document.getElementById("cbNuevoEmail").value.trim();
  document.getElementById("chkNuevo").checked = true;
  toggleNuevoCliente();
  document.getElementById("nuevoNombre").value = nombre;
  document.getElementById("nuevoTelefono").value = tel;
  document.getElementById("nuevoEmail").value = email;
  const txt = document.getElementById("cliResumen");
  txt.textContent = nombre + " · nuevo cliente";
  txt.classList.add("elegido");
  cerrarBuscadorClientes();
}
/* ============================================================
   FICHA DE CLIENTE
   ============================================================ */
async function abrirFichaCliente(clienteId){
  const c = CLIENTES.find(x => x.id == clienteId);
  if(!c) return;
  const info = document.getElementById("fichaInfo");
  const hist = document.getElementById("fichaHistorial");
  info.innerHTML = `
    <div class="ficha-ava">${escapeHtml(inicialesCliente(c.nombre))}</div>
    <div class="ficha-datos">
      <div class="ficha-nombre">${escapeHtml(c.nombre)}</div>
      ${c.telefono ? `<div class="ficha-dato"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.81 19.79 19.79 0 01.06 2.18 2 2 0 012.03 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg> ${escapeHtml(c.telefono)}</div>` : ""}
      ${c.email ? `<div class="ficha-dato"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> ${escapeHtml(c.email)}</div>` : ""}
    </div>`;
  hist.innerHTML = '<div class="ficha-cargando">Cargando historial…</div>';
  document.getElementById("overlayFicha").classList.add("abierto");

  const { data: citas, error } = await sb.from("citas")
    .select("id,inicio,fin,estado,servicios(nombre),trabajadoras(nombre),notas")
    .eq("cliente_id", clienteId)
    .order("inicio", {ascending: false})
    .limit(50);
  if(error){ hist.innerHTML = '<div class="ficha-cargando">Error al cargar.</div>'; return; }
  if(!citas || !citas.length){ hist.innerHTML = '<div class="ficha-cargando">Sin citas registradas.</div>'; return; }

  const cols = {pendiente:"#e0e7ff;color:#3730a3", asistio:"#dcfce7;color:#166534", cancelado:"#fee2e2;color:#991b1b"};
  hist.innerHTML = citas.map(ci => {
    const d = new Date(ci.inicio);
    const fecha = d.toLocaleDateString("es-ES",{weekday:"short",day:"numeric",month:"short",year:"numeric"});
    const hora = d.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"});
    const est = ci.estado||"pendiente";
    return `<div class="ficha-cita">
      <div class="ficha-cita-fecha">${escapeHtml(fecha)} · ${escapeHtml(hora)}</div>
      <div class="ficha-cita-serv">${escapeHtml(ci.servicios?.nombre||"—")}${ci.trabajadoras?.nombre ? " · "+escapeHtml(ci.trabajadoras.nombre) : ""}</div>
      <span class="estado-pill" style="background:${cols[est]}">${est.toUpperCase()}</span>
    </div>`;
  }).join("");
}
function cerrarFichaCliente(){ document.getElementById("overlayFicha").classList.remove("abierto"); }

// Pestañas del drawer (CITA / NOTAS Y DATOS)
function drawerTab(t){
  const esCita = t==="cita";
  document.getElementById("paneCita").classList.toggle("oculto", !esCita);
  document.getElementById("paneNotas").classList.toggle("oculto", esCita);
  document.getElementById("dtabCita").classList.toggle("activo", esCita);
  document.getElementById("dtabNotas").classList.toggle("activo", !esCita);
}
function onServicioChange(){
  const id = document.getElementById("selServicio").value;
  mostrarPrecio(id);
  const s = SERVICIOS_MAP[id];
  const inicio = document.getElementById("inpInicio").value;
  if(s && inicio){
    const d = getInicioDate(); d.setMinutes(d.getMinutes()+s.duracion_minutos);
    setSelectHora("inpFin", toTimeInput(d));
  }
}
function onInicioChange(){ if(document.getElementById("selServicio").value) onServicioChange(); }
function mostrarPrecio(id){
  const s = SERVICIOS_MAP[id]; const box = document.getElementById("precioInfo");
  if(!s){ box.textContent=""; return; }
  box.textContent = (s.precio!=null ? s.precio.toFixed(2)+" €" : "Precio variable") + " · " + s.duracion_minutos + " min";
}
function abrir(){ drawerTab("cita"); document.getElementById("overlay").classList.add("abierto"); }
function cerrarModal(){ document.getElementById("overlay").classList.remove("abierto"); }

/* ============================================================
   GUARDAR / ASISTIO / ELIMINAR
   ============================================================ */
async function guardarCita(){
  if(!ES_ADMIN){ await dlgAlerta("Solo el usuario administrador puede modificar citas."); return; }
  const citaId = document.getElementById("citaId").value;
  const trabajadoraId = document.getElementById("selTrabajadora").value || null;
  const servicioId = document.getElementById("selServicio").value;
  const fecha = document.getElementById("inpFecha").value;
  const horaIni = document.getElementById("inpInicio").value;
  const horaFin = document.getElementById("inpFin").value;
  const notas = document.getElementById("inpNotas").value.trim() || null;

  if(!servicioId){ await dlgAlerta("Elige un servicio."); return; }
  if(!fecha || !horaIni || !horaFin){ await dlgAlerta("Indica fecha, inicio y fin."); return; }
  const inicio = getInicioDate(), fin = getFinDate();
  if(fin <= inicio){ await dlgAlerta("El fin debe ser posterior al inicio."); return; }

  let clienteId;
  if(document.getElementById("chkNuevo").checked){
    const nombre = document.getElementById("nuevoNombre").value.trim();
    if(!nombre){ await dlgAlerta("Escribe el nombre del nuevo cliente."); return; }
    const telefono = document.getElementById("nuevoTelefono").value.trim() || null;
    const email = document.getElementById("nuevoEmail").value.trim() || null;
    const { data, error } = await sb.from("clientes").insert({nombre,telefono,email}).select().single();
    if(error){ await dlgError("Error al crear cliente: "+error.message); return; }
    clienteId = data.id; CLIENTES.push({id:data.id,nombre:data.nombre,telefono:data.telefono,email:data.email});
    CLIENTES.sort((a,b)=>a.nombre.localeCompare(b.nombre));
  } else {
    clienteId = document.getElementById("selCliente").value;
    if(!clienteId){ await dlgAlerta("Selecciona un cliente o marca 'Crear cliente nuevo'."); return; }
  }

  const fila = {
    cliente_id:clienteId, servicio_id:servicioId, trabajadora_id:trabajadoraId,
    inicio:inicio.toISOString(), fin:fin.toISOString(), notas
  };
  let error;
  if(citaId){ ({error} = await sb.from("citas").update(fila).eq("id",citaId)); }
  else { fila.estado="pendiente"; ({error} = await sb.from("citas").insert(fila)); }
  if(error){ await dlgError("Error al guardar la cita: "+error.message); return; }
  cerrarModal(); loadDay();
}
async function marcarAsistio(){
  if(!ES_ADMIN) return;
  const id = document.getElementById("citaId").value; if(!id) return;
  const { error } = await sb.from("citas").update({estado:"asistio"}).eq("id",id);
  if(error){ await dlgError("Error: "+error.message); return; }
  cerrarModal(); loadDay();
}
// Deshace la confirmación de asistencia: la cita vuelve a "pendiente".
async function desmarcarAsistio(){
  if(!ES_ADMIN) return;
  const id = document.getElementById("citaId").value; if(!id) return;
  const { error } = await sb.from("citas").update({estado:"pendiente"}).eq("id",id);
  if(error){ await dlgError("Error: "+error.message); return; }
  cerrarModal(); loadDay();
}
// "Cancelar cita" NO borra: marca estado=cancelado y guarda el motivo.
// Así queda en el historial y se puede consultar en la vista de canceladas.
async function cancelarCita(){
  if(!ES_ADMIN) return;
  const id = document.getElementById("citaId").value; if(!id) return;
  const motivo = await dlgPrompt("Motivo de la cancelación", "ej: el cliente avisó, no se presentó…");
  if(motivo === null) return;                  // pulsó "Cancelar"
  if(!motivo.trim()){ await dlgAlerta("Escribe un motivo para poder llevar el control."); return; }
  let email = null;
  try { const { data:{ user } } = await sb.auth.getUser(); email = user ? user.email : null; } catch(e){}
  const { error } = await sb.from("citas").update({
    estado: "cancelado",
    motivo_cancelacion: motivo.trim(),
    cancelada_en: new Date().toISOString(),
    cancelada_por: email
  }).eq("id", id);
  if(error){ await dlgError("Error al cancelar: "+error.message); return; }
  cerrarModal(); loadDay();
}

// Reactivar: devuelve una cita cancelada a la agenda (estado=pendiente)
async function reactivarCita(){
  if(!ES_ADMIN) return;
  const id = document.getElementById("citaId").value; if(!id) return;
  if(!await dlgConfirm("¿Reactivar esta cita?\nVolverá a la agenda como pendiente y saldrá del listado de canceladas.", "↩️")) return;
  const { error } = await sb.from("citas").update({
    estado: "pendiente", motivo_cancelacion: null, cancelada_en: null, cancelada_por: null
  }).eq("id", id);
  if(error){ await dlgError("Error al reactivar: "+error.message); return; }
  cerrarModal(); loadDay();
}

/* ============================================================
   UTILIDADES
   ============================================================ */
function gridTop(absMin){ return (absMin - apMin()) * PXMIN; }          // minuto absoluto -> px desde el tope del grid
function hhmmToMin(t){ return parseHM(t); }                             // "HH:MM[:SS]" -> minutos absolutos
function minutosDelDia(date){ return date.getHours()*60 + date.getMinutes(); }   // minutos absolutos
function yToMin(y){ return apMin() + (y/PXMIN); }                       // px -> minutos absolutos del dia
function snap15(min){ return Math.round(min/15)*15; }
function minToDate(min, base){ const d=new Date(base||SELECTED); d.setHours(0,0,0,0); d.setMinutes(min); return d; }  // min = minutos absolutos del dia
function fmt(d){ return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function sameDay(a,b){ return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
function toLocalInput(date){ const d=new Date(date); const o=d.getTimezoneOffset(); return new Date(d.getTime()-o*60000).toISOString().slice(0,16); }
function toDateInput(date){ const d=new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function toTimeInput(date){ const d=new Date(date); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
