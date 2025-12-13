# Explication de la Fonctionnalité de Recherche
## Super Recipe Roulette

---

## A) Vue d'ensemble

### Objectif de la fonctionnalité

La fonctionnalité de recherche permet aux utilisateurs de :
- **Rechercher des recettes** par mot-clé (dans le titre ou la description)
- **Filtrer les recettes** selon plusieurs critères (catégorie, difficulté, temps de préparation, ingrédients)
- **Afficher toutes les recettes** automatiquement au chargement de la page
- **Naviguer dans les résultats** grâce à une pagination (9 recettes par page)
- **Obtenir des résultats en temps réel** sans recharger la page complète

### Architecture et séparation des routes

La fonctionnalité de recherche est **séparée dans un routeur dédié** (`backend/routers/recherche.js`) pour plusieurs raisons :

1. **Séparation des responsabilités** : Chaque routeur gère un domaine fonctionnel spécifique
2. **Maintenabilité** : Le code est organisé et facile à trouver/modifier
3. **Clarté** : Il est évident où se trouve la logique de recherche
4. **Évolutivité** : Facile d'ajouter de nouvelles routes de recherche sans encombrer le routeur principal

Le routeur de recherche est monté dans `server.js` via `app.use('/', require('./routers/recherche'))`, ce qui permet d'accéder aux routes `/recherche` et `/api/recherche`.

---

## B) Côté Backend (Node.js / Express)

### 1. Les deux routes de recherche

Le routeur `recherche.js` expose **deux routes distinctes** :

#### Route 1 : `GET /recherche` (affichage initial)

**Rôle** : Affiche la page de recherche avec le template EJS.

**Fonctionnement** :
- Récupère le paramètre `q` (query) depuis l'URL (`req.query.q`)
- Si aucun terme de recherche n'est fourni, affiche la page vide (sans résultats)
- Si un terme est fourni, effectue une recherche SQL et affiche les résultats directement dans le template EJS

**Code clé** :
```javascript
router.get('/recherche', (req, res) => {
    const searchTerm = req.query.q ? req.query.q.trim() : '';
    
    if (!searchTerm || searchTerm === '') {
        // Affiche la page sans résultats
        res.render('recherche', { ... });
    } else {
        // Recherche SQL et affichage des résultats
        db.all('SELECT * FROM recipes WHERE titre LIKE ? OR description LIKE ?', ...);
    }
});
```

#### Route 2 : `GET /api/recherche` (recherche en temps réel)

**Rôle** : API REST qui retourne des résultats de recherche en JSON pour les requêtes AJAX.

**Fonctionnement** :
- Récupère tous les paramètres de recherche depuis `req.query`
- Construit dynamiquement une requête SQL avec filtres
- Retourne les résultats au format JSON avec pagination

**Paramètres acceptés** :
- `q` : terme de recherche (texte)
- `categorie` : filtre par catégorie (entree, plat, dessert)
- `difficulte` : filtre par difficulté (Facile, Moyen, Difficile)
- `tempsMax` : temps maximum de préparation (en minutes)
- `ingredients` : tableau d'ingrédients à rechercher
- `page` : numéro de page pour la pagination

### 2. Récupération des paramètres

Les paramètres sont extraits de l'objet `req.query` (paramètres GET de l'URL) :

```javascript
const searchTerm = req.query.q ? req.query.q.trim() : '';
const categorie = req.query.categorie || '';
const difficulte = req.query.difficulte || '';
const tempsMax = req.query.tempsMax ? parseInt(req.query.tempsMax) : null;
const ingredients = req.query.ingredients ? (Array.isArray(...) ? ... : [...]) : [];
const page = req.query.page ? parseInt(req.query.page) : 1;
```

**Points importants** :
- `trim()` : supprime les espaces en début/fin
- `parseInt()` : convertit les chaînes en nombres
- Gestion des tableaux : `ingredients` peut être un tableau ou une valeur unique
- Valeurs par défaut : si un paramètre est absent, on utilise une valeur par défaut (chaîne vide, null, 1)

### 3. Construction dynamique de la requête SQL

La requête SQL est construite **dynamiquement** en fonction des filtres actifs :

```javascript
let query = 'SELECT r.* FROM recipes r';
const conditions = [];
const params = [];

// Ajout des conditions selon les filtres
if (searchTerm && searchTerm !== '') {
    conditions.push('LOWER(r.titre) LIKE LOWER(?)');
    params.push(`${searchTerm}%`);
}

if (categorie && categorie !== '') {
    conditions.push('r.categorie = ?');
    params.push(categorie);
}

// ... autres filtres ...

// Assemblage final
if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
}
```

**Exemple de requête générée** :
- Si l'utilisateur recherche "poulet" avec catégorie "plat" :
  ```sql
  SELECT r.* FROM recipes r 
  WHERE LOWER(r.titre) LIKE LOWER('poulet%') 
  AND r.categorie = 'plat'
  ORDER BY r.date_creation DESC 
  LIMIT 9 OFFSET 0
  ```

### 4. Pourquoi utiliser des requêtes préparées ?

Les requêtes préparées utilisent des **placeholders** (`?`) au lieu de concaténer directement les valeurs dans la requête SQL.

**Avantages** :
1. **Sécurité** : Protection contre les injections SQL (attaques où un utilisateur malveillant pourrait exécuter du code SQL)
2. **Performance** : La base de données peut optimiser la requête une fois et la réutiliser
3. **Lisibilité** : Le code est plus clair et maintenable

**Exemple** :
```javascript
// ❌ DANGEREUX (injection SQL possible)
db.all(`SELECT * FROM recipes WHERE titre = '${searchTerm}'`);

// ✅ SÉCURISÉ (requête préparée)
db.all('SELECT * FROM recipes WHERE titre = ?', [searchTerm]);
```

### 5. Retour des résultats

#### Route `/recherche` (template EJS)
- Utilise `res.render('recherche', { ... })` pour générer du HTML côté serveur
- Passe les données au template EJS via un objet :
  ```javascript
  {
      logged: req.session.loggedin || false,
      searchTerm: searchTerm,
      recipes: recipes || [],
      hasSearched: true,
      noResults: false
  }
  ```

#### Route `/api/recherche` (JSON)
- Utilise `res.json({ ... })` pour retourner des données JSON
- Structure de réponse :
  ```javascript
  {
      recipes: [...],  // Tableau de recettes
      pagination: {
          currentPage: 1,
          totalPages: 3,
          total: 25,
          limit: 9
      }
  }
  ```

### 6. Gestion de la pagination

La pagination est gérée côté serveur :

```javascript
const limit = 9;  // 9 recettes par page
const offset = (page - 1) * limit;

// Compte total des résultats
const countQuery = query.replace('SELECT r.*', 'SELECT COUNT(*) as total');
db.get(countQuery, params, (err, countResult) => {
    const total = countResult.total;
    const totalPages = Math.ceil(total / limit);
    
    // Ajout de LIMIT et OFFSET à la requête principale
    query += ' ORDER BY r.date_creation DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    // Exécution de la requête
    db.all(query, params, ...);
});
```

**Explication** :
- `LIMIT 9` : limite le nombre de résultats à 9
- `OFFSET 0` (page 1), `OFFSET 9` (page 2), `OFFSET 18` (page 3), etc.
- `COUNT(*)` : compte le nombre total de résultats (avant pagination) pour calculer le nombre de pages

---

## C) Côté Base de données (SQLite)

### 1. Tables utilisées

La recherche utilise principalement la table **`recipes`** :

| Champ | Type | Description |
|-------|------|-------------|
| `id` | INTEGER | Identifiant unique (clé primaire) |
| `titre` | TEXT | Titre de la recette (recherché) |
| `description` | TEXT | Description de la recette (recherchée) |
| `categorie` | TEXT | Catégorie (entree, plat, dessert) (filtré) |
| `temps_preparation` | INTEGER | Temps en minutes (filtré) |
| `difficulte` | TEXT | Difficulté (Facile, Moyen, Difficile) (filtré) |
| `date_creation` | DATETIME | Date de création (pour tri) |

**Note** : Les tables `ingredients` et `recipe_ingredients` existent dans le schéma mais ne sont pas encore utilisées pour la recherche. Actuellement, la recherche d'ingrédients se fait dans le champ `description` de la table `recipes`.

### 2. Champs recherchés

#### Recherche par texte (`searchTerm`)
- **Champ `titre`** : Recherche si le titre **commence par** le terme saisi (insensible à la casse)
  - Exemple : "poulet" trouve "Poulet rôti" mais pas "Recette de poulet"
- **Champ `description`** : Utilisé uniquement dans la route `/recherche` (pas dans `/api/recherche`)

**Code SQL** :
```sql
LOWER(r.titre) LIKE LOWER('poulet%')
```
- `LOWER()` : convertit en minuscules pour une recherche insensible à la casse
- `LIKE 'poulet%'` : le `%` signifie "n'importe quels caractères après", donc recherche les titres qui **commencent** par "poulet"

#### Filtres exacts
- **`categorie`** : Filtre exact (`r.categorie = 'plat'`)
- **`difficulte`** : Filtre exact (`r.difficulte = 'Facile'`)
- **`temps_preparation`** : Filtre avec comparaison (`r.temps_preparation <= 60`)

#### Filtre ingrédients
Actuellement, la recherche d'ingrédients se fait dans le champ `description` :
```sql
LOWER(r.description) LIKE '%tomate%'
```
- Le `%` avant et après signifie "contient" (pas seulement au début)

### 3. Filtrage côté base de données

Tous les filtres sont appliqués **côté serveur** (dans la requête SQL), pas côté client. Cela signifie :

1. **Performance** : Seules les recettes correspondantes sont récupérées de la base
2. **Efficacité** : Pas besoin de charger toutes les recettes puis filtrer en JavaScript
3. **Sécurité** : La logique de filtrage est centralisée et contrôlée

**Exemple de requête avec plusieurs filtres** :
```sql
SELECT r.* FROM recipes r
WHERE LOWER(r.titre) LIKE LOWER('poulet%')
  AND r.categorie = 'plat'
  AND r.difficulte = 'Facile'
  AND (r.temps_preparation IS NULL OR r.temps_preparation <= 60)
  AND (LOWER(r.description) LIKE '%citron%' OR LOWER(r.description) LIKE '%herbes%')
ORDER BY r.date_creation DESC
LIMIT 9 OFFSET 0
```

---

## D) Côté Frontend (JavaScript)

### 1. Détection de la saisie utilisateur

La recherche en temps réel est déclenchée par l'événement **`input`** ou **`keyup`** sur le champ de recherche :

```javascript
$searchInput.on('input keyup', function() {
    filters.searchTerm = $(this).val().trim();
    filters.page = 1; // Reset à la page 1
    
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(function() {
        performSearch();
    }, 300);
});
```

**Explication** :
- `input` : déclenché à chaque modification du champ (y compris copier-coller)
- `keyup` : déclenché quand une touche est relâchée
- **Debouncing** : Le `setTimeout` de 300ms évite d'envoyer une requête à chaque frappe. Si l'utilisateur tape rapidement, seule la dernière frappe déclenche la recherche après 300ms d'inactivité.

### 2. Envoi de la requête au serveur (AJAX)

La requête est envoyée via **AJAX** (Asynchronous JavaScript And XML) avec jQuery :

```javascript
$.ajax({
    url: '/api/recherche',
    method: 'GET',
    data: params,  // { q: 'poulet', categorie: 'plat', page: 1, ... }
    success: function(response) {
        // Traitement des résultats
    },
    error: function(xhr, status, error) {
        // Gestion des erreurs
    }
});
```

**Avantages de l'AJAX** :
- **Pas de rechargement de page** : L'utilisateur reste sur la même page
- **Expérience fluide** : Les résultats s'affichent instantanément
- **Performance** : Seules les données nécessaires sont transférées (JSON, pas HTML complet)

### 3. Réception des résultats

Les résultats sont reçus dans la fonction `success` du callback AJAX :

```javascript
success: function(response) {
    const recipes = response.recipes || [];  // Tableau de recettes
    const pagination = response.pagination;   // Objet pagination
    
    // Mise à jour du titre
    $resultsTitle.text(`${pagination.total} recette(s) trouvée(s)`);
    
    // Affichage des recettes
    displayRecipes(recipes, pagination);
    
    // Mise à jour des tags de filtres actifs
    updateActiveFiltersTags();
}
```

### 4. Mise à jour dynamique de la page

La fonction `displayRecipes()` génère le HTML des résultats et l'injecte dans le DOM :

```javascript
function displayRecipes(recipes, pagination) {
    if (!recipes || recipes.length === 0) {
        // Affiche "Aucune recette trouvée"
        $resultsContainer.html(`<div>...</div>`);
        return;
    }
    
    let html = '<div class="row g-4">';
    
    recipes.forEach(function(recipe) {
        html += `
            <div class="col-md-4">
                <div class="card">
                    <h5>${recipe.titre}</h5>
                    <p>${recipe.description}</p>
                    ...
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    $resultsContainer.html(html);  // Injection dans le DOM
}
```

**Points importants** :
- **Génération de HTML** : Le HTML est construit en JavaScript (template string)
- **Injection dans le DOM** : `$resultsContainer.html(html)` remplace tout le contenu de l'élément
- **Pas de rechargement** : Seule la zone de résultats est mise à jour

### 5. Gestion des filtres

Les filtres sont stockés dans un objet JavaScript :

```javascript
let filters = {
    searchTerm: '',      // Texte de recherche
    categorie: '',      // Catégorie sélectionnée
    difficulte: '',     // Difficulté sélectionnée
    tempsMax: 120,      // Temps maximum (minutes)
    ingredients: [],    // Tableau d'ingrédients
    page: 1             // Page actuelle
};
```

**Mise à jour des filtres** :
- **Catégorie/Difficulté** : Écoute des changements sur les boutons radio
- **Temps** : Écoute des changements sur le slider
- **Ingrédients** : Ajout via un champ texte + bouton
- **Bouton "Appliquer les filtres"** : Déclenche `performSearch()` avec tous les filtres

### 6. Gestion de la pagination côté client

La pagination est générée dynamiquement en JavaScript :

```javascript
function displayPagination(pagination) {
    let html = '<nav><ul class="pagination">';
    
    // Flèche précédente
    if (pagination.currentPage > 1) {
        html += `<li><a href="#" data-page="${pagination.currentPage - 1}"><</a></li>`;
    }
    
    // Numéros de pages (avec logique pour afficher "...")
    for (let i = 1; i <= pagination.totalPages; i++) {
        html += `<li><a href="#" data-page="${i}">${i}</a></li>`;
    }
    
    // Flèche suivante
    if (pagination.currentPage < pagination.totalPages) {
        html += `<li><a href="#" data-page="${pagination.currentPage + 1}">></a></li>`;
    }
    
    html += '</ul></nav>';
    $paginationContainer.html(html);
    
    // Gestion du clic sur une page
    $paginationContainer.find('.page-link[data-page]').on('click', function(e) {
        e.preventDefault();
        filters.page = parseInt($(this).data('page'));
        performSearch();  // Relance la recherche avec la nouvelle page
    });
}
```

---

## E) Cas particuliers

### 1. Recherche vide

**Comportement** : Si l'utilisateur ne saisit rien dans le champ de recherche, **toutes les recettes** sont affichées.

**Implémentation** :
```javascript
// Backend
if (searchTerm && searchTerm !== '') {
    conditions.push('LOWER(r.titre) LIKE LOWER(?)');
    params.push(`${searchTerm}%`);
}
// Si searchTerm est vide, aucune condition n'est ajoutée → toutes les recettes
```

**Frontend** :
```javascript
// Au chargement de la page
performSearch();  // Appelé même si searchTerm est vide
```

### 2. Aucun résultat trouvé

**Backend** : Retourne un tableau vide `recipes: []`

**Frontend** : Affiche un message spécifique :
```javascript
if (!recipes || recipes.length === 0) {
    $resultsContainer.html(`
        <div class="text-center py-5">
            <h3>Aucune recette trouvée</h3>
            <p>Aucune recette ne correspond à vos critères de recherche.</p>
        </div>
    `);
    $paginationContainer.hide();  // Cache la pagination
}
```

### 3. Chargement initial de la page

**Comportement** : Au chargement de `/recherche`, toutes les recettes sont automatiquement affichées.

**Implémentation** :
```javascript
$(document).ready(function() {
    // ...
    // Toujours charger les recettes au chargement (même si searchTerm est vide)
    performSearch();
});
```

**Flux** :
1. Page chargée → JavaScript exécuté
2. `performSearch()` appelé avec `filters.searchTerm = ''`
3. Requête AJAX vers `/api/recherche?q=&page=1`
4. Backend retourne toutes les recettes (pas de condition WHERE sur `titre`)
5. Résultats affichés avec pagination

### 4. Pagination

**Fonctionnement** :
- **9 recettes par page** (défini dans le backend : `const limit = 9`)
- **Navigation** : Flèches précédent/suivant + numéros de pages
- **Logique d'affichage** : Si plus de 7 pages, affiche "..." pour éviter une pagination trop longue
- **Réinitialisation** : Quand l'utilisateur modifie la recherche ou les filtres, la pagination revient à la page 1

**Exemple** :
- 25 recettes au total → 3 pages (9 + 9 + 7)
- Page 1 : recettes 1 à 9
- Page 2 : recettes 10 à 18
- Page 3 : recettes 19 à 25

---

## F) Résumé du flux complet

### Étape par étape : De la saisie à l'affichage

1. **Utilisateur tape dans le champ de recherche**
   - Événement `input` ou `keyup` déclenché
   - Valeur stockée dans `filters.searchTerm`

2. **Debouncing (attente de 300ms)**
   - `setTimeout` attend 300ms d'inactivité
   - Si l'utilisateur tape encore, le timer est réinitialisé

3. **Appel de `performSearch()`**
   - Affichage d'un indicateur de chargement
   - Préparation des paramètres (recherche + filtres + page)
   - Réinitialisation de la page à 1 si nouvelle recherche

4. **Requête AJAX vers `/api/recherche`**
   - Méthode : `GET`
   - URL : `/api/recherche?q=poulet&categorie=plat&page=1`
   - Envoi asynchrone (pas de blocage de l'interface)

5. **Backend reçoit la requête**
   - Extraction des paramètres depuis `req.query`
   - Construction de la requête SQL dynamique
   - Ajout des conditions WHERE selon les filtres actifs

6. **Exécution de la requête SQL**
   - Comptage du total de résultats (pour pagination)
   - Calcul du nombre de pages
   - Récupération des recettes avec LIMIT et OFFSET

7. **Retour de la réponse JSON**
   - Format : `{ recipes: [...], pagination: {...} }`
   - Envoi au client via `res.json()`

8. **Réception côté client (callback `success`)**
   - Extraction des recettes et de la pagination
   - Mise à jour du titre ("X recettes trouvées")

9. **Génération du HTML des résultats**
   - Boucle sur le tableau `recipes`
   - Construction du HTML pour chaque carte de recette
   - Injection dans `$resultsContainer`

10. **Affichage de la pagination**
    - Génération des liens de pagination
    - Affichage des flèches et numéros de pages
    - Gestion des clics pour changer de page

11. **Mise à jour des tags de filtres actifs**
    - Affichage des badges pour chaque filtre actif
    - Possibilité de supprimer un filtre en cliquant sur le X

12. **Résultat final**
    - Les recettes sont affichées dans la grille
    - La pagination permet de naviguer
    - L'utilisateur peut continuer à rechercher/filtrer sans recharger la page

---

## Conclusion

La fonctionnalité de recherche combine :
- **Backend** : Routes Express, requêtes SQL dynamiques et sécurisées, pagination serveur
- **Base de données** : Filtrage efficace côté SQL
- **Frontend** : JavaScript (jQuery) pour l'interactivité, AJAX pour les requêtes asynchrones, mise à jour dynamique du DOM

Cette architecture permet une **expérience utilisateur fluide** avec des résultats en temps réel, tout en maintenant une **séparation claire des responsabilités** entre le serveur et le client.

