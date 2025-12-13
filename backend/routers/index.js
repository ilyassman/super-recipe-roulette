const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');

// Route d'accueil
router.get('/', (req, res) => {
    const db = getDB();
    
    // Récupérer les 3 premières recettes pour "Recettes du jour"
    db.all('SELECT * FROM recipes ORDER BY date_creation DESC LIMIT 3', (err, recipes) => {
        if (err) {
            console.error('Erreur lors de la récupération des recettes:', err.message);
            res.render('index', { 
                logged: req.session.loggedin || false,
                recipes: []
            });
        } else {
            res.render('index', { 
                logged: req.session.loggedin || false,
                recipes: recipes || []
            });
        }
        
        // Fermer la connexion
        db.close();
    });
});

module.exports = router;

