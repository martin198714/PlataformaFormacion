const db = require("../models/db");

class ArchivoService {

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
      .replace(/\bpdf\b/g, "")
      .replace(/\bdocumentos?\b/g, "")
      .replace(/\barchivos?\b/g, "")
      .replace(/\bgu[ií]a\b/g, "")
      .trim();
  }

  async getPerfilesUsuario(userId) {

    userId = Number(userId);
    if (!userId || isNaN(userId)) return [];

    const sql = `
      SELECT PERFIL_ID
      FROM USUARIOS_PERFILES
      WHERE USUARIO_ID = ?
    `;

    const res = await db.query(sql, [userId]);
    return res.map(r => Number(r.PERFIL_ID));
  }

  async buscarArchivo(texto, userId) {

    userId = Number(userId);
    if (!userId || isNaN(userId)) return [];

    const perfiles = await this.getPerfilesUsuario(userId);
    if (!perfiles.length) return [];

    const base = this.limpiarBusqueda(texto);
    const placeholders = perfiles.map(() => "?").join(",");

    if (!base) {

      const sql = `
        SELECT FIRST 10 DISTINCT
          A.ARCHIVO_ID,
          A.TITULO,
          A.URL,
          A.FICHERO_NOMBRE,
          A.DESCRIPCION
        FROM ARCHIVOS A
        INNER JOIN ARCHIVO_PERFILES AP
          ON AP.ARCHIVO_ID = A.ARCHIVO_ID
        WHERE AP.PERFIL_ID IN (${placeholders})
      `;

      return db.query(sql, perfiles);
    }

    const sql = `
      SELECT FIRST 10 DISTINCT
        A.ARCHIVO_ID,
        A.TITULO,
        A.URL,
        A.FICHERO_NOMBRE,
        A.DESCRIPCION
      FROM ARCHIVOS A
      INNER JOIN ARCHIVO_PERFILES AP
        ON AP.ARCHIVO_ID = A.ARCHIVO_ID
      WHERE AP.PERFIL_ID IN (${placeholders})
      AND (
        LOWER(A.TITULO) CONTAINING ?
        OR LOWER(A.DESCRIPCION) CONTAINING ?
        OR LOWER(A.FICHERO_NOMBRE) CONTAINING ?
      )
    `;

    return db.query(sql, [
      ...perfiles,
      base,
      base,
      base
    ]);
  }

  async buscarManuales(userId) {

    userId = Number(userId);
    if (!userId || isNaN(userId)) return [];

    const perfiles = await this.getPerfilesUsuario(userId);
    if (!perfiles.length) return [];

    const placeholders = perfiles.map(() => "?").join(",");

    const sql = `
      SELECT FIRST 50 DISTINCT
        A.ARCHIVO_ID,
        A.TITULO,
        A.URL,
        A.FICHERO_NOMBRE,
        A.DESCRIPCION
      FROM ARCHIVOS A
      INNER JOIN ARCHIVO_PERFILES AP
        ON AP.ARCHIVO_ID = A.ARCHIVO_ID
      WHERE AP.PERFIL_ID IN (${placeholders})
      ORDER BY A.TITULO
    `;

    return db.query(sql, perfiles);
  }

  async getArchivoById(archivoId) {

    archivoId = Number(archivoId);
    if (!archivoId) return null;

    const sql = `
      SELECT FIRST 1
        ARCHIVO_ID,
        TITULO,
        URL,
        FICHERO_NOMBRE
      FROM ARCHIVOS
      WHERE ARCHIVO_ID = ?
    `;

    const res = await db.query(sql, [archivoId]);
    return res[0] || null;
  }
}

module.exports = new ArchivoService();