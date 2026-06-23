const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getConnection } = require("../models/db");
const controlDB = require('../models/firebird'); // 👈 AÑADIR ESTO
const axios = require("axios");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET || "el_ejido_almeria";

/* =========================
   EMAIL
========================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* =========================
   CAPTCHA VERIFY
========================= */
const verifyCaptcha = async (captcha) => {
  try {
    const secret = process.env.RECAPTCHA_SECRET;

    const response = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      null,
      {
        params: {
          secret,
          response: captcha,
        },
      },
    );

    return response.data.success;
  } catch (err) {
    console.log("CAPTCHA ERROR:", err.response?.data || err.message);
    return false;
  }
};

/* =========================
   REGISTER
========================= */

exports.register = async (req, res) => {
  const { email, password, nombre_completo, telefono, captcha } = req.body;

  if (!email || !password || !nombre_completo || !telefono) {
    return res.status(400).json({ error: "Todos los campos son obligatorios" });
  }

  if (!captcha) {
    return res.status(400).json({ error: "Captcha requerido" });
  }

  const captchaOk = await verifyCaptcha(captcha);
  if (!captchaOk) {
    return res.status(400).json({ error: "Captcha inválido" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Contraseña mínima 6 caracteres" });
  }

  const password_hash = bcrypt.hashSync(password, 10);

  getConnection((err, db) => {
    if (err) return res.status(500).json({ error: err.message });

    db.query(
      "SELECT USUARIO_ID FROM USUARIOS WHERE EMAIL = ?",
      [email],
      (errSel, resSel) => {
        if (errSel) {
          db.detach();
          return res.status(500).json({ error: errSel.message });
        }

        if (resSel.length > 0) {
          db.detach();
          return res
            .status(409)
            .json({ error: "El correo ya está registrado" });
        }

        // 🔥 INSERT USUARIO EN EJIDOSOFT
        db.query(
          `INSERT INTO USUARIOS
          (EMAIL, PASSWORD_HASH, NOMBRE_COMPLETO, TELEFONO, ROL_ID, ACTIVO, CREATED_AT)
          VALUES (?, ?, ?, ?, 2, 1, CURRENT_TIMESTAMP)
          RETURNING USUARIO_ID`,
          [email, password_hash, nombre_completo, telefono],
          (errIns, resIns) => {

            if (errIns) {
              db.detach();
              return res.status(500).json({ error: errIns.message });
            }

            const userId = resIns[0].USUARIO_ID;

            // 🔥 AQUÍ AÑADIMOS CONTROL.FDB
            controlDB.query(
              `INSERT INTO MAPEO_USUARIOS (USUARIO_ID, CODIGO_SOPORTE)
               VALUES (?, 1)`,
              [userId],
              (errCtrl) => {

                if (errCtrl) {
                  console.error("Error CONTROL.FDB:", errCtrl);

                  // 🔥 rollback manual (evitar usuario huérfano)
                  db.query(
                    "DELETE FROM USUARIOS WHERE USUARIO_ID = ?",
                    [userId],
                    () => {
                      db.detach();
                      return res.status(500).json({
                        error: "Error asignando soporte (CONTROL DB)"
                      });
                    }
                  );

                  return;
                }

                db.detach();

                transporter.sendMail({
                  from: process.env.EMAIL_USER,
                  to: email,
                  subject: "Bienvenido",
                  html: `<h2>Hola ${nombre_completo}</h2><p>Cuenta creada correctamente.</p>`,
                });

                return res.status(201).json({
                  message: "Usuario registrado correctamente"
                });
              }
            );
          }
        );
      }
    );
  });
};

/* =========================
   FORGOT PASSWORD
========================= */
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email requerido" });
  }

  try {
    const token = crypto.randomBytes(32).toString("hex");

    getConnection((err, db) => {
      if (err) return res.status(500).json({ error: err.message });

      db.query(
        "SELECT USUARIO_ID FROM USUARIOS WHERE EMAIL = ?",
        [email],
        (errSel, rows) => {
          if (errSel) {
            db.detach();
            return res.status(500).json({ error: errSel.message });
          }

          // 🔐 respuesta genérica (seguridad)
          if (!rows || rows.length === 0) {
            db.detach();
            return res.json({
              message: "Si el correo existe, recibirás un enlace",
            });
          }

          const sql = `
            UPDATE USUARIOS
            SET RESET_TOKEN = ?,
                RESET_EXPIRY = DATEADD(1 HOUR TO CURRENT_TIMESTAMP)
            WHERE EMAIL = ?
          `;

          db.query(sql, [token, email], (errUpd) => {
            db.detach();

            if (errUpd) {
              return res.status(500).json({ error: errUpd.message });
            }

            const link = `${process.env.FRONTEND_URL}/reset-password.html?token=${token}`;

            transporter.sendMail(
              {
                from: process.env.EMAIL_USER,
                to: email,
                subject: "Recuperación de contraseña",
                html: `
                  <div style="font-family:Arial;max-width:600px;">
                    <h2>Recuperar contraseña</h2>

                    <p>Hemos recibido una solicitud para cambiar tu contraseña.</p>

                    <a href="${link}" style="
                      display:inline-block;
                      padding:12px 18px;
                      background:#4CAF50;
                      color:white;
                      text-decoration:none;
                      border-radius:6px;
                      font-weight:bold;
                    ">
                      Cambiar contraseña
                    </a>

                    <p>Si no has solicitado esto, ignora este mensaje.</p>

                    <small>Este enlace expira en 1 hora.</small>
                  </div>
                `,
              },
              (err, info) => {
                if (err) {
                  console.error("❌ Error enviando email reset:", err);
                } else {
                  console.log("📩 Reset email enviado:", info.response);
                }
              }
            );

            return res.json({
              message: "Si el correo existe, recibirás un enlace",
            });
          });
        }
      );
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
/* =========================
   RESET PASSWORD
========================= */
exports.resetPassword = (req, res) => {
  const { token, newPassword } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token requerido" });
  }

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "Contraseña inválida (mínimo 6 caracteres)" });
  }

  const hash = bcrypt.hashSync(newPassword, 10);

  getConnection((err, db) => {
    if (err) return res.status(500).json({ error: err.message });

    // 1. Validar token + expiración (FIREBIRD 3)
    const checkSql = `
      SELECT USUARIO_ID
      FROM USUARIOS
      WHERE RESET_TOKEN = ?
        AND RESET_EXPIRY IS NOT NULL
        AND RESET_EXPIRY > CURRENT_TIMESTAMP
    `;

    db.query(checkSql, [token], (errSel, rows) => {
      if (errSel) {
        db.detach();
        return res.status(500).json({ error: errSel.message });
      }

      // ❌ Token inválido o expirado
      if (!rows || rows.length === 0) {
        db.detach();
        return res.status(400).json({
          error: "Token inválido o expirado",
        });
      }

      // 2. Actualizar contraseña
      const updateSql = `
        UPDATE USUARIOS
        SET PASSWORD_HASH = ?,
            RESET_TOKEN = NULL,
            RESET_EXPIRY = NULL
        WHERE RESET_TOKEN = ?
      `;

      db.query(updateSql, [hash, token], (errUpd, result) => {
        db.detach();

        if (errUpd) {
          return res.status(500).json({ error: errUpd.message });
        }

        // 3. Seguridad extra: comprobar que se actualizó algo
        if (!result || result.affectedRows === 0) {
          return res.status(400).json({
            error: "No se pudo actualizar la contraseña",
          });
        }

        return res.json({
          message: "Contraseña actualizada correctamente",
        });
      });
    });
  });
};

/* =========================
   LOGIN (FIX DEFINITIVO)
========================= */
exports.login = (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: "Email y contraseña requeridos",
    });
  }

  getConnection((err, db) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const sqlUser = `
      SELECT
        U.USUARIO_ID,
        U.EMAIL,
        U.PASSWORD_HASH,
        U.NOMBRE_COMPLETO,
        R.NOMBRE AS ROL_NOMBRE
      FROM USUARIOS U
      JOIN ROLES R ON R.ROLE_ID = U.ROL_ID
      WHERE U.EMAIL = ?
    `;

    db.query(sqlUser, [email], (errUser, resUser) => {
      if (errUser) {
        db.detach();
        return res.status(500).json({ error: errUser.message });
      }

      if (!resUser || resUser.length === 0) {
        db.detach();
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      const user = resUser[0];

      const passwordOK = bcrypt.compareSync(
        password,
        String(user.PASSWORD_HASH || "").trim(),
      );

      if (!passwordOK) {
        db.detach();
        return res.status(401).json({ error: "Contraseña incorrecta" });
      }

      const rol = String(user.ROL_NOMBRE || "")
        .trim()
        .toLowerCase();

      const userId = Number(user.USUARIO_ID);

      const sqlPerfiles = `
        SELECT PERFIL_ID
        FROM USUARIOS_PERFILES
        WHERE USUARIO_ID = ?
      `;

      db.query(sqlPerfiles, [userId], (errPerf, resPerf) => {
        // 🔥 ERROR REAL MOSTRADO
        if (errPerf) {
          console.error("🔥 ERROR SQL PERFILES:", errPerf);

          db.detach();

          return res.status(500).json({
            error: "Error SQL en USUARIOS_PERFILES",
            detalle: errPerf.message || errPerf,
            usuarioId: userId,
          });
        }

        const perfiles = (resPerf || []).map((p) => Number(p.PERFIL_ID));

        const token = jwt.sign(
          {
            id: userId,
            email: user.EMAIL,
            rol,
            perfiles,
          },
          JWT_SECRET,
          { expiresIn: "24h" },
        );

        db.detach();

        return res.json({
          token,
          usuario: {
            id: userId,
            email: user.EMAIL,
            nombre: user.NOMBRE_COMPLETO,
            rol,
            perfiles,
          },
        });
      });
    });
  });
};
