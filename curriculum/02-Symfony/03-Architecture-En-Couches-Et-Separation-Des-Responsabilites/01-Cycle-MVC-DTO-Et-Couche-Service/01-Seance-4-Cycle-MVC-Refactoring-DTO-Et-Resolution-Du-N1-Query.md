---
title: 'Séance 4 : Cycle MVC, Refactoring DTO/Service et Résolution du N+1 Query'
teacher: Baila Wane
course_date: '2026-10-29'
description: Cycle de vie complet d'une requête HTTP, programmation fonctionnelle
  en PHP (callbacks, arrow functions), pièges de la logique métier dans Twig, résolution
  du problème de requête N+1 et refactoring par DTOs immuables et couche Service.
keywords: DTO, Service, ExerciceEnCoursDTO, GroupementListExerciceDTO, N+1 Query,
  QueryBuilder, Join, Callbacks, Fonctions fléchées, StarUML, avecLesFemmes
is_published: true
resources:
- type: external_link
  title: Support de cours Notion - Séance 4 (29-10-2026)
  url: https://buttercup-option-ef4.notion.site/Symfony-3ed4a8cf9efb80deb686f05804a1c219
  note: Prise de notes et synthèse originale du cours par Baila Wane.
- type: external_link
  title: Transcription interactive Granola (29-10-2026)
  url: https://notes.granola.ai/t/539b4f97-e485-4883-89b0-de48ac517a02-00demib2
  note: Transcription intégrale des échanges et explications live du cours.
- type: external_link
  title: Dépôt GitHub du projet « Avec Les Femmes »
  url: https://github.com/DianaFerradini/avecLesFemmes-Symfony.git
  note: Code source du projet d'application fil rouge.
---

# 1. Vue d'Ensemble et Workflow Git d'Équipe

Lorsqu'un développeur rejoint l'équipe sur le projet **« Avec Les Femmes »**, la maîtrise des outils de versionnement et d'environnement est primordiale.

### 1.1 `git clone` vs `git pull`
- **`git clone <url>`** : Téléchargement initial complet du dépôt sur une machine locale qui ne possède pas encore le projet.
- **`git pull`** : Récupération des dernières modifications validées par l'équipe sur un projet déjà cloné.

### 1.2 Protocole de Restauration de l'Environnement
Après un clone, le répertoire `vendor/` est absent (puisqu'exclu du versionnement). La procédure rigoureuse se déroule comme suit :
```bash
# 1. Restauration des dépendances exactes via le fichier de verrouillage
composer install

# 2. Configuration locale des accès PostgreSQL
cp .env .env.local
# Éditer .env.local avec les identifiants locaux

# 3. Création physique et mise à jour de la base de données
php bin/console doctrine:database:create
php bin/console doctrine:migrations:migrate --no-interaction

# 4. Chargement des jeux d'essai
php bin/console doctrine:fixtures:load --no-interaction

# 5. Lancement du serveur de développement
symfony server:start
```

---

# 2. Règle Métier : Unicité de l'Exercice « En Cours »

Dans notre modèle de domaine, un `Groupement` gère une collection historique d'exercices comptables (2024, 2025, 2026...). Cependant, une règle métier stricte s'impose :
> ⚖️ **Règle d'or de gestion** :
> À un instant $T$, un groupement ne peut avoir **qu'un seul et unique exercice ayant le statut `EN_COURS`**.
> Tous les exercices antérieurs doivent être impérativement à l'état `CLOTURE`.
> Deux exercices ne peuvent jamais être simultanément actifs au sein du même groupement.

La page d'accueil de supervision du sous-administrateur (`/groupement`) doit afficher la liste des groupements avec le résumé de leur unique exercice actif en cours.

---

# 3. Le Piège de l'Implémentation Naïve et le Problème du N+1 Query

### 3.1 La Mauvaise Pratique (Ce qui avait été fait initialement)
Dans la première version naïve développée par les étudiants, le contrôleur récupérait tous les groupements via `findAll()` et les passait directement à Twig :

```php
// Mauvais contrôleur
$groupements = $this->groupementRepository->findAll();
return $this->render('groupement/index.html.twig', [
    'dataGroupements' => $groupements,
]);
```

Et dans le template Twig `index.html.twig`, pour afficher l'exercice actif, l'étudiant utilisait un filtre Twig :
```twig
{# ANTI-PATTERN MAJEUR DANS LA VUE TWIG #}
{% for groupement in dataGroupements %}
    {% set exerciceActif = groupement.exercices|filter(e => e.statut.value == 'en_cours')|first %}
    <tr>
        <td>{{ groupement.nom }}</td>
        <td>{{ exerciceActif ? exerciceActif.statut.label : 'Aucun' }}</td>
    </tr>
{% endfor %}
```

### 3.2 La Sentence Architecturale de Baila Wane
> 🛑 *« C'est très malin, on est en train de faire le filtrage dans la vue. Mais c'est une hérésie d'architecture ! »*

Pourquoi cette approche est-elle inacceptable en production ?
1. **Violation flagrante de MVC** : La vue Twig ne doit contenir **aucune logique métier ni algorithme de filtrage**. Sa seule responsabilité est de mettre en forme des données déjà prêtes.
2. **Le Fléau du N+1 Query** :
   - Par défaut, Doctrine charge les relations en mode différé (*Lazy Loading*).
   - `findAll()` exécute **1 requête** pour charger 100 groupements.
   - À chaque tour de boucle dans Twig, l'appel à `groupement.exercices` force Doctrine à émettre **une requête SQL supplémentaire** pour aller chercher les exercices de ce groupement spécifique.
   - **Bilan** : Pour 100 groupements, $1 + 100 = 101$ requêtes SQL sont envoyées à la base de données ! Le serveur s'effondre sous la latence réseau.

---

# 4. Programmation Fonctionnelle en PHP : Callbacks et Arrow Functions

Avant de refactoriser, un rappel s'impose sur les fonctions d'ordre supérieur en PHP moderne.

### 4.1 Fonctions Anonymes vs Arrow Functions
```php
// 1. Fonction anonyme classique
$addition = function(int $a, int $b): int {
    return $a + $b;
};

// 2. Fonction fléchée (PHP 7.4+) : syntaxe concise à instruction unique
$additionRapide = fn(int $a, int $b) => $a + $b;
```

### 4.2 Fonctions Intégrées : `array_map` et `array_filter`
- **`array_filter($tableau, callable)`** : Conserve uniquement les éléments pour lesquels la fonction de rappel retourne `true`.
- **`array_map(callable, $tableau)`** : Applique une transformation à chaque élément et retourne la nouvelle collection transformée.

---

# 5. Le Refactoring par DTOs Immuables

Un **DTO (Data Transfer Object)** est un objet simple dont l'unique mission est de transporter les données entre les couches, sans comportement ni dépendance à l'ORM.

### 5.1 DTO de l'Exercice Actif (`src/Dto/ExerciceEncoursDto.php`)
Dans notre dépôt, ce DTO est déclaré `final readonly` pour garantir son immuabilité :

```php
<?php

namespace App\Dto;

use App\Entity\Exercice;

final readonly class ExerciceEncoursDto
{
    public function __construct(
        public int $id,
        public \DateTime $dateDebut,
        public \DateTime $dateFin,
        public string $statut,
    ) {
    }

    public static function fromEntity(Exercice $exerciceEntity): self
    {
        return new self(
            $exerciceEntity->getId(),
            $exerciceEntity->getDebutAt(),
            $exerciceEntity->getFinAt(),
            $exerciceEntity->getStatut()->label(),
        );
    }
}
```

### 5.2 DTO de Présentation de la Liste (`src/Dto/GroupementListExerciceDto.php`)
Ce DTO assemble les données du groupement et son exercice actif :

```php
<?php

namespace App\Dto;

use App\Entity\Groupement;

final readonly class GroupementListExerciceDto
{
    public function __construct(
        public int $id,
        public string $nom,
        public string $tel,
        public ?string $adresse,
        public ?ExerciceEncoursDto $exerciceEncoursDto = null,
        public int $nbrExercices = 0,
    ) {
    }

    public static function fromEntity(Groupement $groupementEntity, ?ExerciceEncoursDto $exerciceEncoursDto = null): self
    {
        return new self(
            $groupementEntity->getId(),
            $groupementEntity->getNom(),
            $groupementEntity->getTel(),
            $groupementEntity->getAdresse(),
            $exerciceEncoursDto,
            $groupementEntity->getExercices()->count(),
        );
    }
}
```

---

# 6. La Couche Service et l'Optimisation SQL dans le Repository

### 6.1 Élimination du N+1 Query dans `GroupementRepository.php`
Au lieu de requêter en lazy loading, nous écrivons une requête optimisée avec `leftJoin` et `addSelect` (*Eager Loading*) :

```php
// src/Repository/GroupementRepository.php
public function findAllGroupementsAndExercicesEncours(GroupeSearchDto $searchDto): array
{
    $qb = $this->createQueryBuilder('g')
        ->leftJoin('g.exercices', 'e')
        ->addSelect('e')
        ->where('e.statut = :statut')
        ->setParameter('statut', 'en_cours');

    if ($searchDto->query) {
        $qb->andWhere('g.nom LIKE :query OR g.adresse LIKE :query')
            ->setParameter('query', '%' . $searchDto->query . '%');
    }

    // UNE SEULE REQUÊTE SQL EXÉCUTÉE
    return $qb->getQuery()->getResult();
}
```

> ℹ️ **[Explication externe - Documentation officielle Symfony]**
> L'instruction `addSelect('e')` demande explicitement à Doctrine de peupler l'objet `Groupement` avec les entités `Exercice` associées dès la première requête SQL via une jointure `LEFT JOIN`. Lorsque le code parcourt `$groupement->getExercices()`, les données sont déjà en mémoire : **zéro requête supplémentaire !**

### 6.2 La Couche Service : `src/Service/GroupementExerciceService.php`
Le service assure l'isolation entre la base de données et le contrôleur :

```php
<?php

namespace App\Service;

use App\Dto\ExerciceEncoursDto;
use App\Dto\GroupementListExerciceDto;
use App\Dto\GroupeSearchDto;
use App\Repository\GroupementRepository;
use App\Repository\ExerciceRepository;

class GroupementExerciceService
{
    public function __construct(
        private readonly GroupementRepository $groupementRepository,
        private readonly ExerciceRepository $exerciceRepository,
        private readonly PaginationService $paginationService
    ) {
    }

    public function findAllGroupementsAndExercicesEncours(GroupeSearchDto $searchDto): array
    {
        $groupements = $this->groupementRepository->findAllGroupementsAndExercicesEncours($searchDto);

        // Transformation fonctionnelle des entités Doctrine en DTOs légers
        return array_map(function ($groupement) {
            $exerciceEncours = $groupement->getExercices()[0] ?? null;
            if ($exerciceEncours) {
                $exerciceEncoursDto = ExerciceEncoursDto::fromEntity($exerciceEncours);
                return GroupementListExerciceDto::fromEntity($groupement, $exerciceEncoursDto);
            }
            return null;
        }, $groupements);
    }
}
```

### 6.3 Le Contrôleur Épuré (`src/Controller/GroupementController.php`)
Le contrôleur ne touche plus aux entités Doctrine :
```php
#[Route('/groupement', name: 'app_groupement')]
public function index(Request $request): Response
{
    $searchDto = new GroupeSearchDto();
    $form = $this->createForm(GroupeSearchType::class, $searchDto);
    $form->handleRequest($request);

    $groupements = $this->groupementExerciceService->findAllGroupementsAndExercicesEncours($searchDto);

    return $this->render('groupement/index.html.twig', [
        'dataGroupements' => $groupements,
        'formSearchGroupement' => $form->createView(),
    ]);
}
```

---

# 7. Synthèse des Acquis

1. Le Lazy Loading non maîtrisé dans Twig déclenche l'avalanche désastreuse du problème N+1 Query.
2. L'Eager Loading (`leftJoin` + `addSelect`) résout définitivement la performance en ramenant l'ensemble du graphe d'objets en une seule requête SQL.
3. Les DTOs (`final readonly`) protègent le domaine métier et n'exposent à la vue que les informations strictement nécessaires à l'affichage.
4. La couche Service isole le contrôleur et garantit la réutilisabilité des règles de gestion.
