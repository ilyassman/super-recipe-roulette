const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');

// Route de recherche
router.get('/recherche', (req, res) => {
    const db = getDB();
    const searchTerm = req.query.q ? req.query.q.trim() : '';
    
    // Cas 1 : Affichage initial (pas de recherche)
    if (!searchTerm || searchTerm === '') {
        res.render('recherche', {
            logged: req.session.loggedin || false,
            searchTerm: '',
            recipes: [],
            hasSearched: false
        });
        db.close();
        return;
    }
    
    // Cas 2 : Recherche avec mot-clé
    // Requête SQL sécurisée avec paramètres préparés
    const searchPattern = `%${searchTerm}%`;
    db.all(
        'SELECT * FROM recipes WHERE titre LIKE ? OR description LIKE ? ORDER BY date_creation DESC',
        [searchPattern, searchPattern],
        (err, recipes) => {
            if (err) {
                console.error('Erreur lors de la recherche:', err.message);
                res.render('recherche', {
                    logged: req.session.loggedin || false,
                    searchTerm: searchTerm,
                    recipes: [],
                    hasSearched: true,
                    error: 'Une erreur est survenue lors de la recherche. Veuillez réessayer.'
                });
            } else {
                // Cas 3 : Aucun résultat trouvé
                if (!recipes || recipes.length === 0) {
                    res.render('recherche', {
                        logged: req.session.loggedin || false,
                        searchTerm: searchTerm,
                        recipes: [],
                        hasSearched: true,
                        noResults: true
                    });
                } else {
                    // Cas 4 : Résultats trouvés
                    res.render('recherche', {
                        logged: req.session.loggedin || false,
                        searchTerm: searchTerm,
                        recipes: recipes || [],
                        hasSearched: true,
                        noResults: false
                    });
                }
            }
            
            // Fermer la connexion
            db.close();
        }
    );
});

// Route API pour la recherche en temps réel (AJAX) avec filtres
router.get('/api/recherche', (req, res) => {
    const db = getDB();
    const searchTerm = req.query.q ? req.query.q.trim() : '';
    const categorie = req.query.categorie || '';
    const difficulte = req.query.difficulte || '';
    const tempsMax = req.query.tempsMax ? parseInt(req.query.tempsMax) : null;
    const ingredients = req.query.ingredients ? (Array.isArray(req.query.ingredients) ? req.query.ingredients : [req.query.ingredients]) : [];
    const page = req.query.page ? parseInt(req.query.page) : 1;
    const limit = 9; // 9 recettes par page
    const offset = (page - 1) * limit;
    
    // Construction de la requête SQL avec filtres
    let query = 'SELECT r.* FROM recipes r';
    const conditions = [];
    const params = [];
    
    // Filtre recherche (titre commence par) - si vide, on affiche tout
    // On ne met pas de condition si searchTerm est vide pour afficher toutes les recettes
    if (searchTerm && searchTerm !== '') {
        conditions.push('LOWER(r.titre) LIKE LOWER(?)');
        params.push(`${searchTerm}%`);
    }
    
    // Filtre catégorie
    if (categorie && categorie !== '') {
        conditions.push('r.categorie = ?');
        params.push(categorie);
    }
    
    // Filtre difficulté
    if (difficulte && difficulte !== '') {
        conditions.push('r.difficulte = ?');
        params.push(difficulte);
    }
    
    // Filtre temps maximum
    if (tempsMax && tempsMax > 0) {
        conditions.push('(r.temps_preparation IS NULL OR r.temps_preparation <= ?)');
        params.push(tempsMax);
    }
    
    // Filtre ingrédients (recherche dans la description si la table ingredients est vide)
    // Pour l'instant, on cherche dans la description car la table ingredients peut être vide
    if (ingredients.length > 0) {
        const ingredientConditions = ingredients.map(() => {
            return 'LOWER(r.description) LIKE ?';
        });
        conditions.push('(' + ingredientConditions.join(' OR ') + ')');
        ingredients.forEach(ing => params.push(`%${ing.toLowerCase()}%`));
    }
    
    // Assemblage de la requête
    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }
    
    // Compte total pour pagination
    const countQuery = query.replace('SELECT r.*', 'SELECT COUNT(*) as total');
    
    db.get(countQuery, params, (err, countResult) => {
        if (err) {
            console.error('Erreur lors du comptage:', err.message);
            res.status(500).json({ error: 'Une erreur est survenue lors de la recherche.' });
            db.close();
            return;
        }
        
        const total = countResult ? countResult.total : 0;
        const totalPages = Math.ceil(total / limit);
        
        // Ajout de l'ordre et de la pagination
        query += ' ORDER BY r.date_creation DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        db.all(query, params, (err, recipes) => {
            if (err) {
                console.error('Erreur lors de la recherche API:', err.message);
                res.status(500).json({ error: 'Une erreur est survenue lors de la recherche.' });
            } else {
                res.json({ 
                    recipes: recipes || [],
                    pagination: {
                        currentPage: page,
                        totalPages: totalPages,
                        total: total,
                        limit: limit
                    }
                });
            }
            
            // Fermer la connexion
            db.close();
        });
    });
});

module.exports = router;

