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
    
    db.get('SELECT * FROM recipes WHERE id = ?', [recipeId], (err, recipe) => {
        if (err) {
            console.error('[ADMIN API] Erreur lors de la récupération de la recette:', err.message);
            console.error('[ADMIN API] Détails SQLite:', err);
            res.status(500).json({ error: 'Erreur lors du chargement de la recette.' });
        } else if (!recipe) {
            console.error('[ADMIN API] Recette introuvable avec ID:', recipeId);
            res.status(404).json({ error: 'Recette introuvable.' });
        } else {
            // Normaliser le nom d'image
            const normalizedRecipe = {
                ...recipe,
                image: recipe.image ? normalizeImageName(recipe.image) : null
            };
            res.json(normalizedRecipe);
        }
        
        db.close();
    });
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
    
    // Insertion dans la base de données
    db.run(
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
        ],
        function(err) {
            if (err) {
                console.error('[ADMIN ADD] Erreur SQL lors de l\'ajout de la recette:', err.message);
                console.error('[ADMIN ADD] Code erreur SQLite:', err.code);
                console.error('[ADMIN ADD] Détails complets:', err);
                // Supprimer l'image si erreur DB
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
            } else {
                console.log('[ADMIN ADD] Recette ajoutée avec succès, ID:', this.lastID);
                res.redirect('/admin?success=Recette ajoutée avec succès');
            }
            
            db.close();
        }
    );
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
    
    // Récupérer l'ancienne image
    db.get('SELECT image FROM recipes WHERE id = ?', [recipeId], async (err, oldRecipe) => {
        if (err) {
            console.error('[ADMIN EDIT] Erreur lors de la récupération de l\'ancienne recette:', err.message);
            console.error('[ADMIN EDIT] Détails SQLite:', err);
            return res.redirect('/admin?error=' + encodeURIComponent('Erreur lors de la modification.'));
        }
        
        if (!oldRecipe) {
            console.error('[ADMIN EDIT] Recette introuvable avec ID:', recipeId);
            return res.redirect('/admin?error=' + encodeURIComponent('Recette introuvable.'));
        }
        
        // Normaliser l'ancien nom d'image
        const oldImageName = oldRecipe.image ? normalizeImageName(oldRecipe.image) : null;
        console.log('[ADMIN EDIT] Ancienne image normalisée:', oldImageName);
        
        // Gérer l'upload de l'image
        let imageFileName = oldImageName; // Par défaut, garder l'ancienne
        try {
            imageFileName = await handleImageUpload(req.file, oldImageName);
            console.log('[ADMIN EDIT] Image finale:', imageFileName);
            
            // Si une nouvelle image a été uploadée et qu'elle est différente de l'ancienne
            if (req.file && imageFileName !== oldImageName && oldImageName) {
                // Supprimer l'ancienne image (seulement si ce n'est pas une image seed)
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
        } catch (error) {
            console.error('[ADMIN EDIT] Erreur upload image:', error.message);
            return res.redirect('/admin?error=' + encodeURIComponent(error.message));
        }
        
        // Mise à jour dans la base de données
        db.run(
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
            ],
            function(err) {
                if (err) {
                    console.error('[ADMIN EDIT] Erreur SQL lors de la modification de la recette:', err.message);
                    console.error('[ADMIN EDIT] Code erreur SQLite:', err.code);
                    console.error('[ADMIN EDIT] Détails complets:', err);
                    // Supprimer la nouvelle image si erreur DB
                    if (req.file && imageFileName !== oldImageName) {
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
                } else {
                    console.log('[ADMIN EDIT] Recette modifiée avec succès, ID:', recipeId);
                    res.redirect('/admin?success=Recette modifiée avec succès');
                }
                
                db.close();
            }
        );
    });
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
    
    // Récupérer l'image pour la supprimer
    db.get('SELECT image FROM recipes WHERE id = ?', [recipeId], (err, recipe) => {
        if (err) {
            console.error('[ADMIN DELETE] Erreur lors de la récupération de la recette:', err.message);
            console.error('[ADMIN DELETE] Détails SQLite:', err);
            return res.redirect('/admin?error=' + encodeURIComponent('Erreur lors de la suppression de la recette'));
        }
        
        if (!recipe) {
            console.error('[ADMIN DELETE] Recette introuvable avec ID:', recipeId);
            return res.redirect('/admin?error=' + encodeURIComponent('Recette introuvable'));
        }
        
        // Supprimer l'image si elle existe (seulement si ce n'est pas une image seed)
        if (recipe.image) {
            const normalizedImageName = normalizeImageName(recipe.image);
            console.log('[ADMIN DELETE] Image normalisée:', normalizedImageName);
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
                        // On continue quand même la suppression de la recette
                    }
                } else {
                    console.log('[ADMIN DELETE] Image non trouvée sur le disque:', normalizedImageName);
                }
            } else {
                console.log('[ADMIN DELETE] Image seed conservée:', normalizedImageName);
            }
        }
        
        // Supprimer la recette de la base de données
        db.run('DELETE FROM recipes WHERE id = ?', [recipeId], function(err) {
            if (err) {
                console.error('[ADMIN DELETE] Erreur SQL lors de la suppression de la recette:', err.message);
                console.error('[ADMIN DELETE] Code erreur SQLite:', err.code);
                console.error('[ADMIN DELETE] Détails complets:', err);
                res.redirect('/admin?error=' + encodeURIComponent('Erreur lors de la suppression de la recette: ' + err.message));
            } else {
                console.log('[ADMIN DELETE] Recette supprimée avec succès, ID:', recipeId);
                res.redirect('/admin?success=Recette supprimée avec succès');
            }
            
            db.close();
        });
    });
});

module.exports = router;
