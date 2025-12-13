const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'recettes.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erreur lors de l\'ouverture de la base de données:', err.message);
    } else {
        console.log('Connexion à la base de données SQLite réussie.');
    }
});

// Création des tables
db.serialize(() => {
    // Table users
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        mot_de_passe TEXT NOT NULL,
        role TEXT DEFAULT 'user'
    )`, (err) => {
        if (err) {
            console.error('Erreur création table users:', err.message);
        } else {
            console.log('Table users créée ou déjà existante.');
        }
    });

    // Table recipes
    db.run(`CREATE TABLE IF NOT EXISTS recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titre TEXT NOT NULL,
        description TEXT,
        image TEXT,
        categorie TEXT NOT NULL,
        temps_preparation INTEGER,
        difficulte TEXT,
        portions_defaut INTEGER DEFAULT 4,
        date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('Erreur création table recipes:', err.message);
        } else {
            console.log('Table recipes créée ou déjà existante.');
        }
    });

    // Table ingredients
    db.run(`CREATE TABLE IF NOT EXISTS ingredients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL
    )`, (err) => {
        if (err) {
            console.error('Erreur création table ingredients:', err.message);
        } else {
            console.log('Table ingredients créée ou déjà existante.');
        }
    });

    // Table recipe_ingredients
    db.run(`CREATE TABLE IF NOT EXISTS recipe_ingredients (
        recipe_id INTEGER,
        ingredient_id INTEGER,
        quantite REAL,
        unite TEXT,
        PRIMARY KEY (recipe_id, ingredient_id),
        FOREIGN KEY (recipe_id) REFERENCES recipes(id),
        FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
    )`, (err) => {
        if (err) {
            console.error('Erreur création table recipe_ingredients:', err.message);
        } else {
            console.log('Table recipe_ingredients créée ou déjà existante.');
        }
    });
    // Vérifier si des recettes existent déjà
    db.get('SELECT COUNT(*) as count FROM recipes', (err, row) => {
        if (err) {
            console.error('Erreur vérification recettes:', err.message);
        } else {
            if (row.count === 0) {
                console.log('Insertion des recettes de test...');
                insertTestData();
            } else {
                console.log(`${row.count} recette(s) déjà présente(s) dans la base.`);
            }
        }
    });
});

// Fonction pour insérer des données de test
function insertTestData() {
    // Insérer un utilisateur admin de test
    db.run(`INSERT INTO users (nom, email,mot_de_passe, role) 
            VALUES (?, ?, ?, ?)`, 
            ['Admin', 'admin@gmail.com', 'admin', 'admin'], 
            function(err) {
        if (err.code !== 'SQLITE_CONSTRAINT') {
            console.error('Erreur insertion admin:', err.message);
        } else {
       

            // Insérer des recettes de test
            const recipes = [
                {
                    titre: 'Poulet rôti au citron et herbes',
                    description: 'Un délicieux poulet rôti parfumé au citron et aux herbes fraîches.',
                    categorie: 'plat',
                    temps_preparation: 90,
                    difficulte: 'Facile',
                    image: 'poulet_roi.jpg',
                    portions_defaut: 4,
                },
                {
                    titre: 'Salade César végétarienne',
                    description: 'Une version végétarienne de la classique salade César avec des protéines végétales.',
                    categorie: 'entree',
                    temps_preparation: 25,
                    difficulte: 'Moyen',
                    image: 'salade_cesar.jpg',
                    portions_defaut: 2,
                   
                },
                {
                    titre: 'Tarte aux pommes rustique',
                    description: 'Une tarte aux pommes traditionnelle avec une pâte rustique et des pommes caramélisées.',
                    categorie: 'dessert',
                    temps_preparation: 60,
                    difficulte: 'Facile',
                    portions_defaut: 8,
                    image: 'tarte_pommes.jpg'                }
            ];

            recipes.forEach((recipe, index) => {
                db.run(`INSERT INTO recipes (titre, description, categorie, temps_preparation, difficulte, portions_defaut, image)
                        VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [recipe.titre, recipe.description, recipe.categorie, recipe.temps_preparation, 
                         recipe.difficulte, recipe.portions_defaut, recipe.image],
                        function(err) {
                    if (err) {
                        console.error(`Erreur insertion recette ${index + 1}:`, err.message);
                    } else {
                        console.log(`Recette "${recipe.titre}" insérée avec ID:`, this.lastID);
                    }
                });
            });
        }
    });
}
setTimeout(() => {
    db.close((err) => {
        if (err) {
            console.error('Erreur lors de la fermeture de la base de données:', err.message);
        } else {
            console.log('Connexion à la base de données fermée.');
            process.exit(0);
        }
    });
}, 2000);

