---
title: Architecture en Couches et Contrats d'Interface Repository
description: Structurer une application d'entreprise selon l'architecture N-Tiers,
  définir des contrats d'interface stricts et implémenter le patron Repository pour
  découpler la logique métier de la persistance.
teacher: Baila Wane
reading_time: 25
order: 1
tags:
- Architecture
- NTiers
- Interfaces
- Repository
- Decouplage
resources:
- title: Séance 2 - Architecture Métier, Console et Streams Java
  file: attachments/Copie de Seance_2_Java_Console_Streams_Architecture_Metier.docx
  description: Support de cours et travaux dirigés du Professeur Baila Wane portant
    sur la séparation en couches et les flux de données.
  type: document
---

# Architecture en Couches et Contrats d'Interface Repository

## 1. Introduction & Contexte Métier

Dans une application logicielle mal conçue, on observe fréquemment ce que l'industrie qualifie de *"Code Spaghetti"* : une classe de vue console ou contrôleur Web qui exécute directement des requêtes SQL, instancie des entités en dur, effectue des calculs de remise financière et affiche les résultats à l'écran. Une telle conception monolithique est impossible à tester de manière isolée, impossible à maintenir, et vouée à la réécriture complète dès que l'on souhaite remplacer le terminal console par une interface Web ou migrer d'une base de données mémoire vers PostgreSQL.

Pour éviter ce désastre, le standard absolu de l'ingénierie logicielle repose sur l'**Architecture en Couches (N-Tier Architecture)**. Chaque couche possède une mission unique, bien délimitée, et communique avec la couche inférieure uniquement à travers des **contrats d'interfaces**.

Comme le souligne le Professeur **Baila Wane** :
> *"Une interface en Java n'est pas une simple liste de méthodes : c'est un contrat juridique ! La couche Métier (Service) passe contrat avec la couche Persistance (Repository) : 'Donne-moi un étudiant par son matricule, peu m'importe que tu ailles le chercher dans une liste en mémoire vive, dans un fichier JSON, ou dans une base Oracle sur un cluster distant !' Si vous brisez ce contrat en liant vos services à des classes concrètes, vous perdez toute agilité architecturale."*

---

## 2. Architecture & Fondations Conceptuelles

### 2.1 Le Modèle N-Tiers de notre application `com.ism`

Le flux de traitement respecte un sens de dépendance descendant strict :

```mermaid
flowchart TD
    subgraph Presentation ["1. Couche Présentation (com.ism / Main)"]
        UI["Main Console / Menu Interactif
- Lecture des entrées utilisateur (Scanner)
- Affichage des menus et tableaux
- Capture des exceptions d'affichage"]
    end

    subgraph ServiceLayer ["2. Couche Métier / Services (com.ism.service)"]
        ES["EtudiantService (Interface)
EtudiantServiceImpl (Implémentation)
- Règles de validation métier
- Unicité de matricule
- Orchestration"]
        MS["MoyenneService (Interface)
MoyenneServiceImpl (Implémentation)
- Calculs statistiques et moyennes pondérées"]
    end

    subgraph RepositoryLayer ["3. Couche Persistance / Repository (com.ism.repository)"]
        ER["EtudiantRepository (Interface Contrat)
- findById, findByMatricule, save, findAll"]
        NR["NoteRepository (Interface Contrat)
- findByEtudiant, save, findAll"]
        ERM["EtudiantRepositoryMemory (Implémentation concrète)"]
        NRM["NoteRepositoryMemory (Implémentation concrète)"]
    end

    subgraph DomainLayer ["4. Couche Domaine (com.ism.domain)"]
        DOM["Entités Pures :
AbstractEntity, Etudiant, Note"]
    end

    UI -->|Appelle| ES
    UI -->|Appelle| MS
    ES -->|Dépend du contrat| ER
    ES -->|Dépend du contrat| NR
    MS -->|Reçoit des collections de| DOM
    ERM -.->|implémente| ER
    NRM -.->|implémente| NR
    ERM -->|Manipule| DOM
    NRM -->|Manipule| DOM
```

### 2.2 Les Principes Cardinaux de l'Architecture en Couches

1. **Isolation des responsabilités** : La couche Présentation ne contient aucun calcul métier ni requête de données. La couche Service ne sait pas si l'appel provient d'un terminal texte, d'un contrôleur REST Spring Boot, ou d'une application mobile Android.
2. **Programmation par interface (*Program to an interface, not an implementation*)** : Les composants dépendent d'abstractions (`EtudiantRepository`), jamais de classes concrètes (`EtudiantRepositoryMemory`).
3. **Le Patron Repository (Éric Evans - Domain-Driven Design)** : Le Repository émule une collection d'objets en mémoire. Il isole totalement le domaine métier des détails techniques de stockage (SQL, NoSQL, In-Memory).

---

## 3. Implémentation Pratique & Code de Référence

### 3.1 Le Contrat Générique de Base `BaseRepository<T>`

Pour standardiser les opérations CRUD (*Create, Read, Update, Delete*) communes à toutes nos entités, nous concevons une interface générique paramétrée par le type d'entité `T` :

```java
package com.ism.repository;

import com.ism.domain.AbstractEntity;
import java.util.List;
import java.util.Optional;

/**
 * Contrat d'accès aux données générique pour les entités du domaine.
 *
 * @param <T> Type de l'entité dérivant de AbstractEntity
 */
public interface BaseRepository<T extends AbstractEntity> {

    T save(T entity);

    Optional<T> findById(Long id);

    List<T> findAll();

    boolean deleteById(Long id);
}
```

### 3.2 Le Contrat Réel du Dépôt : `EtudiantRepository`

Dans notre architecture métier `com.ism.repository`, l'interface d'accès aux données formalise les opérations directes :

```java
package com.ism.repository;

import java.util.List;
import java.util.Optional;
import com.ism.domain.Etudiant;

/**
 * Contrat de persistance pour l'entité Étudiant.
 * 
 * @author Baila Wane
 */
public interface EtudiantRepository {
    boolean insert(Etudiant nouveau);
    List<Etudiant> selectAll();
    Optional<Etudiant> selectByMatricule(String matricule);
}
```

> 📘 **Nomenclature des Méthodes : Style SQL vs Abstraction DDD / Spring Data**
> Débuter avec des verbes comme `insert()` et `selectAll()` permet d'établir une passerelle mentale directe et limpide avec les requêtes SQL relationnelles sous-jacentes. Dans des architectures plus abstraites (comme Spring Data JPA ou les principes du Domain-Driven Design), ces méthodes sont souvent généralisées sous les termes `save(entity)` et `findAll()` pour modéliser le repository comme une collection en mémoire.

L'interface spécifique hérite du contrat générique et ajoute les méthodes de recherche propres aux besoins métier de l'étudiant :

```java
package com.ism.repository;

import com.ism.domain.Etudiant;
import java.util.Optional;

/**
 * Contrat de persistance pour l'entité Etudiant.
 */
public interface EtudiantRepository extends BaseRepository<Etudiant> {

    /**
     * Recherche un étudiant par son matricule unique (ex: "ETU-2026-001").
     *
     * @param matricule Le matricule de l'étudiant
     * @return un Optional contenant l'étudiant s'il existe, Optional.empty() sinon
     */
    Optional<Etudiant> findByMatricule(String matricule);

    /**
     * Vérifie si un matricule est déjà attribué dans le système.
     */
    boolean existsByMatricule(String matricule);
}
```

### 3.3 L'Implémentation Mémoire `EtudiantRepositoryMemory`

Dans notre projet de référence `com.ism`, la première implémentation technique s'appuie sur une structure de stockage mémoire (`DatabaseMemory`) simulant la base de données :

```java
package com.ism.repository.memory;

import com.ism.domain.Etudiant;
import com.ism.repository.EtudiantRepository;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

/**
 * Implémentation en mémoire vive du Repository Étudiant.
 */
public class EtudiantRepositoryMemory implements EtudiantRepository {

    private final DatabaseMemory databaseMemory;
    private long sequenceId = 1L;

    public EtudiantRepositoryMemory(DatabaseMemory databaseMemory) {
        this.databaseMemory = databaseMemory;
    }

    @Override
    public Etudiant save(Etudiant entity) {
        if (entity == null) {
            throw new IllegalArgumentException("L'entité étudiant ne peut pas être nulle.");
        }

        if (entity.getId() == null) {
            // Création : auto-génération d'un ID séquentiel
            entity.setId(sequenceId++);
            entity.setCreatedAt(LocalDateTime.now());
            entity.setUpdatedAt(LocalDateTime.now());
            databaseMemory.getEtudiants().add(entity);
        } else {
            // Mise à jour de l'existant
            entity.setUpdatedAt(LocalDateTime.now());
            for (int i = 0; i < databaseMemory.getEtudiants().size(); i++) {
                if (databaseMemory.getEtudiants().get(i).getId().equals(entity.getId())) {
                    databaseMemory.getEtudiants().set(i, entity);
                    break;
                }
            }
        }
        return entity;
    }

    @Override
    public Optional<Etudiant> findById(Long id) {
        if (id == null) return Optional.empty();
        return databaseMemory.getEtudiants().stream()
                .filter(e -> id.equals(e.getId()))
                .findFirst();
    }

    @Override
    public Optional<Etudiant> findByMatricule(String matricule) {
        if (matricule == null || matricule.trim().isEmpty()) return Optional.empty();
        return databaseMemory.getEtudiants().stream()
                .filter(e -> matricule.equalsIgnoreCase(e.getMatricule()))
                .findFirst();
    }

    @Override
    public boolean existsByMatricule(String matricule) {
        return findByMatricule(matricule).isPresent();
    }

    @Override
    public List<Etudiant> findAll() {
        return Collections.unmodifiableList(new ArrayList<>(databaseMemory.getEtudiants()));
    }

    @Override
    public boolean deleteById(Long id) {
        return databaseMemory.getEtudiants().removeIf(e -> id.equals(e.getId()));
    }
}
```

---

## 4. Bonnes Pratiques, Pièges & Débogage

> ℹ️ **Pourquoi retourner `Optional<T>` au lieu de `null` ?**
> Retourner `null` lorsqu'un enregistrement n'est pas trouvé est la cause n°1 des désastreux `NullPointerException` (qualifié de "billion-dollar mistake" par son créateur Tony Hoare). En retournant `Optional<Etudiant>`, le contrat force explicitement l'appelant à gérer l'absence d'étudiant via `.isPresent()`, `.orElseThrow()` ou `.map()`.

> ⚠️ **L'erreur courante d'instanciation directe du Repository dans le Service :**
> Ne faites jamais dans votre service :
> ```java
> private EtudiantRepository repo = new EtudiantRepositoryMemory(...); // MAUVAISE PRATIQUE !
> ```
> Vous couplerez irrémédiablement le service à la classe mémoire. Si demain vous passez à `EtudiantRepositoryJdbc`, vous devrez réécrire le service. Passez toujours par une injection par constructeur :
> ```java
> public EtudiantServiceImpl(EtudiantRepository etudiantRepository) {
>     this.etudiantRepository = etudiantRepository;
> }
> ```

> 💡 **Le Repository gère la collection, pas la logique métier :**
> Un repository ne doit jamais valider si la moyenne d'un étudiant lui donne droit à une mention ou lever une alerte disciplinaire. Il se contente de stocker, rechercher et restituer des données.

---

## 5. Synthèse & Auto-Évaluation

### Matrice des Responsabilités par Couche

| Couche | Rôle | Entrées | Sorties | Classes d'exemple |
| :--- | :--- | :--- | :--- | :--- |
| **Présentation** | Interaction utilisateur, menus, affichage | Frappes clavier / Requêtes HTTP | Texte console / Réponse JSON | `Main`, `MenuConsole` |
| **Service** | Logique métier, validations, calculs | DTO / Données brutes | DTO / Objets de synthèse | `EtudiantServiceImpl`, `MoyenneServiceImpl` |
| **Repository** | Abstraction de persistance et accès aux données | Entités du Domaine | `Optional<T>`, `List<T>` | `EtudiantRepository`, `NoteRepositoryMemory` |
| **Domaine** | Modélisation des objets du métier réel | Attributs d'état | Objets métier immuables | `Etudiant`, `Note`, `AbstractEntity` |

### Questionnaire d'Auto-Évaluation (QCM)

1. **Dans une architecture en couches propre, de quoi la couche `Service` doit-elle dépendre pour accéder aux données ?**
   - A) Directement du pilote JDBC MySQL
   - B) De l'interface `EtudiantRepository`
   - C) De la classe console `Main`
   - D) D'un tableau statique global
   *Réponse attendue : B. Le service dépend de l'interface abstraite du Repository.*

2. **Quel conteneur Java moderne permet d'exprimer explicitement qu'une recherche en base peut ne renvoyer aucun résultat, évitant ainsi les NullPointerExceptions ?**
   - A) `java.lang.NullObject`
   - B) `java.util.Optional<T>`
   - C) `java.util.Vector<T>`
   - D) `java.lang.Exception`
   *Réponse attendue : B.*

3. **Quelle méthode de `EtudiantRepository` renvoie un booléen indiquant si un étudiant possède déjà un matricule donné ?**
   - A) `save()`
   - B) `existsByMatricule(String matricule)`
   - C) `deleteById(Long id)`
   - D) `findAll()`
   *Réponse attendue : B.*

### Exercice Pratique & DevLog

```markdown
[DevLog - Entrée 05]
- Sujet : Implémentation du pattern Repository en mémoire
- Action : Créez l'interface générique `BaseRepository<T>` et l'interface `NoteRepository`.
- Défi : Implémentez la classe `NoteRepositoryMemory` en utilisant une `List<Note>` interne. Écrivez une méthode `List<Note> findByEtudiantMatricule(String matricule)` qui filtre et renvoie toutes les notes d'un étudiant donné. Testez son bon fonctionnement en ajoutant 3 notes pour un même étudiant.
```
