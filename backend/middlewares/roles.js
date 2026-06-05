function roleMiddleware(allowedRoles = []) {
    // Normalizar roles permitidos a minúsculas
    const allowed = allowedRoles.map(r => r.toString().toLowerCase().trim());

    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'No autenticado' });

        const userRol = (req.user.rol || 'user').toLowerCase();

        if (!allowed.includes(userRol)) {
            return res.status(403).json({
                error: 'No tiene permisos',
                userRol,
                allowedRoles: allowed
            });
        }

        next();
    };
}

module.exports = roleMiddleware;



