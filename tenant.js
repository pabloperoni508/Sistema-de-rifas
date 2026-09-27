// =====================================================================
// tenant.js — resuelve qué organización (rifa) se muestra en esta página
// =====================================================================
// Por defecto se usa "jc-hogar" (tu rifa actual), así que los links y QR
// ya impresos siguen funcionando exactamente igual, sin parámetro.
//
// Para una segunda organización, se agrega ?t=slug-de-la-org a la URL,
// por ejemplo: index.html?t=rifa-de-motos
// =====================================================================

const RIFA_SLUG_DEFAULT = "jc-hogar";

function resolverSlugRifa() {
  const params = new URLSearchParams(window.location.search);
  const t = params.get("t");
  if (t && t.trim() !== "") return t.trim().toLowerCase();
  return RIFA_SLUG_DEFAULT;
}

window.RIFA_SLUG = resolverSlugRifa();