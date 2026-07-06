/* ============================================================
   MENU LATERAL + PANEL "FOTOS ANTES / DESPUES"
   ------------------------------------------------------------
   Integra la subida de fotos antes/despues dentro del propio
   calendario. Reutiliza:
     - el cliente Supabase global `sb` (js/app.js)
     - la sesion ya iniciada (no hay login aparte)
   Accesible tanto para el admin como para las trabajadoras.
   ============================================================ */
(function () {
  "use strict";

  // Bucket de almacenamiento (el mismo de la app original de fotos)
  const BUCKET = "fotos-tratamiento";

  const $ = (id) => document.getElementById(id);

  /* ============================================================
     MENU LATERAL (nav drawer)
     ============================================================ */
  function abrirNav() {
    $("navDrawer").classList.add("abierto");
    $("navBackdrop").classList.add("abierto");
    $("navDrawer").setAttribute("aria-hidden", "false");
  }
  function cerrarNav() {
    $("navDrawer").classList.remove("abierto");
    $("navBackdrop").classList.remove("abierto");
    $("navDrawer").setAttribute("aria-hidden", "true");
  }
  function navIr(destino) {
    cerrarNav();
    if (destino === "fotos") {
      marcarNavActivo("navFotos");
      abrirFotos();
    } else {
      marcarNavActivo("navCalendario");
      cerrarFotos();
    }
  }
  function marcarNavActivo(id) {
    ["navCalendario", "navFotos"].forEach((n) => {
      const el = $(n);
      if (el) el.classList.toggle("activo", n === id);
    });
  }

  /* ============================================================
     ABRIR / CERRAR PANEL DE FOTOS
     ============================================================ */
  function abrirFotos() {
    $("overlayFotos").classList.add("abierto");
    // scroll arriba cada vez que se abre
    const wrap = document.querySelector(".fotos-wrap");
    if (wrap) wrap.scrollTop = 0;
  }
  function cerrarFotos() {
    $("overlayFotos").classList.remove("abierto");
    marcarNavActivo("navCalendario");
  }

  // Exponer para los onclick del HTML
  window.abrirNav = abrirNav;
  window.cerrarNav = cerrarNav;
  window.navIr = navIr;
  window.abrirFotos = abrirFotos;
  window.cerrarFotos = cerrarFotos;

  /* ============================================================
     ESTADO DEL PANEL DE FOTOS
     ============================================================ */
  let clienteSel = null;
  let archivos = { antes: [], despues: [] };

  function aviso(cont, texto, tipo) {
    cont.innerHTML = `<div class="fmsg ${tipo}">${texto}</div>`;
  }
  function limpiaAviso(cont) {
    cont.innerHTML = "";
  }

  /* ---------- BUSCAR / ELEGIR CLIENTE ---------- */
  let tBusca;
  function initBuscador() {
    $("f_buscarCliente").addEventListener("input", () => {
      clearTimeout(tBusca);
      const q = $("f_buscarCliente").value.trim();
      tBusca = setTimeout(() => buscarClientes(q), 200);
    });
    $("f_buscarCliente").addEventListener("focus", () => {
      buscarClientes($("f_buscarCliente").value.trim());
    });
    // cerrar resultados al clicar fuera (solo dentro del panel)
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#overlayFotos .fbuscador"))
        $("f_resultados").classList.add("hidden");
    });
  }

  async function buscarClientes(q) {
    const cont = $("f_resultados");
    let consulta = sb.from("clientes").select("id,nombre,telefono").order("nombre").limit(15);
    if (q.length >= 1) {
      consulta = sb
        .from("clientes")
        .select("id,nombre,telefono")
        .or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%`)
        .order("nombre")
        .limit(15);
    }
    const { data, error } = await consulta;
    cont.innerHTML = "";
    if (error) {
      cont.innerHTML = `<div>Error: ${error.message}</div>`;
      cont.classList.remove("hidden");
      return;
    }
    if ((data || []).length === 0) {
      const vacio = document.createElement("div");
      vacio.style.color = "#9ca3af";
      vacio.textContent = q ? "Sin coincidencias…" : "No hay clientas todavía";
      cont.appendChild(vacio);
    }
    (data || []).forEach((c) => {
      const d = document.createElement("div");
      d.innerHTML = `${escaparHtml(c.nombre)} <span class="tel">${escaparHtml(c.telefono || "")}</span>`;
      d.onclick = () => elegirCliente(c);
      cont.appendChild(d);
    });
    const nuevo = document.createElement("div");
    nuevo.className = "nuevo";
    nuevo.textContent = q ? `＋ Crear clienta nueva "${q}"` : "＋ Crear clienta nueva";
    nuevo.onclick = () => abrirFormNueva(q);
    cont.appendChild(nuevo);
    cont.classList.remove("hidden");
  }

  function elegirCliente(c) {
    clienteSel = c;
    $("f_resultados").classList.add("hidden");
    $("f_zonaBuscador").classList.add("hidden");
    $("f_formNueva").classList.add("hidden");
    $("f_ceNombre").textContent = c.nombre;
    $("f_ceTel").textContent = c.telefono || "(sin teléfono)";
    $("f_clienteElegida").classList.remove("hidden");
    $("f_cardFotos").classList.remove("hidden");
    refrescarBotonSubir();
  }

  function initCliente() {
    $("f_btnCambiarCliente").addEventListener("click", () => {
      clienteSel = null;
      archivos = { antes: [], despues: [] };
      pintarPreviews("antes");
      pintarPreviews("despues");
      $("f_clienteElegida").classList.add("hidden");
      $("f_cardFotos").classList.add("hidden");
      $("f_zonaBuscador").classList.remove("hidden");
      $("f_buscarCliente").value = "";
      refrescarBotonSubir();
    });
  }

  /* ---------- NUEVA CLIENTE ---------- */
  function abrirFormNueva(prefill) {
    $("f_resultados").classList.add("hidden");
    $("f_nuevaNombre").value = prefill || "";
    $("f_nuevaTel").value = "";
    $("f_formNueva").classList.remove("hidden");
  }
  function initNuevaCliente() {
    $("f_btnCancelarNueva").addEventListener("click", () =>
      $("f_formNueva").classList.add("hidden")
    );
    $("f_btnGuardarNueva").addEventListener("click", async () => {
      const nombre = $("f_nuevaNombre").value.trim();
      const telefono = $("f_nuevaTel").value.trim();
      if (!nombre) {
        return aviso($("f_avisoGlobal"), "La nueva clienta necesita un nombre.", "err");
      }
      $("f_btnGuardarNueva").disabled = true;
      const { data, error } = await sb
        .from("clientes")
        .insert({ nombre, telefono: telefono || null })
        .select("id,nombre,telefono")
        .single();
      $("f_btnGuardarNueva").disabled = false;
      if (error) {
        return aviso($("f_avisoGlobal"), "No se pudo crear: " + error.message, "err");
      }
      limpiaAviso($("f_avisoGlobal"));
      elegirCliente(data);
    });
  }

  /* ---------- SELECCION DE FOTOS (camara + galeria + arrastrar) ---------- */
  function conectarZona(tipo, dzId, camBtnId, galBtnId, camInputId, galInputId) {
    const dz = $(dzId),
      camBtn = $(camBtnId),
      galBtn = $(galBtnId),
      cam = $(camInputId),
      gal = $(galInputId);
    camBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      cam.click();
    });
    galBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      gal.click();
    });
    cam.addEventListener("change", () => {
      anadirArchivos(tipo, cam.files);
      cam.value = "";
    });
    gal.addEventListener("change", () => {
      anadirArchivos(tipo, gal.files);
      gal.value = "";
    });
    dz.addEventListener("dragover", (e) => {
      e.preventDefault();
      dz.classList.add("drag");
    });
    dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
    dz.addEventListener("drop", (e) => {
      e.preventDefault();
      dz.classList.remove("drag");
      anadirArchivos(tipo, e.dataTransfer.files);
    });
  }
  function anadirArchivos(tipo, fileList) {
    for (const f of fileList) {
      if (!f.type.startsWith("image/")) continue;
      archivos[tipo].push(f);
    }
    pintarPreviews(tipo);
    refrescarBotonSubir();
  }
  function pintarPreviews(tipo) {
    const cont = tipo === "antes" ? $("f_prevAntes") : $("f_prevDespues");
    cont.innerHTML = "";
    archivos[tipo].forEach((f, i) => {
      const div = document.createElement("div");
      div.className = "fthumb";
      const img = document.createElement("img");
      img.src = URL.createObjectURL(f);
      const x = document.createElement("button");
      x.className = "x";
      x.textContent = "×";
      x.onclick = () => {
        archivos[tipo].splice(i, 1);
        pintarPreviews(tipo);
        refrescarBotonSubir();
      };
      const bar = document.createElement("div");
      bar.className = "fbar";
      bar.dataset.i = i;
      div.append(img, x, bar);
      cont.appendChild(div);
    });
    const c = tipo === "antes" ? $("f_contAntes") : $("f_contDespues");
    c.textContent = archivos[tipo].length ? `${archivos[tipo].length} foto(s) lista(s)` : "";
  }
  function refrescarBotonSubir() {
    const total = archivos.antes.length + archivos.despues.length;
    $("f_btnSubir").disabled = !(clienteSel && total > 0);
  }

  /* ---------- SUBIR ---------- */
  function slug(s) {
    return (s || "")
      .normalize("NFD")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
  }
  function escaparHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[m]));
  }

  function initSubir() {
    $("f_btnSubir").addEventListener("click", async () => {
      if (!clienteSel) return;
      const total = archivos.antes.length + archivos.despues.length;
      if (total === 0) return;
      limpiaAviso($("f_avisoGlobal"));
      $("f_btnSubir").disabled = true;
      $("f_btnSubir").textContent = "Subiendo…";

      const sesionId = crypto.randomUUID();
      const nota = $("f_nota").value.trim() || null;
      const carpetaCliente = slug(clienteSel.nombre) + "-" + clienteSel.id.slice(0, 8);
      let subidas = 0,
        fallos = 0;
      const registros = [];

      for (const tipo of ["antes", "despues"]) {
        for (let i = 0; i < archivos[tipo].length; i++) {
          const f = archivos[tipo][i];
          const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
          const path = `${carpetaCliente}/${tipo}/${sesionId}-${i}-${slug(
            f.name.replace(/\.[^.]+$/, "")
          )}.${ext}`;
          const { error: upErr } = await sb.storage.from(BUCKET).upload(path, f, {
            cacheControl: "3600",
            upsert: false,
            contentType: f.type,
          });
          if (upErr) {
            fallos++;
            continue;
          }
          subidas++;
          registros.push({
            cliente_id: clienteSel.id,
            tipo,
            storage_path: path,
            nombre_archivo: f.name,
            sesion_id: sesionId,
            nota,
          });
          const cont = tipo === "antes" ? $("f_prevAntes") : $("f_prevDespues");
          const bar = cont.querySelector(`.fbar[data-i="${i}"]`);
          if (bar) bar.style.width = "100%";
        }
      }

      if (registros.length) {
        const { error: dbErr } = await sb.from("fotos_tratamiento").insert(registros);
        if (dbErr) {
          aviso(
            $("f_avisoGlobal"),
            `Las imágenes se subieron pero hubo un error al guardar el registro: ${dbErr.message}`,
            "err"
          );
          $("f_btnSubir").disabled = false;
          $("f_btnSubir").textContent = "Subir fotos";
          return;
        }
      }

      if (fallos === 0) {
        aviso($("f_avisoGlobal"), `✅ ${subidas} foto(s) subidas para ${escaparHtml(clienteSel.nombre)}.`, "ok");
        archivos = { antes: [], despues: [] };
        pintarPreviews("antes");
        pintarPreviews("despues");
        $("f_nota").value = "";
      } else {
        aviso(
          $("f_avisoGlobal"),
          `Se subieron ${subidas}, fallaron ${fallos}. Revisa tu conexión e inténtalo otra vez.`,
          "err"
        );
      }
      $("f_btnSubir").textContent = "Subir fotos";
      refrescarBotonSubir();
      const wrap = document.querySelector(".fotos-wrap");
      if (wrap) wrap.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ---------- ARRANQUE ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    if (!$("overlayFotos")) return; // el panel no está en la página
    initBuscador();
    initCliente();
    initNuevaCliente();
    initSubir();
    conectarZona("antes", "f_dzAntes", "f_camAntesBtn", "f_galAntesBtn", "f_camAntes", "f_galAntes");
    conectarZona("despues", "f_dzDespues", "f_camDespuesBtn", "f_galDespuesBtn", "f_camDespues", "f_galDespues");
  });
})();
