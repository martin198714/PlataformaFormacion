const db = require("../models/db");

class KnowledgeService {
  normalizar(texto) {
    return (texto || "")
      .toLowerCase()
      .replace(/[^\w\s.]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  extraerTerminos(texto) {
    const stopWords = [
      "curso",
      "cursos",
      "quiero",
      "ver",
      "mostrar",
      "muestrame",
      "muéstrame",
      "buscar",
      "necesito",
      "informacion",
      "información",
      "sobre",
      "del",
      "de",
      "el",
      "la",
      "los",
      "las",
    ];

    return this.normalizar(texto)
      .split(/\s+/)
      .filter((t) => t.length > 1 && !stopWords.includes(t));
  }

  async buscarCurso(texto, usuarioId) {

    const terminos = this.extraerTerminos(texto).slice(0, 4);

    if (!terminos.length) {
      console.log("Sin términos");
      return [];
    }

    const sql = `
    SELECT FIRST 10 *
    FROM CURSOS
    WHERE PERFIL_ID IN (
      SELECT PERFIL_ID
      FROM USUARIOS_PERFILES
      WHERE USUARIO_ID = ?
    )
    AND (
      ${terminos
        .map(
          () =>
            `(LOWER(TITULO) CONTAINING ? OR LOWER(DESCRIPCION) CONTAINING ?)`,
        )
        .join(" OR ")}
    )
  `;

    const params = [usuarioId, ...terminos.flatMap((t) => [t, t])];

    const resultado = await db.query(sql, params);

    return resultado;
  }
}

module.exports = new KnowledgeService();
