require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');

// ROUTES
const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const archivosRoutes = require('./routes/archivos');
const videosRoutes = require('./routes/videos');
const otrosRecursosRoutes = require('./routes/otros_recursos');
const historialesRoutes = require('./routes/historiales');
const soporteRoutes = require('./routes/soporte');
const cursosRoutes = require('./routes/cursos');
const inscripcionesRoutes = require('./routes/inscripciones');
const chatRoutes = require('./routes/chat.routes');
const contratosRoutes = require('./routes/contratos');
const empresaPerfilesRoutes = require('./routes/empresaPerfilesRoutes');

const app = express();
const PORT = process.env.PORT || 3000;


// ================= MIDDLEWARES =================

app.use(cors());

// DEBUG GLOBAL (🔥 CLAVE)
app.use((req, res, next) => {
    console.log(`➡️ ${req.method} ${req.url}`);
    next();
});

// BODY PARSER
app.use(express.json({ limit: '1000mb' }));
app.use(express.urlencoded({ limit: '1000mb', extended: true }));

// FRONTEND
app.use(express.static(path.join(__dirname, 'public')));

app.use("/img", express.static(path.join(__dirname, "img")));
// ================= CREAR CARPETAS =================

const uploadDirs = [
    'uploads/archivos',
    'uploads/videos',
    'uploads/otros',
    'uploads/capitulos',
    'uploads/temp'
];

uploadDirs.forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
    }
});

const capitulosDir = path.join(__dirname, 'uploads/capitulos');


// ================= RUTAS API =================

// 🔥 CURSOS (con debug interno)
app.use('/api/cursos', (req, res, next) => {
    console.log("📚 entrando en rutas cursos");
    next();
}, cursosRoutes);

app.use('/api/inscripciones', inscripcionesRoutes);
app.use('/api/contratos', contratosRoutes);
app.use('/api/empresa-perfiles', empresaPerfilesRoutes);
app.use('/api/archivos', archivosRoutes);
app.use('/api/videos', videosRoutes);
app.use('/api/otros_recursos', otrosRecursosRoutes);
app.use('/api/soporte', soporteRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/historiales', historialesRoutes);
app.use('/chat', (req, res, next) => {
    console.log("💬 CHAT ROUTE:", req.method, req.url);
    next();
}, chatRoutes);
app.use("/api/empresas", require("./routes/empresas"));
app.use("/api/perfiles", require("./routes/perfiles"));

// ================= RUTAS ESTÁTICAS =================

app.use('/uploads/archivos', express.static(path.join(__dirname, 'uploads/archivos')));
app.use('/uploads/videos', express.static(path.join(__dirname, 'uploads/videos')));
app.use('/uploads/capitulos', express.static(capitulosDir));
app.use('/uploads/otros', express.static(path.join(__dirname, 'uploads/otros')));
app.use(express.static(path.join(__dirname, "../frontend")));


// ================= STREAM VIDEO =================

app.get('/uploads/capitulos/stream/:videoName', (req, res) => {

    const videoPath = path.join(capitulosDir, req.params.videoName);

    if (!fs.existsSync(videoPath)) {
        return res.status(404).send('Archivo no encontrado');
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {

        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        const chunkSize = (end - start) + 1;

        const file = fs.createReadStream(videoPath, { start, end });

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': 'video/mp4'
        });

        file.pipe(res);

    } else {

        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4'
        });

        fs.createReadStream(videoPath).pipe(res);
    }
});


// ================= LISTAR VIDEOS =================

app.get('/api/videos/listar', (req, res) => {

    fs.readdir(capitulosDir, (err, files) => {

        if (err) {
            return res.status(500).json({
                error: 'No se pudieron leer los vídeos'
            });
        }

        const mp4s = files.filter(f => f.endsWith('.mp4'));
        res.json(mp4s);
    });

}); 

app.get('/', (req, res) => {
    res.send('API PlataformaFormacion funcionando correctamente')
});


// ================= 404 =================

app.use((req, res) => {
    console.log("❌ 404 NO ENCONTRADA:", req.method, req.url);
    res.status(404).json({ error: 'Ruta no encontrada' });
});


// ================= ERROR GLOBAL =================

app.use((err, req, res, next) => {
    console.error('💥 Error interno:', err);
    res.status(500).json({
        error: 'Error interno del servidor',
        detalle: err.message
    });
});


// ================= NODE ERRORS =================

process.on('uncaughtException', err => {
    console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', err => {
    console.error('UNHANDLED REJECTION:', err);
});


// ================= SERVER =================

const server = http.createServer(app);

server.timeout = 0;
server.keepAliveTimeout = 0;
server.headersTimeout = 0;

server.listen(PORT, '0.0.0.0', () =>
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`)
);