---
title: 'Séance 3 : UML, Backed Enums, Traits et Ordonnancement des Fixtures'
teacher: Baila Wane
course_date: '2026-10-27'
description: Modélisation UML du cas d'usage sous-administrateur, relations OneToMany
  bidirectionnelles avec orphanRemoval, Backed Enums PHP 8.1+, factorisation par Traits
  et fixtures ordonnées.
keywords: Enums, Backed Enum, StatutExercice, Traits, DateTimeTrait, Fixtures, DependentFixtureInterface,
  Épargne calebasse, Caisse sociale, Amendes, Exercice, Groupement
is_published: true
resources:
- type: external_link
  title: Support de cours Notion - Séance 3 (27-10-2026)
  url: https://buttercup-option-ef4.notion.site/Symfony-3ed4a8cf9efb80deb686f05804a1c219
  note: Prise de notes et synthèse originale du cours par Baila Wane.
- type: external_link
  title: Transcription interactive Granola (27-10-2026)
  url: https://notes.granola.ai/t/015e55ef-5a34-493a-90e9-2344fee32e12-00demib2
  note: Transcription intégrale des échanges et explications live du cours.
- type: external_link
  title: Dépôt GitHub du projet « Avec Les Femmes »
  url: https://github.com/DianaFerradini/avecLesFemmes-Symfony.git
  note: Code source du projet d'application fil rouge.
- type: document
  title: Modélisation StarUML du domaine (modelisation.mdj)
  file: attachments/modelisation.mdj
  note: Diagrammes de cas d'utilisation et diagramme de classes StarUML officiel.
---

# 1. Contexte Métier : Le Rôle du Sous-Administrateur

Dans le domaine fonctionnel de notre application **« Avec Les Femmes »**, le Sous-Administrateur est la clé de voûte de la supervision financière sur le terrain :
- Il enregistre et supervise les différents **Groupements** communautaires.
- Il ouvre, suit et clôture les **Exercices comptables** annuels.
- Au sein d'un exercice, un groupement orchestre la collecte de l'épargne, la caisse de solidarité sociale et l'octroi des prêts aux membres.

### Dates Pédagogiques d'un Exercice
Un exercice ne coïncide pas nécessairement avec l'année civile classique du 1er janvier au 31 décembre. Dans les réalités culturelles et économiques locales, les cycles d'épargne épousent les grandes échéances annuelles :
- **Date de début** : Ex. la veille d'une fête majeure (Tabaski, récoltes).
- **Date limite des prêts** : Date butoir au-delà de laquelle plus aucun nouveau crédit ne peut être accordé, afin de sécuriser le remboursement des fonds.
- **Date de rétribution** : Journée solennelle de partage où chaque participante récupère son épargne cumulée augmentée des intérêts générés par les prêts.
- **Date de fin** : Clôture formelle et archivage de l'exercice comptable.

---

# 2. Modélisation UML : Cas d'Utilisation et Diagramme de Classes

Avant toute implémentation Symfony, le modèle a été conçu sur **StarUML** (`docs/modelisation.mdj`) :

```
┌─────────────────────────────────┐                 ┌──────────────────────────────────────┐
│           Groupement            │                 │               Exercice               │
├─────────────────────────────────┤                 ├──────────────────────────────────────┤
│ - id: int                       │ 1             * │ - id: int                            │
│ - nom: string(100)              │◄────────────────┤ - debutAt: DateTime                  │
│ - tel: string(17)               │                 │ - finAt: DateTime                    │
│ - adresse: string(255) [null]   │                 │ - limitePretsAt: DateTime            │
│ - createAt: DateTimeImmutable   │                 │ - retributionAt: DateTime            │
│ - updateAt: DateTime            │                 │ - statut: StatutExercice (Enum)      │
│ - exercices: Collection         │                 │ - createAt: DateTimeImmutable        │
│                                 │                 │ - updateAt: DateTime                 │
└─────────────────────────────────┘                 └──────────────────────────────────────┘
```

### Règles de Relation Doctrine
- Un `Groupement` possède plusieurs `Exercices` au fil des années (**OneToMany**).
- Un `Exercice` appartient strictement à un seul et unique `Groupement` (**ManyToOne**, clé étrangère non nullable).
- **`orphanRemoval: true`** : Si un groupement est supprimé du système, Doctrine supprime en cascade l'ensemble de ses exercices rattachés afin de garantir l'intégrité référentielle en base de données.

---

# 3. Les Backed Enums en PHP 8.1+

Pour représenter le statut d'un exercice (en cours ou clôturé), nous rejetons les chaînes magiques (*magic strings*) et les entiers arbitraires au profit d'un **Backed Enum typé en chaîne**.

### 3.1 Code Réel : `src/Enum/StatutExercice.php`
Voici l'énumération créée dans notre projet :

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

### 3.2 Avantages Clés
1. **Sécurité au typage** : Impossible d'assigner une valeur invalide comme `'termine'` ou `'ferme'`. Le compilateur PHP et Doctrine lèvent une exception immédiate.
2. **Découplage Vue / Stockage** :
   - `$statut->value` renvoie la valeur brute stockée en SQL (`en_cours`).
   - `$statut->label()` renvoie la formulation française lisible destinée à l'interface Twig (`En cours`).
   - L'expression `match` garantit l'exhaustivité : si un nouveau statut est ajouté, l'oubli de son label générera une alerte statique.

---

# 4. Factorisation sans Héritage Abusif : Les Traits PHP

### 4.1 L'Erreur Pédagogique Fréquente
Plusieurs étudiants proposent de créer une classe mère abstraite `BaseEntity` contenant `$createAt` et `$updateAt`, dont hériteraient `Groupement`, `Exercice` et `Membre`.

> ⚠️ **Mise en garde architecturale de Baila Wane** :
> L'héritage modélise une relation sémantique forte **« EST UN »** (*is-a*).
> Un chat *est un* félin. Un administrateur *est un* utilisateur.
> Mais un *Exercice* ou un *Groupement* n'EST PAS un *« Horodatage »* !
> Utiliser l'héritage uniquement pour hériter de 2 attributs viole les principes de la modélisation objet et bloque l'héritage simple de PHP.

### 4.2 La Solution Industrielle : Le Trait `DateTimeTrait`
Un **Trait** permet d'injecter des attributs et des méthodes dans plusieurs classes indépendantes sans créer de lien hiérarchique artificiel.

Code réel du projet (`src/Trait/DateTimeTrait.php`) :

```php
<?php

namespace App\Trait;

use Doctrine\ORM\Mapping as ORM;

trait DateTimeTrait {
    #[ORM\Column]
    private ?\DateTimeImmutable $createAt = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTime $updateAt = null;

    private function initDate(): void {
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

### 4.3 Utilisation dans l'Entité `Groupement` (`src/Entity/Groupement.php`)
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

    #[ORM\OneToMany(targetEntity: Exercice::class, mappedBy: 'groupement', orphanRemoval: true)]
    private Collection $exercices;

    public function __construct()
    {
        $this->exercices = new ArrayCollection();
        $this->initDate(); // Initialisation des dates via le trait
    }
    // ...
}
```

> 📘 **[Complément d'architecture - Fluent Setters]**
> Remarquez le retour `: static` sur les méthodes `setNom()` et `setTel()`. Cela permet le chaînage d'appels (*Method Chaining*) lors de l'instanciation :
> `$groupement = (new Groupement())->setNom('Benkadi')->setTel('+221770000000');`

---

# 5. Cycle de Persistance et Ordonnancement des Fixtures

### 5.1 `persist()` vs `flush()`
- **`persist($entity)`** : Informe l'EntityManager que l'objet doit être pris en charge par l'Unit of Work. **Aucune requête SQL n'est émise vers la base de données.**
- **`flush()`** : Analyse l'ensemble des changements enregistrés en mémoire, optimise l'ordre des requêtes et les exécute au sein d'une transaction SQL unifiée.
- *Anti-pattern absolu* : Appeler `flush()` à l'intérieur d'une boucle de 500 éléments. Cela provoque 500 allers-retours réseau individuels au lieu d'une seule transaction globale groupée !

### 5.2 Fixtures avec Gestion des Dépendances
Dans un schéma relationnel, les entités maîtresses doivent être insérées avant les entités dépendantes sous peine de violer les clés étrangères.

Pour cela, nous implémentons **`DependentFixtureInterface`** dans `ExerciceFixtures` :

Code réel de `src/DataFixtures/ExerciceFixtures.php` :

```php
<?php

namespace App\DataFixtures;

use App\Entity\Exercice;
use App\Entity\Groupement;
use App\Enum\StatutExercice;
use Doctrine\Bundle\FixturesBundle\Fixture;
use Doctrine\Common\DataFixtures\DependentFixtureInterface;
use Doctrine\Persistence\ObjectManager;

class ExerciceFixtures extends Fixture implements DependentFixtureInterface
{
    public function load(ObjectManager $manager): void
    {
        // 1. Récupération des groupements créés par GroupementFixtures
        $groupements = $manager->getRepository(Groupement::class)->findAll();

        foreach ($groupements as $groupement) {
            // Création d'un exercice actif (EN COURS)
            $exerciceEnCours = new Exercice();
            $exerciceEnCours->setDebutAt(new \DateTime('2026-01-15'))
                ->setFinAt(new \DateTime('2026-12-20'))
                ->setLimitePretsAt(new \DateTime('2026-10-15'))
                ->setRetributionAt(new \DateTime('2026-12-18'))
                ->setStatut(StatutExercice::ENCOURS)
                ->setGroupement($groupement);
            $manager->persist($exerciceEnCours);

            // Création d'exercices historiques (CLÔTURÉS)
            for ($annee = 2024; $annee <= 2025; $annee++) {
                $exerciceClos = new Exercice();
                $exerciceClos->setDebutAt(new \DateTime("{$annee}-01-10"))
                    ->setFinAt(new \DateTime("{$annee}-12-15"))
                    ->setLimitePretsAt(new \DateTime("{$annee}-10-10"))
                    ->setRetributionAt(new \DateTime("{$annee}-12-12"))
                    ->setStatut(StatutExercice::CLOTURE)
                    ->setGroupement($groupement);
                $manager->persist($exerciceClos);
            }
        }

        // Flush global en sortie de boucle
        $manager->flush();
    }

    public function getDependencies(): array
    {
        // Impose à Doctrine d'exécuter GroupementFixtures AVANT ExerciceFixtures
        return [
            GroupementFixtures::class,
        ];
    }
}
```

Chargement des fixtures :
```bash
php bin/console doctrine:fixtures:load --no-interaction
```

---

# 6. Synthèse des Acquis

1. La relation `Groupement` 1..* `Exercice` est bidirectionnelle avec suppression orpheline (`orphanRemoval=true`).
2. Les Backed Enums PHP 8.1 (`StatutExercice`) encapsulent l'intégrité des statuts et fournissent des libellés élégants via l'expression `match`.
3. Le Trait `DateTimeTrait` centralise l'horodatage (`createAt`, `updateAt`) sans recourir à un héritage abusif.
4. `DependentFixtureInterface` maîtrise l'ordre d'injection des données relationnelles.

Dans la prochaine séance, nous analyserons l'affichage de cette liste de groupements et corrigerons les pièges du cycle MVC et du problème de requête N+1.
