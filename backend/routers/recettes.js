const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');

// Route pour afficher une recette (après la roulette)
router.get('/:id', (req, res) => {
    const db = getDB();
    const recipeId = req.params.id;
    
    db.get('SELECT * FROM recipes WHERE id = ?', [recipeId], (err, recipe) => {
        if (err) {
            console.error('Erreur lors de la récupération de la recette:', err.message);
            db.close();
            return res.redirect('/');
        }
        
        if (!recipe) {
            db.close();
            return res.redirect('/');
        }
        
        res.render('recette', {
            logged: req.session.loggedin || false,
            recipe: recipe
        });
        
        db.close();
    });
});

// Route pour afficher les détails complets d'une recette
router.get('/:id/details', (req, res) => {
    const db = getDB();
    const recipeId = req.params.id;
    
    db.get('SELECT * FROM recipes WHERE id = ?', [recipeId], (err, recipe) => {
        if (err) {
            console.error('Erreur lors de la récupération de la recette:', err.message);
            db.close();
            return res.redirect('/');
        }
        
        if (!recipe) {
            db.close();
            return res.redirect('/');
        }
        
        // Récupérer les ingrédients de la recette
        db.all(`SELECT i.nom, ri.quantite, ri.unite 
                FROM recipe_ingredients ri 
                JOIN ingredients i ON ri.ingredient_id = i.id 
                WHERE ri.recipe_id = ?`, [recipeId], (err, ingredients) => {
            
            if (err) {
                console.error('Erreur ingrédients:', err.message);
                ingredients = [];
            }
            
            // Récupérer les instructions de la recette
            db.all(`SELECT numero_etape, description 
                    FROM recipe_instructions 
                    WHERE recipe_id = ? 
                    ORDER BY numero_etape ASC`, [recipeId], (err, instructions) => {
                
                if (err) {
                    console.error('Erreur instructions:', err.message);
                    instructions = [];
                }
                
                // Récupérer 3 suggestions de recettes (autres recettes aléatoires)
                db.all('SELECT * FROM recipes WHERE id != ? ORDER BY RANDOM() LIMIT 3', [recipeId], (err, suggestions) => {
                    if (err) {
                        console.error('Erreur suggestions:', err.message);
                        suggestions = [];
                    }
                    
                    res.render('recette-details', {
                        logged: req.session.loggedin || false,
                        recipe: recipe,
                        ingredients: ingredients || [],
                        instructions: instructions || [],
                        suggestions: suggestions || []
                    });
                    
                    db.close();
                });
            });
        });
    });
});

module.exports = router;

