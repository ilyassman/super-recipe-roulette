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
    
    res.render('profil', {
        logged: true,
        userName: req.session.userName ,
        userEmail: req.session.userEmail ,
        userRole: req.session.userRole
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

module.exports = router;
