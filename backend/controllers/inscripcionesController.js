const { getConnection } = require('../models/db');


// ======================================================
// CURSOS VISIBLES POR USUARIO (SEGÚN PERFILES)
// ======================================================
exports.getCursosUsuario = (req, res) => {

  const email = req.params.email?.trim().toLowerCase();

  if (!email) {
    return res.status(400).json({
      message: "Email requerido"
    });
  }

  getConnection((err, db) => {

    if (err) {
      return res.status(500).json({
        message: "Error conexión BD"
      });
    }

    // ======================================================
    // 1. BUSCAR USUARIO
    // ======================================================
    db.query(`
      SELECT USUARIO_ID
      FROM USUARIOS
      WHERE LOWER(EMAIL) = ?
      AND ACTIVO = 1
      AND (DELETED = 0 OR DELETED IS NULL)
    `, [email], (err, user) => {

      if (err) {

        db.detach();

        return res.status(500).json({
          message: "Error usuario"
        });
      }

      if (!user || user.length === 0) {

        db.detach();

        return res.status(404).json({
          message: "Usuario no encontrado"
        });
      }

      const usuario_id = user[0].USUARIO_ID;

      // ======================================================
      // 2. CURSOS SEGÚN LOS PERFILES DEL USUARIO
      // ======================================================
      db.query(`
        SELECT
          C.ID AS CURSO_ID,
          C.TITULO,
          C.DESCRIPCION,
          C.FECHA_INICIO,
          C.FECHA_FIN,
          C.PLAZAS,
          C.PERFIL_ID,
          COUNT(I.ID) AS OCUPADAS

        FROM CURSOS C

        INNER JOIN USUARIOS_PERFILES UP
          ON UP.PERFIL_ID = C.PERFIL_ID

        LEFT JOIN INSCRIPCIONES I
          ON I.ID_CURSO = C.ID

        WHERE UP.USUARIO_ID = ?

        GROUP BY
          C.ID,
          C.TITULO,
          C.DESCRIPCION,
          C.FECHA_INICIO,
          C.FECHA_FIN,
          C.PLAZAS,
          C.PERFIL_ID

        ORDER BY C.FECHA_INICIO
      `, [usuario_id], (err, rows) => {

        db.detach();

        if (err) {

          console.log(err);

          return res.status(500).json({
            message: "Error cursos usuario"
          });
        }

        return res.json(rows);
      });
    });
  });
};


// ======================================================
// INSCRIPCIÓN
// ======================================================
exports.inscribirse = (req, res) => {

  const { email, curso_id, modalidad } = req.body;

  // ======================================================
  // VALIDACIONES
  // ======================================================
  if (!email || !curso_id || !modalidad) {

    return res.status(400).json({
      message: "Faltan datos obligatorios"
    });
  }

  if (!["online", "presencial", "ambos"].includes(modalidad)) {

    return res.status(400).json({
      message: "Modalidad inválida"
    });
  }

  const emailClean = email.trim().toLowerCase();

  getConnection((err, db) => {

    if (err) {

      return res.status(500).json({
        message: "Error conexión BD"
      });
    }

    // ======================================================
    // 1. OBTENER USUARIO
    // ======================================================
    db.query(`
      SELECT USUARIO_ID
      FROM USUARIOS
      WHERE LOWER(EMAIL) = ?
      AND ACTIVO = 1
      AND (DELETED = 0 OR DELETED IS NULL)
    `, [emailClean], (err, user) => {

      if (err) {

        db.detach();

        return res.status(500).json({
          message: "Error consulta usuario"
        });
      }

      if (!user || user.length === 0) {

        db.detach();

        return res.status(404).json({
          message: "Usuario no encontrado"
        });
      }

      const usuario_id = user[0].USUARIO_ID;

      // ======================================================
      // 2. VALIDAR PERFIL DEL CURSO
      // ======================================================
      db.query(`
        SELECT
          C.ID,
          C.PLAZAS,
          C.PERFIL_ID,
          COUNT(I.ID) AS INSCRITOS

        FROM CURSOS C

        LEFT JOIN INSCRIPCIONES I
          ON I.ID_CURSO = C.ID

        WHERE C.ID = ?

        AND EXISTS (
          SELECT 1
          FROM USUARIOS_PERFILES UP
          WHERE UP.USUARIO_ID = ?
          AND UP.PERFIL_ID = C.PERFIL_ID
        )

        GROUP BY
          C.ID,
          C.PLAZAS,
          C.PERFIL_ID
      `, [curso_id, usuario_id], (err, curso) => {

        if (err) {

          db.detach();

          return res.status(500).json({
            message: "Error consulta curso"
          });
        }

        if (!curso || curso.length === 0) {

          db.detach();

          return res.status(403).json({
            message: "No tienes acceso a este curso"
          });
        }

        const plazas = curso[0].PLAZAS || 0;
        const inscritos = curso[0].INSCRITOS || 0;

        // ======================================================
        // 3. PLAZAS
        // ======================================================
        if (inscritos >= plazas) {

          db.detach();

          return res.status(400).json({
            message: "Curso completo"
          });
        }

        // ======================================================
        // 4. EVITAR DUPLICADOS
        // ======================================================
        db.query(`
          SELECT ID
          FROM INSCRIPCIONES
          WHERE ID_ALUMNO = ?
          AND ID_CURSO = ?
        `, [usuario_id, curso_id], (err, exist) => {

          if (err) {

            db.detach();

            return res.status(500).json({
              message: "Error comprobando inscripción"
            });
          }

          if (exist && exist.length > 0) {

            db.detach();

            return res.status(400).json({
              message: "Ya estás inscrito en este curso"
            });
          }

          // ======================================================
          // 5. INSERTAR INSCRIPCIÓN
          // ======================================================
          db.query(`
            INSERT INTO INSCRIPCIONES
            (ID_ALUMNO, ID_CURSO, MODALIDAD)
            VALUES (?, ?, ?)
          `, [usuario_id, curso_id, modalidad], (err) => {

            db.detach();

            if (err) {

              console.log(err);

              return res.status(500).json({
                message: "Error inscripción"
              });
            }

            return res.json({
              message: "Inscripción realizada correctamente"
            });
          });
        });
      });
    });
  });
};