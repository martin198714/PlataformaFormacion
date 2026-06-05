const express = require("express");
const router = express.Router();
const db = require("../models/db");
const { authMiddleware } = require("../middlewares/auth");

router.get("/", authMiddleware, async (req, res) => {
    try {
        const rows = await db.query(`
            SELECT EMPRESA_ID, NOMBRE, CIF
            FROM EMPRESAS
            ORDER BY NOMBRE
        `);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;