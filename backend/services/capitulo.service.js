const db = require("../models/db");

class CapituloService {

  // =========================
  // 🔧 NORMALIZACIÓN
  // =========================
  normalizar(texto) {
    return (texto || "")
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/[^a-z0-9áéíóúüñ\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  limpiarBusqueda(texto) {
    return this.normalizar(texto)
      .replace(/\bmanuales?\b/g, "")
      .replace(/\bvideo(s)?\b/g, "")
      .replace(/\bcap[ií]tulos?\b/g, "")
      .replace(/\bcurso(s)?\b/g, "")
      .trim();
  }

  // =========================
  // 👤 PERFILES DEL USUARIO
  // =========================
  async getPerfilesUsuario(userId) {

    userId = Number(userId);

    if (!userId || isNaN(userId)) {
      return [];
    }

    const sql = `
      SELECT PERFIL_ID
      FROM USUARIOS_PERFILES
      WHERE USUARIO_ID = ?
    `;

    const res = await db.query(sql, [userId]);

    return res.map(r => Number(r.PERFIL_ID));
  }

  // =========================
  // 🎬 BUSCAR CAPÍTULOS (LIMPIO)
  // =========================
  async buscarCapitulos(texto, userId) {

    userId = Number(userId);

    if (!userId || isNaN(userId)) return [];

    const perfiles = await this.getPerfilesUsuario(userId);

    if (!perfiles.length) return [];

    const base = this.limpiarBusqueda(texto);
    const placeholders = perfiles.map(() => "?").join(",");

    // =========================
    // 📌 BASE QUERY SEGURA
    // =========================
    const baseSql = `
      SELECT FIRST 10 DISTINCT
        C.CAPITULO_ID,
        C.TITULO,
        C.URL,
        C.FICHERO_NOMBRE,
        C.DESCRIPCION,
        C.ORDEN,
        C.VERSION,
        C.ES_ACTUAL
      FROM CAPITULOS C
      WHERE C.CAPITULO_ID IN (
        SELECT CP.CAPITULO_ID
        FROM CAPITULO_PERFILES CP
        WHERE CP.PERFIL_ID IN (${placeholders})
      )
    `;

    // =========================
    // 📌 SIN TEXTO
    // =========================
    if (!base) {
      return db.query(baseSql + " ORDER BY C.ORDEN", perfiles);
    }

    // =========================
    // 🔎 CON TEXTO
    // =========================
    return db.query(baseSql + `
      AND (
        LOWER(C.TITULO) CONTAINING ?
        OR LOWER(C.DESCRIPCION) CONTAINING ?
        OR LOWER(C.FICHERO_NOMBRE) CONTAINING ?
      )
      ORDER BY C.ORDEN
    `, [
      ...perfiles,
      base,
      base,
      base
    ]);
  }

  // =========================
  // 🎬 CAPÍTULOS POR GRUPO
  // =========================
  async buscarCapitulosPorGrupo(userId, grupoId) {

    userId = Number(userId);
    grupoId = Number(grupoId);

    if (!userId || isNaN(userId)) return [];
    if (!grupoId || isNaN(grupoId)) return [];

    const perfiles = await this.getPerfilesUsuario(userId);

    if (!perfiles.length) return [];

    const placeholders = perfiles.map(() => "?").join(",");

    const sql = `
      SELECT FIRST 50 DISTINCT
        C.CAPITULO_ID,
        C.TITULO,
        C.URL,
        C.FICHERO_NOMBRE,
        C.DESCRIPCION,
        C.ORDEN,
        C.VERSION,
        C.ES_ACTUAL
      FROM CAPITULOS C
      WHERE C.CAPITULO_ID IN (
        SELECT CP.CAPITULO_ID
        FROM CAPITULO_PERFILES CP
        WHERE CP.PERFIL_ID IN (${placeholders})
      )
      AND C.GRUPO_ID = ?
      ORDER BY C.ORDEN
    `;

    return db.query(sql, [...perfiles, grupoId]);
  }

  // =========================
  // 🔐 PERMISOS
  // =========================
  async puedeVerCapitulo(capituloId, userId) {

    capituloId = Number(capituloId);
    userId = Number(userId);

    if (!capituloId || !userId) return false;

    const perfiles = await this.getPerfilesUsuario(userId);

    if (!perfiles.length) return false;

    const placeholders = perfiles.map(() => "?").join(",");

    const sql = `
      SELECT FIRST 1 1
      FROM CAPITULO_PERFILES
      WHERE CAPITULO_ID = ?
      AND PERFIL_ID IN (${placeholders})
    `;

    const res = await db.query(sql, [
      capituloId,
      ...perfiles
    ]);

    return res.length > 0;
  }
}

module.exports = new CapituloService();