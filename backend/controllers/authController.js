const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getConnection } = require("../models/db");
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
      }
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
          return res.status(409).json({ error: "El correo ya está registrado" });
        }

        db.query(
          `INSERT INTO USUARIOS
          (EMAIL, PASSWORD_HASH, NOMBRE_COMPLETO, TELEFONO, ROL_ID, ACTIVO, CREATED_AT)
          VALUES (?, ?, ?, ?, 2, 1, CURRENT_TIMESTAMP)`,
          [email, password_hash, nombre_completo, telefono],
          (errIns) => {
            db.detach();

            if (errIns) {
              return res.status(500).json({ error: errIns.message });
            }

            transporter.sendMail({
              from: process.env.EMAIL_USER,
              to: email,
              subject: "Bienvenido",
              html: `<h2>Hola ${nombre_completo}</h2><p>Cuenta creada correctamente.</p>`,
            });

            return res.status(201).json({
              message: "Usuario registrado correctamente",
            });
          }
        );
      }
    );
  });
};

/* =========================
   FORGOT PASSWORD
========================= */
exports.forgotPassword = (req, res) => {
  const { email } = req.body;

  const token = crypto.randomBytes(32).toString("hex");

  getConnection((err, db) => {
    if (err) return res.status(500).json({ error: err.message });

    const sql = `
      UPDATE USUARIOS
      SET RESET_TOKEN = ?, RESET_EXPIRY = DATEADD(1 HOUR TO CURRENT_TIMESTAMP)
      WHERE EMAIL = ?
    `;

    db.query(sql, [token, email], (err) => {
      db.detach();

      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const link = `http://localhost:3000/reset-password.html?token=${token}`;

      transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Recuperar contraseña",
        html: `<h3>Recupera tu contraseña</h3><a href="${link}">${link}</a>`,
      });

      res.json({ message: "Si el correo existe, recibirás un enlace" });
    });
  });
};

/* =========================
   RESET PASSWORD
========================= */
exports.resetPassword = (req, res) => {
  const { token, newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "Contraseña inválida" });
  }

  const hash = bcrypt.hashSync(newPassword, 10);

  getConnection((err, db) => {
    if (err) return res.status(500).json({ error: err.message });

    const sql = `
      UPDATE USUARIOS
      SET PASSWORD_HASH = ?, RESET_TOKEN = NULL
      WHERE RESET_TOKEN = ?
    `;

    db.query(sql, [hash, token], (err) => {
      db.detach();

      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.json({
        message: "Contraseña actualizada correctamente",
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
        String(user.PASSWORD_HASH || "").trim()
      );

      if (!passwordOK) {
        db.detach();
        return res.status(401).json({ error: "Contraseña incorrecta" });
      }

      const rol = String(user.ROL_NOMBRE || "").trim().toLowerCase();

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
            usuarioId: userId
          });
        }

        const perfiles = (resPerf || []).map(p => Number(p.PERFIL_ID));

        const token = jwt.sign(
          {
            id: userId,
            email: user.EMAIL,
            rol,
            perfiles,
          },
          JWT_SECRET,
          { expiresIn: "24h" }
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