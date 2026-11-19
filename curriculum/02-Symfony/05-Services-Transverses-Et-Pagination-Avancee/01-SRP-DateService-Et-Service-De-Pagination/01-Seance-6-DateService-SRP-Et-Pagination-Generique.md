---
title: 'Séance 6 : DateService, Respect du SRP et Pagination Générique'
teacher: Baila Wane
course_date: '2026-11-05'
description: Formatage et localisation des dates, détection des violations du Single
  Responsibility Principle (SRP), création de DateService, fondements mathématiques
  de la pagination et factorisation par PageDto et PaginationService.
keywords: DateService, SRP, Single Responsibility Principle, Pagination, PageDto,
  PaginationService, Paginator, Doctrine, Twig, avecLesFemmes, Examen
is_published: true
resources:
- type: external_link
  title: Support de cours Notion - Séance 6 (05-11-2026)
  url: https://buttercup-option-ef4.notion.site/Symfony-3ed4a8cf9efb80deb686f05804a1c219
  note: Prise de notes et synthèse originale du cours par Baila Wane.
- type: external_link
  title: Transcription interactive Granola (05-11-2026)
  url: https://notes.granola.ai/t/f8ca0911-5c90-4ebf-a784-c091e012a8aa-00demib2
  note: Transcription intégrale des échanges et explications live du cours.
- type: external_link
  title: Dépôt GitHub du projet « Avec Les Femmes »
  url: https://github.com/DianaFerradini/avecLesFemmes-Symfony.git
  note: Code source du projet d'application fil rouge.
---

# 1. Gestion des Dates et Calcul des Jours Restants

Dans le suivi des exercices financiers du projet **« Avec Les Femmes »**, le sous-administrateur a besoin d'indicateurs visuels précis :
- Connaître la date limite d'octroi des prêts aux membres.
- Connaître le compte à rebours exact : **combien de jours reste-t-il avant l'échéance des prêts ?**

### 1.1 Localisation des Dates en Français
Deux approches existent pour localiser les dates dans Symfony :
1. Via Twig et l'extension `intl` (`dateDebut|format_date('long', locale='fr')`).
2. Globalement via la configuration de translation (`config/packages/translation.yaml`).

Cependant, sur de nombreux serveurs d'hébergement ou postes de travail étudiants, l'extension C `php-intl` n'est pas activée. Pour garantir une indépendance totale et une portabilité sans faille, nous gérons le formatage textuel standard directement dans la couche applicative.

---

# 2. Détection de Violation du Single Responsibility Principle (SRP)

Initialement, le DTO `ExerciceDto` contenait du code de calcul pour la différence entre les dates :

```php
// Mauvaise pratique initiale dans le DTO
private static function calculateNbrJoursRestant(\DateTime $date): int {
    $now = new \DateTime();
    return (int) $now->diff($date)->format('%r%a');
}
```

> ⚠️ **Alerte Architecture de Baila Wane** :
> Un DTO (*Data Transfer Object*) a pour **unique responsabilité** de véhiculer de la donnée d'un point A à un point B.
> Dès lors qu'un DTO effectue des opérations de calcul algorithmique ou de formatage, il viole frontalement le **Single Responsibility Principle (SRP)**, premier des principes SOLID !

### 2.1 La Solution : Création de `DateService` (`src/Service/DateService.php`)
Pourquoi déclarer `DateService` comme une classe `final` avec des méthodes statiques ?
- Les DTOs sont instanciés manuellement dans le code métier via `new ExerciceDto(...)`, et non par le conteneur d'injection de dépendances de Symfony.
- Injecter un service par le constructeur dans un DTO forcerait à trimballer une référence de service dans chaque objet de transfert !
- Des méthodes statiques pures sans état (*stateless*) offrent une solution élégante, testable et ultra-rapide.

Code réel du dépôt (`src/Service/DateService.php`) :

```php
<?php

namespace App\Service;

final class DateService
{
    public static function calculateNbrJoursRestant(\DateTime $dateRetribution): int
    {
        $now = new \DateTime();
        $interval = $now->diff($dateRetribution);
        return (int) $interval->format('%r%a');
    }

    public static function formatDate(\DateTime $date): string
    {
        return $date->format('d/m/Y');
    }
}
```

### 2.2 Utilisation Propre dans `ExerciceDto.php`
Le DTO redevient un simple conteneur immuable :

```php
<?php

namespace App\Dto;

use App\Entity\Exercice;
use App\Service\DateService;

final readonly class ExerciceDto
{
    public function __construct(
        public int $id,
        public string $dateDebut,
        public string $dateFin,
        public string $retributionAt,
        public string $limitePretsAt,
        public int $nbrJoursRestant,
        public string $statut,
    ) {
    }

    public static function fromEntity(Exercice $exerciceEntity): self
    {
        return new self(
            $exerciceEntity->getId(),
            DateService::formatDate($exerciceEntity->getDebutAt()),
            DateService::formatDate($exerciceEntity->getFinAt()),
            DateService::formatDate($exerciceEntity->getRetributionAt()),
            DateService::formatDate($exerciceEntity->getLimitePretsAt()),
            DateService::calculateNbrJoursRestant($exerciceEntity->getLimitePretsAt()),
            $exerciceEntity->getStatut()->label(),
        );
    }
}
```

---

# 3. Fondements Mathématiques et SQL de la Pagination

La pagination consiste à segmenter un jeu de données volumineux en sous-ensembles navigables.

### 3.1 Les Deux Paramètres Fondamentaux
1. **`limit`** : Le nombre d'éléments maximum à afficher par page (ex. 5 exercices par page).
2. **`offset`** : L'indice du premier enregistrement à récupérer en base de données.

$$\text{offset} = (\text{page} - 1) \times \text{limit}$$

*Exemple pour une limite de 5 éléments :*
- Page 1 : $\text{offset} = (1 - 1) \times 5 = 0$ ➔ Éléments de 0 à 4.
- Page 2 : $\text{offset} = (2 - 1) \times 5 = 5$ ➔ Éléments de 5 à 9.
- Page 3 : $\text{offset} = (3 - 1) \times 5 = 10$ ➔ Éléments de 10 à 14.

### 3.2 Calcul du Nombre Total de Pages
Pour calculer le nombre total de pages nécessaires, on divise le nombre total d'enregistrements par la limite, et on applique un **arrondi par excès** via la fonction `ceil` :

$$\text{nbrPages} = \lceil \frac{\text{totalElements}}{\text{limit}} \rceil$$

Si un groupement a 11 exercices avec une limite de 5 par page :
$$\lceil \frac{11}{5} \rceil = \lceil 2.2 \rceil = 3 \text{ pages.}$$

> 🧠 **Règle fondamentale rappelée par Baila Wane** :
> On ne peut paginer **que sur une collection**, jamais sur un singleton !
> Un `findBy` sur les exercices d'un groupement renvoie une collection : c'est paginable.
> Un `find` d'un groupement renvoie un objet unique : ce n'est pas paginable.

---

# 4. Refactoring Architectural : Pagination Générique Réutilisable

Pour ne pas dupliquer la logique de pagination à chaque nouvel écran de l'application, nous concevons un composant générique en deux parties : **`PageDto`** et **`PaginationService`**.

### 4.1 Le DTO Générique de Pagination (`src/Dto/PageDto.php`)
Ce DTO stocke les métadonnées de navigation et offre des helpers booléens pour Twig :

```php
<?php

namespace App\Dto;

final class PageDto
{
    public int $nbrPages;

    public function __construct(
        public readonly int $pageEnCours,
        public readonly int $totalElements,
        public readonly int $limit,
        public array $elements,
    ) {
        $this->nbrPages = (int) ceil($totalElements / $limit);
    }

    public function precedent(): bool
    {
        return $this->pageEnCours > 1;
    }

    public function suivant(): bool
    {
        return $this->pageEnCours < $this->nbrPages;
    }
}
```

### 4.2 Le Service Générique de Pagination (`src/Service/PaginationService.php`)
Ce service exploite le composant officiel **`Doctrine\ORM\Tools\Pagination\Paginator`** pour garantir un décompte exact même en présence de jointures complexes :

```php
<?php

namespace App\Service;

use App\Dto\PageDto;
use Doctrine\ORM\QueryBuilder;
use Doctrine\ORM\Tools\Pagination\Paginator;

class PaginationService
{
    public const DEFAULT_LIMIT = 5;
    public const MAX_LIMIT = 100;

    public function paginate(QueryBuilder $qb, int $page = 1, int $limit = self::DEFAULT_LIMIT): PageDto
    {
        $query = $qb->getQuery()
            ->setFirstResult(($page - 1) * $limit)
            ->setMaxResults($limit);

        $paginator = new Paginator($query, false);
        $totalItems = count($paginator);

        return new PageDto($page, $totalItems, $limit, iterator_to_array($paginator));
    }
}
```

---

# 5. Intégration Complète dans le Cas d'Usage Exercices

### 5.1 Consommation dans `GroupementExerciceService.php`
Le service métier prépare le QueryBuilder, délègue la pagination au `PaginationService`, puis convertit les entités résultantes en DTOs de présentation :

```php
public function findOneGroupementWithExercices(int $idGroupement, int $page): ?GroupementExerciceListDto
{
    $groupement = $this->groupementRepository->find($idGroupement);
    if (!$groupement) {
        return null;
    }

    $nbrExercices = $this->exerciceRepository->countExercicesByGroupement($idGroupement);

    $qb = $this->exerciceRepository->createQueryBuilder('e')
        ->where('e.groupement = :groupement')
        ->setParameter('groupement', $idGroupement)
        ->orderBy('e.statut', 'DESC');

    // Délégation de la pagination
    $pageDto = $this->paginationService->paginate($qb, $page);

    // Transformation en DTOs
    $pageDto->elements = array_map(function ($exercice) {
        return ExerciceDto::fromEntity($exercice);
    }, $pageDto->elements);

    return GroupementExerciceListDto::fromEntity($groupement, $pageDto, $nbrExercices);
}
```

### 5.2 Contrôleur Sécurisé avec Redirection (`ExerciceController.php`)
```php
#[Route('{idGroupement}/exercice', name: 'app_exercice', requirements: ['idGroupement' => '\d+'])]
public function index(int $idGroupement, Request $request): Response
{
    $page = (int) $request->query->get('page', 1);
    if ($page < 1) {
        $page = 1;
    }

    $groupementExerciceListDto = $this->groupementExerciceService->findOneGroupementWithExercices($idGroupement, $page);

    if ($groupementExerciceListDto === null) {
        return $this->redirectToRoute('app_groupement');
    }

    if (count($groupementExerciceListDto->page->elements) === 0) {
        return $this->redirectToRoute('app_nouveau_exercice');
    }

    return $this->render('exercice/index.html.twig', [
        'groupementExerciceListDto' => $groupementExerciceListDto,
    ]);
}
```

### 5.3 Barre de Navigation Dynamique dans Twig (`templates/exercice/index.html.twig`)
Grâce aux méthodes `precedent()` et `suivant()` de `PageDto`, le template Twig reste concis et expressif :

```twig
<nav class="pagination" aria-label="Pagination de l’historique">
    {% set route = app.request.attributes.get('_route') %}
    {% set params = app.request.attributes.get('_route_params') %}
    {% set paginate = groupementExerciceListDto.page %}

    {# Bouton Précédent conditionnel #}
    {% if paginate.precedent() %}
        <a class="pagination__lien" rel="prev" href="{{ path(route, params|merge({'page': paginate.pageEnCours - 1})) }}">
            Précédent
        </a>
    {% endif %}

    {# Numéros de page avec surbrillance active #}
    {% for p in 1..paginate.nbrPages %}
        <a class="pagination__lien {{ p == paginate.pageEnCours ? 'pagination__lien--actif' : '' }}" 
           href="{{ path(route, params|merge({'page': p})) }}">
            {{ p }}
        </a>
    {% endfor %}

    {# Bouton Suivant conditionnel #}
    {% if paginate.suivant() %}
        <a class="pagination__lien" rel="next" href="{{ path(route, params|merge({'page': paginate.pageEnCours + 1})) }}">
            Suivant
        </a>
    {% endif %}
</nav>
```

---

# 6. Recommandations Pédagogiques pour l'Examen

En conclusion de séance, l'enseignant a détaillé le protocole de l'examen semestriel :

### Format de l'Évaluation
1. **Partie 1 : Épreuve Théorique sur Papier (Éliminatoire)**
   - Questions conceptuelles : principes SOLID, Single Responsibility Principle, flux de requête MVC.
   - Analyse critique de code : repérer des violations d'architecture (requêtes SQL dans les contrôleurs, calculs dans les DTOs, requêtes N+1 dans Twig).
   - *Condition requise* : La moyenne est obligatoire pour obtenir l'accès à la machine.
2. **Partie 2 : Épreuve Pratique sur Machine**
   - Implémentation d'un cas d'usage complet sur le projet fil rouge.
   - Création de Formulaires avec DTOs, services métiers découplés et composants de pagination.

---

# 7. Synthèse Globale du Cours de Symfony

À travers ces 6 séances articulées autour du projet réel « Avec Les Femmes », nous avons parcouru l'intégralité du cycle de vie d'une application professionnelle Symfony 7 :
- **Séance 1** : Topologies d'architecture logicielle et installation normée.
- **Séance 2** : Structure des répertoires, Composer et cycle de vie des paquets.
- **Séance 3** : Modélisation UML, Backed Enums PHP 8.1, Traits et fixtures relationnelles.
- **Séance 4** : Cycle de requête MVC, DTOs immuables, services et éradication du N+1 Query.
- **Séance 5** : Formulaires dynamiques basés sur DTO, layouts Twig et requêtes QueryBuilder.
- **Séance 6** : DateService respectant le SRP, mathématiques de la pagination et composant réutilisable `PaginationService`.
