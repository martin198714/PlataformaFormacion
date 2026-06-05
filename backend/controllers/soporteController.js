const { getConnection: getConnectionSoporte } = require("../models/firebird");
const { getConnection: getConnectionEjido } = require("../models/db");
const nodemailer = require("nodemailer");
const path = require("path");

/* =========================
   🔄 PRIORIDAD
========================= */

function mapPrioridad(p) {
  const map = {
    Baja: 1,
    Media: 2,
    Alta: 3,
    "Muy alta": 4,
    Crítica: 5,
  };
  return map[p] || 1;
}

function getPrioridadTexto(p) {
  const map = {
    1: "Baja",
    2: "Media",
    3: "Alta",
    4: "Muy alta",
    5: "Crítica",
  };
  return map[Number(p)] || "-";
}

/* =========================
   🔐 USER ID
========================= */

function getUserId(req) {
  const id = req.user?.id;
  return id && !isNaN(id) ? parseInt(id) : null;
}

/* =========================
   ✉️ EMAIL SERVICE
========================= */

function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

async function sendEmail({ to, cc, subject, text, html }) {
  const transporter = createTransporter();

  return transporter.sendMail({
    from: `"Soporte Ejidosoft" <${process.env.EMAIL_USER}>`,
    to,
    cc,
    subject,
    text,
    html,
    attachments: [
      {
        filename: "unnamed.jpg",
        path: path.join(__dirname, "../img/unnamed.jpg"),
        cid: "headerimg",
      },
      {
        filename: "unnamed1.jpg",
        path: path.join(__dirname, "../img/unnamed1.jpg"),
        cid: "footerimg",
      },
    ],
  });
}

/* =========================
   DB HELPERS
========================= */

function getUsuarioEjido(usuarioId) {
  return new Promise((resolve, reject) => {
    getConnectionEjido((err, db) => {
      if (err) return reject(err);

      db.query(
        `SELECT USUARIO_ID, EMAIL, NOMBRE_COMPLETO, EMPRESA_ID
         FROM USUARIOS
         WHERE USUARIO_ID = ?`,
        [usuarioId],
        (err, result) => {
          try { db.detach(); } catch (_) {}
          if (err) return reject(err);
          resolve(result?.[0] || null);
        }
      );
    });
  });
}

function getUsuarioSoportePorId(usuarioId) {
  return new Promise((resolve, reject) => {
    getConnectionSoporte((err, db) => {
      if (err) return reject(err);

      db.query(
        `SELECT CODIGO_SOPORTE
         FROM MAPEO_USUARIOS
         WHERE USUARIO_ID = ?`,
        [usuarioId],
        (err, result) => {
          try { db.detach(); } catch (_) {}
          if (err) return reject(err);
          resolve(result?.[0]?.CODIGO_SOPORTE || null);
        }
      );
    });
  });
}

function getEmpresaEjido(empresaId) {
  return new Promise((resolve, reject) => {
    getConnectionEjido((err, db) => {
      if (err) return reject(err);

      db.query(
        `SELECT EMPRESA_ID, NOMBRE
         FROM EMPRESAS
         WHERE EMPRESA_ID = ?`,
        [empresaId],
        (err, result) => {
          try { db.detach(); } catch (_) {}
          if (err) return reject(err);
          resolve(result?.[0] || null);
        }
      );
    });
  });
}

/* =========================
   📥 LISTA INCIDENCIAS
========================= */

function getIncidencias(req, res) {
  const usuarioId = getUserId(req);
  if (!usuarioId) return res.status(401).json({ error: "Usuario no válido" });

  getConnectionSoporte((err, db) => {
    if (err) return res.status(500).json({ error: err.message });

    db.query(
      `
      SELECT I.ORDEN, I.COD_CLI, I.CONTACTO, I.INCIDENCIA,
             I.PRIORIDAD, I.TIPOINCIDENCIA, I.ESTADO, I.FMOD
      FROM INCIDENCIAS I
      WHERE I.USUARIO_EJIDO = ?
      ORDER BY I.ORDEN DESC
      `,
      [usuarioId],
      async (err, data) => {
        try { db.detach(); } catch (_) {}

        if (err) return res.status(500).json({ error: err.message });

        try {
          const enriched = await Promise.all(
            (data || []).map(async (i) => {
              const empresa = await getEmpresaEjido(i.COD_CLI);
              return { ...i, EMPRESA: empresa?.NOMBRE || "Sin empresa" };
            })
          );

          res.json(enriched);
        } catch (e) {
          res.status(500).json({ error: e.message });
        }
      }
    );
  });
}

/* =========================
   ➕ CREAR INCIDENCIA
========================= */

async function createIncidencia(req, res) {
  try {
    const usuarioId = getUserId(req);
    if (!usuarioId) return res.status(401).json({ error: "Usuario no válido" });

    const usuario = await getUsuarioEjido(usuarioId);
    if (!usuario) return res.status(401).json({ error: "Usuario no encontrado" });

    const codigoSoporte = await getUsuarioSoportePorId(usuarioId);
    if (!codigoSoporte) return res.status(400).json({ error: "Usuario no mapeado" });

    const { empresa, cliente, mensaje, prioridad, telefono } = req.body;

    const prioridadNum = mapPrioridad(prioridad);

    const TIPO_INCIDENCIA = 1;
    const ESTADO = 1;

    getConnectionSoporte((err, db) => {
      if (err) return res.status(500).json({ error: err.message });

      db.query(
        `
        INSERT INTO INCIDENCIAS (
          COD_CLI, USUARIO, USERNAME, PCNAME,
          INCIDENCIA, CONTACTO, PRIORIDAD,
          USUARIOASIG, TIPOINCIDENCIA, ESTADO,
          USUARIO_EJIDO, FMOD
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        RETURNING ORDEN
        `,
        [
          Number(empresa || usuario.EMPRESA_ID),
          codigoSoporte,
          usuario.NOMBRE_COMPLETO,
          "WEB",
          mensaje,
          cliente + (telefono ? " - " + telefono : ""),
          prioridadNum,
          null,
          TIPO_INCIDENCIA,
          ESTADO,
          usuarioId,
        ],
        async (err, result) => {
          try { db.detach(); } catch (_) {}

          if (err) return res.status(500).json({ error: err.message });

          const orden = result?.ORDEN || result?.[0]?.ORDEN || "SIN-ID";

          /* =========================
             📩 EMAILS
          ========================= */

          try {
            await sendEmail({
              to: usuario.EMAIL,
              cc: process.env.SOPORTE_EMAIL,
              subject: `🛠 Incidencia ${orden} creada`,
              text: `Incidencia ${orden}
Cliente: ${cliente}
Teléfono: ${telefono || "-"}
Prioridad: ${getPrioridadTexto(prioridadNum)}
Descripción: ${mensaje}`,
              html: `
<div style="font-family: Arial; padding:20px;">
  <h2>🛠 Incidencia ${orden}</h2>
  <p><b>Cliente:</b> ${cliente}</p>
  <p><b>Teléfono:</b> ${telefono || "-"}</p>
  <p><b>Prioridad:</b> ${getPrioridadTexto(prioridadNum)}</p>
  <p><b>Descripción:</b> ${mensaje}</p>
</div>`
            });
          } catch (e) {
            console.error("EMAIL ERROR:", e);
          }

          res.json({ ok: true, orden });
        }
      );
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

/* =========================
   DELETE
========================= */

function deleteIncidencia(req, res) {
  const orden = parseInt(req.params.orden);

  getConnectionSoporte((err, db) => {
    if (err) return res.status(500).json({ error: err.message });

    db.query(
      `DELETE FROM INCIDENCIAS WHERE ORDEN = ?`,
      [orden],
      (err) => {
        try { db.detach(); } catch (_) {}

        if (err) return res.status(500).json({ error: err.message });

        res.json({ ok: true });
      }
    );
  });
}

/* =========================
   EMPRESA USUARIO
========================= */

async function getEmpresaUsuario(req, res) {
  const usuarioId = getUserId(req);
  if (!usuarioId) return res.status(401).json({ error: "Usuario no válido" });

  const usuario = await getUsuarioEjido(usuarioId);
  const empresa = await getEmpresaEjido(usuario.EMPRESA_ID);

  res.json({
    EMPRESA_ID: usuario.EMPRESA_ID,
    NOMBRE: empresa?.NOMBRE || "Sin empresa",
  });
}

module.exports = {
  getIncidencias,
  createIncidencia,
  deleteIncidencia,
  getEmpresaUsuario,
};