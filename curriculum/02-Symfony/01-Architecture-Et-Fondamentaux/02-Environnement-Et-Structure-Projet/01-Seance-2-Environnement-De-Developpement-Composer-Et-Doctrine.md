---
title: 'Séance 2 : Philosophie d''Apprentissage, Composer et Structure d''un Projet
  Symfony'
teacher: Baila Wane
course_date: '2026-10-22'
description: Rôle des LLMs dans la posture de l'ingénieur, analogies d'entreprise
  d'un framework, arborescence interne de Symfony, gestion des dépendances via Composer
  et modélisation initiale du projet « Avec Les Femmes ».
keywords: Composer, Packagist, vendor, composer.lock, Doctrine, Migrations, Entités,
  Repositories, avecLesFemmes, LLM, Tuteur, ModeCotisation, Campagne, Membre
is_published: true
resources:
- type: external_link
  title: Support de cours Notion - Séance 2 (22-10-2026)
  url: https://buttercup-option-ef4.notion.site/Symfony-3ed4a8cf9efb80deb686f05804a1c219
  note: Prise de notes et synthèse originale du cours par Baila Wane.
- type: external_link
  title: Dépôt GitHub du projet « Avec Les Femmes »
  url: https://github.com/DianaFerradini/avecLesFemmes-Symfony.git
  note: Code source du projet d'application fil rouge.
- type: external_link
  title: Documentation officielle Symfony - The Directory Structure
  url: https://symfony.com/doc/current/setup/homestead.html#directory-structure
  note: Spécification officielle des répertoires d'une application Symfony.
---

# 1. Philosophie d'Apprentissage et Rôle des LLMs

Dans le cadre de cette formation, l'usage des Modèles de Langage (LLMs : Claude, Gemini, etc.) est encouragé selon un protocole strict : **l'IA comme tuteur d'ingénierie guidé**, et non comme distributeur passif de code copié-collé.

### 1.1 Le Protocole « Tuteur Senior »
Dès l'ouverture d'une session de travail avec un LLM :
- Nous créons une conversation dédiée intitulée *« Cours de Symfony »*.
- Nous assignons au modèle le persona d'un **professeur principal et architecte logiciel avec 10 ans d'expérience**.
- **La règle d'or** : Le LLM ne doit pas donner la solution immédiatement. L'étudiant conçoit son architecture, tape son code, le soumet à l'IA et demande une critique technique constructive (détection des failles, principes SOLID, respect des conventions).

### 1.2 L'Analogie de l'Omelette
> 🍳 **Citation de Baila Wane** :
> *« Aujourd'hui, la compréhension des concepts est infiniment plus importante que de savoir réaliser les concepts. Savoir expliquer précisément comment faire une omelette est devenu plus utile que savoir casser les œufs, car les LLMs peuvent cuisiner à notre place. Ce qui reste irremplaçable chez l'ingénieur, c'est la capacité à concevoir, dicter, arbitrer et vérifier ce que l'outil produit. »*

En cycle supérieur, l'ingénieur ne tape plus mécaniquement du code sans recul : il comprend l'architecture, anticipe la montée en charge, identifie les anomalies de conception et pilote des agents d'implémentation.

---

# 2. Le Rôle d'un Framework en Entreprise

Un framework n'est pas une simple boîte à outils techniques : c'est un **cadre organisationnel standardisé**. Deux analogies présentées en cours permettent d'en saisir la portée managériale :

1. **L'analogie de la crèche d'entreprise** :
   Une entreprise qui installe une crèche interne permet à une mère ingénieure d'amener son enfant, d'avoir des pauses sereines pour l'allaiter, et de reprendre immédiatement son travail sans logistique pesante. L'environnement libère l'esprit pour que la tâche principale soit réalisée dans les meilleures conditions.
2. **L'analogie du médecin d'entreprise** :
   Lorsqu'un collaborateur est souffrant, un médecin sur place pose un premier diagnostic, dispense les soins immédiats et permet la reprise de l'activité.

De la même manière, Symfony prend en charge l'ensemble de l'infrastructure répétitive (sécurisation des entrées HTTP, sanitisation des requêtes SQL, injection de dépendances, cryptage des mots de passe). Le développeur se consacre exclusivement aux cas d'usage métiers (*Use Cases*).

### Avantages Stratégiques pour l'Organisation
- **Standardisation de l'architecture** : N'importe quel développeur Symfony certifié peut reprendre une application en moins d'une semaine sans documentation ésotérique.
- **Recrutement ciblé** : La fiche de poste *« Développeur Symfony Senior »* correspond à des compétences normées et vérifiables sur le marché international.
- **Garantie anti-réécriture** : Contrairement aux projets développés *from-scratch* qui finissent à la poubelle lors du départ de leur créateur, un projet Symfony perdure sur une décennie.

---

# 3. Prérequis et Arborescence Interne de Symfony

### 3.1 Vérifications Préliminaires
Avant d'exécuter un projet, l'environnement doit valider :
```bash
php -v                      # PHP 8.2 ou supérieur (ex. PHP 8.3.9)
composer --version          # Vérifier la présence de Composer 2
symfony check:requirements  # Diagnostic automatisé des extensions PHP
```

### 3.2 Structure Détaillée des Répertoires
Voici l'organisation rigoureuse des dossiers générés au sein de notre projet `avecLesFemmes` :

```
avecLesFemmes/
├── bin/            # Scripts d'administration et console CLI (php bin/console)
├── config/         # Fichiers YAML de configuration des bundles, routes et services
├── public/         # UNIQUE dossier exposé au serveur web (index.php, CSS, images)
├── src/            # Cœur applicatif (Contrôleurs, Entités, Services, Repositories, DTOs)
├── templates/      # Vues rédigées en syntaxe Twig (.html.twig)
├── var/            # Fichiers d'exécution temporaires (var/log/ et var/cache/)
├── vendor/         # Dépendances tierces installées par Composer (JAMAIS versionné)
├── .env            # Modèle des variables d'environnement (versionné avec valeurs génériques)
└── composer.json   # Déclaration des dépendances et autoloading PSR-4
```

> ⚠️ **Le Répertoire `public/` et le principe du Front Controller** :
> Seul `public/` est accessible aux requêtes web extérieures. Le fichier `public/index.php` est le **Front Controller unique** par lequel transite 100% du trafic. Il initialise le Kernel, charge les variables d'environnement, et délègue le routage. Aucun fichier sensible de `src/` ou `config/` ne peut être divulgué par le serveur HTTP.

> ℹ️ **[Explication externe - Documentation officielle Symfony]**
> Le dossier `var/cache/` stocke le conteneur d'injection de dépendances compilé en code PHP pur ultra-rapide. En mode `dev`, Symfony vérifie la fraîcheur des fichiers et recompile à la volée. En mode `prod`, le cache est figé pour des performances optimales et doit être vidé manuellement lors de chaque déploiement via `php bin/console cache:clear`.

---

# 4. Gestion des Dépendances : Composer & Packagist

### 4.1 Fonctionnement de Packagist
Les paquets PHP open source sont centralisés sur [Packagist.org](https://packagist.org/) (équivalent du registre npm en Node.js ou Maven Central en Java). Dans l'écosystème Symfony, ces bibliothèques packagées prêtes à l'emploi sont appelées des **Bundles**.

### 4.2 Le Rôle Pivot de `composer.json` et `composer.lock`
Dans le dépôt réel `DianaFerradini/avecLesFemmes-Symfony`, voici l'extrait exact de notre fichier `composer.json` :

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
        "symfony/console": "7.4.*",
        "symfony/dotenv": "7.4.*",
        "symfony/flex": "^2.10",
        "symfony/form": "7.4.*",
        "symfony/framework-bundle": "7.4.*",
        "symfony/runtime": "7.4.*",
        "symfony/twig-bundle": "7.4.*",
        "symfony/validator": "7.4.*"
    },
    "require-dev": {
        "doctrine/doctrine-fixtures-bundle": "^4.3",
        "symfony/maker-bundle": "^1.65"
    },
    "autoload": {
        "psr-4": {
            "App\\": "src/"
        }
    }
}
```

- **`composer.json`** : Exprime les contraintes sémantiques souples (ex. `^2.19` autorise les montées de versions mineures sans rupture d'API).
- **`composer.lock`** : Verrouille l'empreinte cryptographique et le commit précis de chaque dépendance installée le jour de la création.
- **Pourquoi le verrouillage est vital ?** Si un projet est réinstallé dans 5 ans, un simple `composer install` lira `composer.lock` et installera exactement les versions certifiées fonctionnelles, préservant l'application contre les régressions d'une bibliothèque tierce.

---

# 5. Modélisation Initiale du Projet « Avec Les Femmes »

Lors de cette séance, le projet a été amorcé avec les premières entités de base définissant la structure d'épargne (commit `d014003`) :
- `TypeCampagne` : Catégorie d'activité financière (Calebasse simple, Tontine d'investissement, Prêt d'urgence).
- `Campagne` : Session financière programmée avec une date de début, une date de fin optionnelle et un montant unitaire de souscription.
- `Membre` : Utilisatrice inscrite au sein du réseau.
- `ModeCotisation` : Table d'association qualifiant le rythme et les montants souscrits par membre.

### 5.1 Code Réel : Entité `Campagne` (`src/Entity/Campagne.php`)
Examinons le code source réel implémenté dans notre dépôt :

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

    #[ORM\Column]
    private ?\DateTimeImmutable $createAt = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTime $updateAt = null;

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

    // Getters et Setters générés...
}
```

> ⚠️ **Constat d'Architecture & Problématique Identifiée** :
> Remarquez que dans cette première ébauche, les champs `$createAt` et `$updateAt` ont été déclarés manuellement dans `Campagne.php`, puis dupliqués à l'identique dans `Membre.php` et `TypeCampagne.php`.
> Copier-coller des attributs et leurs accesseurs viole directement le principe DRY (*Don't Repeat Yourself*). Lors de la séance 3, nous résoudrons élégamment ce problème grâce aux **Traits PHP**.

---

# 6. Synthèse des Acquis

1. L'ingénieur contemporain adopte une posture d'arbitre et de concepteur, utilisant les LLMs pour critiquer et challenger son code.
2. Le fichier `composer.lock` garantit la reproductibilité absolue de l'environnement applicatif dans le temps.
3. Seul `public/` est exposé au web ; `vendor/` et `.env.local` ne franchissent jamais les portes du gestionnaire de versions Git.
4. Les premières entités Doctrine sont en place et prêtes pour la modélisation avancée du rôle Sous-Administrateur.
