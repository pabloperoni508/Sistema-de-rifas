const contenedor = document.getElementById("numeros");

// Slug de la organización a mostrar (definido en tenant.js, cargado antes que este archivo)
const RIFA_SLUG = window.RIFA_SLUG;

// Última configuración pública conocida (se actualiza cada vez que se consulta)
let configActual = null;

// =============================
// NORMALIZAR ESTADOS
// =============================
function normalizarEstado(estado) {
  if (!estado) return "libre";
  const e = estado.toLowerCase().trim();
  if (e === "reservado" || e === "pendiente") return "pendiente";
  if (e === "vendido"   || e === "confirmado") return "confirmado";
  return "libre";
}

// =============================
// CONFIGURACIÓN PÚBLICA (reemplaza los SELECT directos a config_rifa)
// Siempre consulta Supabase y devuelve el dato más fresco.
// =============================
async function obtenerConfigPublica() {
  try {
    const { data, error } = await supabaseClient.rpc("get_rifa_publica", { p_slug: RIFA_SLUG });

    if (error) {
      console.warn("[config] Error al leer la rifa:", error.message);
      return null;
    }
    if (!data) {
      console.warn("[config] No se encontró ninguna rifa con el slug:", RIFA_SLUG);
      return null;
    }

    configActual = data;
    return data;

  } catch (err) {
    console.error("[config] Error inesperado:", err);
    return null;
  }
}

// =============================
// BLOQUEO — fuente de verdad
// =============================
async function cargarBloqueo() {
  const config = await obtenerConfigPublica();
  return config?.bloqueado === true;
}

// =============================
// CARGAR NÚMEROS
// =============================
async function cargarNumeros() {
  const bloqueado = await cargarBloqueo();

  const { data, error } = await supabaseClient.rpc("get_numeros_publicos", { p_slug: RIFA_SLUG });

  if (error) {
    console.error("Error al cargar números:", error);
    alert("Error al cargar números: " + error.message);
    return;
  }

  if (!contenedor) return;

  contenedor.innerHTML = "";

  (data || []).forEach(numero => {
    const boton = document.createElement("button");
    boton.textContent = numero.numero.toString().padStart(2, "0");

    const estado = normalizarEstado(numero.estado);
    boton.classList.add(estado);

    if (estado === "libre" && !bloqueado) {
      boton.onclick = () => comprarNumero(numero.numero);
    } else {
      boton.disabled = true;
      if (estado === "libre" && bloqueado) {
        boton.title = "La selección de números está temporalmente deshabilitada.";
      }
    }

    contenedor.appendChild(boton);
  });
}

// =============================
// RESERVAR NÚMERO
// =============================
async function comprarNumero(numero) {
  // Verificar bloqueo en tiempo real antes de cualquier acción
  const bloqueado = await cargarBloqueo();
  if (bloqueado) {
    alert("La selección de números está temporalmente deshabilitada.");
    await cargarNumeros();
    return;
  }

  // Pedir nombre
  const nombre = prompt("Ingrese su nombre:");
  if (!nombre || !nombre.trim()) return;

  // Pedir teléfono
  const telefono = prompt("Ingrese su número de teléfono (10 dígitos):");
  if (telefono === null) return;

  // Validar: exactamente 10 dígitos numéricos (misma regla de siempre;
  // el servidor la vuelve a validar como segunda línea de defensa)
  const soloNumeros = telefono.trim().replace(/\s/g, "");
  if (!/^\d{10}$/.test(soloNumeros)) {
    alert("Ingrese un número de teléfono válido (exactamente 10 dígitos numéricos).");
    return;
  }

  const { data, error } = await supabaseClient.rpc("reservar_numero", {
    p_slug:     RIFA_SLUG,
    p_numero:   numero,
    p_nombre:   nombre.trim(),
    p_telefono: soloNumeros
  });

  if (error) {
    console.error("ERROR SUPABASE:", error);
    alert("No se pudo reservar el número: " + error.message);
    return;
  }

  if (!data || data.ok !== true) {
    const err = data?.error;
    if (err === "bloqueado") {
      alert("La selección de números está temporalmente deshabilitada.");
    } else if (err === "telefono_invalido" || err === "nombre_invalido") {
      alert("Los datos ingresados no son válidos. Intentá de nuevo.");
    } else if (err === "rifa_no_encontrada") {
      alert("No se pudo encontrar esta rifa.");
    } else {
      alert("Ese número ya fue reservado por otra persona.");
    }
    cargarNumeros();
    return;
  }

  alert(`Número ${String(numero).padStart(2, "0")} reservado correctamente`);
  cargarNumeros();
}

// =============================
// CARGAR INFO DEL MODAL
// =============================
async function cargarInfoRifa() {
  const config = await obtenerConfigPublica();
  if (!config) return;

  const tituloInfo       = document.getElementById("tituloInfo");
  const subtituloInfo    = document.getElementById("subtituloInfo");
  const infoValor        = document.getElementById("infoValor");
  const infoPago         = document.getElementById("infoPago");
  const infoMensajeExtra = document.getElementById("infoMensajeExtra");
  const btnWhatsapp      = document.getElementById("btnWhatsappInfo");

  if (tituloInfo)       tituloInfo.textContent       = config.titulo_modal    || "Información de la Rifa";
  if (subtituloInfo)    subtituloInfo.textContent    = config.subtitulo_modal || "";
  if (infoValor)        infoValor.textContent        = config.valor_numero    || "-";
  if (infoPago)         infoPago.textContent         = config.forma_pago      || "-";
  if (infoMensajeExtra) infoMensajeExtra.textContent = config.mensaje_extra   || "-";

  if (btnWhatsapp) {
    if (config.whatsapp && String(config.whatsapp).trim() !== "") {
      btnWhatsapp.href          = `https://wa.me/${config.whatsapp}?text=Hola%20quiero%20consultar%20por%20la%20rifa`;
      btnWhatsapp.style.display = "flex";
    } else {
      btnWhatsapp.href          = "#";
      btnWhatsapp.style.display = "none";
    }
  }
}

// =============================
// BANNER DE PRESENTACIÓN
// =============================
async function cargarBanner() {
  try {
    const config = configActual || await obtenerConfigPublica();

    if (!config?.imagen_url) {
      console.info("cargarBanner: no hay imagen_url guardada.");
      return;
    }

    const banner    = document.getElementById("bannerPresentacion");
    const bannerImg = document.getElementById("bannerImg");

    if (!banner || !bannerImg) return;

    bannerImg.src        = config.imagen_url + "?t=" + Date.now();
    banner.style.display = "flex";
    document.body.classList.add("banner-abierto");

  } catch (err) {
    console.error("cargarBanner: error inesperado →", err);
  }
}

function cerrarBanner() {
  const banner = document.getElementById("bannerPresentacion");
  if (banner) {
    banner.classList.add("cerrando");
    setTimeout(() => {
      banner.style.display = "none";
      banner.classList.remove("cerrando");
      document.body.classList.remove("banner-abierto");
    }, 280);
  }
}

window.cerrarBanner = cerrarBanner;

// =============================
// MODAL INFO
// =============================
async function abrirInfo() {
  const modal = document.getElementById("modalInfo");
  if (!modal) return;

  await cargarInfoRifa();

  modal.classList.add("mostrar");
  document.body.classList.add("modal-abierto");
}

function cerrarInfo() {
  const modal = document.getElementById("modalInfo");
  if (modal) {
    modal.classList.remove("mostrar");
    document.body.classList.remove("modal-abierto");
  }
}

window.abrirInfo  = abrirInfo;
window.cerrarInfo = cerrarInfo;

window.addEventListener("click", function (e) {
  const modal = document.getElementById("modalInfo");
  if (e.target === modal) cerrarInfo();
});

window.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    cerrarInfo();
    cerrarBanner();
  }
});

// =============================
// TIEMPO REAL (Realtime Broadcast, por organización)
// Reemplaza los dos canales postgres_changes: ahora la base emite un
// mensaje por cada cambio, sin exponer nombre ni teléfono, y solo a
// quien esté mirando esta organización.
// =============================
function suscribirseRealtime(organizationId) {
  if (!organizationId) return;

  supabaseClient
    .channel(`rifa:${organizationId}`)
    .on("broadcast", { event: "numeros" }, () => {
      cargarNumeros();
    })
    .on("broadcast", { event: "config" }, () => {
      cargarInfoRifa();
      cargarNumeros(); // re-renderiza con el estado de bloqueo actualizado
    })
    .subscribe();
}

// =============================
// INICIO
// =============================
(async function iniciar() {
  const config = await obtenerConfigPublica();

  if (!config) {
    if (contenedor) {
      contenedor.innerHTML = "<p style='padding:20px;'>No se encontró esta rifa.</p>";
    }
    return;
  }

  await cargarNumeros();
  await cargarInfoRifa();
  await cargarBanner();
  suscribirseRealtime(config.organization_id);
})();