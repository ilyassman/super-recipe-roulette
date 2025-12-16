const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const path = require('path');
const fs = require('fs');

// Toutes les routes admin nécessitent d'être admin
router.use(requireAdmin);

// Chemin du dossier img
const imgDir = path.join(__dirname, '../../frontend/assets/img');

// Fonction pour normaliser le nom d'image (extraire uniquement le nom du fichier)
function normalizeImageName(imagePath) {
    if (!imagePath) return null;
    
    // Si c'est déjà juste un nom de fichier, le retourner tel quel
    if (!imagePath.includes('/') && !imagePath.includes('\\')) {
        return imagePath;
    }
    
    // Extraire le nom du fichier depuis un chemin
    // Gère les formats : "/assets/img/uploads/recipe-xxx.jpg" ou "recipe-xxx.jpg"
    const fileName = path.basename(imagePath);
    return fileName;
}

// Fonction pour vérifier et copier l'image
function handleImageUpload(file, oldImageName = null) {
    return new Promise((resolve, reject) => {
        if (!file) {
            // Pas de fichier uploadé, garder l'ancienne image (normalisée)
            resolve(oldImageName ? normalizeImageName(oldImageName) : null);
            return;
        }
        
        // Vérifier l'extension
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
        if (!allowedExts.includes(ext)) {
            reject(new Error('Format d\'image non autorisé. Utilisez JPG, PNG ou WEBP.'));
            return;
        }
        
        // Nom du fichier (nom original)
        const fileName = file.originalname;
        const targetPath = path.join(imgDir, fileName);
        
        // Normaliser l'ancien nom pour la comparaison
        const normalizedOldName = oldImageName ? normalizeImageName(oldImageName) : null;
        
        // Vérifier si le fichier existe déjà
        if (fs.existsSync(targetPath)) {
            // Si c'est la même image que celle actuelle, on la garde
            if (normalizedOldName === fileName) {
                resolve(fileName);
                return;
            }
            // Sinon, erreur : fichier déjà existant
            reject(new Error('Une image avec ce nom existe déjà, renommez votre fichier.'));
            return;
        }
        
        // Vérifier que le dossier existe
        if (!fs.existsSync(imgDir)) {
            fs.mkdirSync(imgDir, { recursive: true });
        }
        
        // Copier le fichier avec fs
        fs.writeFile(targetPath, file.buffer, (err) => {
            if (err) {
                reject(new Error('Erreur lors de l\'enregistrement de l\'image.'));
            } else {
                resolve(fileName);
            }
        });
    });
}

// --- Helpers Promises SQLite (pour async/await) ---
function dbRun(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

function dbGet(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function dbAll(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

function toArray(v) {
    if (v === undefined || v === null) return [];
    return Array.isArray(v) ? v : [v];
}

function normalizeText(v) {
    return (v ?? '').toString().trim();
}

function parseNumberOrNull(v) {
    const s = normalizeText(v);
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

function extractIngredientsFromBody(body) {
    const noms = toArray(body.ingredient_nom ?? body['ingredient_nom[]']);
    const quantites = toArray(body.ingredient_quantite ?? body['ingredient_quantite[]']);
    const unites = toArray(body.ingredient_unite ?? body['ingredient_unite[]']);

    const maxLen = Math.max(noms.length, quantites.length, unites.length);
    const out = [];
    const seen = new Set(); // déduplication par nom (case-insensitive)

    for (let i = 0; i < maxLen; i++) {
        const nom = normalizeText(noms[i]);
        if (!nom) continue;
        const key = nom.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const quantite = parseNumberOrNull(quantites[i]);
        const unite = normalizeText(unites[i]) || null;

        out.push({ nom, quantite, unite });
    }

    return out;
}

function extractInstructionsFromBody(body) {
    const steps = toArray(body.instruction_description ?? body['instruction_description[]'] ?? body.instruction ?? body['instruction[]']);
    return steps
        .map(s => normalizeText(s))
        .filter(Boolean);
}

async function getOrCreateIngredientId(db, nom) {
    const existing = await dbGet(db, 'SELECT id FROM ingredients WHERE LOWER(nom) = LOWER(?) LIMIT 1', [nom]);
    if (existing && existing.id) return existing.id;
    const insertRes = await dbRun(db, 'INSERT INTO ingredients (nom) VALUES (?)', [nom]);
    return insertRes.lastID;
}

async function saveRecipeIngredients(db, recipeId, ingredients) {
    for (const ing of ingredients) {
        const ingredientId = await getOrCreateIngredientId(db, ing.nom);
        await dbRun(
            db,
            'INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantite, unite) VALUES (?, ?, ?, ?)',
            [recipeId, ingredientId, ing.quantite, ing.unite]
        );
    }
}

async function saveRecipeInstructions(db, recipeId, instructions) {
    for (let i = 0; i < instructions.length; i++) {
        await dbRun(
            db,
            'INSERT INTO recipe_instructions (recipe_id, numero_etape, description) VALUES (?, ?, ?)',
            [recipeId, i + 1, instructions[i]]
        );
    }
}

// Route GET /admin - Liste toutes les recettes avec pagination
router.get('/admin', (req, res) => {
    const db = getDB();
    const page = parseInt(req.query.page) || 1;
    const limit = 10; // 10 recettes par page
    const offset = (page - 1) * limit;
    
    // Compter le total de recettes
    db.get('SELECT COUNT(*) as total FROM recipes', (err, countResult) => {
        if (err) {
            console.error('[ADMIN] Erreur lors du comptage des recettes:', err.message);
            console.error('[ADMIN] Détails SQLite:', err);
            res.render('admin', {
                logged: true,
                userName: req.session.userName,
                userRole: req.session.userRole,
                recipes: [],
                error: 'Erreur lors du chargement des recettes.',
                query: req.query,
                pagination: null
            });
            db.close();
            return;
        }
        
        const total = countResult.total;
        const totalPages = Math.ceil(total / limit);
        
        // Récupérer les recettes avec pagination
        db.all('SELECT * FROM recipes ORDER BY date_creation DESC LIMIT ? OFFSET ?', [limit, offset], (err, recipes) => {
            if (err) {
                console.error('[ADMIN] Erreur lors de la récupération des recettes:', err.message);
                console.error('[ADMIN] Détails SQLite:', err);
                res.render('admin', {
                    logged: true,
                    userName: req.session.userName,
                    userRole: req.session.userRole,
                    recipes: [],
                    error: 'Erreur lors du chargement des recettes.',
                    query: req.query,
                    pagination: null
                });
            } else {
                // Normaliser les noms d'images pour l'affichage
                const normalizedRecipes = recipes.map(recipe => ({
                    ...recipe,
                    image: recipe.image ? normalizeImageName(recipe.image) : null
                }));
                
                res.render('admin', {
                    logged: true,
                    userName: req.session.userName,
                    userRole: req.session.userRole,
                    recipes: normalizedRecipes || [],
                    error: null,
                    query: req.query,
                    pagination: {
                        currentPage: page,
                        totalPages: totalPages,
                        total: total,
                        limit: limit
                    }
                });
            }
            
            db.close();
        });
    });
});

// Route GET /admin/api/recipe/:id - API pour récupérer une recette (pour la modal)
router.get('/admin/api/recipe/:id', (req, res) => {
    const db = getDB();
    const recipeId = parseInt(req.params.id);
    
    if (isNaN(recipeId)) {
        console.error('[ADMIN API] ID de recette invalide:', req.params.id);
        return res.status(400).json({ error: 'ID de recette invalide.' });
    }
    
    (async () => {
        try {
            const recipe = await dbGet(db, 'SELECT * FROM recipes WHERE id = ?', [recipeId]);
            if (!recipe) {
                console.error('[ADMIN API] Recette introuvable avec ID:', recipeId);
                res.status(404).json({ error: 'Recette introuvable.' });
                return;
            }

            const ingredients = await dbAll(
                db,
                `SELECT i.nom, ri.quantite, ri.unite
                 FROM recipe_ingredients ri
                 JOIN ingredients i ON ri.ingredient_id = i.id
                 WHERE ri.recipe_id = ?`,
                [recipeId]
            );

            const instructions = await dbAll(
                db,
                `SELECT numero_etape, description
                 FROM recipe_instructions
                 WHERE recipe_id = ?
                 ORDER BY numero_etape ASC`,
                [recipeId]
            );

            const normalizedRecipe = {
                ...recipe,
                image: recipe.image ? normalizeImageName(recipe.image) : null,
                ingredients: ingredients || [],
                instructions: instructions || []
            };

            res.json(normalizedRecipe);
        } catch (err) {
            console.error('[ADMIN API] Erreur lors de la récupération de la recette:', err.message);
            console.error('[ADMIN API] Détails SQLite:', err);
            res.status(500).json({ error: 'Erreur lors du chargement de la recette.' });
        } finally {
            db.close();
        }
    })();
});

// Route POST /admin/add - Traite l'ajout d'une recette avec upload
router.post('/admin/add', upload.single('image'), async (req, res) => {
    const db = getDB();
    const { titre, description, categorie, temps_preparation, difficulte, portions_defaut } = req.body;
    
    console.log('[ADMIN ADD] Données reçues:', { titre, categorie, temps_preparation, difficulte, portions_defaut, hasImage: !!req.file });
    
    // Validation des champs obligatoires
    if (!titre || !categorie) {
        console.error('[ADMIN ADD] Validation échouée: titre ou categorie manquant');
        return res.redirect('/admin?error=' + encodeURIComponent('Le titre et la catégorie sont obligatoires.'));
    }
    
    // Gérer l'upload de l'image
    let imageFileName = null;
    try {
        imageFileName = await handleImageUpload(req.file, null);
        console.log('[ADMIN ADD] Image uploadée:', imageFileName);
    } catch (error) {
        console.error('[ADMIN ADD] Erreur upload image:', error.message);
        return res.redirect('/admin?error=' + encodeURIComponent(error.message));
    }

    const ingredients = extractIngredientsFromBody(req.body);
    const instructions = extractInstructionsFromBody(req.body);

    let inTransaction = false;

    try {
        await dbRun(db, 'BEGIN TRANSACTION');
        inTransaction = true;

        const insertRecipeRes = await dbRun(
            db,
            `INSERT INTO recipes (titre, description, categorie, temps_preparation, difficulte, portions_defaut, image)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                titre,
                description || null,
                categorie,
                temps_preparation ? parseInt(temps_preparation) : null,
                difficulte || null,
                portions_defaut ? parseInt(portions_defaut) : 4,
                imageFileName
            ]
        );

        const recipeId = insertRecipeRes.lastID;

        await saveRecipeIngredients(db, recipeId, ingredients);
        await saveRecipeInstructions(db, recipeId, instructions);

        await dbRun(db, 'COMMIT');
        inTransaction = false;

        console.log('[ADMIN ADD] Recette ajoutée avec succès, ID:', recipeId);
        res.redirect('/admin?success=' + encodeURIComponent('Recette ajoutée avec succès'));
    } catch (err) {
        console.error('[ADMIN ADD] Erreur SQL lors de l\'ajout complet de la recette:', err.message);
        console.error('[ADMIN ADD] Détails SQLite:', err);

        if (inTransaction) {
            try { await dbRun(db, 'ROLLBACK'); } catch (_) {}
        }

        // Supprimer l'image si erreur DB (nouvelle image)
        if (imageFileName) {
            const imagePath = path.join(imgDir, imageFileName);
            if (fs.existsSync(imagePath)) {
                try {
                    fs.unlinkSync(imagePath);
                    console.log('[ADMIN ADD] Image supprimée après erreur DB');
                } catch (unlinkErr) {
                    console.error('[ADMIN ADD] Erreur lors de la suppression de l\'image:', unlinkErr.message);
                }
            }
        }

        res.redirect('/admin?error=' + encodeURIComponent('Erreur lors de l\'ajout de la recette: ' + err.message));
    } finally {
        db.close();
    }
});

// Route POST /admin/edit/:id - Traite la modification d'une recette avec upload
router.post('/admin/edit/:id', upload.single('image'), async (req, res) => {
    const db = getDB();
    const recipeId = parseInt(req.params.id);
    const { titre, description, categorie, temps_preparation, difficulte, portions_defaut } = req.body;
    
    console.log('[ADMIN EDIT] Modification recette ID:', recipeId);
    console.log('[ADMIN EDIT] Données reçues:', { titre, categorie, temps_preparation, difficulte, portions_defaut, hasImage: !!req.file });
    
    if (isNaN(recipeId)) {
        console.error('[ADMIN EDIT] ID de recette invalide:', req.params.id);
        return res.redirect('/admin?error=' + encodeURIComponent('ID de recette invalide.'));
    }
    
    // Validation des champs obligatoires
    if (!titre || !categorie) {
        console.error('[ADMIN EDIT] Validation échouée: titre ou categorie manquant');
        return res.redirect('/admin?error=' + encodeURIComponent('Le titre et la catégorie sont obligatoires.'));
    }
    
    const ingredients = extractIngredientsFromBody(req.body);
    const instructions = extractInstructionsFromBody(req.body);

    (async () => {
        let oldImageName = null;
        let imageFileName = null;
        let inTransaction = false;

        try {
            const oldRecipe = await dbGet(db, 'SELECT image FROM recipes WHERE id = ?', [recipeId]);
            if (!oldRecipe) {
                console.error('[ADMIN EDIT] Recette introuvable avec ID:', recipeId);
                res.redirect('/admin?error=' + encodeURIComponent('Recette introuvable.'));
                return;
            }

            oldImageName = oldRecipe.image ? normalizeImageName(oldRecipe.image) : null;
            console.log('[ADMIN EDIT] Ancienne image normalisée:', oldImageName);

            // Upload éventuel (on ne supprime l'ancienne image qu'après COMMIT)
            imageFileName = oldImageName;
            imageFileName = await handleImageUpload(req.file, oldImageName);
            console.log('[ADMIN EDIT] Image finale:', imageFileName);

            await dbRun(db, 'BEGIN TRANSACTION');
            inTransaction = true;

            await dbRun(
                db,
                `UPDATE recipes 
                 SET titre = ?, description = ?, categorie = ?, temps_preparation = ?, difficulte = ?, portions_defaut = ?, image = ?
                 WHERE id = ?`,
                [
                    titre,
                    description || null,
                    categorie,
                    temps_preparation ? parseInt(temps_preparation) : null,
                    difficulte || null,
                    portions_defaut ? parseInt(portions_defaut) : 4,
                    imageFileName,
                    recipeId
                ]
            );

            // Recréer ingrédients + instructions (simple et fiable)
            await dbRun(db, 'DELETE FROM recipe_ingredients WHERE recipe_id = ?', [recipeId]);
            await dbRun(db, 'DELETE FROM recipe_instructions WHERE recipe_id = ?', [recipeId]);

            await saveRecipeIngredients(db, recipeId, ingredients);
            await saveRecipeInstructions(db, recipeId, instructions);

            await dbRun(db, 'COMMIT');
            inTransaction = false;

            // Si une nouvelle image a été uploadée et qu'elle est différente de l'ancienne, supprimer l'ancienne (hors images seed)
            if (req.file && imageFileName && imageFileName !== oldImageName && oldImageName) {
                const seedImages = ['poulet_roi.jpg', 'salade_cesar.jpg', 'tarte_pommes.jpg', 
                                   'carbonara.jpg', 'omelette_champignons.jpg', 
                                   'brownies_chocolat.jpg', 'veloute_potiron.jpg'];
                if (!seedImages.includes(oldImageName)) {
                    const oldImagePath = path.join(imgDir, oldImageName);
                    if (fs.existsSync(oldImagePath)) {
                        try {
                            fs.unlinkSync(oldImagePath);
                            console.log('[ADMIN EDIT] Ancienne image supprimée:', oldImageName);
                        } catch (unlinkErr) {
                            console.error('[ADMIN EDIT] Erreur lors de la suppression de l\'ancienne image:', unlinkErr.message);
                        }
                    }
                }
            }

            console.log('[ADMIN EDIT] Recette modifiée avec succès, ID:', recipeId);
            res.redirect('/admin?success=' + encodeURIComponent('Recette modifiée avec succès'));
        } catch (err) {
            console.error('[ADMIN EDIT] Erreur lors de la modification complète de la recette:', err.message);
            console.error('[ADMIN EDIT] Détails SQLite:', err);

            if (inTransaction) {
                try { await dbRun(db, 'ROLLBACK'); } catch (_) {}
            }

            // Supprimer la nouvelle image si erreur DB
            if (req.file && imageFileName && imageFileName !== oldImageName) {
                const imagePath = path.join(imgDir, imageFileName);
                if (fs.existsSync(imagePath)) {
                    try {
                        fs.unlinkSync(imagePath);
                        console.log('[ADMIN EDIT] Nouvelle image supprimée après erreur DB');
                    } catch (unlinkErr) {
                        console.error('[ADMIN EDIT] Erreur lors de la suppression de la nouvelle image:', unlinkErr.message);
                    }
                }
            }

            res.redirect('/admin?error=' + encodeURIComponent('Erreur lors de la modification de la recette: ' + err.message));
        } finally {
            db.close();
        }
    })();
});

// Route GET /admin/delete/:id - Supprime une recette
router.get('/admin/delete/:id', (req, res) => {
    const db = getDB();
    const recipeId = parseInt(req.params.id);
    
    console.log('[ADMIN DELETE] Suppression recette ID:', recipeId);
    
    if (isNaN(recipeId)) {
        console.error('[ADMIN DELETE] ID de recette invalide:', req.params.id);
        return res.redirect('/admin?error=' + encodeURIComponent('ID de recette invalide.'));
    }
    
    (async () => {
        let normalizedImageName = null;
        let inTransaction = false;

        try {
            const recipe = await dbGet(db, 'SELECT image FROM recipes WHERE id = ?', [recipeId]);
            if (!recipe) {
                console.error('[ADMIN DELETE] Recette introuvable avec ID:', recipeId);
                res.redirect('/admin?error=' + encodeURIComponent('Recette introuvable'));
                return;
            }

            normalizedImageName = recipe.image ? normalizeImageName(recipe.image) : null;
            if (normalizedImageName) {
                console.log('[ADMIN DELETE] Image normalisée:', normalizedImageName);
            }

            await dbRun(db, 'BEGIN TRANSACTION');
            inTransaction = true;

            // Nettoyer les tables liées (pour éviter des orphelins / erreurs FK)
            await dbRun(db, 'DELETE FROM favorites WHERE recipe_id = ?', [recipeId]);
            await dbRun(db, 'DELETE FROM recipe_ingredients WHERE recipe_id = ?', [recipeId]);
            await dbRun(db, 'DELETE FROM recipe_instructions WHERE recipe_id = ?', [recipeId]);
            await dbRun(db, 'DELETE FROM recipes WHERE id = ?', [recipeId]);

            await dbRun(db, 'COMMIT');
            inTransaction = false;

            // Supprimer l'image si elle existe (seulement si ce n'est pas une image seed)
            if (normalizedImageName) {
                const seedImages = ['poulet_roi.jpg', 'salade_cesar.jpg', 'tarte_pommes.jpg', 
                                   'carbonara.jpg', 'omelette_champignons.jpg', 
                                   'brownies_chocolat.jpg', 'veloute_potiron.jpg'];
                if (!seedImages.includes(normalizedImageName)) {
                    const imagePath = path.join(imgDir, normalizedImageName);
                    if (fs.existsSync(imagePath)) {
                        try {
                            fs.unlinkSync(imagePath);
                            console.log('[ADMIN DELETE] Image supprimée:', normalizedImageName);
                        } catch (unlinkErr) {
                            console.error('[ADMIN DELETE] Erreur lors de la suppression de l\'image:', unlinkErr.message);
                        }
                    }
                } else {
                    console.log('[ADMIN DELETE] Image seed conservée:', normalizedImageName);
                }
            }

            console.log('[ADMIN DELETE] Recette supprimée avec succès, ID:', recipeId);
            res.redirect('/admin?success=' + encodeURIComponent('Recette supprimée avec succès'));
        } catch (err) {
            console.error('[ADMIN DELETE] Erreur lors de la suppression:', err.message);
            console.error('[ADMIN DELETE] Détails SQLite:', err);
            if (inTransaction) {
                try { await dbRun(db, 'ROLLBACK'); } catch (_) {}
            }
            res.redirect('/admin?error=' + encodeURIComponent('Erreur lors de la suppression de la recette: ' + err.message));
        } finally {
            db.close();
        }
    })();
});

module.exports = router;
