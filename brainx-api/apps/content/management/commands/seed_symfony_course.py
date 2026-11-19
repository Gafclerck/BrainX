"""Management command to seed the Symfony course and its 5 sessions from Notion notes."""

import datetime
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.content.models import Chapter, Course, Lesson, Module, Resource
from apps.content.mutations import mutate
from apps.users.models import User, UserManager


NOTION_SOURCE_URL = (
    'https://buttercup-option-ef4.notion.site/Symfony-3ed4a8cf9efb80deb686f05804a1c219'
)

SESSIONS_DATA = [
    {
        'module_name': 'Architecture & Fondamentaux',
        'module_pos': 1,
        'chapter_name': 'Introduction & Déploiement Applicatif',
        'chapter_pos': 1,
        'title': 'Séance 1 : Architecture logicielle et introduction à Symfony',
        'teacher': 'Baila Wane',
        'course_date': datetime.date(2026, 10, 1),
        'position': 1,
        'keywords': 'Architecture, Monolithe, Microservices, Agentique, MVC, Symfony, Doctrine, Twig, Maker Bundle, CLI, PostgreSQL, DTO, Composer, PSR-4',
        'resources': [
            {
                'type': Resource.Type.EXTERNAL_LINK,
                'title': 'Support Notion - Séance 1 (01-10-2026)',
                'url': NOTION_SOURCE_URL,
                'note': 'Support de cours et synthèse Notion par Baila Wane.',
            }
        ],
        'description': r"""### Architecture de Déploiement : Vue d’Ensemble
- **Artefact** : composant unique déployé (code PHP, JS, JAR pour Java).
- **Monolithique** : un seul artefact, une seule base de code pour tout le système.
- **Monolithique distribué** : deux artefacts distincts (back-end API + front-end SPA/mobile).
- **Microservice** : métier éclaté en petites applications indépendantes, coordonnées via réseau/messages.
- **Agentique** : tendance émergente où les workflows sont pilotés dynamiquement par description et règles plutôt que par code figé.

### Limites de l'Architecture Monolithique
- Duplication du métier si plusieurs interfaces clientes existent (web, mobile, desktop).
- Toute évolution fonctionnelle doit être répercutée sur chaque artefact.
- Inadapté aux applications modernes à périmètre évolutif (MVP, pivots fréquents).
- Utile principalement en formation initiale pour apprendre rapidement, rarement en production à grande échelle.

### Monolithique Distribué & Microservices
- **Monolithique distribué** :
  - Back-end : services + repositories + base de données, sans génération de vue HTML.
  - Front-end : présentation uniquement, connectée au back via une API REST / JSON.
  - Mix de technologies possible (PHP en back, Swift sur iOS, React/Vue en web).
- **Microservices & Scalabilité** :
  - Métier découpé en services autonomes (ex. transfert, achat crédit, authentification).
  - Chaque service dispose de ses propres ressources et peut être répliqué indépendamment.
  - **Load balancer** : distribue intelligemment les requêtes vers les instances saines.
  - Scalabilité verticale (ajout CPU/RAM limité) vs Scalabilité horizontale (multiplication d'instances).

### Systèmes et Architectures Agentiques
- **Automatisation vs Agentique** :
  - Automatisation : traitement séquentiel déclenché par un événement fixe.
  - Agentique : l'application comprend le contexte, s'adapte et orchestre dynamiquement les bons outils (*tools*).
- Interfaces futures : disparition progressive des formulaires complexes au profit d'interactions en langage naturel.

### Pourquoi choisir Symfony ?
- **From-scratch vs Framework** :
  - Sans framework : structure anarchique, absence de conventions, dette technique immense et reprise quasi-impossible.
  - Avec framework : structure normalisée, dépendances éprouvées, standards industriels.
- **Symfony vs Laravel** :
  - Laravel : flexible, accessible, mais plus permissif sur l'orienté objet.
  - Symfony : rigueur stricte, respect absolu des principes SOLID, design patterns, couplage faible. Idéal pour acquérir une rigueur transférable vers Spring (Java) ou d'autres écosystèmes d'entreprise.

### Architecture Réelle du Projet « Avec Les Femmes »
Dans notre projet concret (`avecLesFemmes-symfony`), l'organisation des répertoires suit rigoureusement les conventions industrielles Symfony :

```
avecLesFemmes-symfony/
├── assets/             # Feuilles de styles et scripts de présentation
├── bin/console         # Point d'entrée de la console Symfony
├── config/             # Configuration des bundles, services et packages
├── docs/               # Modélisation UML (diagramme StarUML modelisation.mdj)
├── migrations/         # Historique des migrations SQL versionnées
├── src/
│   ├── Controller/     # Contrôleurs web (GroupementController, ExerciceController)
│   ├── DataFixtures/   # Jeux d'essai (GroupementFixtures, ExerciceFixtures)
│   ├── Dto/            # Objets de transfert de données (GroupSearchDto, ExerciceDto)
│   ├── Entity/         # Entités Doctrine (Groupement, Exercice, Membre, Campagne)
│   ├── Enum/           # Énumérations typées (StatutExercice)
│   ├── Form/           # Formulaires Symfony (GroupeSearchType)
│   ├── Repository/     # Accès aux données et QueryBuilder optimisé
│   ├── Service/        # Couche métier (GroupementExerciceService)
│   └── Trait/          # Traits transversaux réutilisables (DateTimeTrait)
├── templates/          # Vues Twig (base.html.twig, groupement/, exercice/)
└── composer.json       # Gestionnaire de dépendances et autoloading PSR-4
```

### Configuration des Dépendances : composer.json
Voici l'extrait réel de configuration du projet définissant les prérequis PHP, bundles Symfony et l'espace de noms `App\` sous standard PSR-4 :

```json
{
    "type": "project",
    "license": "proprietary",
    "minimum-stability": "stable",
    "prefer-stable": true,
    "require": {
        "php": ">=8.2",
        "doctrine/doctrine-bundle": "^2.19",
        "doctrine/doctrine-migrations-bundle": "^3.7",
        "doctrine/orm": "^3.7",
        "symfony/framework-bundle": "7.4.*",
        "symfony/form": "7.4.*",
        "symfony/twig-bundle": "7.4.*",
        "symfony/validator": "7.4.*"
    },
    "autoload": {
        "psr-4": {
            "App\\": "src/"
        }
    }
}
```

### Architecture MVC et Flux d'une Requête dans Symfony
Flux complet d'une requête dans notre application :
1. Le navigateur émet une requête HTTP (`GET /groupement` ou `POST /groupement`).
2. Le **Contrôleur** (`GroupementController`) intercepte la requête et la lie au **DTO** (`GroupeSearchDto`) via le formulaire (`GroupeSearchType`).
3. Le **DTO** encapsule les critères validés.
4. Le Contrôleur délègue le traitement au **Service** métier (`GroupementExerciceService`).
5. Le Service sollicite le **Repository** (`GroupementRepository`) qui exécute une requête optimisée via **Doctrine ORM**.
6. Le Service transforme les entités Doctrine en DTOs de présentation (`GroupementListExerciceDto`).
7. Le Contrôleur transmet ces DTOs au moteur de vue **Twig** (`groupement/index.html.twig`) qui génère la réponse HTML.

### Commandes Clés de Démarrage
- Création du projet : `symfony new avecLesFemmes --version=lts --webapp`
- Commandes de développement au quotidien :
  - `php bin/console doctrine:database:create`
  - `php bin/console make:entity`
  - `php bin/console doctrine:migrations:diff`
  - `php bin/console doctrine:migrations:migrate`
  - `php bin/console doctrine:fixtures:load`
""",
    },
    {
        'module_name': 'Architecture & Fondamentaux',
        'module_pos': 1,
        'chapter_name': 'Environnement & ORM Doctrine',
        'chapter_pos': 2,
        'title': 'Séance 2 : Structure du Projet, Doctrine ORM et Modélisation Initiale',
        'teacher': 'Baila Wane',
        'course_date': datetime.date(2026, 10, 22),
        'position': 1,
        'keywords': 'Composer, Packagist, vendor, composer.lock, Doctrine, Migrations, Entités, Repositories, avecLesFemmes, LLM, Tuteur, ModeCotisation, Campagne, Groupement',
        'resources': [
            {
                'type': Resource.Type.EXTERNAL_LINK,
                'title': 'Support Notion - Séance 2 (22-10-2026)',
                'url': NOTION_SOURCE_URL,
                'note': 'Support de cours et synthèse Notion par Baila Wane.',
            }
        ],
        'description': r"""### Philosophie d'Apprentissage et Rôle des LLMs
- **L'IA comme tuteur guidé** : Création d'une session dédiée dans le LLM avec le rôle d'un professeur senior (10 ans d'expérience).
- **Règle d'or** : Le LLM ne doit pas générer la solution finale directement. L'étudiant conçoit, implémente, soumet son code et demande une critique / validation.
- **Principe fondamental** : « Comprendre les concepts architecturaux est aujourd'hui plus important que la saisie mécanique du code. » Ce qui reste irremplaçable chez l'ingénieur, c'est la capacité à concevoir, dicter, arbitrer et valider.

### Le Rôle d'un Framework en Entreprise
- Un framework est un « cadre de travail » qui standardise l'environnement de développement.
- Il libère l'équipe des problématiques récurrentes (sécurité, connexion base de données, injection de dépendances, conventions de nommage).
- Permet un recrutement ciblé et assure la pérennité du projet lors du départ d'un collaborateur.

### Structure Interne d'une Application Symfony
- `bin/` : scripts et console d'administration (`php bin/console`).
- `config/` : configuration des bundles, des routes et des services.
- `public/` : unique répertoire exposé au serveur web, abritant le front-controller `index.php` et les assets statiques.
- `src/` : cœur métier de l'application (Contrôleurs, Entités, Services, Repositories, DTOs).
- `templates/` : vues rédigées en syntaxe Twig (`.html.twig`).
- `var/` : journaux d'erreurs (`var/log/`) et fichiers de compilation/cache (`var/cache/`).
- `vendor/` : code source des dépendances tierces gérées par Composer (strictement exclu de Git via `.gitignore`).

### Gestion des Dépendances : Composer & Packagist
- Les paquets PHP sont indexés sur [Packagist.org](https://packagist.org/).
- **`composer.json`** : exprime les contraintes de versions souples (ex. `^7.4`).
- **`composer.lock`** : verrouille les versions exactes installées au commit près, garantissant une reproductibilité absolue de l'environnement sur plusieurs années.

### Configuration et Environnements
- `.env` : gabarit des variables d'environnement, versionné avec des valeurs génériques ou vides.
- `.env.local` : fichier local non versionné contenant les identifiants réels de connexion à la base de données.
- Modes d'exécution : `dev`, `prod`, `test`.

### ORM Doctrine : Principes et Cycle de Vie
- Rôle du mapping : convertir les objets PHP en tuples SQL et réciproquement.
- **Entité** : classe représentant une table métier. Règle : ne jamais exposer une entité directement dans une vue.
- **Repository** : point d'entrée pour la lecture de données (`find`, `findAll`, `findBy`).
- **Migrations** : historique incrémental et versionné du schéma de base de données.

### Modélisation du Projet « Avec Les Femmes »
Contexte : Gestion de calébasses participatives, tontines et épargne communautaire féminine.
- **Acteurs** : Administrateur de groupement, membres simples, trésorière, secrétaire.
- **Entités identifiées** :
  - `Groupement` : nom, adresse, téléphone.
  - `Campagne` : nom, dateDebut, dateFin, montant fixe, createdAt, updatedAt.
  - `TypeCampagne` : relation Many-to-One avec Campagne (permet d'étendre aux tontines, prêts, etc.).
  - `Membre` : nom complet, téléphone, adresse, login, mot de passe.
  - `ModeCotisation` : table d'association entre `Membre` et `Campagne`.

### Code Réel : Entité Groupement (`src/Entity/Groupement.php`)
Voici l'entité `Groupement` telle qu'implémentée dans notre application, avec ses attributs Doctrine et sa relation One-to-Many vers `Exercice` :

```php
<?php

namespace App\Entity;

use App\Repository\GroupementRepository;
use App\Trait\DateTimeTrait;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: GroupementRepository::class)]
class Groupement
{
    use DateTimeTrait;

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 100)]
    private ?string $nom = null;

    #[ORM\Column(length: 17)]
    private ?string $tel = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $adresse = null;

    /**
     * @var Collection<int, Exercice>
     */
    #[ORM\OneToMany(targetEntity: Exercice::class, mappedBy: 'groupement', orphanRemoval: true)]
    private Collection $exercices;

    public function __construct()
    {
        $this->exercices = new ArrayCollection();
        $this->initDate();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getNom(): ?string
    {
        return $this->nom;
    }

    public function setNom(string $nom): static
    {
        $this->nom = $nom;
        return $this;
    }

    public function getTel(): ?string
    {
        return $this->tel;
    }

    public function setTel(string $tel): static
    {
        $this->tel = $tel;
        return $this;
    }

    public function getAdresse(): ?string
    {
        return $this->adresse;
    }

    public function setAdresse(?string $adresse): static
    {
        $this->adresse = $adresse;
        return $this;
    }

    /**
     * @return Collection<int, Exercice>
     */
    public function getExercices(): Collection
    {
        return $this->exercices;
    }
}
```

### Code Réel : Entité Campagne (`src/Entity/Campagne.php`)
Définition des types de colonnes (dates mutables, clés étrangères) pour les cycles d'épargne :

```php
<?php

namespace App\Entity;

use App\Repository\CampagneRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: CampagneRepository::class)]
class Campagne
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 100)]
    private ?string $nom = null;

    #[ORM\Column(type: Types::DATE_MUTABLE)]
    private ?\DateTime $dateDebutAt = null;

    #[ORM\Column(type: Types::DATE_MUTABLE, nullable: true)]
    private ?\DateTime $dateFinAt = null;

    #[ORM\Column]
    private ?int $montant = null;

    #[ORM\ManyToOne(inversedBy: 'campagnes')]
    #[ORM\JoinColumn(nullable: false)]
    private ?TypeCampagne $typeCampagne = null;

    /**
     * @var Collection<int, ModeCotisation>
     */
    #[ORM\OneToMany(targetEntity: ModeCotisation::class, mappedBy: 'campagne')]
    private Collection $modeCotisations;

    public function __construct()
    {
        $this->modeCotisations = new ArrayCollection();
    }

    // Getters et Setters...
}
```

### Travail Pratique Assigné
1. Finaliser le diagramme de classes complet sous `docs/modelisation.mdj`.
2. Créer des commandes personnalisées dans `composer.json` (ex: `nom:db:create`, `nom:migration`).
3. Créer les entités, générer les migrations et structurer les premières fixtures.
4. Stratégie Git : un commit unitaire par entité créée.
""",
    },
    {
        'module_name': 'Modélisation Métier & Conception Avancée',
        'module_pos': 2,
        'chapter_name': 'Entités, Enums & Fixtures',
        'chapter_pos': 1,
        'title': 'Séance 3 : UML, Backed Enums, Traits et Ordonnancement des Fixtures',
        'teacher': 'Baila Wane',
        'course_date': datetime.date(2026, 10, 27),
        'position': 1,
        'keywords': 'Enums, Backed Enum, StatutExercice, Traits, DateTimeTrait, Fixtures, DependentFixtureInterface, Épargne calebasse, Caisse sociale, Amendes, Exercice',
        'resources': [
            {
                'type': Resource.Type.EXTERNAL_LINK,
                'title': 'Transcription interactive Granola (27-10-2026)',
                'url': 'https://notes.granola.ai/t/015e55ef-5a34-493a-90e9-2344fee32e12-00demib2',
                'note': 'Transcription complète et prise de notes interactive Granola.',
            },
            {
                'type': Resource.Type.EXTERNAL_LINK,
                'title': 'Support Notion - Séance 3 (27-10-2026)',
                'url': NOTION_SOURCE_URL,
                'note': 'Support de cours et synthèse Notion par Baila Wane.',
            },
        ],
        'description': r"""### Contexte Pédagogique et Périmètre Sous-Admin
- Présentation de l'application réelle déployée sur le Play Store par l'enseignant.
- Approche incrémentale : introduction délibérée de variations pour développer la résilience architecturale des étudiants.
- Périmètre de la séance : cas d'utilisation du sous-administrateur (gestion des groupements, des exercices comptables et des activités/campagnes).

### Modélisation UML & Diagramme de Classes
- **Exercice** : période financière durant laquelle un groupement opère (ex. de la veille de la Tabaski à deux semaines avant la Tabaski suivante).
- Relation `Groupement` 1..* `Exercice` (bidirectionnelle, avec `orphanRemoval=true`).
- Attributs de l'Exercice : `debutAt`, `finAt`, `limitePretsAt`, `retributionAt`, `statut`.

### Code Réel : Backed Enum PHP 8.1+ (`src/Enum/StatutExercice.php`)
Dans notre application, nous utilisons un **Backed Enum** de type chaîne. Grâce à la fonction `label()` utilisant l'expression `match`, nous découplons la valeur stockée en base de données de l'intitulé d'affichage :

```php
<?php

namespace App\Enum;

enum StatutExercice: string {
    case ENCOURS = 'en_cours';
    case CLOTURE = 'cloture';

    public function label(): string {
        return match ($this) {
            self::ENCOURS => "En cours",
            self::CLOTURE => "Clôturé",
        };
    }
}
```

### Code Réel : Trait Partagé d'Audit (`src/Trait/DateTimeTrait.php`)
Pour éviter la duplication des colonnes d'audit `createAt` et `updateAt` entre les entités (`Groupement`, `Exercice`), nous utilisons un Trait PHP avec initialisation automatique :

```php
<?php

namespace App\Trait;

use Doctrine\ORM\Mapping as ORM;

trait DateTimeTrait {
    #[ORM\Column]
    private ?\DateTimeImmutable $createAt = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTime $updateAt = null;

    private function initDate() {
        $now = new \DateTimeImmutable();
        $this->createAt = $now;
        $this->updateAt = new \DateTime();
    }

    public function getCreateAt(): ?\DateTimeImmutable
    {
        return $this->createAt;
    }

    public function setCreateAt(\DateTimeImmutable $createAt): static
    {
        $this->createAt = $createAt;
        return $this;
    }

    public function getUpdateAt(): ?\DateTime
    {
        return $this->updateAt;
    }

    public function setUpdateAt(?\DateTime $updateAt): static
    {
        $this->updateAt = $updateAt;
        return $this;
    }
}
```

### Code Réel : Entité Exercice (`src/Entity/Exercice.php`)
L'entité `Exercice` intègre le Trait, le Backed Enum via l'attribut `enumType` et sa relation avec `Groupement` :

```php
<?php

namespace App\Entity;

use App\Enum\StatutExercice;
use App\Repository\ExerciceRepository;
use App\Trait\DateTimeTrait;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ExerciceRepository::class)]
class Exercice
{
    use DateTimeTrait;

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(type: Types::DATE_MUTABLE)]
    private ?\DateTime $debutAt = null;

    #[ORM\Column(type: Types::DATE_MUTABLE, nullable: true)]
    private ?\DateTime $finAt = null;

    #[ORM\Column(type: Types::DATE_MUTABLE, nullable: true)]
    private ?\DateTime $limitePretsAt = null;

    #[ORM\Column(type: Types::DATE_MUTABLE, nullable: true)]
    private ?\DateTime $retributionAt = null;

    #[ORM\Column(enumType: StatutExercice::class)]
    private ?StatutExercice $statut = null;

    #[ORM\ManyToOne(inversedBy: 'exercices')]
    #[ORM\JoinColumn(nullable: false)]
    private ?Groupement $groupement = null;

    public function __construct() {
        $this->initDate();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getDebutAt(): ?\DateTime
    {
        return $this->debutAt;
    }

    public function setDebutAt(\DateTime $debutAt): static
    {
        $this->debutAt = $debutAt;
        return $this;
    }

    public function getFinAt(): ?\DateTime
    {
        return $this->finAt;
    }

    public function setFinAt(?\DateTime $finAt): static
    {
        $this->finAt = $finAt;
        return $this;
    }

    public function getStatut(): ?StatutExercice
    {
        return $this->statut;
    }

    public function setStatut(StatutExercice $statut): static
    {
        $this->statut = $statut;
        return $this;
    }

    public function getGroupement(): ?Groupement
    {
        return $this->groupement;
    }

    public function setGroupement(?Groupement $groupement): static
    {
        $this->groupement = $groupement;
        return $this;
    }
}
```

### Code Réel : Ordonnancement des Fixtures (`src/DataFixtures/`)
Puisque chaque exercice dépend d'un groupement existant, exécuter les fixtures dans l'ordre alphabétique déclencherait une violation de clé étrangère SQL (`SQLSTATE[23000]`).
Nous résolvons cela en implémentant `DependentFixtureInterface` :

**Fixtures Groupements (`src/DataFixtures/GroupementFixtures.php`) :**
```php
<?php

namespace App\DataFixtures;

use App\Entity\Groupement;
use Doctrine\Bundle\FixturesBundle\Fixture;
use Doctrine\Persistence\ObjectManager;

class GroupementFixtures extends Fixture
{
    public function load(ObjectManager $manager): void
    {
        $data = [
            ['GIE Teranga Mbour', '+221 77 123 45 67', 'Mbour, Thiès'],
            ['GIE Jappo Dakar', '+221 78 234 56 78', 'Pikine, Dakar'],
            ['GIE Dëgg Saint-Louis', '+221 76 345 67 89', 'Sor, Saint-Louis'],
        ];

        foreach ($data as [$nom, $tel, $adresse]) {
            $groupement = (new Groupement())
                ->setNom($nom)
                ->setTel($tel)
                ->setAdresse($adresse);

            $manager->persist($groupement); // Mise en mémoire tampon
        }

        $manager->flush(); // Une seule transaction SQL vers la base !
    }
}
```

**Fixtures Exercices avec Dépendance (`src/DataFixtures/ExerciceFixtures.php`) :**
```php
<?php

namespace App\DataFixtures;

use App\Entity\Exercice;
use App\Enum\StatutExercice;
use App\Repository\GroupementRepository;
use Doctrine\Bundle\FixturesBundle\Fixture;
use Doctrine\Common\DataFixtures\DependentFixtureInterface;
use Doctrine\Persistence\ObjectManager;

class ExerciceFixtures extends Fixture implements DependentFixtureInterface
{
    // Promotion de propriété dans le constructeur PHP 8.1+
    public function __construct(private readonly GroupementRepository $repo) {
    }

    // Déclaration formelle de l'ordre d'exécution
    public function getDependencies(): array {
        return [GroupementFixtures::class];
    }

    public function load(ObjectManager $manager): void
    {
        $groupements = $this->repo->findAll();
        foreach ($groupements as $groupement) {
            $exercice = (new Exercice())
                ->setGroupement($groupement)
                ->setDebutAt(new \DateTime('2026-01-01'))
                ->setFinAt(new \DateTime('2026-12-31'))
                ->setLimitePretsAt(new \DateTime('2026-10-01'))
                ->setRetributionAt(new \DateTime('2026-11-01'))
                ->setStatut(StatutExercice::ENCOURS);

            $manager->persist($exercice);
        }

        $manager->flush();
    }
}
```

### Règles Métier : Épargne Calebasse et Caisse Sociale
- **Épargne calebasse** : obligatoire pour tous les membres sur toute la durée de l'exercice (montant fixe ou libre).
- **Caisse sociale** (fonds de secours du groupement) :
  - Membre présent : cotisation épargne + forfait caisse sociale (ex. +100 FCFA).
  - Membre absent excusé : cotisation épargne + forfait majoré (ex. +300 FCFA).
  - Membre absent non excusé : calcul d'une amende journalière accumulée jusqu'au règlement effectif (ex. 350 FCFA/jour de retard).
""",
    },
    {
        'module_name': 'Modélisation Métier & Conception Avancée',
        'module_pos': 2,
        'chapter_name': 'Architecture en Couches & Optimisation',
        'chapter_pos': 2,
        'title': 'Séance 4 : Cycle MVC, Refactoring DTO/Service et Résolution du N+1 Query',
        'teacher': 'Baila Wane',
        'course_date': datetime.date(2026, 10, 29),
        'position': 1,
        'keywords': 'DTO, Service, ExerciceEnCoursDTO, GroupementListExerciceDTO, N+1 Query, QueryBuilder, Join, Callbacks, Fonctions fléchées, StarUML',
        'resources': [
            {
                'type': Resource.Type.EXTERNAL_LINK,
                'title': 'Transcription interactive Granola (29-10-2026)',
                'url': 'https://notes.granola.ai/t/539b4f97-e485-4883-89b0-de48ac517a02-00demib2',
                'note': 'Transcription complète et prise de notes interactive Granola.',
            },
            {
                'type': Resource.Type.EXTERNAL_LINK,
                'title': 'Support Notion - Séance 4 (29-10-2026)',
                'url': NOTION_SOURCE_URL,
                'note': 'Support de cours et synthèse Notion par Baila Wane.',
            },
        ],
        'description': r"""### Cycle de Requête MVC & Découplage
- Analyse du flux de requête complet via diagramme de séquence : `Requête HTTP -> Routeur -> Action du Contrôleur -> Service -> Repository -> Vue Twig -> Réponse HTTP`.
- Responsabilité stricte du Contrôleur : réceptionner la requête, déléguer aux services, renvoyer la réponse. Aucun traitement métier ne doit y figurer.

### Programmation Fonctionnelle en PHP : Callbacks et Arrow Functions
- Fonctions anonymes et passage de fonctions comme arguments (`callable`).
- Fonctions fléchées (`fn($x) => $x->isValide()`): syntaxe concise pour les prédicats.
- Utilisation de `array_filter` et `array_map` pour transformer et filtrer les collections sans boucles impératives verbeuses.

### Code Réel : Les DTOs de Présentation (`src/Dto/`)
Au lieu d'exposer les entités Doctrine à la vue Twig (ce qui forcerait Twig à naviguer dans le graphe d'objets), nous créons des **DTOs immuables** (`final readonly`) munis de fabriques statiques `fromEntity()` :

**DTO d'un Exercice Actif (`src/Dto/ExerciceEncoursDto.php`) :**
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

**DTO d'un Groupement avec Exercice Résolu (`src/Dto/GroupementListExerciceDto.php`) :**
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
        public ExerciceEncoursDto $exerciceEncoursDto,
    ) {
    }

    public static function fromEntity(Groupement $groupementEntity, ExerciceEncoursDto $exerciceEncoursDto): self
    {
        return new self(
            $groupementEntity->getId(),
            $groupementEntity->getNom(),
            $groupementEntity->getTel(),
            $groupementEntity->getAdresse(),
            $exerciceEncoursDto,
        );
    }
}
```

### Code Réel : La Couche Service (`src/Service/GroupementExerciceService.php`)
Le service métier encapsule la logique d'orchestration et convertit les entités en DTOs à l'aide de `array_map` :

```php
<?php

namespace App\Service;

use App\Dto\ExerciceEncoursDto;
use App\Dto\GroupementListExerciceDto;
use App\Dto\GroupementExerciceListDto;
use App\Dto\ExerciceDto;
use App\Repository\GroupementRepository;
use App\Repository\ExerciceRepository;
use App\Dto\GroupeSearchDto;

class GroupementExerciceService
{
    public function __construct(
        private readonly GroupementRepository $groupementRepository,
        private readonly ExerciceRepository $exerciceRepository
    ) {
    }

    public function findAllGroupementsAndExercicesEncours(GroupeSearchDto $searchDto): array
    {
        // 1. Récupération des entités via le repository optimisé
        $groupements = $this->groupementRepository->findAllGroupementsAndExercicesEncours($searchDto);
        
        // 2. Mapping fonctionnel vers les DTOs de présentation
        return array_map(function ($groupement) {
            $exerciceEncours = $groupement->getExercices()[0] ?? null;
            if ($exerciceEncours) {
                $exerciceEncoursDto = ExerciceEncoursDto::fromEntity($exerciceEncours);
                return GroupementListExerciceDto::fromEntity($groupement, $exerciceEncoursDto);
            }

            return null;
        }, $groupements);
    }

    public function findOneGroupementWithExercices(int $idGroupement): ?GroupementExerciceListDto
    {
        $groupement = $this->groupementRepository->find($idGroupement);
        if (!$groupement) {
            return null;
        }

        $exercices = $this->exerciceRepository->findBy(['groupement' => $idGroupement], ['statut' => 'DESC']);
        $exercicesDto = array_map(function ($exercice) {
            return ExerciceDto::fromEntity($exercice);
        }, $exercices);

        return GroupementExerciceListDto::fromEntity($groupement, $exercicesDto);
    }
}
```

### Le Piège du Problème N+1 Queries et sa Résolution
- **Le problème (approche naïve)** :
  1. `findAll()` sur `Groupement` exécute `SELECT * FROM groupement` (1 requête).
  2. Quand le template ou le service parcourt les 500 groupements et accède à `$groupement->getExercices()`, Doctrine exécute un `SELECT` supplémentaire par groupement !
  3. Total : **1 + 500 = 501 requêtes SQL**, provoquant un effondrement des performances.

- **La solution : Jointure Eager par QueryBuilder dans `GroupementRepository.php`** :
  Grâce à `leftJoin` et `addSelect`, Doctrine ramène les groupements ET leurs exercices dans **une seule et unique requête SQL** :

```php
<?php

namespace App\Repository;

use App\Entity\Groupement;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;
use App\Dto\GroupeSearchDto;

/**
 * @extends ServiceEntityRepository<Groupement>
 */
class GroupementRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Groupement::class);
    }

    public function findAllGroupementsAndExercicesEncours(GroupeSearchDto $searchDto): array
    {
        // Jointure explicite avec addSelect('e') pour hydrater les exercices en 1 seule requête SQL
        $qb = $this->createQueryBuilder('g')
            ->leftJoin('g.exercices', 'e')
            ->addSelect('e')
            ->where('e.statut = :statut')
            ->setParameter('statut', 'en_cours');

        if ($searchDto->query) {
            $qb->andWhere('g.nom LIKE :query OR g.adresse LIKE :query')
                ->setParameter('query', '%' . $searchDto->query . '%');
        }

        return $qb->getQuery()->getResult();
    }
}
```
""",
    },
    {
        'module_name': 'Formulaires & Requêtes Dynamiques',
        'module_pos': 3,
        'chapter_name': 'Formulaires Symfony & Héritage Twig',
        'chapter_pos': 1,
        'title': 'Séance 5 : Formulaires Dynamiques avec DTO, Layouts Twig et Filtrage Repository',
        'teacher': 'Baila Wane',
        'course_date': datetime.date(2026, 11, 3),
        'position': 1,
        'keywords': 'FormType, make:form, GroupSearchDTO, Request, CSRF, Twig layout, base.html.twig, QueryBuilder andWhere, Route requirements, Filtre POST',
        'resources': [
            {
                'type': Resource.Type.EXTERNAL_LINK,
                'title': 'Transcription interactive Granola (03-11-2026)',
                'url': 'https://notes.granola.ai/t/1104d68b-b13a-4abf-85dd-a9e691a9c405-00demib2',
                'note': 'Transcription complète et prise de notes interactive Granola.',
            },
            {
                'type': Resource.Type.EXTERNAL_LINK,
                'title': 'Support Notion - Séance 5 (03-11-2026)',
                'url': NOTION_SOURCE_URL,
                'note': 'Support de cours et synthèse Notion par Baila Wane.',
            },
        ],
        'description': r"""### Stratégie de Filtrage : Choix entre GET et POST
- **GET** : Paramètres véhiculés dans l'URL, adapté aux filtres légers et au bookmarking, mais limité en longueur.
- **POST** : Recommandé pour des filtres riches, modulaires et extensibles sans encombrer la barre d'adresse.

### Code Réel : DTO de Recherche (`src/Dto/GroupeSearchDto.php`)
Le critère de recherche n'est pas lié à une entité de base de données, mais à un objet simple de transfert :

```php
<?php

namespace App\Dto;

final class GroupeSearchDto
{
    public function __construct(
        public ?string $query = null,
    ) {}
}
```

### Code Réel : FormType Symfony (`src/Form/GroupeSearchType.php`)
Création du type de formulaire rattaché au DTO, avec désactivation de la protection CSRF pour un formulaire de filtrage pur :

```php
<?php

namespace App\Form;

use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\OptionsResolver\OptionsResolver;
use App\Dto\GroupeSearchDto;
use Symfony\Component\Form\Extension\Core\Type\SubmitType;
use Symfony\Component\Form\Extension\Core\Type\SearchType;

class GroupeSearchType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder
            ->add('query', SearchType::class, [
                'required' => false,
                'label'  => false,
                'attr' => [
                    'placeholder' => 'Nom ou ville',
                ],
            ])
            ->add('submit', SubmitType::class, [
                'label' => 'Filtrer',
                'attr' => [
                    'class' => 'bouton',
                ],
            ])
        ;
    }

    public function configureOptions(OptionsResolver $resolver): void
    {
        $resolver->setDefaults([
            'data_class' => GroupeSearchDto::class,
            'method' => 'POST',
            'csrf_protection' => false,
        ]);
    }
}
```

### Code Réel : Traitement dans le Contrôleur (`src/Controller/GroupementController.php`)
Utilisation de `handleRequest($request)` pour alimenter automatiquement le DTO avec les données soumises :

```php
<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use App\Service\GroupementExerciceService;
use App\Dto\GroupeSearchDto;
use App\Form\GroupeSearchType;

final class GroupementController extends AbstractController
{
    public function __construct(private readonly GroupementExerciceService $groupementExerciceService) {
    }
    
    #[Route('/groupement', name: 'app_groupement')]
    public function index(Request $request): Response
    {
        $searchDto = new GroupeSearchDto();
        $form = $this->createForm(GroupeSearchType::class, $searchDto);
        $form->handleRequest($request);

        $groupements = $this->groupementExerciceService->findAllGroupementsAndExercicesEncours($searchDto);
        
        return $this->render('groupement/index.html.twig', [
            'controller_name' => 'GroupementController',
            'dataGroupements' => $groupements,
            'formSearchGroupement' => $form->createView(),
        ]);
    }
}
```

### Code Réel : Route avec Contraintes Regex (`src/Controller/ExerciceController.php`)
Contraintes d'expression régulière (`requirements`) pour sécuriser les URLs dès la couche de routage Symfony :

```php
<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use App\Service\GroupementExerciceService;

final class ExerciceController extends AbstractController
{
    public function __construct(private readonly GroupementExerciceService $groupementExerciceService) {
    }
    
    // requirements: \d+ exige que l'ID soit un entier strictement numérique (0-9)
    #[Route('{idGroupement}/exercice', name: 'app_exercice', requirements: ['idGroupement' => '\d+'])]
    public function index(int $idGroupement): Response
    {
        $groupementExerciceListDto = $this->groupementExerciceService->findOneGroupementWithExercices($idGroupement);
        
        if ($groupementExerciceListDto === null) {
            return $this->redirectToRoute('app_groupement');
        }
        
        if (count($groupementExerciceListDto->exercices) === 0) {
            return $this->redirectToRoute('app_nouveau_exercice');
        }

        return $this->render('exercice/index.html.twig', [
            'controller_name' => 'ExerciceController',
            'groupementExerciceListDto' => $groupementExerciceListDto,
        ]);
    }
}
```

### Code Réel : Gabarits Twig et Héritage
**Template de base (`templates/base.html.twig`) :**
```twig
<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8">
        <title>{% block title %}Welcome!{% endblock %}</title>
        {% block stylesheets %}
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap" rel="stylesheet">
        {% endblock %}
    </head>
    <body>
        {% block menu %}
            <header class="entete" id="liste">
                <div class="entete__barre">
                    <a class="marque" href="#liste">Avec les femmes</a>
                    <nav aria-label="Navigation principale">
                        <ul class="nav">
                            <li><a href="{{ url('app_groupement') }}" aria-current="page">Groupements</a></li>
                        </ul>
                    </nav>
                </div>
            </header>
        {% endblock %}
        {% block body %}{% endblock %}
    </body>
</html>
```

**Vue Spécifique (`templates/groupement/index.html.twig`) :**
```twig
{% extends 'base.html.twig' %}
{% block title %}Groupements{% endblock %}

{% block menu %}
  {{ parent() }}
{% endblock %}

{% block body %}
    <main class="contenu">
      <div class="tete-page">
        <div> 
          <h1>Groupements</h1>
          <p class="sous-titre">3 groupements suivis</p>
        </div>
        <a class="bouton" href="#">Nouveau groupement</a>
      </div>
 
      <section class="panneau" aria-labelledby="titre-liste">
        <h2 id="titre-liste" class="visuellement-cache">Liste des groupements</h2>
 
        {# Rendu du formulaire Symfony #}
        {{ form_start(formSearchGroupement, {'attr': {'class': 'recherche form-search-inline', 'role': 'search'}}) }}
            {{ form_row(formSearchGroupement.query, {'attr': {'class': 'form-control'}}) }}
            {{ form_row(formSearchGroupement.submit) }}
        {{ form_end(formSearchGroupement) }}
 
        <div class="defilement">
          <table>
            <thead>
              <tr>
                <th scope="col">Groupement</th>
                <th scope="col">Téléphone</th>
                <th scope="col">Exercice en cours</th>
                <th scope="col" class="nombre">Exercices</th>
              </tr>
            </thead>
            <tbody>
              {% for groupement in dataGroupements %}
                <tr>
                  <td>
                    <a class="nom-groupement" href="{{ path('app_exercice', {'idGroupement': groupement.id}) }}">
                      {{ groupement.nom }}
                    </a>
                    <span class="discret">{{ groupement.adresse }}</span>
                  </td>
                  <td>{{ groupement.tel }}</td>
                  <td>
                    <span class="statut statut--en_cours">{{ groupement.exerciceEncoursDto.statut }}</span>
                    <span class="discret">depuis le {{ groupement.exerciceEncoursDto.dateDebut|format_date('long') }}</span>
                  </td>
                  <td class="nombre">3</td>
                </tr>
              {% endfor %}
            </tbody>
          </table>
        </div>
      </section>
    </main>
{% endblock %}
```
""",
    },
]


class Command(BaseCommand):
    """Seed the full Symfony course tree with the 5 Notion class sessions."""

    help = 'Seed the Symfony course and its 5 sessions from Notion notes.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--email',
            type=str,
            default=None,
            help='Publisher email to stamp as actor (defaults to first Publisher).',
        )
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Delete any existing course named "Symfony" before seeding.',
        )
        parser.add_argument(
            '--unpublish',
            action='store_true',
            help='Leave created lessons as draft (default: published).',
        )

    def handle(self, *args, **options):
        email = options['email']
        reset = options['reset']
        publish = not options['unpublish']

        actor = self._resolve_actor(email)
        self.stdout.write(f'Using publisher actor: {actor.email}')

        with transaction.atomic():
            course = self._resolve_or_create_course(actor, reset=reset)
            total_lessons, total_resources = self._seed_sessions(
                actor, course, publish=publish
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully seeded course "{course.name}" with {total_lessons} lessons and {total_resources} resources.'
            )
        )

    def _resolve_actor(self, email: str | None) -> User:
        if email:
            try:
                user = User.objects.get(email=email)
                if not user.is_publisher:
                    raise CommandError(f'User {email} is not a publisher.')
                return user
            except User.DoesNotExist:
                raise CommandError(f'User {email} does not exist.')

        publisher = User.objects.filter(is_publisher=True).order_by('created_at').first()
        if not publisher:
            raise CommandError(
                'No publisher user found in database. Create one or pass --email.'
            )
        return publisher

    def _resolve_or_create_course(self, actor: User, reset: bool = False) -> Course:
        course_name = 'Symfony'
        existing = Course.objects.filter(name=course_name, is_deleted=False).first()

        if existing and reset:
            self.stdout.write(f'Reset flag specified. Deleting existing course: {course_name}')
            Course.objects.filter(name=course_name).delete()
            existing = None

        if existing:
            self.stdout.write(f'Reusing existing Course: {course_name}')
            return existing

        course = mutate(
            actor=actor,
            model=Course,
            data={
                'name': course_name,
                'subject': 'Génie Logiciel',
                'position': 1,
            },
        )
        self.stdout.write(f'Created Course: {course.name} ({course.subject})')
        return course

    def _seed_sessions(
        self, actor: User, course: Course, publish: bool = True
    ) -> tuple[int, int]:
        total_lessons = 0
        total_resources = 0

        # Cache existing modules/chapters under this course
        modules_cache: dict[str, Module] = {
            m.name: m for m in course.modules.filter(is_deleted=False)
        }

        for session in SESSIONS_DATA:
            module_name = session['module_name']
            module_pos = session['module_pos']
            chapter_name = session['chapter_name']
            chapter_pos = session['chapter_pos']

            # Resolve module
            module = modules_cache.get(module_name)
            if not module:
                module = mutate(
                    actor=actor,
                    model=Module,
                    data={
                        'course': course,
                        'name': module_name,
                        'position': module_pos,
                    },
                )
                modules_cache[module_name] = module
                self.stdout.write(f'  + Module: {module_name}')

            # Resolve chapter
            chapter = module.chapters.filter(name=chapter_name, is_deleted=False).first()
            if not chapter:
                chapter = mutate(
                    actor=actor,
                    model=Chapter,
                    data={
                        'module': module,
                        'name': chapter_name,
                        'position': chapter_pos,
                    },
                )
                self.stdout.write(f'    + Chapter: {chapter_name}')

            # Resolve or create lesson
            lesson_title = session['title']
            existing_lesson = chapter.lessons.filter(title=lesson_title, is_deleted=False).first()
            if existing_lesson:
                self.stdout.write(f'      * Reusing Lesson: {lesson_title}')
                continue

            lesson = mutate(
                actor=actor,
                model=Lesson,
                data={
                    'chapter': chapter,
                    'title': lesson_title,
                    'teacher': session['teacher'],
                    'course_date': session['course_date'],
                    'position': session['position'],
                    'description': session['description'],
                    'keywords': session['keywords'],
                    'is_published': publish,
                },
            )
            total_lessons += 1
            self.stdout.write(f'      * Lesson: {lesson.title}')

            # Seed resources
            for res_data in session.get('resources', []):
                Resource.objects.create(
                    lesson=lesson,
                    type=res_data['type'],
                    title=res_data['title'],
                    url=res_data.get('url', ''),
                    note=res_data.get('note', ''),
                    last_modified_by=actor,
                )
                total_resources += 1

        return total_lessons, total_resources
