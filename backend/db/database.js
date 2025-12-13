const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'recettes.sqlite');

// Fonction pour obtenir une connexion à la base de données
function getDB() {
    return new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('Erreur lors de l\'ouverture de la base de données:', err.message);
        }
    });
}

module.exports = { getDB };

