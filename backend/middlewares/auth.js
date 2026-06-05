const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "el_ejido_almeria";

/* =========================
   GENERAR TOKEN
========================= */
function generarToken(user) {
    if (!user || !user.USUARIO_ID || !user.EMAIL) {
        throw new Error("Usuario inválido");
    }

    const rol =
        user.EMAIL.toLowerCase() === "admin@gmail.com"
            ? "admin"
            : user.rol || "user";

    const payload = {
        id: user.USUARIO_ID,
        email: user.EMAIL,
        rol,
        perfiles: user.perfiles || []
    };

    return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
}

/* =========================
   VERIFICAR TOKEN
========================= */
function verificarToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

/* =========================
   AUTH MIDDLEWARE
========================= */
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "No autenticado" });
    }

    const token = authHeader.split(" ")[1];

    try {
        req.user = verificarToken(token);
        next();
    } catch (err) {
        return res.status(401).json({ error: "Token inválido o expirado" });
    }
}

module.exports = {
    generarToken,
    verificarToken,
    authMiddleware
};