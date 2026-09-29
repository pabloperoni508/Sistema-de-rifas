// =========================
// LOGIN (Supabase Auth)
// =========================

// Organización del usuario logueado. Se completa al iniciar sesión.
let orgActual = null;

// Busca la organización del usuario autenticado (hoy cada usuario
// pertenece a una sola organización; si en el futuro pertenece a
// varias, se toma la primera).
async function obtenerOrganizacionActual() {
  const { data: membresia, error: errorMembresia } = await supabaseClient
    .from("organization_members")
    .select("organization_id")
    .limit(1)
    .single();

  if (errorMembresia || !membresia?.organization_id) return null;

  const { data: organizacion, error: errorOrg } = await supabaseClient
    .from("organizations")
    .select("id, slug, name")
    .eq("id", membresia.organization_id)
    .single();

  if (errorOrg || !organizacion) return null;
  return organizacion;
}

function mostrarPanel() {
  document.getElementById("pantallaLogin").style.display = "none";
  document.getElementById("panelAdmin").style.display    = "block";
}

function mostrarLogin() {
  document.getElementById("pantallaLogin").style.display = "flex";
  document.getElementById("panelAdmin").style.display    = "none";
}

async function intentarLogin() {
  const email = document.getElementById("inputEmail").value.trim();
  const pass  = document.getElementById("inputPassword").value;
  const error = document.getElementById("loginError");
  const btn   = document.getElementById("btnLogin");

  if (!email || !pass.trim()) return;

  btn.disabled     = true;
  btn.textContent  = "Verificando...";
  error.style.display = "none";

  const { error: authError } = await supabaseClient.auth.signInWithPassword({
    email,
    password: pass
  });

  if (authError) {
    error.textContent   = "Email o contraseña incorrectos.";
    error.style.display = "block";
    btn.disabled    = false;
    btn.textContent = "Ingresar";
    return;
  }

  orgActual = await obtenerOrganizacionActual();

  if (!orgActual) {
    error.textContent   = "Tu usuario no está vinculado a ninguna organización todavía.";
    error.style.display = "block";
    await supabaseClient.auth.signOut();
    btn.disabled    = false;
    btn.textContent = "Ingresar";
    return;
  }

  mostrarPanel();
  await iniciarAdmin();
  btn.disabled    = false;
  btn.textContent = "Ingresar";
}

// Enter en el input de password dispara login
document.getElementById("inputPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") intentarLogin();
});

document.getElementById("btnLogin").addEventListener("click", intentarLogin);

// Mostrar/ocultar contraseña
document.getElementById("btnVerPass").addEventListener("click", () => {
  const input = document.getElementById("inputPassword");
  input.type  = input.type === "password" ? "text" : "password";
});

// Cerrar sesión
document.getElementById("btnCerrarSesion").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  orgActual = null;
  document.getElementById("inputEmail").value    = "";
  document.getElementById("inputPassword").value = "";
  mostrarLogin();
});

// Al cargar la página: si ya hay una sesión de Supabase Auth activa
// (persistida por el propio cliente), ir directo al panel.
(async function verificarSesionAlCargar() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (session) {
    orgActual = await obtenerOrganizacionActual();
    if (orgActual) {
      mostrarPanel();
      await iniciarAdmin();
      return;
    }
    // Sesión válida pero sin organización vinculada: no dejar pasar.
    await supabaseClient.auth.signOut();
  }

  mostrarLogin();
})();

// =========================
// VARIABLES DEL PANEL
// =========================
const tablaAdmin = document.getElementById("tablaAdmin");

const tituloModalInput    = document.getElementById("tituloModalInput");
const subtituloModalInput = document.getElementById("subtituloModalInput");
const valorNumeroInput    = document.getElementById("valorNumeroInput");
const formaPagoInput      = document.getElementById("formaPagoInput");
const whatsappInput       = document.getElementById("whatsappInput");
const mensajeExtraInput   = document.getElementById("mensajeExtraInput");

const btnGuardarConfig = document.getElementById("btnGuardarConfig");
const btnLimpiarGrilla = document.getElementById("btnLimpiarGrilla");

// =========================
// NORMALIZAR ESTADOS
// =========================
function normalizarEstado(estado) {
  if (!estado) return "libre";

  const e = estado.toLowerCase().trim();

  if (e === "reservado") return "pendiente";
  if (e === "vendido") return "confirmado";

  if (e === "pendiente") return "pendiente";
  if (e === "confirmado") return "confirmado";
  if (e === "libre") return "libre";

  return "libre";
}

// =========================
// CARGAR CONFIGURACIÓN
// =========================
async function cargarConfig() {
  try {
    const { data, error } = await supabaseClient
      .from("config_rifa")
      .select("*")
      .eq("organization_id", orgActual.id)
      .single();

    if (error) {
      console.warn("No se pudo cargar config_rifa:", error.message);
      return;
    }

    tituloModalInput.value = data.titulo_modal || "";
    subtituloModalInput.value = data.subtitulo_modal || "";
    valorNumeroInput.value = data.valor_numero || "";
    formaPagoInput.value = data.forma_pago || "";
    whatsappInput.value = data.whatsapp || "";
    mensajeExtraInput.value = data.mensaje_extra || "";

  } catch (err) {
    console.error("Error al cargar configuración:", err);
  }
}

// =========================
// GUARDAR CONFIGURACIÓN
// =========================
async function guardarConfig() {
  try {
    const payload = {
      organization_id: orgActual.id,
      titulo_modal: tituloModalInput.value.trim(),
      subtitulo_modal: subtituloModalInput.value.trim(),
      valor_numero: valorNumeroInput.value.trim(),
      forma_pago: formaPagoInput.value.trim(),
      whatsapp: whatsappInput.value.trim(),
      mensaje_extra: mensajeExtraInput.value.trim()
    };

    const { error } = await supabaseClient
      .from("config_rifa")
      .upsert(payload, { onConflict: "organization_id" });

    if (error) {
      console.error("Error al guardar configuración:", error);
      alert("No se pudo guardar la información: " + error.message);
      return;
    }

    alert("Los cambios han sido guardados correctamente.");

  } catch (err) {
    console.error("Error inesperado al guardar config:", err);
    alert("Ocurrió un error inesperado al guardar la configuración.");
  }
}

// Evita que nombre/teléfono se interpreten como HTML en la tabla
function escapeHtml(texto) {
  if (!texto) return texto;
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

// =========================
// CARGAR TABLA ADMIN
// =========================
async function cargarTablaAdmin() {
  try {
    const { data, error } = await supabaseClient
      .from("numeros_rifa")
      .select("*")
      .eq("organization_id", orgActual.id)
      .order("numero", { ascending: true });

    if (error) {
      console.error("Error al cargar la tabla:", error);
      alert("Error al cargar la tabla: " + error.message);
      return;
    }

    tablaAdmin.innerHTML = "";

    data.forEach(item => {
      const estado = normalizarEstado(item.estado);
      const fila = document.createElement("tr");

      let accionesHTML = "";

      if (estado === "pendiente") {
        accionesHTML = `
          <button class="btn-confirmar" onclick="confirmarNumero(${item.numero})">Aceptar</button>
          <button class="btn-cancelar" onclick="cancelarNumero(${item.numero})">Cancelar</button>
        `;
      } else if (estado === "confirmado") {
        accionesHTML = `
          <button class="btn-cancelar" onclick="cancelarNumero(${item.numero})">Cancelar</button>
        `;
      } else {
        accionesHTML = `<span style="color:#777;">-</span>`;
      }

      // escapeHtml() evita que un nombre o teléfono con caracteres como
      // < > se interprete como HTML al insertarlo en la tabla.
      fila.innerHTML = `
        <td>${String(item.numero).padStart(2, "0")}</td>
        <td>${escapeHtml(item.nombre) || "-"}</td>
        <td>${escapeHtml(item.telefono) || "-"}</td>
        <td>
          <span class="estado-badge ${estado}">${estado}</span>
        </td>
        <td class="acciones-celda">
          ${accionesHTML}
        </td>
      `;

      tablaAdmin.appendChild(fila);
    });

  } catch (err) {
    console.error("Error inesperado al cargar tabla admin:", err);
  }
}

// =========================
// ACEPTAR NÚMERO (CONFIRMAR)
// =========================
async function confirmarNumero(numero) {
  try {
    const { error } = await supabaseClient
      .from("numeros_rifa")
      .update({ estado: "confirmado" })
      .eq("organization_id", orgActual.id)
      .eq("numero", numero);

    if (error) {
      console.error("Error al confirmar número:", error);
      alert("No se pudo confirmar el número: " + error.message);
      return;
    }

    await cargarTablaAdmin();
    alert(`El número ${String(numero).padStart(2, "0")} fue confirmado correctamente.`);

  } catch (err) {
    console.error("Error inesperado al confirmar número:", err);
    alert("Ocurrió un error inesperado.");
  }
}

// =========================
// CANCELAR NÚMERO (VOLVER A LIBRE)
// =========================
async function cancelarNumero(numero) {
  try {
    const { error } = await supabaseClient
      .from("numeros_rifa")
      .update({
        nombre:   null,
        telefono: null,
        estado:   "libre"
      })
      .eq("organization_id", orgActual.id)
      .eq("numero", numero);

    if (error) {
      console.error("Error al cancelar número:", error);
      alert("No se pudo cancelar el número: " + error.message);
      return;
    }

    await cargarTablaAdmin();
    alert(`El número ${String(numero).padStart(2, "0")} volvió a LIBRE.`);

  } catch (err) {
    console.error("Error inesperado al cancelar número:", err);
    alert("Ocurrió un error inesperado.");
  }
}

// =========================
// LIMPIAR TODA LA GRILLA
// =========================
async function limpiarGrillaEntera() {
  const confirmar = window.confirm("¿Seguro que querés limpiar toda la grilla? Esto pondrá TODOS los números en LIBRE.");

  if (!confirmar) return;

  try {
    const { error } = await supabaseClient
      .from("numeros_rifa")
      .update({
        nombre:   null,
        telefono: null,
        estado:   "libre"
      })
      .eq("organization_id", orgActual.id);

    if (error) {
      console.error("Error al limpiar la grilla:", error);
      alert("No se pudo limpiar la grilla: " + error.message);
      return;
    }

    await cargarTablaAdmin();
    alert("La grilla completa fue reiniciada correctamente.");

  } catch (err) {
    console.error("Error inesperado al limpiar grilla:", err);
    alert("Ocurrió un error inesperado.");
  }
}

// =========================
// EVENTOS
// =========================
if (btnGuardarConfig) {
  btnGuardarConfig.addEventListener("click", guardarConfig);
}

if (btnLimpiarGrilla) {
  btnLimpiarGrilla.addEventListener("click", limpiarGrillaEntera);
}

// =========================
// HACER FUNCIONES GLOBALES
// (porque las usa onclick en la tabla)
// =========================
window.confirmarNumero = confirmarNumero;
window.cancelarNumero = cancelarNumero;

// =========================
// INICIO DEL PANEL (se llama solo después de un login exitoso,
// una vez que orgActual ya está disponible)
// =========================
async function iniciarAdmin() {
  document.title = "Admin - " + orgActual.name;
  await cargarConfig();
  await cargarTablaAdmin();
  await cargarImagenActual();
  await cargarFaviconActual();
  await cargarEstadoBloqueo();
}

// =========================
// DESCARGAR RIFA (CSV)
// =========================
async function descargarRifaCSV() {
  try {
    const { data, error } = await supabaseClient
      .from("numeros_rifa")
      .select("*")
      .eq("organization_id", orgActual.id)
      .order("numero", { ascending: true });

    if (error) {
      console.error("Error al obtener datos para CSV:", error);
      alert("No se pudieron obtener los datos: " + error.message);
      return;
    }

    // Encabezado
    const filas = [["Número", "Nombre","N° celular", "Estado"]];

    data.forEach(item => {
      filas.push([
        String(item.numero).padStart(2, "0"),
        item.nombre || "-",
        item.telefono || "-",
        normalizarEstado(item.estado)
      ]);
    });

    // Convertir a texto CSV
    const csvContent = filas
      .map(fila => fila.map(celda => `"${celda}"`).join(";"))
      .join("\n");

    // Agregar BOM para que Excel abra bien los acentos
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href     = url;
    link.download = `rifa_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

  } catch (err) {
    console.error("Error inesperado al descargar CSV:", err);
    alert("Ocurrió un error inesperado al descargar.");
  }
}

const btnDescargarRifa = document.getElementById("btnDescargarRifa");
if (btnDescargarRifa) {
  btnDescargarRifa.addEventListener("click", descargarRifaCSV);
}

// =========================
// IMAGEN DE PRESENTACIÓN
// =========================
const STORAGE_BUCKET = "rifa-imagenes"; // <-- nombre del bucket en Supabase Storage

const inputImagen        = document.getElementById("inputImagen");
const btnSeleccionarImg  = document.getElementById("btnSeleccionarImagen");
const btnSubirImagen     = document.getElementById("btnSubirImagen");
const btnQuitarImagen    = document.getElementById("btnQuitarImagen");
const uploadArea         = document.getElementById("uploadArea");
const uploadPlaceholder  = document.getElementById("uploadPlaceholder");
const previewActual      = document.getElementById("previewActual");
const imgPreviewActual   = document.getElementById("imgPreviewActual");
const uploadStatus       = document.getElementById("uploadStatus");

let archivoSeleccionado = null;

// Mostrar estado en el área de upload
function mostrarStatus(mensaje, tipo = "info") {
  uploadStatus.textContent = mensaje;
  uploadStatus.className   = `upload-status visible status-${tipo}`;
}

function ocultarStatus() {
  uploadStatus.className = "upload-status";
}

// Cargar imagen actual desde config_rifa
async function cargarImagenActual() {
  try {
    const { data, error } = await supabaseClient
      .from("config_rifa")
      .select("imagen_url")
      .eq("organization_id", orgActual.id)
      .single();

    if (error || !data?.imagen_url) return;

    imgPreviewActual.src      = data.imagen_url;
    previewActual.style.display  = "flex";
    btnQuitarImagen.style.display = "inline-block";
  } catch (err) {
    console.error("Error al cargar imagen actual:", err);
  }
}

// Preview local al seleccionar archivo
function previsualizarArchivo(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    imgPreviewActual.src       = e.target.result;
    previewActual.style.display  = "flex";
    uploadPlaceholder.style.display = "none";
  };
  reader.readAsDataURL(file);
}

// Subir imagen a Supabase Storage y guardar URL en config_rifa
// (el path del archivo sigue siendo el mismo de siempre; el aislamiento
// por organización en Storage se activa junto con el corte de seguridad
// final, cuando además haya más de una organización subiendo imágenes)
async function subirImagen() {
  if (!archivoSeleccionado) return;

  btnSubirImagen.disabled    = true;
  btnSubirImagen.textContent = "Subiendo...";
  mostrarStatus("Subiendo imagen...", "info");

  try {
    // 1. Usar extensión real del archivo para evitar problemas de tipo
    const ext        = archivoSeleccionado.name.split(".").pop().toLowerCase() || "jpg";
    const storagePath = orgActual.id + "/presentacion/banner." + ext;

    // 2. Subir al bucket (upsert = sobreescribe si ya existe)
    const { error: uploadError } = await supabaseClient.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, archivoSeleccionado, {
        upsert: true,
        contentType: archivoSeleccionado.type
      });

    if (uploadError) {
      const msg = "Error al subir al Storage: " + uploadError.message;
      mostrarStatus(msg, "error");
      alert("❌ " + msg);
      btnSubirImagen.disabled    = false;
      btnSubirImagen.textContent = "⬆ Subir imagen";
      return;
    }

    // 3. Obtener URL pública SIN cache-bust (se agrega al mostrar, no al guardar)
    const { data: urlData } = supabaseClient.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    const urlBase = urlData.publicUrl;

    if (!urlBase) {
      const msg = "No se pudo obtener la URL pública. ¿El bucket es público?";
      mostrarStatus(msg, "error");
      alert("❌ " + msg);
      btnSubirImagen.disabled    = false;
      btnSubirImagen.textContent = "⬆ Subir imagen";
      return;
    }

    // 4. Guardar URL limpia en config_rifa
    const { error: dbError } = await supabaseClient
      .from("config_rifa")
      .upsert(
        { organization_id: orgActual.id, imagen_url: urlBase, imagen_path: storagePath },
        { onConflict: "organization_id" }
      );

    if (dbError) {
      const msg = "Imagen subida al Storage pero no se pudo guardar la URL en la base de datos: " + dbError.message;
      mostrarStatus(msg, "error");
      alert("❌ " + msg);
      return;
    }

    // 5. Todo OK
    mostrarStatus("✓ Imagen subida y guardada correctamente.", "ok");
    alert("✅ Imagen subida correctamente. Ya aparecerá en el index.");
    btnSubirImagen.textContent        = "⬆ Subir imagen";
    btnQuitarImagen.style.display     = "inline-block";
    archivoSeleccionado               = null;
    btnSubirImagen.disabled           = true;

  } catch (err) {
    console.error("Error inesperado al subir imagen:", err);
    const msg = "Error inesperado: " + err.message;
    mostrarStatus(msg, "error");
    alert("❌ " + msg);
    btnSubirImagen.disabled    = false;
    btnSubirImagen.textContent = "⬆ Subir imagen";
  }
}

// Quitar imagen: borra del storage y limpia la URL en config_rifa
async function quitarImagen() {
  const confirmar = window.confirm("¿Seguro que querés quitar la imagen de presentación?");
  if (!confirmar) return;

  mostrarStatus("Quitando imagen...", "info");

  try {
    const { data: fila } = await supabaseClient
      .from("config_rifa")
      .select("imagen_path")
      .eq("organization_id", orgActual.id)
      .single();

    if (fila?.imagen_path) {
      await supabaseClient.storage.from(STORAGE_BUCKET).remove([fila.imagen_path]);
    }

    const { error } = await supabaseClient
      .from("config_rifa")
      .update({ imagen_url: null, imagen_path: null })
      .eq("organization_id", orgActual.id);

    if (error) {
      mostrarStatus("Error al quitar la imagen: " + error.message, "error");
      return;
    }

    imgPreviewActual.src         = "";
    previewActual.style.display  = "none";
    uploadPlaceholder.style.display = "flex";
    btnQuitarImagen.style.display   = "none";
    archivoSeleccionado = null;
    btnSubirImagen.disabled = true;
    mostrarStatus("Imagen quitada correctamente.", "ok");

  } catch (err) {
    console.error("Error al quitar imagen:", err);
    mostrarStatus("Ocurrió un error inesperado.", "error");
  }
}

// === EVENTOS DEL UPLOADER ===

if (btnSeleccionarImg) {
  btnSeleccionarImg.addEventListener("click", () => inputImagen.click());
}

if (inputImagen) {
  inputImagen.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      mostrarStatus("La imagen no puede superar 5 MB.", "error");
      return;
    }

    archivoSeleccionado = file;
    previsualizarArchivo(file);
    btnSubirImagen.disabled = false;
    ocultarStatus();
  });
}

// Drag & drop
if (uploadArea) {
  uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadArea.classList.add("drag-over");
  });

  uploadArea.addEventListener("dragleave", () => {
    uploadArea.classList.remove("drag-over");
  });

  uploadArea.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadArea.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) return;

    if (file.size > 5 * 1024 * 1024) {
      mostrarStatus("La imagen no puede superar 5 MB.", "error");
      return;
    }

    archivoSeleccionado = file;
    previsualizarArchivo(file);
    btnSubirImagen.disabled = false;
    ocultarStatus();
  });
}

if (btnSubirImagen) {
  btnSubirImagen.addEventListener("click", subirImagen);
}

if (btnQuitarImagen) {
  btnQuitarImagen.addEventListener("click", quitarImagen);
}

// =========================
// FAVICON
// =========================
const inputFavicon       = document.getElementById("inputFavicon");
const btnSeleccionarFav  = document.getElementById("btnSeleccionarFavicon");
const btnSubirFavicon    = document.getElementById("btnSubirFavicon");
const btnQuitarFavicon   = document.getElementById("btnQuitarFavicon");
const previewFavicon     = document.getElementById("previewFaviconActual");
const imgPreviewFavicon  = document.getElementById("imgPreviewFavicon");
const faviconPlaceholder = document.getElementById("faviconUploadPlaceholder");
const faviconStatus      = document.getElementById("faviconStatus");

let faviconSeleccionado = null;

function mostrarFaviconStatus(mensaje, tipo = "info") {
  faviconStatus.textContent = mensaje;
  faviconStatus.className   = `upload-status visible status-${tipo}`;
}

async function cargarFaviconActual() {
  try {
    const { data, error } = await supabaseClient
      .from("config_rifa")
      .select("favicon_url")
      .eq("organization_id", orgActual.id)
      .single();

    if (error || !data?.favicon_url) return;

    imgPreviewFavicon.src          = data.favicon_url;
    previewFavicon.style.display   = "flex";
    btnQuitarFavicon.style.display = "inline-block";
  } catch (err) {
    console.error("Error al cargar favicon actual:", err);
  }
}

async function subirFavicon() {
  if (!faviconSeleccionado) return;

  btnSubirFavicon.disabled    = true;
  btnSubirFavicon.textContent = "Subiendo...";
  mostrarFaviconStatus("Subiendo favicon...", "info");

  try {
    const ext         = faviconSeleccionado.name.split(".").pop().toLowerCase() || "ico";
    const storagePath = orgActual.id + "/favicon." + ext;

    const { error: uploadError } = await supabaseClient.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, faviconSeleccionado, {
        upsert: true,
        contentType: faviconSeleccionado.type || "image/x-icon"
      });

    if (uploadError) {
      mostrarFaviconStatus("Error al subir: " + uploadError.message, "error");
      btnSubirFavicon.disabled    = false;
      btnSubirFavicon.textContent = "⬆ Subir favicon";
      return;
    }

    const { data: urlData } = supabaseClient.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    const { error: dbError } = await supabaseClient
      .from("config_rifa")
      .upsert(
        { organization_id: orgActual.id, favicon_url: urlData.publicUrl, favicon_path: storagePath },
        { onConflict: "organization_id" }
      );

    if (dbError) {
      mostrarFaviconStatus("Favicon subido pero no se pudo guardar: " + dbError.message, "error");
      return;
    }

    mostrarFaviconStatus("✓ Favicon guardado correctamente.", "ok");
    btnSubirFavicon.textContent    = "⬆ Subir favicon";
    btnQuitarFavicon.style.display = "inline-block";
    faviconSeleccionado            = null;
    btnSubirFavicon.disabled       = true;

  } catch (err) {
    console.error("Error inesperado al subir favicon:", err);
    mostrarFaviconStatus("Error inesperado: " + err.message, "error");
    btnSubirFavicon.disabled    = false;
    btnSubirFavicon.textContent = "⬆ Subir favicon";
  }
}

async function quitarFavicon() {
  const confirmar = window.confirm("¿Seguro que querés quitar el favicon?");
  if (!confirmar) return;

  mostrarFaviconStatus("Quitando favicon...", "info");

  try {
    const { data: fila } = await supabaseClient
      .from("config_rifa")
      .select("favicon_path")
      .eq("organization_id", orgActual.id)
      .single();

    if (fila?.favicon_path) {
      await supabaseClient.storage.from(STORAGE_BUCKET).remove([fila.favicon_path]);
    }

    const { error } = await supabaseClient
      .from("config_rifa")
      .update({ favicon_url: null, favicon_path: null })
      .eq("organization_id", orgActual.id);

    if (error) {
      mostrarFaviconStatus("Error al quitar el favicon: " + error.message, "error");
      return;
    }

    imgPreviewFavicon.src             = "";
    previewFavicon.style.display      = "none";
    faviconPlaceholder.style.display  = "flex";
    btnQuitarFavicon.style.display    = "none";
    faviconSeleccionado = null;
    btnSubirFavicon.disabled = true;
    mostrarFaviconStatus("Favicon quitado correctamente.", "ok");

  } catch (err) {
    console.error("Error al quitar favicon:", err);
    mostrarFaviconStatus("Ocurrió un error inesperado.", "error");
  }
}

if (btnSeleccionarFav) {
  btnSeleccionarFav.addEventListener("click", () => inputFavicon.click());
}

if (inputFavicon) {
  inputFavicon.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 1 * 1024 * 1024) {
      mostrarFaviconStatus("El favicon no puede superar 1 MB.", "error");
      return;
    }

    faviconSeleccionado = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      imgPreviewFavicon.src            = ev.target.result;
      previewFavicon.style.display     = "flex";
      faviconPlaceholder.style.display = "none";
    };
    reader.readAsDataURL(file);

    btnSubirFavicon.disabled = false;
  });
}

if (btnSubirFavicon) {
  btnSubirFavicon.addEventListener("click", subirFavicon);
}

if (btnQuitarFavicon) {
  btnQuitarFavicon.addEventListener("click", quitarFavicon);
}

// =========================
// CAMBIAR CONTRASEÑA (ahora usa Supabase Auth)
// =========================
async function cambiarPassword() {
  const actual    = document.getElementById("passActualInput").value.trim();
  const nueva     = document.getElementById("passNuevaInput").value.trim();
  const confirmar = document.getElementById("passConfirmarInput").value.trim();

  if (!actual || !nueva || !confirmar) {
    alert("Completá todos los campos.");
    return;
  }

  if (nueva !== confirmar) {
    alert("La contraseña nueva y la confirmación no coinciden.");
    return;
  }

  if (nueva.length < 6) {
    alert("La contraseña nueva debe tener al menos 6 caracteres.");
    return;
  }

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user?.email) {
    alert("No se pudo verificar tu sesión. Volvé a iniciar sesión e intentá de nuevo.");
    return;
  }

  // Verificar la contraseña actual re-autenticando con ella
  const { error: reauthError } = await supabaseClient.auth.signInWithPassword({
    email: user.email,
    password: actual
  });
  if (reauthError) {
    alert("La contraseña actual es incorrecta.");
    return;
  }

  const { error } = await supabaseClient.auth.updateUser({ password: nueva });
  if (error) {
    alert("Error al cambiar la contraseña: " + error.message);
    return;
  }

  alert("✅ Contraseña cambiada correctamente.");
  document.getElementById("passActualInput").value    = "";
  document.getElementById("passNuevaInput").value     = "";
  document.getElementById("passConfirmarInput").value = "";
}

document.getElementById("btnCambiarPass").addEventListener("click", cambiarPassword);

// =========================
// BLOQUEAR / DESBLOQUEAR NÚMEROS
// =========================
const btnBloquear = document.getElementById("btnBloquear");

async function cargarEstadoBloqueo() {
  try {
    const { data, error } = await supabaseClient
      .from("config_rifa")
      .select("bloqueado")
      .eq("organization_id", orgActual.id)
      .single();

    if (error) return;

    actualizarBotonBloqueo(data.bloqueado === true);
  } catch (err) {
    console.error("Error al cargar estado de bloqueo:", err);
  }
}

function actualizarBotonBloqueo(estaBloqueado) {
  if (!btnBloquear) return;

  if (estaBloqueado) {
    btnBloquear.textContent = "🔓 Desbloquear números";
    btnBloquear.className   = "btn-desbloquear";
  } else {
    btnBloquear.textContent = "🔒 Bloquear números";
    btnBloquear.className   = "btn-bloquear";
  }

  btnBloquear.dataset.bloqueado = estaBloqueado ? "1" : "0";
}

async function toggleBloqueo() {
  const estaBloqueado = btnBloquear.dataset.bloqueado === "1";
  const nuevoEstado   = !estaBloqueado;

  const accion = nuevoEstado ? "bloquear" : "desbloquear";
  const confirmar = window.confirm(`¿Seguro que querés ${accion} la selección de números?`);
  if (!confirmar) return;

  btnBloquear.disabled = true;

  const { error } = await supabaseClient
    .from("config_rifa")
    .update({ bloqueado: nuevoEstado })
    .eq("organization_id", orgActual.id);

  if (error) {
    alert("No se pudo cambiar el estado: " + error.message);
    btnBloquear.disabled = false;
    return;
  }

  actualizarBotonBloqueo(nuevoEstado);
  btnBloquear.disabled = false;
  alert(nuevoEstado
    ? "🔒 Números bloqueados. Los usuarios no pueden seleccionar."
    : "🔓 Números desbloqueados. Los usuarios pueden seleccionar."
  );
}

if (btnBloquear) {
  btnBloquear.addEventListener("click", toggleBloqueo);
}