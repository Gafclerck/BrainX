---
title: "Interface Utilisateur Console et Validation Robuste des Saisies"
description: "Concevoir un menu interactif console ergonomique, maîtriser les pièges du Scanner Java (consommation du retour à la ligne) et sécuriser la validation des saisies utilisateur."
teacher: "Baila Wane"
reading_time: 25
order: 2
tags:
  - Console
  - UI
  - Scanner
  - Validation
  - CleanCode
  - ExceptionHandling
---

# Interface Utilisateur Console et Validation Robuste des Saisies

## 1. Introduction & Contexte Métier

Bien que les interfaces Web modernes et les API REST dominent les déploiements en nuage, l'application console en mode texte demeure un outil fondamental dans la boîte à outils de l'ingénieur logiciel. Elle sert de banc d'essai interactif pour tester l'architecture métier, d'outil d'administration système (CLI - *Command-Line Interface*), et de passerelle d'automatisation pour les scripts d'exploitation.

Cependant, programmer une interface console robuste est un exercice redoutable pour les développeurs inexpérimentés. Face à un utilisateur qui tape une lettre au lieu d'un chiffre, qui appuie frénétiquement sur la touche Entrée ou qui saisit une chaîne vide, une mauvaise gestion des entrées clavier avec la classe `java.util.Scanner` conduit inévitablement à :
1. Des blocages infinis ou des sauts de formulaire inexplicables (le fameux piège du résidu `\n` dans le buffer).
2. Des crashs immédiats par `java.util.InputMismatchException` ou `NumberFormatException`.
3. Une contamination de la couche console par des responsabilités métier indues.

Dans notre projet de référence **`com.ism`**, le fichier `Main.java` démontre comment concevoir une boucle interactive propre, découplée des services, et entièrement blindée contre les erreurs de manipulation.

Comme le démontre le Professeur **Baila Wane** :
> *"Votre interface console ne doit être qu'un traducteur ! Elle lit du texte brut saisi par l'opérateur, valide son format minimal, construit un DTO et le passe à la couche Service. Si le service lève une exception, la console attrape l'exception, affiche un message d'avertissement élégant en rouge, et réaffiche le menu sans JAMAIS crasher !"*

---

## 2. Architecture & Fondations Conceptuelles

### 2.1 Le Cycle de la Boucle Événementielle Console (*REPL*)

L'application console s'articule autour d'une boucle interactive de type **REPL** (*Read - Eval - Print - Loop*) :

```mermaid
flowchart TD
    START(["Démarrage de l'application"]) --> INIT["Initialisation des Services via ServiceFactory"]
    INIT --> LOOP{"Boucle Interactive (running == true)"}
    
    LOOP -->|1. Display| MENU["Affichage du Menu Principal :
1. Ajouter Étudiant
2. Lister Étudiants
3. Attribuer Note
4. Relevé de Notes
5. Quitter"]
    MENU -->|2. Read| INPUT["Saisie du Choix Utilisateur
(Scanner sécurisé)"]
    INPUT -->|3. Eval| DISPATCH["Aiguillage (Switch / Case) vers le sous-formulaire"]
    
    DISPATCH -->|4. Print & Catch| OP["Appel Service & Affichage Résultat
(try-catch BusinessException)"]
    OP --> LOOP

    DISPATCH -->|Choix 5| EXIT["running = false
Fermeture propre des ressources"]
    EXIT --> STOP(["Arrêt du Programme"])
```

### 2.2 Le Piège Classique du `Scanner.nextInt()` et sa Solution

La classe `Scanner` de Java présente un comportement déroutant pour les néophytes :
- Lorsque vous appelez `scanner.nextInt()` et tapez `1` suivi de la touche Entrée, `nextInt()` consomme le chiffre `1`, **mais laisse le caractère de saut de ligne `\n` dans le tampon d'entrée (buffer)** !
- Si votre instruction suivante appelle `scanner.nextLine()` pour lire le nom de famille de l'étudiant, `nextLine()` rencontre immédiatement le `\n` restant et renvoie instantanément une chaîne vide, donnant l'impression visuelle que le programme a sauté la question !

> ⚠️ **La règle absolue enseignée par Baila Wane :**
> **Ne mélangez jamais `nextInt()` ou `nextDouble()` avec `nextLine()` !**
> Lisez TOUJOURS la ligne entière sous forme de chaîne de caractères avec `scanner.nextLine().trim()`, puis effectuez la conversion vous-même avec `Integer.parseInt(...)` ou `Double.parseDouble(...)` au sein d'un bloc de contrôle.

### 2.3 Architecture Industrielle de la Vue Console : La Classe Mère `View`

Dans une application professionnelle, chaque vue d'entité ne doit pas réinventer ses propres méthodes de lecture du clavier.
Baila Wane préconise d'organiser la présentation en couches d'héritage maîtrisé :
1. **Une classe mère abstraite `View`** : regroupe les primitives de saisie sécurisées (`lireTexte`, `lireEntier`, `lireDecimale`). Elle encapsule une instance unique de `Scanner` injectée par constructeur ou gérée en Singleton.
2. **Des classes de vues concrètes marquées `final`** (ex: `EtudiantView`, `ProduitView`, `SalleView`) : elles héritent de `View` et implémentent les formulaires spécifiques au domaine sans pouvoir être dérivées de façon anarchique.

---

## 3. Implémentation Pratique & Code de Référence

### 3.1 La Classe Mère Abstraite `View` et le Scanner Singleton

```java
package com.ism.view;

import java.util.Scanner;

/**
 * Classe mère abstraite pour toutes les vues console de l'application.
 * Factorise la saisie clavier et sécurise les conversions de types.
 *
 * @author Baila Wane
 */
public abstract class View {

    protected final Scanner scanner;

    protected View(Scanner scanner) {
        this.scanner = scanner;
    }

    public String lireTexte(String prompt) {
        String saisie;
        do {
            System.out.print(prompt + " : ");
            saisie = scanner.nextLine().trim();
            if (saisie.isEmpty()) {
                System.out.println(" ⚠️ Cette valeur ne peut pas être vide. Veuillez réessayer.");
            }
        } while (saisie.isEmpty());
        return saisie;
    }

    public int lireEntier(String prompt, int min, int max) {
        while (true) {
            System.out.print(prompt + " (" + min + "-" + max + ") : ");
            String saisie = scanner.nextLine().trim();
            try {
                int valeur = Integer.parseInt(saisie);
                if (valeur >= min && valeur <= max) {
                    return valeur;
                }
                System.out.println(" ⚠️ Veuillez entrer un entier compris entre " + min + " et " + max + ".");
            } catch (NumberFormatException e) {
                System.out.println(" ⚠️ Saisie invalide : veuillez entrer un nombre entier.");
            }
        }
    }

    public double lireDecimale(String prompt, double min, double max) {
        while (true) {
            System.out.print(prompt + " (" + min + "-" + max + ") : ");
            String saisie = scanner.nextLine().trim().replace(',', '.');
            try {
                double valeur = Double.parseDouble(saisie);
                if (valeur >= min && valeur <= max) {
                    return valeur;
                }
                System.out.println(" ⚠️ La valeur doit être comprise entre " + min + " et " + max + ".");
            } catch (NumberFormatException e) {
                System.out.println(" ⚠️ Format décimal invalide. Exemple attendu : 14.5");
            }
        }
    }
}
```

### 3.2 La Vue Concrète `EtudiantView`

En dérivant de la classe mère `View`, la classe concrète `EtudiantView` orchestre les formulaires de saisie et les affichages du domaine étudiant sans réécrire la tuyauterie de bas niveau :

```java
package com.ism.view;

import com.ism.dto.EtudiantCreateDto;
import com.ism.dto.EtudiantListeDto;
import com.ism.dto.NoteCreateDto;
import com.ism.dto.NoteListeDto;

import java.util.List;
import java.util.Scanner;

public final class EtudiantView extends View {

    public EtudiantView(Scanner scanner) {
        super(scanner);
    }

    public EtudiantCreateDto saisirNouveauEtudiant() {
        System.out.println("\n--- INSCRIPTION D'UN ÉTUDIANT ---");
        String matricule = lireTexte("Matricule");
        String nom = lireTexte("Nom");
        String prenom = lireTexte("Prénom");
        String email = lireTexte("Email");
        String telephone = lireTexte("Téléphone");
        String classe = lireTexte("Classe (ex: L3-GL, M1-INFO)");

        return new EtudiantCreateDto(matricule, nom, prenom, email, telephone, classe);
    }

    public NoteCreateDto saisirNouvelleNote() {
        System.out.println("\n--- ATTRIBUTION DE NOTE ---");
        String matricule = lireTexte("Matricule de l'étudiant");
        String matiere = lireTexte("Matière");
        double valeur = lireDecimale("Note obtenue", 0.0, 20.0);
        double coeff = lireDecimale("Coefficient", 1.0, 10.0);

        return new NoteCreateDto(valeur, coeff, matiere, matricule);
    }

    public void afficherEtudiants(List<EtudiantListeDto> etudiants) {
        System.out.println("\n--- PROMOTION DES ÉTUDIANTS INSCRITS ---");
        if (etudiants == null || etudiants.isEmpty()) {
            System.out.println("ℹ️ Aucun étudiant enregistré pour le moment.");
            return;
        }

        System.out.printf("%-5s | %-15s | %-25s | %-10s | %-25s\n", "ID", "MATRICULE", "NOM COMPLET", "CLASSE", "EMAIL");
        System.out.println("---------------------------------------------------------------------------------------");
        for (EtudiantListeDto e : etudiants) {
            System.out.printf("%-5d | %-15s | %-25s | %-10s | %-25s\n", e.id(), e.matricule(), e.nomComplet(), e.classe(), e.email());
        }
    }

    public void afficherBulletin(EtudiantListeDto etudiant, List<NoteListeDto> notes, double moyenne) {
        System.out.println("\n--- BULLETIN DE NOTES ---");
        System.out.println("Étudiant : " + etudiant.nomComplet() + " (" + etudiant.matricule() + ") | Classe : " + etudiant.classe());
        System.out.println("--------------------------------------------------");
        if (notes == null || notes.isEmpty()) {
            System.out.println("ℹ️ Aucune note attribuée pour cet étudiant.");
            return;
        }

        for (NoteListeDto n : notes) {
            System.out.printf("- %-20s : %5.2f / 20 (Coeff: %.1f)\n", n.matiere(), n.valeur(), n.coefficient());
        }
        System.out.println("--------------------------------------------------");
        System.out.printf("MOYENNE GÉNÉRALE PONDÉRÉE : %.2f / 20\n", moyenne);
        System.out.println("DÉCISION DU JURY : " + (moyenne >= 10.0 ? "ADMIS ✅" : "AJOURNÉ ❌"));
    }
}
```

### 3.3 La Couche Validateur Statique (`Validator`) et Codes `EnumError`

Pour respecter le principe de responsabilité unique (SRP), la vérification des données de formulaire ne doit pas encombrer la classe de vue.
Nous créons une couche de validation dédiée composée de classes utilitaires statiques :

```java
package com.ism.validator;

import com.ism.enums.EnumError;

/**
 * Validateur syntaxique de chaînes de caractères.
 */
public final class StringValidator {

    private StringValidator() {}

    public static EnumError validerObligatoire(String valeur) {
        if (valeur == null) {
            return EnumError.CHAMP_OBLIGATOIRE;
        }
        if (valeur.trim().isEmpty()) {
            return EnumError.CHAMP_OBLIGATOIRE;
        }
        return EnumError.SUCCES;
    }
}
```

> 📘 **Règle Majeure de Conception : Les Validateurs renvoient des `EnumError`**
> Un validateur ne doit jamais renvoyer un simple `boolean` (qui ne dit pas pourquoi la validation a échoué) ni une chaîne de caractères brute (qui empêche l'internationalisation). En renvoyant un code `EnumError`, la vue peut instantanément afficher le message dans la langue appropriée.

### 3.4 Frontière Étanche : Validation Syntaxique vs Validation Métier

Une distinction essentielle enseignée par Baila Wane sépare deux univers de validation :
1. **La Validation Syntaxique / Structurelle (Vue / Validateur / DTO)** :
   - Vérifie si le matricule n'est pas vide, si le format e-mail contient un `@`, si la note est un nombre positif.
   - Ne nécessite **aucun accès à la base de données**. Elle s'exécute immédiatement en périphérie de l'application.
2. **La Validation Métier (Couche Service)** :
   - Vérifie si le matricule n'est pas déjà attribué à un autre étudiant en base, si la salle est libre sur le créneau demandé, si le solde financier de l'étudiant autorise l'inscription.
   - Nécessite **l'interrogation des Repositories**. Elle s'exécute obligatoirement dans la couche Service.

### 3.5 La Boucle Principale de `com.ism.Main`

Examinons l'orchestration réelle dans la classe `Main` de notre projet, qui instancie la vue et délègue l'exécution aux services :

```java
package com.ism;

import com.ism.dto.EtudiantCreateDto;
import com.ism.dto.EtudiantListeDto;
import com.ism.dto.NoteCreateDto;
import com.ism.dto.NoteListeDto;
import com.ism.exception.BusinessException;
import com.ism.factory.ServiceFactory;
import com.ism.service.EtudiantService;
import com.ism.service.NoteService;
import com.ism.view.EtudiantView;

import java.util.List;
import java.util.Scanner;

public class Main {

    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        EtudiantView etudiantView = new EtudiantView(scanner);

        EtudiantService etudiantService = ServiceFactory.getEtudiantService();
        NoteService noteService = ServiceFactory.getNoteService();

        boolean running = true;
        System.out.println("==================================================");
        System.out.println("     BRAINX - GESTION ACADÉMIQUE ISM (CONSOLE)    ");
        System.out.println("==================================================");

        while (running) {
            afficherMenu();
            int choix = etudiantView.lireEntier("Votre choix", 1, 5);

            try {
                switch (choix) {
                    case 1 -> {
                        EtudiantCreateDto dto = etudiantView.saisirNouveauEtudiant();
                        EtudiantListeDto enregistre = etudiantService.inscrireEtudiant(dto);
                        System.out.println("✅ Étudiant inscrit avec succès ! ID attribué : " + enregistre.id());
                    }
                    case 2 -> {
                        List<EtudiantListeDto> liste = etudiantService.listerTous();
                        etudiantView.afficherEtudiants(liste);
                    }
                    case 3 -> {
                        NoteCreateDto dto = etudiantView.saisirNouvelleNote();
                        noteService.ajouterNote(dto);
                        System.out.println("✅ Note enregistrée avec succès pour l'étudiant " + dto.etudiantMatricule() + " !");
                    }
                    case 4 -> {
                        String matricule = etudiantView.lireTexte("Matricule de l'étudiant à consulter");
                        EtudiantListeDto etudiant = etudiantService.trouverParMatricule(matricule);
                        List<NoteListeDto> notes = noteService.listerNotesParEtudiant(matricule);
                        double moyenne = etudiantService.calculerMoyenneEtudiant(matricule);
                        etudiantView.afficherBulletin(etudiant, notes, moyenne);
                    }
                    case 5 -> {
                        System.out.println("\n[SYSTÈME] Fermeture de l'application. Au revoir !");
                        running = false;
                    }
                }
            } catch (BusinessException e) {
                // Interception ciblée des anomalies métier sans crasher le programme
                System.out.println("\n❌ [ERREUR MÉTIER] Code: " + e.getErrorCode() + " | " + e.getMessage());
            } catch (Exception e) {
                // Interception de sécurité pour imprévus
                System.out.println("\n❌ [ERREUR INATTENDUE] Une anomalie système est survenue : " + e.getMessage());
            }
            System.out.println();
        }

        scanner.close();
    }

    private static void afficherMenu() {
        System.out.println("--------------------------------------------------");
        System.out.println("1. Inscrire un nouvel étudiant");
        System.out.println("2. Consulter la liste des étudiants");
        System.out.println("3. Attribuer une note à un étudiant");
        System.out.println("4. Consulter le relevé de notes d'un étudiant");
        System.out.println("5. Quitter");
        System.out.println("--------------------------------------------------");
    }
}
```

---

## 4. Bonnes Pratiques, Pièges & Débogage

> ⚠️ **Revue de Code : Deux Pièges Majeurs en Interface Console**
> Lors de la conception d'un terminal interactif, deux erreurs classiques doivent être évitées :
> 1. **L'inversion de prompt** : afficher par mégarde une invite erronée (par exemple demander *"Matricule : "* alors que le programme attend le nom d'une matière suite à une copie hâtive de ligne), ce qui désoriente l'utilisateur.
> 2. **L'instabilité de `System.console()` sous les environnements IDE** : `System.console()` renvoie `null` lorsqu'il est exécuté dans la console intégrée d'un IDE comme IntelliJ IDEA, Eclipse ou VS Code. Appeler une méthode dessus déclenche un crash `NullPointerException`. C'est pourquoi l'ingénieur privilégie un `Scanner(System.in)` encapsulé dans une classe de base `View` !

> ℹ️ **Le remplacement de la virgule par le point :**
> Selon les paramètres régionaux (*Locale*) de la machine de l'étudiant, la saisie d'un décimal attend soit une virgule (France/Sénégal `14,5`), soit un point (USA `14.5`). Utiliser `saisie.replace(',', '.')` avant `Double.parseDouble()` rend votre code universel et immunisé contre les différences d'OS.

> ⚠️ **Ne jamais fermer `System.in` prématurément :**
> Si vous appelez `scanner.close()` à l'intérieur d'une méthode secondaire, la JVM ferme définitivement le flux standard d'entrée système `System.in`. Tout appel ultérieur à `new Scanner(System.in)` déclenchera immédiatement une `IllegalStateException: Scanner closed`. Ne fermez le scanner qu'à la terminaison complète du programme dans le `main`.

> 💡 **La séparation étanche Vue - Métier :**
> Remarquez que la classe `Main` n'effectue aucun calcul de moyenne, ne modifie pas les listes en direct et n'instancie aucun objet de persistance. Elle orchestre la vue `EtudiantView` et délègue tout aux services via les DTOs.

> 📘 **Démystification : Ce que les Frameworks Modernes (Spring, Quarkus, Symfony) font sous le capot**
> En réalisant manuellement l'architecture par couches, la boucle console, la gestion du Singleton `Scanner` et l'injection par la `ServiceFactory`, vous venez de reproduire exactement le fonctionnement interne des plus grands frameworks industriels :
> 1. **Le conteneur IoC (Inversion of Control)** : Dans Spring ou Symfony, un conteneur d'injection de dépendances instancie automatiquement tous les Singletons (Services, Repositories, Database) au démarrage de l'application.
> 2. **L'autowiring** : Le framework inspecte les constructeurs et injecte automatiquement les interfaces requises sans que le développeur n'ait à écrire `new`.
> 3. **La couche Contrôleur** : En mode Web, le contrôleur REST remplace notre menu console `switch/case` : il reçoit les requêtes HTTP JSON, les mappe en DTOs, et intercepte les exceptions métier via un `@ControllerAdvice` global pour renvoyer des codes HTTP normalisés (400, 404, 409).
> *Comprendre ces fondations manuelles fait de vous un développeur capable de dompter n'importe quel framework sans jamais le subir !*

---

## 5. Synthèse & Auto-Évaluation

### Règles d'Or de l'Interface Console

| Règle | Raison technique | Solution appliquée |
| :--- | :--- | :--- |
| **Toujours lire en `nextLine()`** | Évite le résidu de `\n` laissé par `nextInt()` dans le buffer. | `View.lireTexte()` / `View.lireEntier()` |
| **Parser manuellement les nombres** | Intercepte les fautes de frappe sans crasher l'application. | `Integer.parseInt(saisie)` avec `try-catch` |
| **Nettoyer les espaces superflus** | Évite les faux rejets sur `" 1"` ou `"ETU-001 "`. | `.trim()` systématique sur les entrées |
| **Catcher `BusinessException`** | Offre un retour explicite à l'utilisateur sans trace brute. | Gestion centralisée dans le `switch/case` |

### Questionnaire d'Auto-Évaluation (QCM)

1. **Quel problème technique survient lorsqu'on appelle `scanner.nextLine()` immédiatement après un `scanner.nextInt()` ?**
   - A) Une exception `OutOfMemoryError`
   - B) Le `nextLine()` consomme le saut de ligne résiduel restant dans le buffer et renvoie une chaîne vide
   - C) La mémoire Heap est corrompue
   - D) Le terminal se ferme instantanément
   *Réponse attendue : B.*

2. **Quelle méthode de chaîne de caractères permet de supprimer les espaces inutiles au début et à la fin de la saisie utilisateur ?**
   - A) `stripWhitespace()`
   - B) `clean()`
   - C) `trim()`
   - D) `flush()`
   *Réponse attendue : C.*

3. **Quelle couche de l'application est chargée d'attraper les `BusinessException` pour afficher un message d'erreur lisible à l'opérateur ?**
   - A) La couche Repository
   - B) La couche Domaine
   - C) La couche Présentation (`Main` / Console)
   - D) La base de données
   *Réponse attendue : C.*

### Exercice Pratique & DevLog

```markdown
[DevLog - Entrée 12]
- Sujet : Implémentation du menu console interactif sécurisé
- Action : Créez la classe abstraite `View`, la classe concrète `EtudiantView` et assemblez la classe `com.ism.Main`.
- Défi : Lancez l'application en console. Tentez volontairement de saisir des lettres lorsque le menu demande un choix de 1 à 5, puis entrez une note de 30/20. Vérifiez que l'application réagit avec élégance en affichant les messages d'avertissement et vous redemande une saisie sans jamais crasher.
```
