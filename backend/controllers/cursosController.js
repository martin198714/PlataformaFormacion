const { getConnection } = require('../models/db');

// ============================
// UTIL
// ============================
function limpiarTitulo(titulo) {
  return String(titulo || "")
    .replace(/^\s*0+\.?\s*/, "")
    .replace(/^\.\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================
// CALENDARIO
// ============================
exports.getCursosEstado = (req, res) => {

  getConnection((err, db) => {
    if (err) return res.status(500).json(err);

    db.query(`
      SELECT 
        S.ID AS SESSION_ID,
        S.ID_CURSO AS CURSO_ID,
        C.TITULO,
        C.DESCRIPCION,
        C.DURACION,
        S.FECHA_INICIO,
        S.FECHA_FIN,
        C.PLAZAS,
        C.ESTADO_ID,
        COUNT(I.ID) AS OCUPADAS
      FROM CURSO_SESIONES S
      INNER JOIN CURSOS C ON C.ID = S.ID_CURSO
      LEFT JOIN INSCRIPCIONES I ON I.ID_CURSO = C.ID
      GROUP BY 
        S.ID, S.ID_CURSO, C.TITULO, C.DESCRIPCION,
        C.DURACION, S.FECHA_INICIO, S.FECHA_FIN,
        C.PLAZAS, C.ESTADO_ID
      ORDER BY S.FECHA_INICIO
    `, (err, result) => {

      db.detach();

      if (err) {
        console.error("ERROR GET ESTADO:", err);
        return res.status(500).json(err);
      }

      res.json(result || []);
    });
  });
};

// ============================
// LISTA CURSOS
// ============================
exports.getCursos = (req, res) => {

  getConnection((err, db) => {
    if (err) return res.status(500).json(err);

    db.query(`
      SELECT * FROM CURSOS
      ORDER BY ID DESC
    `,
    (err, result) => {

      db.detach();

      if (err) {
        console.error("ERROR GET CURSOS:", err);
        return res.status(500).json(err);
      }

      res.json(result || []);
    });
  });
};

// ============================
// CREAR
// ============================
exports.createCurso = (req, res) => {

  let {
    titulo,
    descripcion,
    fecha_inicio,
    fecha_fin,
    plazas,
    duracion,
    estado_id
  } = req.body;

  if (!titulo || !fecha_inicio) {
    return res.status(400).json({ error: "Título y fecha_inicio obligatorios" });
  }

  titulo = limpiarTitulo(titulo);
  estado_id = estado_id && estado_id > 0 ? estado_id : 1;

  fecha_inicio = fecha_inicio || new Date().toISOString().split('T')[0];
  fecha_fin = fecha_fin || fecha_inicio;

  getConnection((err, db) => {
    if (err) return res.status(500).json(err);

    db.query(`SELECT NEXT VALUE FOR GEN_CURSOS_ID AS ID FROM RDB$DATABASE`, (err, result) => {

      if (err) {
        db.detach();
        return res.status(500).json(err);
      }

      const cursoId = result[0].ID;

      db.query(`
        INSERT INTO CURSOS 
        (ID, TITULO, DESCRIPCION, FECHA_INICIO, FECHA_FIN, PLAZAS, DURACION, ESTADO_ID)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        cursoId,
        titulo,
        descripcion || "",
        fecha_inicio,
        fecha_fin,
        plazas || 0,
        duracion || 0,
        estado_id
      ],
      (err2) => {

        if (err2) {
          db.detach();
          return res.status(500).json(err2);
        }

        db.query(`
          INSERT INTO CURSO_SESIONES (ID_CURSO, FECHA_INICIO, FECHA_FIN)
          VALUES (?, ?, ?)
        `,
        [cursoId, fecha_inicio, fecha_fin],
        (err3) => {

          db.detach();

          if (err3) return res.status(500).json(err3);

          res.json({
            id: cursoId,
            message: "Curso creado correctamente"
          });
        });
      });
    });
  });
};

// ============================
// UPDATE
// ============================
exports.updateCurso = (req, res) => {

  const { id } = req.params;

  let {
    titulo,
    descripcion,
    fecha_inicio,
    fecha_fin,
    plazas,
    duracion,
    estado_id
  } = req.body;

  titulo = limpiarTitulo(titulo);
  estado_id = estado_id && estado_id > 0 ? estado_id : 1;

  fecha_inicio = fecha_inicio || new Date().toISOString().split('T')[0];
  fecha_fin = fecha_fin || fecha_inicio;

  getConnection((err, db) => {
    if (err) return res.status(500).json(err);

    db.query(`
      UPDATE CURSOS 
      SET TITULO=?, DESCRIPCION=?, FECHA_INICIO=?, FECHA_FIN=?, PLAZAS=?, DURACION=?, ESTADO_ID=?
      WHERE ID=?
    `,
    [
      titulo,
      descripcion || "",
      fecha_inicio,
      fecha_fin,
      plazas || 0,
      duracion || 0,
      estado_id,
      id
    ],
    (err) => {

      if (err) {
        db.detach();
        return res.status(500).json(err);
      }

      db.query(`
        UPDATE CURSO_SESIONES
        SET FECHA_INICIO=?, FECHA_FIN=?
        WHERE ID_CURSO=?
      `,
      [fecha_inicio, fecha_fin, id],
      (err2) => {

        db.detach();

        if (err2) return res.status(500).json(err2);

        res.json({ message: "OK" });
      });
    });
  });
};

// ============================
// DELETE
// ============================
exports.deleteCurso = (req, res) => {

  const { id } = req.params;

  getConnection((err, db) => {
    if (err) return res.status(500).json(err);

    db.query(`DELETE FROM CURSO_SESIONES WHERE ID_CURSO=?`, [id], (err1) => {

      if (err1) {
        db.detach();
        return res.status(500).json(err1);
      }

      db.query(`DELETE FROM INSCRIPCIONES WHERE ID_CURSO=?`, [id], (err2) => {

        if (err2) {
          db.detach();
          return res.status(500).json(err2);
        }

        db.query(`DELETE FROM CURSOS WHERE ID=?`, [id], (err3) => {

          db.detach();

          if (err3) return res.status(500).json(err3);

          res.json({ message: "Eliminado" });
        });
      });
    });
  });
};

exports.getAlumnosCurso = (req, res) => {

  const { id } = req.params;

  getConnection((err, db) => {

    if (err) {
      return res.status(500).json(err);
    }

    db.query(`
      SELECT 
        U.USUARIO_ID AS ALUMNO_ID,
        U.NOMBRE_COMPLETO AS NOMBRE,
        U.EMAIL,
        U.TELEFONO,
        C.TITULO

      FROM INSCRIPCIONES I

      INNER JOIN USUARIOS U
        ON U.USUARIO_ID = I.ID_ALUMNO

      INNER JOIN CURSOS C
        ON C.ID = I.ID_CURSO

      WHERE I.ID_CURSO = ?

      AND U.ACTIVO = 1
      AND (U.DELETED = 0 OR U.DELETED IS NULL)

      ORDER BY U.NOMBRE_COMPLETO
    `, [id], (err, result) => {

      db.detach();

      if (err) {

        console.error("ERROR SQL getAlumnosCurso:", err);

        return res.status(500).json({
          message: "Error obteniendo usuarios inscritos"
        });
      }

      console.log("USUARIOS INSCRITOS:", result);

      return res.json(result || []);
    });
  });
};