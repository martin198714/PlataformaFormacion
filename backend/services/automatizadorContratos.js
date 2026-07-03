const db = require("../models/db");

const { generarHash } =
require("../utils/hash");

const {
generarPDFContrato
} = require("./pdf.service");

const {
enviarContratoEmail
} = require("./email.service");

const {
ESTADOS_CONTRATO
} = require("../utils/estadosContrato");

/* =========================
UTIL
========================= */

function toArray(r) {
if (!r) return [];

if (Array.isArray(r))
return r;

if (Array.isArray(r?.rows))
return r.rows;

if (Array.isArray(r?.data))
return r.data;

return [];
}

function normalizarPerfiles(perfiles){

if(!Array.isArray(perfiles))
return [];

return perfiles
.map(Number)
.filter(
n=>
Number.isInteger(n)
&&
n>0
);

}

/* =========================
CREAR CONTRATO AUTOMÁTICO
========================= */

async function generarContratoAutomatico(
empresaId,
perfiles,
creadoPor
){

const empresa=
Number(empresaId);

if(
!Number.isInteger(empresa)
||
empresa<=0
){
throw new Error(
"empresaId inválido"
);
}

const perfilesNumeros=
normalizarPerfiles(
perfiles
);

if(
perfilesNumeros.length===0
){
throw new Error(
"Debes enviar perfiles válidos"
);
}

/* =========================
EVITAR DUPLICADOS
========================= */

const placeholders=
perfilesNumeros
.map(()=>"?")
.join(",");

const existeRaw=
await db.query(
`
SELECT FIRST 1
c.ID,
c.TOKEN

FROM CONTRATOS_MANTENIMIENTO c

INNER JOIN CONTRATO_PERFILES cp
ON cp.CONTRATO_ID=c.ID

WHERE
c.EMPRESA_ID=?
AND
cp.PERFIL_ID IN (${placeholders})

ORDER BY c.ID DESC
`,
[
empresa,
...perfilesNumeros
]
);

const existe=
toArray(
existeRaw
);

if(
existe.length
){

return{
ok:true,
duplicado:true,
contratoId:
existe[0].ID,
token:
existe[0].TOKEN,

linkFirma:
`http://127.0.0.1:5500/frontend/firmar.html?token=${existe[0].TOKEN}`
};

}

/* =========================
TOKEN + HASH
========================= */

const token=
generarHash({
empresa,
perfiles:
perfilesNumeros,
t:
Date.now()
});

const hashContrato=
generarHash({
empresa,
token,
perfiles:
perfilesNumeros
});

/* =========================
INSERT CONTRATO
========================= */

const insertRaw=
await db.query(
`
INSERT INTO
CONTRATOS_MANTENIMIENTO
(
EMPRESA_ID,
TOKEN,
HASH_CONTRATO,
ESTADO,
FECHA_ENVIO
)
VALUES
(
?,
?,
?,
?,
CURRENT_TIMESTAMP
)
RETURNING ID
`,
[
empresa,
token,
hashContrato,
ESTADOS_CONTRATO.PENDIENTE
]
);

const contratoId=

insertRaw?.[0]?.ID
||
insertRaw?.ID
||
toArray(insertRaw)?.[0]?.ID;

if(
!contratoId
){

console.log(
"INSERT RAW",
insertRaw
);

throw new Error(
"No se pudo crear contrato"
);

}

/* =========================
GUARDAR PERFILES
========================= */

for(
const perfilId
of perfilesNumeros
){

await db.query(
`
INSERT INTO
CONTRATO_PERFILES
(
CONTRATO_ID,
PERFIL_ID
)

SELECT ?,?
FROM RDB$DATABASE

WHERE NOT EXISTS(

SELECT 1
FROM CONTRATO_PERFILES

WHERE
CONTRATO_ID=?
AND
PERFIL_ID=?

)
`,
[
contratoId,
perfilId,
contratoId,
perfilId
]
);

}

/* =========================
NOMBRES PERFILES
========================= */

const perfilesRaw=
await db.query(
`
SELECT
ID,
NOMBRE

FROM PERFILES

WHERE ID IN (${placeholders})
`,
perfilesNumeros
);

const nombresPerfiles=
toArray(
perfilesRaw
)
.map(
p=>p.NOMBRE
);

/* =========================
GENERAR PDF
========================= */

const pdf=
await generarPDFContrato({

contratoId,

empresaId:
empresa,

perfiles:
nombresPerfiles,

hash:
hashContrato

});

if(
!pdf?.filePath
){

throw new Error(
"Error generando PDF"
);

}

/* =========================
EMAILS DESTINO
========================= */

const emailRaw=
await db.query(
`
SELECT DISTINCT
u.EMAIL

FROM USUARIOS u

INNER JOIN
USUARIOS_PERFILES up

ON up.USUARIO_ID=u.USUARIO_ID

WHERE

u.EMPRESA_ID=?

AND

up.PERFIL_ID
IN (${placeholders})

AND
u.ACTIVO=1

AND
u.DELETED=0
`,
[
empresa,
...perfilesNumeros
]
);

const emails=
[
...new Set(

toArray(
emailRaw
)

.map(
u=>
u.EMAIL
)

.filter(Boolean)

)
];

console.log(
"EMAILS",
emails
);

/* =========================
ENVIAR EMAILS
========================= */

const linkFirma=
`http://127.0.0.1:5500/frontend/firmar.html?token=${token}`;

for(
const email
of emails
){

try{

await enviarContratoEmail({

to:
email,

pdfPath:
pdf.filePath,

contratoId,

linkFirma

});

}
catch(err){

console.error(
"EMAIL ERROR",
email,
err.message
);

}

}

/* =========================
RETURN
========================= */

return{

ok:true,

contratoId,

token,

pdf:
pdf.fileName,

perfiles:
nombresPerfiles,

emailsEnviados:
emails.length,

linkFirma

};

}

module.exports={
generarContratoAutomatico
};