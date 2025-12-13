// Middleware pour vérifier si l'utilisateur est administrateur
function requireAdmin(req, res, next) {
    // Vérifier si l'utilisateur est connecté
    if (!req.session.loggedin) {
        return res.redirect('/login');
    }
    
    // Vérifier si l'utilisateur est admin
    if (req.session.userRole !== 'admin') {
        return res.redirect('/');
    }
    
    // Si tout est OK, passer au middleware suivant
    next();
}

module.exports = { requireAdmin };

