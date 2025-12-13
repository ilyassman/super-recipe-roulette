const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = 3000;

// Configuration des sessions
app.use(session({
    secret: 'super-recipe-roulette-secret-key',
    resave: false,
    saveUninitialized: false
}));

// Configuration Express
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Servir les fichiers statiques du dossier frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Servir spécifiquement /assets (css, js, img) pour des URLs propres
app.use('/assets', express.static(path.join(__dirname, '../frontend/assets')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/', require('./routers/index'));
app.use('/recette', require('./routers/recettes'));
app.use('/', require('./routers/auth'));
app.use('/', require('./routers/recherche'));
app.use('/', require('./routers/admin'));

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
