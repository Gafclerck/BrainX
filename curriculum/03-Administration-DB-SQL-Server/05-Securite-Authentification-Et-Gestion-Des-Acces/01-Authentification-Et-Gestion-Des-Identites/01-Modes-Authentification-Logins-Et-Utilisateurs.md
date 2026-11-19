---
title: "Modèle de Sécurité, Modes d'Authentification, Logins et Utilisateurs Orphelins"
teacher: "Mr MODOU KARA SAMB"
course_date: "2026-10-21"
description: "Architecture de sécurité à deux niveaux (Instance vs Base), comparaison Windows vs Mixed Mode, gestion du cycle de vie des logins, bases partiellement contenues et correction chirurgicale des utilisateurs orphelins."
keywords: "SQL Server, Sécurité, Authentification Windows, Mode Mixte, Logins, Database Users, Guest, Partially Contained, Orphaned Users, SID, TP 3.1"
is_published: true
resources:
  - type: external_link
    title: "Documentation Microsoft Learn - Notions fondamentales sur les autorisations du moteur de base de données"
    url: "https://learn.microsoft.com/fr-fr/sql/relational-databases/security/authentication-access/getting-started-with-database-engine-permissions"
    note: "Guide officiel d'architecture sur les principaux, sécurisables et permissions sous SQL Server."
  - type: document
    title: "Atelier Pratique 1 - Authentification et Logins SQL Server"
    file: "attachments/Atelier-1-Authentification-Et-Autorisations.docx"
    note: "Énoncé des travaux pratiques sur la gestion des comptes et logins."
  - type: document
    title: "Support Atelier 2 - Rôles serveur et base de données"
    file: "attachments/Atelier-2-Roles-Serveur-Et-Base-De-Donnees.pdf"
    note: "Support officiel des rôles d'instance et de base."
---

# 1. Fil Conducteur Métier : Restructuration des Accès de SDS (TP 3.1)

À la suite d'un audit de sécurité interne réalisé au siège de **SENEGAL DISTRIBUTION SA (SDS)**, la direction générale constate des anomalies inquiétantes :
- Plusieurs collaborateurs utilisent des comptes administrateurs partagés ;
- Des applications tierces se connectent avec le supercompte `sa` ;
- Après la restauration d'une base sur un serveur de test, certains comptes applicatifs sont bloqués sans explication apparente.

La DSI charge l'équipe DBA de remettre à plat l'architecture des accès sur l'instance **`SQLPROD01`** : distinguer rigoureusement les **Logins** au niveau de l'instance des **Utilisateurs** au niveau des bases, sécuriser le compte `sa`, désactiver les comptes invités `guest`, et maîtriser le dépannage des **utilisateurs orphelins**.

---

# 2. Le Modèle de Sécurité Hiérarchique

La sécurité de Microsoft SQL Server repose sur un principe fondamental en entonnoir : **qui agit, sur quoi, et avec quel droit précis** :

```
+------------------------------------------------------------------------+
| 1. INSTANCE SQL SERVER (Porte d'entrée Serveur)                        |
|    - Modes d'authentification : Windows Only ou Mixed Mode             |
|    - Principaux Serveur : Logins Windows & Logins SQL Server           |
|    - Rôles Serveur Fixes : sysadmin, securityadmin, serveradmin...      |
+------------------------------------------------------------------------+
                                     |
                          (Mappage d'accès par SID)
                                     v
+------------------------------------------------------------------------+
| 2. BASE DE DONNÉES (ex: SDS_Ventes)                                    |
|    - Principaux Base : Database Users (Utilisateurs de base)           |
|    - Rôles de Base Fixes : db_datareader, db_datawriter, db_owner...   |
|    - Rôles Métier Personnalisés : RoleComptable, RoleCommercial        |
+------------------------------------------------------------------------+
                                     |
                          (Contrôle des Permissions)
                                     v
+------------------------------------------------------------------------+
| 3. OBJETS & SCHÉMAS (Sécurisables)                                     |
|    - Schémas : Ventes, Finance, RH, dbo                                |
|    - Tables, Vues, Procédures Stockées                                 |
|    - Verbes de droits : GRANT, DENY, REVOKE                            |
+------------------------------------------------------------------------+
```

---

# 3. Les Deux Modes d'Authentification

Pour franchir la porte d'entrée de l'instance, SQL Server prend en charge deux modes :

### 3.1 Authentification Windows (Recommandé par défaut)
Dans ce mode, l'authentification est totalement déléguée au contrôleur de domaine **Active Directory (AD)** via le protocole **Kerberos** ou NTLM :
- **Avantages majeurs** : Aucun mot de passe n'est stocké dans SQL Server. L'utilisateur bénéficie d'un mécanisme de connexion unique (*Single Sign-On - SSO*). Les politiques de sécurité globales de l'entreprise (longueur de mot de passe, complexité, expiration tous les 60 jours, verrouillage après 3 échecs) s'appliquent automatiquement.
- *Syntaxe T-SQL* :
  ```sql
  -- Création d'un login Windows s'appuyant sur l'annuaire d'entreprise
  CREATE LOGIN [SDS\ousmane.fall] FROM WINDOWS;
  GO
  ```

### 3.2 Le Mode Mixte (Windows et SQL Server Authentication)
SQL Server valide lui-même le couple identifiant/mot de passe stocké de manière hachée dans la base système `master` (`sys.sql_logins`) :
- **Usage en entreprise** : Indispensable lorsque des applications multiplateformes (applications conteneurisées Linux, microservices Django/Symfony, serveurs web externes) doivent se connecter sans compte Active Directory.
- **Activer le mode mixte sur une instance existante** :
  1. Dans SSMS, clic droit sur l'instance `SQLPROD01` > **Propriétés** > Page **Sécurité** ;
  2. Sous *Authentification du serveur*, cocher **Mode d'authentification SQL Server et Windows** ;
  3. Clic sur OK, puis **redémarrer obligatoirement le service Windows MSSQLSERVER**.

---

# 4. Cycle de Vie des Logins et Protection du Compte `sa`

### 4.1 Création et Gestion de Logins SQL (TP 3.1)
Pour chaque profil d'employé de SDS, le mot de passe doit respecter la politique de sécurité du système :

```sql
USE master;
GO

-- 1. Login du responsable comptable (Aziz)
CREATE LOGIN aziz_comptable 
WITH PASSWORD = N'C0mpt@ble_2026!SDS',
     CHECK_POLICY = ON,      -- Impose la complexité Windows
     CHECK_EXPIRATION = ON,  -- Force le renouvellement périodique
     DEFAULT_DATABASE = [SDS_Ventes];
GO

-- 2. Login de la commerciale (Fatou)
CREATE LOGIN fatou_commercial 
WITH PASSWORD = N'C0mmerc!al_2026#SDS',
     CHECK_POLICY = ON,
     CHECK_EXPIRATION = ON,
     DEFAULT_DATABASE = [SDS_Ventes];
GO

-- 3. Login applicatif pour le logiciel de facturation
CREATE LOGIN app_sds 
WITH PASSWORD = N'ApplicSDS#SecretKey2026!',
     CHECK_POLICY = ON,
     CHECK_EXPIRATION = OFF, -- Compte de service : pas d'expiration inopinée en pleine nuit
     DEFAULT_DATABASE = [SDS_Ventes];
GO
```

### 4.2 Maintenance et Désactivation Temporaire
Quand un collaborateur ou un prestataire quitte temporairement l'entreprise, il ne faut **jamais supprimer son login** immédiatement (cela briserait la propriété des objets créés) :

```sql
-- Désactivation temporaire (l'accès est immédiatement coupé)
ALTER LOGIN fatou_commercial DISABLE;
GO

-- Réactivation au retour de mission
ALTER LOGIN fatou_commercial ENABLE;
GO

-- Forcer le changement de mot de passe à la prochaine connexion
ALTER LOGIN aziz_comptable WITH MUST_CHANGE, CHECK_EXPIRATION = ON;
GO
```

### 4.3 Sécurisation du Compte `sa` (*System Administrator*)
Le compte `sa` est le superadministrateur historique de SQL Server. Parce que son nom est universellement connu des cyberattaquants, il fait l'objet d'attaques par force brute incessantes.
- **Règles de durcissement professionnelles** :
  1. Attribuer à `sa` un mot de passe aléatoire ultra-complexe de plus de 30 caractères.
  2. Renommer le compte `sa` pour déjouer les robots de scan automatisés.
  3. Désactiver formellement le compte `sa`.

```sql
USE master;
GO

-- Renommage et désactivation du compte sa
ALTER LOGIN sa WITH NAME = [sds_admin_desactive];
ALTER LOGIN [sds_admin_desactive] DISABLE;
GO
```

---

# 5. Du Login à l'Utilisateur de Base (Database User)

> [!IMPORTANT]
> **La Règle d'Or à retenir impérativement :**
> - Un **Login** existe au niveau de l'**Instance** : il permet uniquement de s'authentifier et de franchir le réseau.
> - Un **Utilisateur (*Database User*)** existe au niveau d'une **Base de Données** précise : il permet d'y entrer et d'y exécuter des actions.
> - Un login sans utilisateur associé peut se connecter à SQL Server mais ne peut accéder à aucune base utilisateur (il reçoit un refus immédiat).

### Mappage par le SID (Security Identifier)
La liaison entre le Login et l'Utilisateur ne se fait **pas par le nom**, mais par un identifiant binaire unique universel : le **SID** (*Security Identifier*).

```sql
USE SDS_Ventes;
GO

-- Création des utilisateurs dans la base SDS_Ventes rattachés à leurs logins d'instance
CREATE USER aziz_comptable FOR LOGIN aziz_comptable;
CREATE USER fatou_commercial FOR LOGIN fatou_commercial;
CREATE USER app_sds FOR LOGIN app_sds;
GO
```

### 5.1 Sécurisation du Compte `guest`
Dans chaque base de données SQL Server réside un utilisateur spécial nommé **`guest`**.
- *Le Danger* : Si le compte `guest` possède le droit `CONNECT`, n'importe quel login valide de l'instance qui n'a pas d'utilisateur propre dans la base peut y entrer sous l'identité de l'invité !
- *Mesure de protection impérative* :
  ```sql
  USE SDS_Ventes;
  GO
  REVOKE CONNECT FROM guest;
  GO
  ```

---

# 6. Bases Partiellement Contenues (*Partially Contained Databases*)

Dans une architecture multi-agences ou cloud, la dépendance d'une base envers les logins de l'instance `master` complique les migrations de serveurs.

SQL Server permet de configurer une base en **contenance partielle** (`CONTAINMENT = PARTIAL`). Elle autorise la création d'**utilisateurs autonomes (*contained database users*)** avec mot de passe stocké directement au sein de la base de données utilisateur :

```sql
USE master;
GO
-- 1. Autoriser l'instance à héberger des bases contenues
EXEC sp_configure 'contained database authentication', 1;
RECONFIGURE;
GO

-- 2. Activer la contenance partielle sur l'agence régionale SDS_Agence3
ALTER DATABASE SDS_Agence3 SET CONTAINMENT = PARTIAL;
GO

USE SDS_Agence3;
GO

-- 3. Création d'un utilisateur autonome SANS aucun login dans master !
CREATE USER caissier_agence3 WITH PASSWORD = N'Cais$ierAgence3_2026!';
GO
```
*Bénéfice absolu* : Vous pouvez sauvegarder `SDS_Agence3` et la restaurer sur n'importe quel autre serveur SQL Server : l'utilisateur `caissier_agence3` pourra immédiatement se connecter sans aucune recréation de login !

---

# 7. Diagnostiquer et Corriger les Utilisateurs Orphelins (*Orphaned Users*)

Un utilisateur devient **orphelin** lorsque son compte existe dans la base de données, mais que son `SID` ne correspond à aucun `SID` de login sur l'instance locale.

### Comment Apparaît un Utilisateur Orphelin ?
1. Vous sauvegardez `SDS_Ventes` sur le serveur de production `SRV-SQL01`.
2. Vous restaurez la base sur le serveur de secours de Thiès (`SRV-SQL02`).
3. Même si vous avez créé un login `app_sds` sur les deux serveurs, **leurs SIDs générés aléatoirement sont différents** ! L'utilisateur de la base restaurée pointe sur l'ancien SID de Dakar et se retrouve orphelin : l'application ne peut plus se connecter.

```mermaid
graph TD
    subgraph Instance_SQL ["Instance SQL (master)"]
        Login["Login: app_sds (SID: 0x01A4B8...)"]
    end
    subgraph Base_Restauree ["Base SDS_Ventes Restaurée"]
        User["User: app_sds (SID: 0x99FF33...)"]
    end
    Login -.->|SID Incompatible !| User
    Note over Login,User: ÉCHEC : Utilisateur Orphelin (Connexion refusée)
```

### 7.1 Détection des Utilisateurs Orphelins
```sql
USE SDS_Ventes;
GO

-- Requête moderne comparant les SIDs de la base et de l'instance
SELECT 
    dp.name AS [UtilisateurOrphelin],
    dp.type_desc AS [TypeUtilisateur],
    dp.sid AS [SID_DansLaBase]
FROM sys.database_principals dp
LEFT JOIN sys.server_principals sp ON dp.sid = sp.sid
WHERE dp.type IN ('S', 'U', 'G') -- SQL, Windows User, Windows Group
  AND dp.authentication_type <> 2 -- Exclut les utilisateurs autonomes
  AND sp.sid IS NULL
  AND dp.name NOT IN ('guest', 'INFORMATION_SCHEMA', 'sys');
GO
```

### 7.2 Correction Chirurgicale Moderne
Pour réassocier l'utilisateur orphelin au login existant portant le même nom sur la nouvelle instance :

```sql
USE SDS_Ventes;
GO

-- Rapprochement officiel recommandé par Microsoft
ALTER USER app_sds WITH LOGIN = app_sds;
ALTER USER fatou_commercial WITH LOGIN = fatou_commercial;
GO
```

---

# 8. Exercices Pratiques et Auto-Évaluation

1. **Décrivez chronologiquement ce qui se passe entre le moment où un comptable clique sur « Se connecter » dans SSMS et celui où la requête `SELECT * FROM Finance.Factures` lui renvoie des données.**
2. **Quelle est la différence fondamentale entre désactiver un login (`ALTER LOGIN ... DISABLE`) et le supprimer (`DROP LOGIN`) ?**
3. **Pourquoi est-il impossible de créer un utilisateur orphelin au sein d'une base de données partiellement contenue ?**
