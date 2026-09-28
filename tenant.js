// =====================================================================
// tenant.js — resuelve qué organización (rifa) se muestra en esta página
// =====================================================================
// Por defecto se usa "jc-hogar" (tu rifa actual), así que la URL raíz
// (sin nada después del dominio) sigue mostrando siempre la misma rifa.
//
// Para otra organización, se puede usar cualquiera de estas dos formas:
//   - Por path (recomendado en Vercel):  tu-sitio.com/rifa-de-motos
//   - Por parámetro (compatible con GitHub Pages, que no reescribe
//     rutas): tu-sitio.com/index.html?t=rifa-de-motos
// Si están las dos, gana el parámetro ?t=.
// =====================================================================

const RIFA_SLUG_DEFAULT = "jc-hogar";

// Nombres de archivo que NUNCA son un slug de organización (evita que
// /admin.html o /index.html se interpreten como el nombre de una rifa)
const RUTAS_RESERVADAS = ["admin.html", "admin", "index.html", ""];

function resolverSlugRifa() {
  const params = new URLSearchParams(window.location.search);
  const t = params.get("t");
  if (t && t.trim() !== "") return t.trim().toLowerCase();

  // En GitHub Pages, el sitio vive dentro de una subcarpeta con el
  // nombre del repositorio (ej: /Rifa-oficial-JC-hogar/), así que el
  // primer segmento de la ruta NO es una organización — ahí solo vale
  // el parámetro ?t= de arriba. La ruta prolija (/rifa-mx-379) solo se
  // interpreta en un dominio propio (Vercel), donde no hay esa subcarpeta.
  const esGithubPages = window.location.hostname.endsWith(".github.io");

  if (!esGithubPages) {
    const segmentos = window.location.pathname.split("/").filter(Boolean);
    if (segmentos.length > 0) {
      const candidato = segmentos[0].toLowerCase();
      if (!RUTAS_RESERVADAS.includes(candidato)) return candidato;
    }
  }

  return RIFA_SLUG_DEFAULT;
}

window.RIFA_SLUG = resolverSlugRifa();