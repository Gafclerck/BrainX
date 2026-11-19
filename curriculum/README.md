# Guide d'ingestion des cours BrainX (Curriculum)

> 📖 **Pour les agents IA et concepteurs de contenu** : Consultez le guide complet de référence dans [docs/GUIDE_CONCEPTION_COURS_IA.md](file:///D:/MY_PROEJCT/BrainX/docs/GUIDE_CONCEPTION_COURS_IA.md) pour la méthodologie d'extraction depuis les sources brutes (`docs/`, Notion, Git), les règles du fil conducteur et le formatage obligatoire.

Ce répertoire contient l'ensemble des cours au format Markdown pour l'ingestion automatique dans la base de données BrainX.

## Structure de répertoires obligatoire (4 niveaux)

```
curriculum/
└── <Nom-Du-Cours>/
    └── <Nom-Du-Module>/
        └── <Nom-Du-Chapitre>/
            ├── 01-Titre-De-La-Lecon.md
            └── attachments/
                ├── support.pdf
                └── schema.png
```

Les préfixes numériques (ex: `01-`, `02-`) dans les noms de dossiers et de fichiers sont automatiquement nettoyés pour donner des titres lisibles (ex: `01-Algorithmes` devient `Algorithmes`), tout en garantissant un ordre de tri naturel et déterministe.

## Format Frontmatter YAML des Leçons

Chaque fichier Markdown de leçon (`.md`) doit comporter un bloc d'en-tête YAML délimité par `---` :

```markdown
---
title: "Introduction aux protocoles Web & HTTP"
teacher: "Professeur Alan Turing"
course_date: "2026-11-20"
description: "Comprendre les fondamentaux du protocole HTTP, requêtes, réponses et codes de statut."
keywords: "web, http, tcp, rest, api"
is_published: true
resources:
  - type: document
    title: "Support PDF du cours HTTP"
    file: "attachments/cours-http.pdf"
    note: "À lire avant les travaux pratiques"
  - type: external_link
    title: "Spécification RFC 9110 (HTTP Semantics)"
    url: "https://www.rfc-editor.org/rfc/rfc9110.html"
---

# 1. Introduction aux Réseaux et au Web
Le World Wide Web repose sur un modèle client-serveur...
```

## Exécution de l'ingestion

Pour importer ou synchroniser l'ensemble des cours avec PostgreSQL :

```bash
# Dans brainx-api
python manage.py import_curriculum --path ../curriculum
```

La commande est **idempotente** : relancer la commande mettra à jour les descriptions ou le contenu modifié sans créer de doublons.
