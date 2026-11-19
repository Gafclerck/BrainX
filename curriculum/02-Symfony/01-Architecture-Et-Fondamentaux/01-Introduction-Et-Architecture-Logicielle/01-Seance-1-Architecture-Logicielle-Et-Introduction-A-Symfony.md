---
title: 'Séance 1 : Architecture Logicielle et Introduction à Symfony'
teacher: Baila Wane
course_date: '2026-10-01'
description: Panorama complet des architectures logicielles (monolithe, microservices,
  agentique), pertinence d’un framework d’entreprise et premiers pas avec Symfony
  7.
keywords: Architecture, Monolithe, Microservices, Agentique, MVC, Symfony, Doctrine,
  Twig, Maker Bundle, CLI, PostgreSQL, DTO, Composer, PSR-4
is_published: true
resources:
- type: external_link
  title: Support de cours Notion - Séance 1 (01-10-2026)
  url: https://buttercup-option-ef4.notion.site/Symfony-3ed4a8cf9efb80deb686f05804a1c219
  note: Prise de notes et synthèse originale du cours par Baila Wane.
- type: external_link
  title: Dépôt GitHub du projet « Avec Les Femmes »
  url: https://github.com/DianaFerradini/avecLesFemmes-Symfony.git
  note: Code source du projet d'application fil rouge.
- type: external_link
  title: Documentation officielle Symfony - Installation & Setup
  url: https://symfony.com/doc/current/setup.html
  note: Guide d'installation officiel de Symfony CLI et de Composer.
---

# 1. Fil Conducteur : L'Application « Avec Les Femmes »

Tout au long de ce module, notre apprentissage ne reposera pas sur des exercices théoriques déconnectés, mais sur un projet réel d'entreprise déployé en production : **« Avec Les Femmes »**.

Cette application web et mobile accompagne les groupements féminins communautaires en Afrique de l'Ouest dans la gestion autonome de leurs fonds financiers :
- **Les Calebasses d'épargne** : versements périodiques des membres avec suivi des présences et des pénalités.
- **Les Tontines & Activités génératrices de revenus**.
- **Les Prêts solidaires** : octroi de crédits avec dates limites de remboursement et taux d'intérêt communautaire.
- **Les Exercices financiers** : périodes comptables délimitées (par exemple, de la veille de la Tabaski à deux semaines avant la Tabaski suivante), à l'issue desquelles les bénéfices et intérêts sont rétribués.

Nous nous concentrons dans ce cours sur le rôle du **Sous-Administrateur**, garant de la conformité, du suivi des groupements et du bon déroulement des exercices.

---

# 2. Panorama des Architectures Logicielles et Déploiement

Avant d'écrire la moindre ligne de code PHP, tout ingénieur logiciel doit comprendre l'environnement d'exécution et le mode d'assemblage de son système.

### 2.1 Les 5 Grands Modèles d'Architecture
1. **L'Artefact** : L'unité atomique déployée sur un serveur (ex. un script PHP, un fichier JAR compilé en Java, ou un bundle de scripts JS).
2. **L'Architecture Monolithique** :
   - Un seul artefact regroupant l'ensemble des couches (interface utilisateur, logique métier, requêtes base de données).
   - **Limites majeures** : Si l'application dispose d'un site web, d'une application mobile Android et d'un guichet desktop, le code métier doit être réécrit ou dupliqué pour chaque canal. Toute modification fonctionnelle oblige à redéployer l'intégralité du système.
   - *Usage réel* : Idéal en première année d'études pour appréhender les bases, mais inadapté aux projets industriels évolutifs (MVP, pivots fréquents).
3. **Le Monolithe Distribué** :
   - Deux artefacts étanches : un **Back-End API** (ex. Symfony / PostgreSQL) et un **Front-End SPA / Mobile** (ex. React, Vue, Swift).
   - Le Back-end expose des ressources via une API REST sécurisée (JSON), sans générer d'interface HTML.
4. **Les Microservices** :
   - Le domaine métier est découpé en services totalement autonomes et indépendants (ex. service d'authentification, service de transfert d'argent, service de notification SMS).
   - Chaque microservice possède sa propre base de données et ses propres ressources serveur.
   - Modèle adopté par les géants de l'industrie : Wave, Orange Money, Netflix, Meta.
5. **L'Architecture Agentique (Tendance Émergente)** :
   - L'application n'est plus enchaînée à un workflow séquentiel rigide codé en dur (*if/else* à l'infini).
   - Le système intègre des modèles d'IA capables de comprendre un contexte en langage naturel, d'arbitrer et d'orchestrer dynamiquement un catalogue d'outils logiciels (*tools* / fonctions) selon des règles prédéfinies.

### 2.2 Scalabilité et Résolution des Goulots d'Étranglement
- **Scalabilité Verticale** : Augmenter la puissance d'une seule machine hôte (CPU, RAM, disques NVMe). Solution limitée par les contraintes physiques du matériel et extrêmement coûteuse.
- **Scalabilité Horizontale** : Multiplier les instances légères d'un même service sur plusieurs machines en grappe (*cluster*).
- **Le Load Balancer (Répartiteur de charge)** : Dispositif réseau situé en amont des instances qui distribue équitablement les requêtes HTTP entrantes vers les serveurs disponibles et en bonne santé (*health check*).

> 💡 **Cas d'école évoqué en séance (Exemple ISM)** :
> Lors des pics d'affluence, le service de pointage des présences sature le processeur du serveur monolithique. Conséquence dramatique : le service de paiement des frais de scolarité devient inaccessible !
> **Solution architecturale** : Isoler le pointage et le paiement en deux services indépendants. En cas de pic sur le pointage, le service est automatiquement répliqué horizontalement derrière un Load Balancer sans jamais ralentir la caisse.

---

# 3. Pourquoi Choisir un Framework ? Symfony vs Laravel

### 3.1 Le Danger du Développement « From-Scratch »
Développer une application d'entreprise sans cadre (*from-scratch*) conduit inévitablement au chaos :
- Absence totale de conventions de nommage et d'architecture.
- Dette technique exponentielle.
- Reprise de code impossible lors du départ d'un collaborateur (le projet doit souvent être réécrit de zéro).

### 3.2 La Valeur Ajoutée d'un Framework
Un framework est un **cadre de travail normé**. Il prend en charge l'infrastructure récurrente (sécurité, parsing HTTP, injection de dépendances, ORM, routage) pour permettre à l'ingénieur de se consacrer à 100% à la valeur métier.

### 3.3 Symfony vs Laravel
- **Laravel** : Privilégie la flexibilité, la rapidité de prototypage et une syntaxe permissive. Il permet de coder sans maîtriser en profondeur les concepts objet avancés.
- **Symfony** : Impose une rigueur absolue, le respect des **principes SOLID**, les design patterns de référence et un couplage faible.
- **Transférabilité** : La maîtrise de Symfony offre une passerelle directe vers **Spring Boot (Java)** ou **NestJS (TypeScript)**, car les structures de pensée et d'injection de dépendances y sont identiques.

> ℹ️ **[Explication externe - Documentation officielle Symfony]**
> Symfony est à la fois un framework full-stack et un ensemble de composants découplés et réutilisables (*Symfony Components*). Plus de 80% des frameworks et CMS PHP majeurs (dont Laravel, Drupal, PrestaShop et Magento) intègrent des composants Symfony natifs (`HttpFoundation`, `Console`, `EventDispatcher`).

---

# 4. Le Cycle de Vie d'une Requête MVC dans Symfony

L'architecture MVC (Modèle - Vue - Contrôleur) traditionnelle est enrichie dans nos applications d'entreprise par l'introduction de **DTOs (Data Transfer Objects)** et d'une **couche Service**.

```
[Navigateur / Client HTTP]
         │ (Requête HTTP GET / POST)
         ▼
     [Routeur] ──► Identifie l'action ciblée
         │
         ▼
   [Contrôleur] ──► Reçoit la requête, instancie ou lie un DTO
         │
         ▼
     [Service] ──► Orchestre la logique métier et les règles de gestion
         │
         ▼
   [Repository] ──► Construit les requêtes optimisées
         │
         ▼
  [Doctrine ORM] ──► Traduit en SQL (PostgreSQL / MySQL) via PDO
         │
         ▼
   [Base de Données]
```

### Règle d'or du Contrôleur
Le contrôleur est un simple chef d'orchestre :
- Il reçoit la requête HTTP.
- Il délègue l'exécution aux services appropriés.
- Il transmet les DTOs résultants à la vue Twig ou renvoie une réponse JSON.
- **Aucune logique métier, aucun calcul et aucune requête SQL ne doivent figurer dans un contrôleur.**

---

# 5. Les Composants Majeurs de l'Écosystème Symfony

1. **Maker Bundle (`symfony/maker-bundle`)** : Générateur de code en ligne de commande (`make:controller`, `make:entity`, `make:form`).
2. **Doctrine ORM** : Mapping objet-relationnel. Il traduit les entités PHP en tables SQL et gère les migrations de schéma incrémentales.
3. **DoctrineFixturesBundle** : Génération de jeux d'essais réalistes en base de données pour le développement et les tests automatisés.
4. **Twig** : Moteur de templates rapide, sécurisé (échappement automatique des failles XSS) et doté d'un système d'héritage modulaire.
5. **Messenger & Queues** : Gestion des tâches asynchrones en arrière-plan (ex. envoi de SMS ou d'emails sans bloquer l'utilisateur).
6. **Validator** : Moteur de validation déclarative par attributs PHP (`#[Assert\NotBlank]`, `#[Assert\Positive]`).

---

# 6. Mise en Pratique : Installation et Premiers Pas

### 6.1 Prérequis Techniques
- PHP 8.2 ou supérieur (avec extensions `pdo_pgsql` ou `pdo_mysql`, `intl`, `mbstring`, `zip`).
- Composer 2.x (gestionnaire de paquets).
- Symfony CLI (outil de diagnostic et serveur local).

Vérification de l'environnement :
```bash
php -v
composer --version
symfony check:requirements
```

### 6.2 Création du Projet
Dans notre formation, le projet fil rouge est initialisé avec la version LTS :
```bash
symfony new avecLesFemmes --version=lts --webapp
cd avecLesFemmes
```

### 6.3 Configuration de la Base de Données (.env.local)
Ne jamais modifier les identifiants sensibles dans `.env` (qui est versionné sous Git). Créez une copie locale `.env.local` :
```ini
# .env.local (non versionné)
DATABASE_URL="postgresql://postgres:root@127.0.0.1:5432/avecLesFemmes?serverVersion=16&charset=utf8"
```

### 6.4 Commandes Quotidiennes du Développeur Symfony
```bash
# 1. Création physique de la base de données
php bin/console doctrine:database:create

# 2. Création interactive d'une entité et de son repository
php bin/console make:entity

# 3. Génération du différentiel de migration SQL
php bin/console doctrine:migrations:diff

# 4. Application de la migration en base
php bin/console doctrine:migrations:migrate

# 5. Démarrage du serveur local avec monitoring HTTPS
symfony server:start
```

---

# 7. Synthèse et Perspectives pour la Séance 2

Lors de cette séance inaugurale, nous avons posé les fondations indispensables :
- Compréhension des topologies réseau et de la scalabilité horizontale.
- Rôle structurant de Symfony face aux dérives du code non normé.
- Découpage strict des responsabilités dans le cycle MVC.

Dans la séance suivante, nous approfondirons **la structure interne des répertoires de Symfony**, le fonctionnement interne de **Composer et Packagist**, ainsi que notre **philosophie d'apprentissage augmentée par l'IA**.
