const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // 👈 IMPORTANTE: App Password de Gmail
  },
  tls: {
    rejectUnauthorized: false,
  },
});

async function enviarContratoEmail({ to, pdfPath, contratoId, linkFirma }) {
  try {
    console.log("📩 Intentando enviar a:", to);
    console.log("📄 PDF:", pdfPath);

    if (!to) throw new Error("Email destino vacío");
    if (!pdfPath) throw new Error("PDF no existe");

    await transporter.sendMail({
      from: `"Contratos" <${process.env.EMAIL_USER}>`,
      to,
      subject: `Contrato #${contratoId} pendiente de firma`,
      html: `
        <h2>Contrato pendiente de firma</h2>
        <p>ID: <b>${contratoId}</b></p>
        <a href="${linkFirma}">Firmar contrato</a>
      `,
      attachments: [
        {
          filename: `contrato_${contratoId}.pdf`,
          path: pdfPath,
        },
      ],
    });

    console.log("✅ EMAIL ENVIADO OK");
    return { ok: true };

  } catch (err) {
    console.error("❌ ERROR REAL EMAIL:", err);
    throw err;
  }
}

module.exports = { enviarContratoEmail };