const express = require('express');
const router = express.Router();

// Route GET pour afficher la page de connexion
router.get('/login', (req, res) => {
    // Si déjà connecté, rediriger vers l'accueil
    if (req.session.loggedin) {
        return res.redirect('/');
    }
    
    res.render('login', {
        logged: false
    });
});

// Route POST pour traiter la connexion (à implémenter plus tard)
router.post('/login', (req, res) => {
    // TODO: Vérifier les identifiants dans la BDD
    // Pour le moment, juste rediriger
    res.redirect('/');
});

module.exports = router;

