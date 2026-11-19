---
title: "Programmation Transact-SQL, Vues Indexées, Procédures Stockées et Déclencheurs"
teacher: "Mr MODOU KARA SAMB"
course_date: "2026-10-08"
description: "Maîtrise des extensions procédurales Transact-SQL, encapsulation métier dans les procédures stockées transactionnelles avec TRY...CATCH, optimisation par vues indexées et automatisation d'audit avec les déclencheurs DML."
keywords: "SQL Server, Transact-SQL, T-SQL, Vues Indexées, Procédures Stockées, Triggers, DML, Transactions, TRY CATCH, Schemabinding, Output"
is_published: true
resources:
  - type: external_link
    title: "Documentation Microsoft Learn - Programmabilité T-SQL"
    url: "https://learn.microsoft.com/fr-fr/sql/t-sql/language-elements/transact-sql-syntax-conventions-transact-sql"
    note: "Référence syntaxique officielle du langage Transact-SQL de Microsoft SQL Server."
---

# 1. Le Langage Transact-SQL (T-SQL) en Entreprise

Le langage standard ANSI SQL est principalement déclaratif : il permet de spécifier *quelles* données l'on souhaite extraire ou modifier, sans préciser *comment* y parvenir. 

Pour répondre aux exigences des applications d'entreprise comme celles de **SENEGAL DISTRIBUTION SA (SDS)**, Microsoft enrichit la norme avec **Transact-SQL (T-SQL)**. Cette extension propriétaire ajoute des capacités impératives complètes : variables locales, structures conditionnelles, boucles, gestion robuste des exceptions et manipulation fine des transactions.

### 1.1 Panorama des Familles d'Instructions SQL
Toute interaction avec SQL Server relève de l'une des quatre grandes familles :
1. **DDL (*Data Definition Language*)** : Définit la structure des objets de la base (`CREATE`, `ALTER`, `DROP`, `TRUNCATE`).
2. **DML (*Data Manipulation Language*)** : Manipule les données contenues dans les tables (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `MERGE`).
3. **DCL (*Data Control Language*)** : Gère la sécurité et les autorisations (`GRANT`, `DENY`, `REVOKE`).
4. **TCL (*Transaction Control Language*)** : Pilote les unités logiques de travail atomiques (`BEGIN TRANSACTION`, `COMMIT TRANSACTION`, `ROLLBACK TRANSACTION`, `SAVE TRANSACTION`).

---

# 2. Les Vues : Abstraction, Sécurité et Vues Indexées

Une vue est une requête `SELECT` nommée et enregistrée dans le dictionnaire système de la base de données. Contrairement à une table, une vue standard ne stocke aucune donnée physique : chaque interrogation déclenche dynamiquement la requête sous-jacente.

### 2.1 Les Trois Rôles Stratégiques d'une Vue
- **Sécurisation des accès** : Exposer uniquement les colonnes non confidentielles aux utilisateurs sans leur accorder de droits directs sur les tables sous-jacentes.
- **Simplification sémantique** : Masquer la complexité des jointures multiples pour les outils de reporting (Power BI, Excel).
- **Stabilité de l'API de données** : Maintenir la signature des colonnes pour les applications clientes même si la structure physique des tables évolue.

```sql
USE SDS_Ventes;
GO

-- Vue pour l'équipe commerciale masquant les informations financières sensibles
CREATE OR ALTER VIEW Ventes.v_SyntheseCommandesEnCours
AS
SELECT 
    c.CommandeID,
    cl.RaisonSociale AS Client,
    cl.Ville,
    c.DateCommande,
    c.Statut,
    COUNT(lc.ArticleID) AS NombreArticlesDistincts,
    SUM(lc.QuantiteCommandee) AS QuantiteTotale
FROM Ventes.Commandes c
JOIN Ventes.Clients cl ON c.ClientID = cl.ClientID
LEFT JOIN Ventes.LignesCommande lc ON c.CommandeID = lc.CommandeID
WHERE c.Statut <> N'ANNULEE'
GROUP BY c.CommandeID, cl.RaisonSociale, cl.Ville, c.DateCommande, c.Statut;
GO
```

### 2.2 Les Vues Indexées (*Indexed Views / Materialized Views*)
Dans une base à forte volumétrie (comme les 180 Go de SDS), recalculer des agrégations sur des millions de lignes dégrade le processeur. SQL Server permet de **matérialiser physiquement** le résultat d'une vue sur disque en lui adjoignant un **index clusterisé unique**.

> 📘 **[Complément d'architecture & Bonnes pratiques]**
> Pour créer une vue indexée, deux conditions sont strictes :
> 1. La vue doit être créée avec l'option `WITH SCHEMABINDING` (ce qui fige la structure des tables sources et interdit tout `ALTER TABLE` destructeur).
> 2. Tous les noms de tables doivent être préfixés par leur schéma (`dbo.`, `Ventes.`).
> 3. Si la vue comporte un `GROUP BY`, elle doit obligatoirement inclure `COUNT_BIG(*)` dans sa clause `SELECT`.

```sql
-- Création d'une vue indexée pour accélérer le tableau de bord des directeurs régionaux
CREATE OR ALTER VIEW Ventes.v_ChiffreAffairesParVille
WITH SCHEMABINDING
AS
SELECT 
    cl.Ville,
    COUNT_BIG(*) AS NombreLignesFactures,
    SUM(ISNULL(f.MontantTTC, 0)) AS ChiffreAffairesTotalTTC
FROM Finance.Factures f
JOIN Ventes.Commandes c ON f.CommandeID = c.CommandeID
JOIN Ventes.Clients cl ON c.ClientID = cl.ClientID
WHERE f.Statut = N'REGLEE'
GROUP BY cl.Ville;
GO

-- Matérialisation physique de la vue via son index clusterisé unique
CREATE UNIQUE CLUSTERED INDEX IX_v_ChiffreAffairesParVille_Ville
ON Ventes.v_ChiffreAffairesParVille (Ville);
GO
```

---

# 3. Les Procédures Stockées d'Entreprise

Une procédure stockée est un module T-SQL précompilé et conservé dans le cache d'exécution de SQL Server.

### 3.1 Avantages Industriels
1. **Performances accrues** : Le plan d'exécution optimisé est mis en cache mémoire (*Plan Cache*) dès la première exécution, évitant les étapes coûteuses de compilation ultérieure.
2. **Sécurité par cloisonnement** : Le modèle du moindre privilège repose sur les procédures stockées. Comme nous le verrons dans les modules de sécurité, les utilisateurs applicatifs ne reçoivent **aucun droit direct sur les tables**, mais uniquement `GRANT EXECUTE` sur la procédure stockée.
3. **Protection contre l'Injection SQL** : Le passage de paramètres typés élimine nativement tout risque de concaténation malveillante.

### 3.2 Script Complet : Procédure de Facturation Transactionnelle
Ce script illustre une transaction financière robuste pour SDS, avec gestion des erreurs via `TRY...CATCH` et validation des stocks :

```sql
USE SDS_Ventes;
GO

CREATE OR ALTER PROCEDURE Finance.usp_GenererFactureCommande
    @CommandeID INT,
    @NouvelleFactureID INT OUTPUT,
    @MontantFactureTTC DECIMAL(14, 0) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON; -- Déclenche un rollback automatique en cas d'erreur de transaction sévère

    DECLARE @ClientID INT;
    DECLARE @StatutCommande NVARCHAR(20);
    DECLARE @SousTotalHT DECIMAL(14, 2);
    DECLARE @TauxTVA DECIMAL(5, 2) = 0.18; -- TVA légale 18% au Sénégal / zone UEMOA

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Vérification de l'existence et du statut de la commande
        SELECT 
            @ClientID = ClientID,
            @StatutCommande = Statut
        FROM Ventes.Commandes WITH (UPDLOCK, HOLDLOCK) -- Verrou de mise à jour pour éviter les courses concurrentes
        WHERE CommandeID = @CommandeID;

        IF @ClientID IS NULL
        BEGIN
            THROW 50001, N'Erreur : La commande spécifiée est introuvable.', 1;
        END;

        IF @StatutCommande = N'FACTUREE'
        BEGIN
            THROW 50002, N'Erreur : Cette commande a déjà été facturée précédemment.', 1;
        END;

        -- 2. Calcul du montant total HT à partir des lignes de commande
        SELECT 
            @SousTotalHT = SUM(QuantiteCommandee * PrixUnitaireFacture * (1.0 - TauxRemise / 100.0))
        FROM Ventes.LignesCommande
        WHERE CommandeID = @CommandeID;

        IF @SousTotalHT IS NULL OR @SousTotalHT <= 0
        BEGIN
            THROW 50003, N'Erreur : Impossible de facturer une commande vide ou sans montant positif.', 1;
        END;

        -- 3. Application de la TVA et arrondi monétaire FCFA (entier sans centimes)
        SET @MontantFactureTTC = ROUND(@SousTotalHT * (1.0 + @TauxTVA), 0);

        -- 4. Insertion de la facture dans le schéma Finance
        INSERT INTO Finance.Factures (CommandeID, MontantTTC, DateEmission, Statut)
        VALUES (@CommandeID, @MontantFactureTTC, SYSDATETIME(), N'EMISE');

        SET @NouvelleFactureID = SCOPE_IDENTITY();

        -- 5. Mise à jour de l'état de la commande
        UPDATE Ventes.Commandes
        SET Statut = N'FACTUREE',
            MontantTotalFCFA = @MontantFactureTTC
        WHERE CommandeID = @CommandeID;

        -- Validation de l'ensemble des opérations
        COMMIT TRANSACTION;

        PRINT CONCAT(N'Succès : Facture N° ', @NouvelleFactureID, N' émise pour un montant de ', @MontantFactureTTC, N' FCFA.');
    END TRY
    BEGIN CATCH
        -- Annulation de la transaction si elle est encore active
        IF XACT_STATE() <> 0
        BEGIN
            ROLLBACK TRANSACTION;
        END;

        -- Capture et propagation du diagnostic d'erreur
        DECLARE @ErrorMsg NVARCHAR(2048) = ERROR_MESSAGE();
        DECLARE @ErrorNum INT = ERROR_NUMBER();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();

        RAISERROR(N'Échec de facturation [Erreur %d] : %s', @ErrorSeverity, @ErrorState, @ErrorNum, @ErrorMsg);
    END CATCH;
END;
GO
```

---

# 4. Les Déclencheurs DML (*Triggers*)

Un déclencheur DML est un bloc de code T-SQL qui s'exécute **automatiquement** en réaction à un événement de modification de données (`INSERT`, `UPDATE`, `DELETE`) sur une table cible.

### 4.1 Tables Virtuelles en Mémoire : `inserted` et `deleted`
Durant l'exécution du déclencheur, SQL Server instancie en mémoire deux tables de transition reflétant l'état des lignes :
- **`inserted`** : Contient les nouvelles lignes ajoutées par `INSERT` ou les nouvelles valeurs après `UPDATE`.
- **`deleted`** : Contient les anciennes lignes supprimées par `DELETE` ou les anciennes valeurs avant `UPDATE`.

```
Instruction      Table 'deleted'               Table 'inserted'
------------     ------------------------      ------------------------
INSERT           (Vide)                        Nouvelles lignes créées
DELETE           Lignes qui vont être ôtées   (Vide)
UPDATE           Anciennes valeurs (avant)     Nouvelles valeurs (après)
```

### 4.2 Script : Déclencheur d'Audit des Annulations de Factures
Pour satisfaire les auditeurs de la **Commission de Protection des Données Personnelles (CDP)** et la direction financière de SDS, toute modification ou annulation d'une facture doit être tracée sans exception :

```sql
USE SDS_Ventes;
GO

-- Table d'historique immuable
CREATE TABLE Finance.AuditFactures (
    AuditID BIGINT IDENTITY(1,1) PRIMARY KEY,
    FactureID INT NOT NULL,
    AncienStatut NVARCHAR(15) NOT NULL,
    NouveauStatut NVARCHAR(15) NOT NULL,
    AncienMontant DECIMAL(14,0) NOT NULL,
    NouveauMontant DECIMAL(14,0) NOT NULL,
    DateModification DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
    Operateur NVARCHAR(128) NOT NULL DEFAULT SUSER_SNAME(),
    ApplicationSource NVARCHAR(128) NOT NULL DEFAULT APP_NAME()
);
GO

-- Déclencheur AFTER UPDATE sur les factures
CREATE OR ALTER TRIGGER Finance.trg_AuditFactures_Update
ON Finance.Factures
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- Vérifier si les colonnes critiques (Statut ou MontantTTC) ont été modifiées
    IF UPDATE(Statut) OR UPDATE(MontantTTC)
    BEGIN
        INSERT INTO Finance.AuditFactures (
            FactureID,
            AncienStatut,
            NouveauStatut,
            AncienMontant,
            NouveauMontant
        )
        SELECT 
            d.FactureID,
            d.Statut AS AncienStatut,
            i.Statut AS NouveauStatut,
            d.MontantTTC AS AncienMontant,
            i.MontantTTC AS NouveauMontant
        FROM deleted d
        JOIN inserted i ON d.FactureID = i.FactureID
        WHERE d.Statut <> i.Statut 
           OR d.MontantTTC <> i.MontantTTC;
    END;
END;
GO
```

> ⚠️ **[Mise en garde & Pièges fréquents]**
> Les déclencheurs s'exécutent **au sein de la transaction qui a provoqué l'événement**. Si un trigger lève une exception ou exécute un `ROLLBACK`, toute l'opération parente est annulée. Par conséquent :
> 1. Ne placez jamais de traitements longs, d'appels réseau lents ou d'envois d'e-mails synchrones dans un trigger.
> 2. Écrivez toujours des triggers **ensemblistes** capables de gérer des instructions multi-lignes (`INSERT INTO ... SELECT`), sans jamais présumer qu'une seule ligne est modifiée à la fois.

---

# 5. Exercices Pratiques et Auto-Évaluation

### Question 1 : Procédures vs Fonctions
Quelle est la différence fondamentale entre une Procédure Stockée et une Fonction Définie par l'Utilisateur (UDF) sous SQL Server en matière de gestion des transactions et de modifications des données (`INSERT`/`UPDATE`) ?

### Question 2 : Vues Indexées
Pourquoi est-il interdit d'utiliser des fonctions non déterministes (telles que `GETDATE()`, `RAND()` ou `NEWID()`) dans la définition d'une vue indexée avec `SCHEMABINDING` ?

### Exercice Pratique
Rédigez le script d'un déclencheur `AFTER INSERT` sur la table `Ventes.LignesCommande` qui met automatiquement à jour la colonne `StockDisponible` de la table `Ventes.Articles` en soustrayant la quantité commandée, et qui lève une exception si le stock résultant devenait strictement négatif.
