const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');

// Route d'accueil
router.get('/', (req, res) => {
    const db = getDB();
    
    // Récupérer les 3 premières recettes pour "Recettes du jour"
    db.all('SELECT * FROM recipes ORDER BY random() LIMIT 3', (err, recipes) => {
        if (err) {
            console.error('Erreur lors de la récupération des recettes:', err.message);
            res.render('index', { 
                logged: req.session.loggedin || false,
                recipes: [],
                rouletteRecipes: []
            });
        } else {
            // Récupérer 5 recettes aléatoires pour la roulette
            db.all('SELECT * FROM recipes ORDER BY random() LIMIT 5', (err, rouletteRecipes) => {
                if (err) {
                    console.error('Erreur lors de la récupération des recettes roulette:', err.message);
                    rouletteRecipes = [];
                }
                
                res.render('index', { 
                    logged: req.session.loggedin || false,
                    recipes: recipes || [],
                    rouletteRecipes: rouletteRecipes || []
                });
                
                // Fermer la connexion
                db.close();
            });
        }
    });
});

module.exports = router;

