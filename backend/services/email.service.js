const nodemailer = require("nodemailer");

/* =========================
   TRANSPORTER GMAIL
========================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* =========================
   ENVIAR CONTRATO POR EMAIL
========================= */
async function enviarContratoEmail({ to, pdfPath, contratoId, linkFirma }) {
  if (!to) throw new Error("Email destino requerido");

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: `Contrato #${contratoId} pendiente de firma`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Contrato pendiente de firma</h2>

        <p>Hola,</p>

        <p>Se ha generado un nuevo contrato con el ID:</p>
        <h3>#${contratoId}</h3>

        <p>Para revisarlo y firmarlo electrónicamente, accede al siguiente enlace:</p>

        <a href="${linkFirma}" style="display:inline-block;padding:10px 15px;background:#2d6cdf;color:#fff;text-decoration:none;border-radius:5px;">
          Firmar contrato
        </a>

        <p style="margin-top:20px;color:#666;font-size:12px;">
          Si no esperabas este correo, puedes ignorarlo.
        </p>
      </div>
    `,
    text: `Contrato ${contratoId} pendiente de firma. Accede aquí: ${linkFirma}`,
    attachments: [
      {
        filename: `contrato_${contratoId}.pdf`,
        path: pdfPath,
      },
    ],
  };

  try {
    await transporter.sendMail(mailOptions);
    return { ok: true };
  } catch (err) {
    console.error("ERROR EMAIL:", err.message);
    throw new Error("Error enviando email de contrato");
  }
}

module.exports = { enviarContratoEmail };