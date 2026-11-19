---
title: Classes, Objets, États, Comportements et Polymorphisme
description: 'Maîtriser les piliers de l''orienté objet en Java : encapsulation stricte,
  cycle de vie des objets dans le Heap, classe abstraite AbstractEntity et polymorphisme
  dynamique.'
teacher: Baila Wane
reading_time: 25
order: 1
tags:
- Java
- POO
- Encapsulation
- Polymorphisme
- AbstractEntity
- Lombok
resources:
- title: Formation Java - Modélisation Objet et Concepts Avancés
  file: attachments/formation-java-partie-2.pdf
  description: Support de cours du Professeur Baila Wane détaillant les mécanismes
    de la programmation orientée objet en Java.
  type: document
---

# Classes, Objets, États, Comportements et Polymorphisme

## 1. Introduction & Contexte Métier

Dans le développement d'applications de gestion d'entreprise, la modélisation du domaine métier constitue le cœur battant du système. Si vos entités sont mal conçues, perméables aux états incohérents ou dépourvues de contrats clairs, l'ensemble de l'architecture logicielle s'effondrera au moindre changement de spécification.

Prenez le cas de notre système académique **`com.ism`**. Un étudiant n'est pas une simple collection de chaînes de caractères éparpillées dans des variables locales. C'est une entité dotée d'une **identité pérenne** (un identifiant unique et un matricule), d'un **état interne** (nom, prénom, adresse e-mail, téléphone) et de **règles d'intégrité strictes** (une note doit être comprise entre 0 et 20, un étudiant ne peut pas posséder un matricule vide).

Comme l'enseigne le Professeur **Baila Wane** :
> *"Un objet, c'est l'union sacrée d'un état (ses attributs privés) et d'un comportement (ses méthodes publiques). L'encapsulation n'est pas une option esthétique : c'est le blindage qui empêche le monde extérieur de corrompre la mémoire et la logique de vos entités !"*

Dans ce chapitre, nous allons poser les fondations de notre domaine métier en explorant l'encapsulation, la classe de base réutilisable `AbstractEntity`, le contrat fondamental `equals` & `hashCode`, et la puissance du polymorphisme dynamique.

---

## 2. Architecture & Fondations Conceptuelles

### 2.1 Les Piliers de l'Objet : État, Comportement et Identité

Tout objet Java se caractérise par trois éléments fondamentaux :
1. **L'Identité** : L'adresse mémoire unique de l'objet dans le Heap (comparée par `==`), ou son identifiant métier unique (comparé par `equals()`).
2. **L'État** : Les valeurs instantanées portées par ses champs d'instance (`fields`). Deux étudiants distincts peuvent avoir le même nom, mais des états et identités différents.
3. **Le Comportement** : L'ensemble des méthodes applicables à l'objet, définissant ce qu'il peut faire ou subir.

```mermaid
classDiagram
    class AbstractEntity {
        <<abstract>>
        #Long id
        #LocalDateTime createdAt
        #LocalDateTime updatedAt
        +getId() Long
        +setId(Long id) void
    }

    class Etudiant {
        -String matricule
        -String nom
        -String prenom
        -String email
        -String telephone
        +toString() String
        +equals(Object obj) boolean
        +hashCode() int
    }

    class Note {
        -Double valeur
        -Double coefficient
        -String matiere
        -Etudiant etudiant
        +toString() String
    }

    AbstractEntity <|-- Etudiant : hérite de
    AbstractEntity <|-- Note : hérite de
    Note --> Etudiant : fait référence à
```

### 2.2 L'Encapsulation et la protection des invariants

L'encapsulation consiste à interdire tout accès direct aux attributs d'une classe depuis l'extérieur. Les champs sont déclarés `private` (ou `protected` pour l'héritage maîtrisé), et l'accès se fait exclusivement via :
- Des **accesseurs (Getters)** : permettent la lecture contrôlée de l'état.
- Des **mutateurs (Setters)** : permettent la modification en validant les invariants métier avant d'affecter la variable.

Pour éliminer le code répétitif (*boilerplate*) sans sacrifier l'encapsulation, nous utilisons la bibliothèque officielle **Project Lombok** (`@Getter`, `@Setter`, `@Builder`, `@ToString`).

### 2.3 Le contrat `equals()` et `hashCode()`

En Java, l'opérateur `==` compare strictement les adresses mémoires (références de pointeurs dans la Stack). Ainsi, deux objets `Etudiant` distincts possédant pourtant exactement le même matricule et le même ID seront jugés différents par `==`.

Pour comparer l'égalité logique métier, nous devons redéfinir la méthode `equals(Object o)` issue de `java.lang.Object`.
> ⚠️ **Règle absolue du contrat Java :**
> Si deux objets sont égaux selon `equals()`, ils **DOIVENT** obligatoirement renvoyer le même `hashCode()`. Si vous oubliez cette règle, vos entités deviendront invisibles ou dupliquées lorsqu'elles seront stockées dans des collections de type `HashSet` ou `HashMap` !

---

## 3. Implémentation Pratique & Code de Référence

Examinons le code réel extrait de notre projet de référence `com.ism.domain`.

### 3.1 La classe générique abstraite `AbstractEntity`

Toute entité de notre système partage des métadonnées de cycle de vie. Plutôt que de dupliquer `id`, `createdAt` et `updatedAt` dans chaque entité, nous factorisons ce comportement dans une classe abstraite :

```java
package com.ism.domain;

import lombok.Getter;
import lombok.Setter;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * Classe mère abstraite fournissant l'identité et les dates d'audit
 * pour toutes les entités du domaine métier ISM.
 *
 * @author Baila Wane
 */
@Getter
@Setter
public abstract class AbstractEntity implements Serializable {

    protected Long id;
    protected LocalDateTime createdAt;
    protected LocalDateTime updatedAt;

    public AbstractEntity() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    public AbstractEntity(Long id) {
        this();
        this.id = id;
    }
}
```

### 3.2 L'entité métier `Etudiant`

Conformément au code de référence de notre dépôt GitHub `com.ism.domain.Etudiant`, l'étudiant est identifié par son matricule unique, son nom complet et sa classe académique :

```java
package com.ism.domain;

import lombok.*;

import java.util.Objects;

/**
 * Entité représentant un étudiant inscrit à l'ISM.
 * Entité représentant un étudiant au sein du système académique.
 *
 * @author Baila Wane
 */
@Getter
@Setter
@ToString(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Etudiant extends AbstractEntity {

    private String nomComplet;
    private String matricule;
    private String classe; // Ex: "L3 GLRS", "Master 1 ISI"

    // Constructeur complet avec ID hérité
    public Etudiant(int id, String nomComplet, String matricule, String classe) {
        this.id = id;
        this.nomComplet = nomComplet;
        this.matricule = matricule;
        this.classe = classe;
    }

    /**
     * Deux étudiants sont égaux si et seulement si leur matricule unique est identique.
     */
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Etudiant etudiant = (Etudiant) o;
        return Objects.equals(matricule, etudiant.matricule);
    }

    @Override
    public int hashCode() {
        return Objects.hash(matricule);
    }
}
```

> 💡 **Perspective d'Évolution en Entreprise :**
> Dans le cadre d'un système de production à grande échelle, cette entité de base peut être enrichie d'attributs complémentaires (`email`, `telephone`, `dateNaissance`) sans briser le contrat d'héritage ni la règle d'égalité basée sur le matricule.

L'entité `Etudiant` étend `AbstractEntity`, encapsule ses données et utilise Lombok pour générer un constructeur fluide (*Builder Pattern*) et des accesseurs rigoureux :

```java
package com.ism.domain;

import lombok.*;

import java.util.Objects;

/**
 * Entité représentant un étudiant inscrit à l'ISM.
 */
@Getter
@Setter
@ToString(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Etudiant extends AbstractEntity {

    private String matricule;
    private String nom;
    private String prenom;
    private String email;
    private String telephone;

    // Constructeur complet avec ID hérité
    public Etudiant(Long id, String matricule, String nom, String prenom, String email, String telephone) {
        super(id);
        this.matricule = matricule;
        this.nom = nom;
        this.prenom = prenom;
        this.email = email;
        this.telephone = telephone;
    }

    /**
     * Deux étudiants sont égaux si et seulement si leur matricule unique est identique.
     */
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Etudiant etudiant = (Etudiant) o;
        return Objects.equals(matricule, etudiant.matricule);
    }

    @Override
    public int hashCode() {
        return Objects.hash(matricule);
    }
}
```

### 3.3 L'entité métier `Note`

L'entité `Note` encapsule le résultat académique obtenu par un étudiant pour une matière donnée :

```java
package com.ism.domain;

import lombok.*;

/**
 * Entité représentant une note attribuée à un étudiant.
 */
@Getter
@Setter
@ToString(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Note extends AbstractEntity {

    private Double valeur;
    private Double coefficient;
    private String matiere;
    private Etudiant etudiant;

    public Note(Long id, Double valeur, Double coefficient, String matiere, Etudiant etudiant) {
        super(id);
        this.valeur = valeur;
        this.coefficient = coefficient;
        this.matiere = matiere;
        this.etudiant = etudiant;
    }
}
```

### 3.4 Démonstration du Polymorphisme Dynamique

Le polymorphisme permet de manipuler des objets dérivés à travers la référence de leur type parent (`AbstractEntity`), la JVM se chargeant d'invoquer la méthode appropriée à l'exécution (*liaison tardive / dynamic dispatch*) :

```java
public class PolymorphismDemo {
    public static void main(String[] args) {
        // Déclaration via le type générique abstrait
        Etudiant e1 = new Etudiant(1, "Awa Diop", "ETU-2026-001", "L3 GLRS");
        AbstractEntity n1 = new Note(10L, 17.5, 3.0, "Architecture Logicielle Java", (Etudiant) e1);

        // Appel polymorphique : la JVM résout dynamiquement le toString() propre à chaque classe
        afficherEntite(e1);
        afficherEntite(n1);
    }

    public static void afficherEntite(AbstractEntity entity) {
        System.out.println("[AUDIT LOG] Type d'entité : " + entity.getClass().getSimpleName());
        System.out.println("[AUDIT LOG] Détails : " + entity.toString());
    }
}
```

---

## 4. Bonnes Pratiques, Pièges & Débogage

> ℹ️ **Pourquoi privilégier le Builder Pattern ?**
> Lorsque les entités possèdent de nombreux champs optionnels, multiplier les constructeurs surchargés (*Telescoping Constructor Antipattern*) rend le code illisible et source d'erreurs (inversion de deux paramètres de type `String` comme l'email et le téléphone). L'annotation `@Builder` de Lombok permet une instanciation expressive et sécurisée :
> ```java
> Etudiant etu = Etudiant.builder()
>     .matricule("ETU-001")
>     .nom("Diallo")
>     .prenom("Moussa")
>     .build();
> ```

> ⚠️ **Le piège de la boucle infinie dans `@ToString` :**
> Si `Etudiant` contient une liste de `Note` et que chaque `Note` contient une référence vers son `Etudiant`, un appel à `toString()` déclenchera une récursion infinie conduisant inévitablement à un crash mémoire `java.lang.StackOverflowError` ! Utilisez `@ToString.Exclude` sur la relation inverse pour briser le cycle.

> 💡 **Pourquoi `AbstractEntity` ne peut pas être instanciée ?**
> Le mot-clé `abstract` interdit formellement `new AbstractEntity()`. C'est une garantie conceptuelle : un concept "abstrait" n'a pas d'existence physique dans le monde réel ; seuls des étudiants ou des notes concrets peuvent être enregistrés.

---

## 5. Synthèse & Auto-Évaluation

### Tableau Comparatif des Concepts

| Concept | Définition | Impact en mémoire / Exécution | Exemple de code |
| :--- | :--- | :--- | :--- |
| **Classe** | Moule ou plan de fabrication définissant attributs et méthodes. | Chargée une seule fois dans le Metaspace par le ClassLoader. | `public class Etudiant { ... }` |
| **Objet / Instance** | Réalisation concrète en mémoire créée via `new`. | Alloué dynamiquement dans le Heap. Nettoyé par le GC. | `Etudiant e = new Etudiant();` |
| **Encapsulation** | Masquage des détails internes et contrôle des accès. | Les champs privés ne sont accessibles que via les accesseurs. | `private String email;` |
| **Polymorphisme** | Capacité d'un objet à prendre plusieurs formes. | Résolution dynamique de méthode au moment de l'exécution. | `AbstractEntity e = new Etudiant();` |

### Questionnaire d'Auto-Évaluation (QCM)

1. **Que se passe-t-il si vous tentez d'exécuter l'instruction `AbstractEntity entity = new AbstractEntity();` ?**
   - A) L'objet est instancié avec des valeurs nulles.
   - B) Le code refuse de compiler car une classe abstraite ne peut pas être directement instanciée.
   - C) Une exception `NullPointerException` est levée au runtime.
   - D) La JVM alloue l'objet dans la Stack.
   *Réponse attendue : B.*

2. **Quelle méthode de `java.lang.Object` devez-vous obligatoirement redéfinir pour que deux étudiants ayant le même matricule soient reconnus comme identiques par une `HashSet` ?**
   - A) `toString()` uniquement
   - B) `clone()` et `finalize()`
   - C) Conjointement `equals(Object o)` et `hashCode()`
   - D) `compareTo()`
   *Réponse attendue : C.*

3. **Quelle annotation Lombok génère automatiquement le constructeur fluide permettant d'écrire `Etudiant.builder().nom("Faye").build()` ?**
   - A) `@Data`
   - B) `@Builder`
   - C) `@AllArgsConstructor`
   - D) `@Value`
   *Réponse attendue : B.*

### Exercice Pratique & DevLog

```markdown
[DevLog - Entrée 03]
- Sujet : Modélisation des entités métier et contrat d'égalité
- Action : Implémentez la hiérarchie `AbstractEntity`, `Etudiant` et `Note` dans votre package `com.ism.domain`.
- Défi : Créez deux instances distinctes d'`Etudiant` ayant exactement le même matricule `"ISM-999"`, mais deux noms différents. Placez ces deux étudiants dans un `HashSet<Etudiant>`. Vérifiez la taille du set avec `set.size()`. Si la taille est 1, votre contrat `equals/hashCode` est validé !
```
