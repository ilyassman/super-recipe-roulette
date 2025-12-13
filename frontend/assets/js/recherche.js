// Script pour la recherche et les filtres
$(document).ready(function() {
    // Récupérer le terme de recherche initial depuis l'attribut data du body
    const initialSearchTerm = $('body').data('initial-search-term') || '';
    
    // État des filtres
    let filters = {
        searchTerm: initialSearchTerm,
        categorie: '',
        difficulte: '',
        tempsMax: 120,
        ingredients: [],
        page: 1
    };
    
    let searchTimeout;
    let allRecipes = []; // Cache pour filtrage côté client si nécessaire
    
    // Références aux éléments
    const $searchInput = $('#searchInput');
    const $resultsContainer = $('#resultsContainer');
    const $resultsTitle = $('#resultsTitle');
    const $activeFiltersTags = $('#activeFiltersTags');
    const $paginationContainer = $('#paginationContainer');
    const $ingredientInput = $('#ingredientInput');
    const $ingredientsChips = $('#ingredientsChips');
    const $tempsSlider = $('#tempsSlider');
    const $tempsValue = $('#tempsValue');
    
    // Fonction pour obtenir l'icône selon la catégorie
    function getCategoryIcon(categorie) {
        if (categorie === 'entree') return 'bi-flower1';
        if (categorie === 'dessert') return 'bi-apple';
        return 'bi-egg-fried';
    }
    
    // Fonction pour obtenir la classe de badge selon la difficulté
    function getDifficultyBadgeClass(difficulte) {
        if (difficulte === 'Moyen') return 'bg-warning text-dark';
        if (difficulte === 'Difficile') return 'bg-danger';
        return 'bg-success';
    }
    
    // Fonction pour obtenir le label de catégorie
    function getCategoryLabel(categorie) {
        const labels = {
            'entree': 'Entrée',
            'plat': 'Plat',
            'dessert': 'Dessert'
        };
        return labels[categorie] || categorie;
    }
    
    // Fonction pour mettre à jour les tags de filtres actifs
    function updateActiveFiltersTags() {
        $activeFiltersTags.empty();
        
        if (filters.categorie) {
            $activeFiltersTags.append(`
                <span class="badge bg-primary d-flex align-items-center gap-1" style="cursor: pointer;" data-filter="categorie">
                    ${getCategoryLabel(filters.categorie)}
                    <i class="bi bi-x" style="font-size: 0.8em;"></i>
                </span>
            `);
        }
        
        if (filters.difficulte) {
            $activeFiltersTags.append(`
                <span class="badge bg-primary d-flex align-items-center gap-1" style="cursor: pointer;" data-filter="difficulte">
                    ${filters.difficulte}
                    <i class="bi bi-x" style="font-size: 0.8em;"></i>
                </span>
            `);
        }
        
        filters.ingredients.forEach(ing => {
            $activeFiltersTags.append(`
                <span class="badge bg-primary d-flex align-items-center gap-1" style="cursor: pointer;" data-filter="ingredient" data-value="${ing}">
                    ${ing}
                    <i class="bi bi-x" style="font-size: 0.8em;"></i>
                </span>
            `);
        });
        
        // Gestion du clic sur les X des tags
        $activeFiltersTags.find('.badge').on('click', function() {
            const filterType = $(this).data('filter');
            if (filterType === 'categorie') {
                filters.categorie = '';
                $('input[name="categorie"]').prop('checked', false);
            } else if (filterType === 'difficulte') {
                filters.difficulte = '';
                $('input[name="difficulte"]').prop('checked', false);
            } else if (filterType === 'ingredient') {
                const value = $(this).data('value');
                filters.ingredients = filters.ingredients.filter(i => i !== value);
                updateIngredientsChips();
            }
            performSearch();
        });
    }
    
    // Fonction pour mettre à jour les chips d'ingrédients
    function updateIngredientsChips() {
        $ingredientsChips.empty();
        filters.ingredients.forEach(ing => {
            $ingredientsChips.append(`
                <span class="badge bg-secondary d-flex align-items-center gap-1" style="cursor: pointer;">
                    ${ing}
                    <i class="bi bi-x" style="font-size: 0.8em;"></i>
                </span>
            `);
        });
        
        // Gestion du clic sur les X des chips
        $ingredientsChips.find('.badge').on('click', function() {
            const ing = $(this).text().trim().replace('×', '').trim();
            filters.ingredients = filters.ingredients.filter(i => i !== ing);
            updateIngredientsChips();
            updateActiveFiltersTags();
        });
    }
    
    // Fonction pour afficher les recettes
    function displayRecipes(recipes, pagination) {
        if (!recipes || recipes.length === 0) {
            $resultsContainer.html(`
                <div class="text-center py-5">
                    <i class="bi bi-search fs-1 text-muted mb-3"></i>
                    <h3 class="fw-bold mb-3">Aucune recette trouvée</h3>
                    <p class="text-muted">Aucune recette ne correspond à vos critères de recherche.</p>
                </div>
            `);
            $paginationContainer.hide();
            return;
        }
        
        let html = '<div class="row g-4">';
        
        recipes.forEach(function(recipe) {
            const icon = getCategoryIcon(recipe.categorie);
            const badgeClass = getDifficultyBadgeClass(recipe.difficulte);
            const difficulte = recipe.difficulte || 'Facile';
            const categorieLabel = getCategoryLabel(recipe.categorie);
            
            // Badges spéciaux (exemple - à adapter selon vos données)
            let specialBadge = '';
            // Vous pouvez ajouter une logique pour déterminer les badges spéciaux
            
            // Normaliser le nom d'image
            let imageName = recipe.image || '';
            if (imageName) {
                // Si le chemin contient déjà /assets/ ou http, extraire juste le nom
                if (imageName.includes('/assets/') || imageName.startsWith('http')) {
                    const parts = imageName.split(/[/\\]/);
                    imageName = parts[parts.length - 1];
                } else if (imageName.includes('/') || imageName.includes('\\')) {
                    const parts = imageName.split(/[/\\]/);
                    imageName = parts[parts.length - 1];
                }
            }
            const imageUrl = imageName ? `/assets/img/${imageName}` : '';
            
            html += `
                <div class="col-md-4">
                    <a href="/recette/${recipe.id}/details" class="text-decoration-none" style="color: inherit;">
                        <div class="card shadow-sm border-0 rounded-4 h-100 overflow-hidden recipe-card" style="cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease;" onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.1)'">
                            <div class="card-img-top position-relative" style="height: 200px; background: linear-gradient(135deg, #8B4513 0%, #654321 100%); overflow: hidden;">
                                ${specialBadge}
                                ${imageUrl ? 
                                    `<img src="${imageUrl}" alt="${recipe.titre}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                     <div class="position-absolute top-50 start-50 translate-middle text-white text-center" style="display: none;">
                                         <i class="bi ${icon} fs-1"></i>
                                     </div>` :
                                    `<div class="position-absolute top-50 start-50 translate-middle text-white text-center">
                                         <i class="bi ${icon} fs-1"></i>
                                     </div>`
                                }
                            </div>
                            <div class="card-body">
                                <h5 class="card-title fw-bold mb-2">${recipe.titre}</h5>
                                <p class="card-text text-muted small mb-3">${recipe.description || ''}</p>
                                <div class="d-flex gap-2 flex-wrap align-items-center">
                                    <span class="badge bg-info">
                                        <i class="bi bi-clock me-1"></i>${recipe.temps_preparation || 'N/A'} min
                                    </span>
                                    <span class="badge ${badgeClass}">
                                        ${difficulte}
                                    </span>
                                    <span class="badge bg-secondary">
                                        ${categorieLabel}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </a>
                </div>
            `;
        });
        
        html += '</div>';
        $resultsContainer.html(html);
        
        // Afficher la pagination si nécessaire
        if (pagination && pagination.totalPages > 1) {
            displayPagination(pagination);
            $paginationContainer.show();
        } else {
            $paginationContainer.hide();
        }
    }
    
    // Fonction pour afficher la pagination
    function displayPagination(pagination) {
        let html = '<nav><ul class="pagination">';
        
        // Flèche gauche
        if (pagination.currentPage > 1) {
            html += `<li class="page-item"><a class="page-link" href="#" data-page="${pagination.currentPage - 1}"><</a></li>`;
        } else {
            html += `<li class="page-item disabled"><span class="page-link"><</span></li>`;
        }
        
        // Pages
        const totalPages = pagination.totalPages;
        const currentPage = pagination.currentPage;
        
        if (totalPages <= 7) {
            // Afficher toutes les pages
            for (let i = 1; i <= totalPages; i++) {
                const active = i === currentPage ? 'active' : '';
                html += `<li class="page-item ${active}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
            }
        } else {
            // Logique avec "..."
            if (currentPage <= 3) {
                for (let i = 1; i <= 4; i++) {
                    const active = i === currentPage ? 'active' : '';
                    html += `<li class="page-item ${active}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
                }
                html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
                html += `<li class="page-item"><a class="page-link" href="#" data-page="${totalPages}">${totalPages}</a></li>`;
            } else if (currentPage >= totalPages - 2) {
                html += `<li class="page-item"><a class="page-link" href="#" data-page="1">1</a></li>`;
                html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
                for (let i = totalPages - 3; i <= totalPages; i++) {
                    const active = i === currentPage ? 'active' : '';
                    html += `<li class="page-item ${active}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
                }
            } else {
                html += `<li class="page-item"><a class="page-link" href="#" data-page="1">1</a></li>`;
                html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
                for (let i = currentPage - 1; i <= currentPage + 1; i++) {
                    const active = i === currentPage ? 'active' : '';
                    html += `<li class="page-item ${active}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
                }
                html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
                html += `<li class="page-item"><a class="page-link" href="#" data-page="${totalPages}">${totalPages}</a></li>`;
            }
        }
        
        // Flèche droite
        if (pagination.currentPage < pagination.totalPages) {
            html += `<li class="page-item"><a class="page-link" href="#" data-page="${pagination.currentPage + 1}">></a></li>`;
        } else {
            html += `<li class="page-item disabled"><span class="page-link">></span></li>`;
        }
        
        html += '</ul></nav>';
        $paginationContainer.html(html);
        
        // Gestion du clic sur les pages
        $paginationContainer.find('.page-link[data-page]').on('click', function(e) {
            e.preventDefault();
            filters.page = parseInt($(this).data('page'));
            performSearch();
        });
    }
    
    // Fonction pour effectuer la recherche
    function performSearch() {
        // Afficher un indicateur de chargement
        $resultsContainer.html(`
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Recherche en cours...</span>
                </div>
                <p class="mt-3 text-muted">Recherche en cours...</p>
            </div>
        `);
        
        // Préparer les paramètres
        const params = {
            q: filters.searchTerm,
            page: filters.page
        };
        
        if (filters.categorie) params.categorie = filters.categorie;
        if (filters.difficulte) params.difficulte = filters.difficulte;
        if (filters.tempsMax < 120) params.tempsMax = filters.tempsMax;
        if (filters.ingredients.length > 0) {
            params.ingredients = filters.ingredients;
        }
        
        // Requête AJAX
        $.ajax({
            url: '/api/recherche',
            method: 'GET',
            data: params,
            success: function(response) {
                const recipes = response.recipes || [];
                const pagination = response.pagination;
                
                // Mettre à jour le titre
                if (recipes.length > 0) {
                    $resultsTitle.text(`${pagination.total} recette${pagination.total > 1 ? 's' : ''} trouvée${pagination.total > 1 ? 's' : ''}`);
                } else {
                    $resultsTitle.text('Aucune recette trouvée');
                }
                
                displayRecipes(recipes, pagination);
                updateActiveFiltersTags();
            },
            error: function(xhr, status, error) {
                console.error('Erreur AJAX:', error, xhr);
                $resultsContainer.html(`
                    <div class="alert alert-danger" role="alert">
                        <i class="bi bi-exclamation-triangle me-2"></i>
                        Une erreur est survenue lors de la recherche. Veuillez réessayer.
                    </div>
                `);
            }
        });
    }
    
    // Gestion de la recherche en temps réel
    $searchInput.on('input keyup', function() {
        filters.searchTerm = $(this).val().trim();
        filters.page = 1; // Reset à la page 1
        
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(function() {
            performSearch();
        }, 300);
    });
    
    // Fonction pour ajouter un ingrédient
    function addIngredient() {
        const ingredient = $ingredientInput.val().trim();
        if (ingredient && !filters.ingredients.includes(ingredient)) {
            filters.ingredients.push(ingredient);
            $ingredientInput.val('');
            updateIngredientsChips();
        }
    }
    
    // Gestion de l'ajout d'ingrédient - touche Entrée
    $ingredientInput.on('keypress', function(e) {
        if (e.which === 13) {
            e.preventDefault();
            addIngredient();
        }
    });
    
    // Gestion du clic sur l'icône de recherche
    $('.ingredient-search-icon').on('click', function() {
        addIngredient();
    });
    
    // Gestion du slider de temps
    $tempsSlider.on('input', function() {
        const value = parseInt($(this).val());
        filters.tempsMax = value;
        if (value >= 120) {
            $tempsValue.text('120+ min');
        } else {
            $tempsValue.text(value + ' min');
        }
    });
    
    // Gestion des boutons toggle catégorie
    $('input[name="categorie"]').on('change', function() {
        if ($(this).is(':checked')) {
            filters.categorie = $(this).val();
        } else {
            filters.categorie = '';
        }
    });
    
    // Gestion des boutons toggle difficulté
    $('input[name="difficulte"]').on('change', function() {
        if ($(this).is(':checked')) {
            filters.difficulte = $(this).val();
        } else {
            filters.difficulte = '';
        }
    });
    
    // Bouton Appliquer les filtres
    $('#applyFiltersBtn').on('click', function() {
        filters.page = 1;
        performSearch();
    });
    
    // Bouton Réinitialiser
    $('#resetFiltersBtn').on('click', function() {
        filters = {
            searchTerm: $searchInput.val().trim(),
            categorie: '',
            difficulte: '',
            tempsMax: 120,
            ingredients: [],
            page: 1
        };
        
        $('input[name="categorie"]').prop('checked', false);
        $('input[name="difficulte"]').prop('checked', false);
        $tempsSlider.val(120);
        $tempsValue.text('120+ min');
        $ingredientInput.val('');
        updateIngredientsChips();
        updateActiveFiltersTags();
        
        performSearch();
    });
    
    // Initialisation - charger toutes les recettes au chargement
    // Toujours charger les recettes au chargement (même si searchTerm est vide)
    performSearch();
});

