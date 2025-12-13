const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');
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
   console.log("donnee recu : ",req.body);
   const db=getDB();
   db.get("SELECT * FROM users WHERE email = ? AND mot_de_passe = ?", [req.body.email, req.body.password], (err, user) => {
    if (err) {
        console.error('Erreur lors de la récupération de l\'utilisateur:', err.message);
    }
    if (!user) {
        
        res.status(200).send('ko');
    }
    else
    {   
        req.session.loggedin = true;
        req.session.userId = user.id;
        req.session.userName = user.nom;
        req.session.userEmail = user.email;
        req.session.userRole = user.role;
        
        res.status(200).json({role: user.role,status: "OK"});
        
    }
    db.close();
   });
   
  
       
   
});
// Route GET pour afficher le profil
router.get('/profil', (req, res) => {
    // Vérifier si l'utilisateur est connecté
    if (!req.session.loggedin) {
        return res.redirect('/login');
    }
    const db=getDB();
    db.all("Select * from favorites,recipes where user_id = ? and favorites.recipe_id = recipes.id", [req.session.userId], (err, favorites) => {
        if (err) {
            console.error('Erreur lors de la récupération des favoris:', err.message);
        }
        else
        {
            res.render('profil', {
                logged: true,
                userName: req.session.userName ,
                userEmail: req.session.userEmail ,
                userRole: req.session.userRole,
                favorites: favorites
            });
        }
    });
    
    
});

// Route GET pour la déconnexion
router.get('/logout', (req, res) => {
    console.log('=== DÉCONNEXION ===');
    console.log('Utilisateur déconnecté:', req.session.userName || 'Inconnu');
    
    // Détruire la session
    req.session.destroy((err) => {
        if (err) {
            console.error('Erreur lors de la déconnexion:', err);
            return res.redirect('/profil');
        }
        
        console.log('Session détruite avec succès');
        console.log('========================\n');
        
        // Rediriger vers la page d'accueil
        res.redirect('/login');
    });
});

// Route GET pour afficher la page d'inscription
router.get('/register', (req, res) => {
    // Si déjà connecté, rediriger vers l'accueil
    if (req.session.loggedin) {
        return res.redirect('/');
    }
    
    res.render('register', {
        logged: false
    });
});

// Route POST pour vérifier si l'email existe déjà (validation en temps réel)
router.post('/check-email', (req, res) => {
    const { email } = req.body;
    
    if (!email || email.trim() === '') {
        return res.send('OK');
    }
    
    const db = getDB();
    
    // Vérifier si l'email existe dans la base de données
    db.get('SELECT id FROM users WHERE email = ?', [email.trim()], (err, user) => {
        if (err) {
            console.error('Erreur lors de la vérification de l\'email:', err.message);
            db.close();
            return res.send('OK');
        }
        
        db.close();
        
        if (user) {
            // Email existe déjà
            return res.send('EXISTS');
        } else {
            // Email disponible
            return res.send('OK');
        }
    });
});

// Route POST pour traiter l'inscription
router.post('/register', (req, res) => {
    const { nom, email, password } = req.body;
    
    console.log('=== INSCRIPTION ===');
    console.log('Nom:', nom);
    console.log('Email:', email);
    
    // Validation des données
    if (!nom || !email || !password) {
        console.log('❌ ÉCHEC: Champs manquants');
        return res.status(400).json({
            success: false,
            message: 'Veuillez remplir tous les champs.'
        });
    }
    
    if (password.length < 6) {
        console.log('❌ ÉCHEC: Mot de passe trop court');
        return res.status(400).json({
            success: false,
            message: 'Le mot de passe doit contenir au moins 6 caractères.'
        });
    }
    
    const db = getDB();
    
    // Vérifier si l'email existe déjà
    db.get('SELECT id FROM users WHERE email = ?', [email.trim()], (err, existingUser) => {
        if (err) {
            console.error('❌ ERREUR BDD:', err.message);
            db.close();
            return res.status(500).json({
                success: false,
                message: 'Une erreur est survenue lors de l\'inscription.'
            });
        }
        
        if (existingUser) {
            console.log('❌ ÉCHEC: Email déjà utilisé:', email);
            db.close();
            return res.status(400).json({
                success: false,
                message: 'Cet email est déjà utilisé.'
            });
        }
        
        // Insérer le nouvel utilisateur
        db.run(`INSERT INTO users (nom, email, mot_de_passe, role) 
                VALUES (?, ?, ?, ?)`, 
                [nom.trim(), email.trim(), password, 'user'], 
                function(err) {
            if (err) {
                console.error('❌ ERREUR insertion utilisateur:', err.message);
                db.close();
                return res.status(500).json({
                    success: false,
                    message: 'Une erreur est survenue lors de l\'inscription.'
                });
            }
            
            console.log('✅ Utilisateur créé avec succès:', {
                id: this.lastID,
                nom: nom.trim(),
                email: email.trim()
            });
            console.log('=== INSCRIPTION RÉUSSIE ===\n');
            
            db.close();
            
            // Retourner une réponse JSON de succès
            res.json({
                success: true,
                message: 'Compte créé avec succès ! Redirection vers la page de connexion...',
                redirect: '/login'
            });
        });
    });
});

module.exports = router;
