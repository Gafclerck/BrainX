---
title: 'Séance 5 : Formulaires Dynamiques avec DTO, Layouts Twig et Filtrage Repository'
teacher: Baila Wane
course_date: '2026-11-03'
description: Conception de formulaires dynamiques basés sur des DTOs, stratégie de
  filtrage HTTP, sécurisation CSRF, héritage de templates Twig avec la fonction parent()
  et requêtes conditionnelles QueryBuilder.
keywords: FormType, make:form, GroupSearchDTO, Request, CSRF, Twig layout, base.html.twig,
  QueryBuilder andWhere, Route requirements, Filtre POST, avecLesFemmes
is_published: true
resources:
- type: external_link
  title: Support de cours Notion - Séance 5 (03-11-2026)
  url: https://buttercup-option-ef4.notion.site/Symfony-3ed4a8cf9efb80deb686f05804a1c219
  note: Prise de notes et synthèse originale du cours par Baila Wane.
- type: external_link
  title: Transcription interactive Granola (03-11-2026)
  url: https://notes.granola.ai/t/1104d68b-b13a-4abf-85dd-a9e691a9c405-00demib2
  note: Transcription intégrale des échanges et explications live du cours.
- type: external_link
  title: Dépôt GitHub du projet « Avec Les Femmes »
  url: https://github.com/DianaFerradini/avecLesFemmes-Symfony.git
  note: Code source du projet d'application fil rouge.
---

# 1. Stratégie de Filtrage : Choix Architectural entre GET et POST

Pour filtrer la liste des groupements par nom ou par adresse, une réflexion préalable s'impose sur la méthode HTTP :

| Critère | Méthode GET | Méthode POST (Choix du projet) |
| :--- | :--- | :--- |
| **Emplacement des données** | Directement dans l'URL (`?q=Dakar&statut=actif`) | Dans le corps de la requête HTTP (*Payload*) |
| **Taille limite** | ~2048 caractères selon les navigateurs | Quasi illimitée |
| **Bookmarking (Favoris)** | Facile (l'URL contient les critères) | Nécessite un réacheminement |
| **Évolutivité future** | Limitée aux filtres simples | **Idéale pour des filtres riches et modulaires** (dates multiples, cases à cocher, statuts) sans encombrer la barre d'adresse |

Le projet « Avec Les Femmes » anticipe l'ajout de multiples critères de filtrage administratif : **la méthode POST est donc retenue pour la recherche de groupements**.

---

# 2. Le Pattern Formulaire Basé sur DTO

Dans une application Symfony débutante, les formulaires sont fréquemment liés directement à des entités Doctrine (`data_class: Groupement::class`).
Pour un formulaire de recherche ou de filtre, **cette approche est une faute de conception**, car les critères de recherche ne représentent pas un enregistrement en base de données.

### 2.1 Le DTO de Recherche (`src/Dto/GroupeSearchDto.php`)
Nous créons un objet de transfert dédié à la recherche :

```php
<?php

namespace App\Dto;

final class GroupeSearchDto
{
    public function __construct(
        public ?string $query = null,
    ) {
    }
}
```

### 2.2 Avantage Évolutif
Si demain le sous-administrateur souhaite filtrer par région, par statut d'exercice ou par date de création, il suffit d'ajouter ces propriétés dans `GroupeSearchDto`. Ni la base de données ni l'entité `Groupement` ne sont impactées !

---

# 3. Création du FormType Symfony : `GroupeSearchType`

Nous générons la classe de formulaire via la console :
```bash
php bin/console make:form GroupeSearchType
```

Code réel implémenté dans `src/Form/GroupeSearchType.php` :

```php
<?php

namespace App\Form;

use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\OptionsResolver\OptionsResolver;
use Symfony\Component\Form\Extension\Core\Type\SearchType;
use Symfony\Component\Form\Extension\Core\Type\SubmitType;
use App\Dto\GroupeSearchDto;

class GroupeSearchType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder
            ->add('query', SearchType::class, [
                'required' => false,
                'label' => false,
                'attr' => [
                    'placeholder' => 'Rechercher par nom ou ville...',
                ],
            ])
            ->add('submit', SubmitType::class, [
                'label' => 'Filtrer',
                'attr' => [
                    'class' => 'bouton',
                ],
            ]);
    }

    public function configureOptions(OptionsResolver $resolver): void
    {
        $resolver->setDefaults([
            'data_class' => GroupeSearchDto::class,
            'method' => 'POST',
            'csrf_protection' => false, // Désactivation raisonnée pour un filtre de lecture seule
        ]);
    }
}
```

> 🛡️ **Focus Sécurité : Pourquoi désactiver la protection CSRF ici ?**
> La faille CSRF (*Cross-Site Request Forgery*) consiste à tromper un utilisateur connecté pour exécuter à son insu une action altérant des données (virement, suppression, modification).
> Le formulaire de recherche de groupements est une action de **consultation pure sans altération d'état**. Désactiver le token CSRF allège le formulaire et élimine les erreurs d'expiration de session lors de multiples recherches rapides.

---

# 4. L'Objet `Request` de Symfony vs les Superglobales PHP

> 🚫 **Règle absolue en Symfony** :
> Il est formellement interdit d'accéder aux superglobales natives `$_GET`, `$_POST`, `$_SERVER` ou `$_REQUEST`.
> Tout échange passe par la classe **`Symfony\Component\HttpFoundation\Request`**.

- `$request->query->get('cle')` : Récupère les paramètres transmis via l'URL (GET).
- `$request->request->get('cle')` : Récupère les paramètres soumis dans le corps (POST).
- `$form->handleRequest($request)` : Analyse la requête et hydrate automatiquement les propriétés de notre `GroupeSearchDto`.

---

# 5. Héritage de Templates Twig (Layouts) et Rendu Granulaire

### 5.1 Architecture des Layouts Twig
L'application repose sur un squelette maître : `templates/base.html.twig`.
Les pages spécialisées en héritent grâce à la balise `{% extends 'base.html.twig' %}`.

```
templates/base.html.twig (Layout parent global)
   ├── {% block title %}
   ├── {% block stylesheets %}
   ├── {% block menu %}
   └── {% block body %}
```

### 5.2 Rôle Crucial de la Fonction `{{ parent() }}`
Lorsqu'une vue enfant redéfinit un bloc Twig sans appeler `{{ parent() }}`, elle **écrase intégralement** le contenu défini par le layout parent !

```twig
{# templates/groupement/index.html.twig #}
{% extends 'base.html.twig' %}

{% block title %}Groupements{% endblock %}

{% block menu %}
  {{ parent() }} {# Préserve le menu de navigation principal du layout de base #}
{% endblock %}
```

### 5.3 Rendu Granulaire du Formulaire de Recherche
Au lieu d'utiliser le rendu brut `{{ form(formSearchGroupement) }}` qui produit un balisage standard rigide, nous utilisons les fonctions granulaires de Twig :

```twig
{{ form_start(formSearchGroupement, {'attr': {'class': 'recherche form-search-inline', 'role': 'search'}}) }}
    {{ form_row(formSearchGroupement.query, {'attr': {'class': 'form-control'}}) }}
    {{ form_row(formSearchGroupement.submit) }}
{{ form_end(formSearchGroupement) }}
```

---

# 6. Routes Paramétrées et Navigation vers les Exercices

Quand le sous-administrateur clique sur un groupement dans le tableau, il doit être dirigé vers la vue détaillée de ses exercices.

### 6.1 Route avec Contrainte d'Intégrité par Regex
Dans `src/Controller/ExerciceController.php` :

```php
#[Route('{idGroupement}/exercice', name: 'app_exercice', requirements: ['idGroupement' => '\d+'])]
public function index(int $idGroupement, Request $request): Response
{
    // ...
}
```

> ℹ️ **[Explication externe - Documentation officielle Symfony]**
> Le paramètre `requirements: ['idGroupement' => '\d+']` force le routeur à vérifier que `{idGroupement}` est exclusivement composé de chiffres décimaux. Si un utilisateur malveillant saisit `/abc/exercice`, Symfony retourne immédiatement une erreur **HTTP 404 (Not Found)** sans même solliciter la base de données !

### 6.2 Lien Dynamique dans le Tableau Twig
Dans `templates/groupement/index.html.twig` :
```twig
<a class="nom-groupement" href="{{ path('app_exercice', {'idGroupement': groupement.id}) }}">
    {{ groupement.nom }}
</a>
```

---

# 7. Synthèse des Acquis

1. Les formulaires de recherche s'appuient sur des DTOs découplés des entités persistées.
2. L'objet `Request` de HttpFoundation encapsule proprement les paramètres HTTP.
3. La fonction `{{ parent() }}` préserve les blocs indispensables du layout global.
4. Les expressions régulières dans les attributs `#[Route]` renforcent la sécurité aux frontières de l'application.
