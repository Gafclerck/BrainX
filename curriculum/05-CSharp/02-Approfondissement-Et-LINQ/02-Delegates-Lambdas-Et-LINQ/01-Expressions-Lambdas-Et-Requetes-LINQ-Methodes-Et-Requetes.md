---
title: "Délégués, Expressions Lambdas et LINQ (Language Integrated Query)"
description: "Révolution de la manipulation de données en C# : Action, Func, prédicats, syntaxe des lambdas (=>), évaluation différée (Deferred Execution) et requêtes LINQ (Method vs Query syntax)."
order: 1
duration: 90
level: "Intermediate"
---

# Délégués, Expressions Lambdas et LINQ (Language Integrated Query)

**LINQ** (*Language Integrated Query*) est l'une des innovations majeures du langage C#. Il unifie l'interrogation de sources de données disparates (collections en mémoire, documents XML, tables relationnelles de bases de données avec EF Core) au sein d'une même syntaxe typée et vérifiée dès la compilation.

---

## 1. Délégués et Expressions Lambdas

Un **délégué** est un pointeur de fonction managé et sécurisé. Le framework .NET fournit deux types génériques universels :
- **`Action<T1, T2>`** : Pointeur vers une méthode qui retourne `void`.
- **`Func<T1, T2, TResult>`** : Pointeur vers une méthode dont le dernier type générique est le type de retour.
- **`Predicate<T>`** : Équivalent de `Func<T, bool>` (retourne un booléen pour les tests).

L'opérateur lambda **`=>`** (*arrow operator*) permet d'écrire des fonctions anonymes ultra-concises :

```csharp
// Délégué Func prenant un entier et retournant un booléen
Func<int, bool> estPair = n => n % 2 == 0;
Console.WriteLine(estPair(42)); // True

// Délégué Action prenant une chaîne et ne retournant rien
Action<string> journaliser = msg => Console.WriteLine($"[AUDIT {DateTime.Now:HH:mm:ss}] {msg}");
journaliser("Accès utilisateur autorisé.");
```

---

## 2. LINQ : Method Syntax vs Query Syntax

LINQ propose deux syntaxes interchangeables :
1. **Method Syntax (Fluent)** : Utilise des méthodes d'extension de `System.Linq.Enumerable` enchaînées avec des expressions lambdas. C'est la syntaxe la plus populaire en entreprise.
2. **Query Syntax (SQL-like)** : Proche de la syntaxe déclarative SQL (`from ... where ... select`).

```csharp
// Source de données
var nombres = new List<int> { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 };

// 1. Method Syntax (Fluent API)
var pairsAuCarre1 = nombres
    .Where(n => n % 2 == 0)
    .Select(n => n * n)
    .ToList();

// 2. Query Syntax
var pairsAuCarre2 = (from n in nombres
                     where n % 2 == 0
                     select n * n).ToList();
```

---

## 3. L'Évaluation Différée (*Deferred Execution*)

Un concept fondamental de LINQ est que les requêtes construites sur `IEnumerable<T>` ne s'exécutent **pas** au moment où elles sont définies, mais au moment précis où vous **itérer** sur le résultat (avec un `foreach`, ou en forçant l'évaluation avec `.ToList()`, `.ToArray()`, `.Count()`).

```csharp
var liste = new List<int> { 1, 2, 3 };

// La requête n'est pas encore exécutée ici !
var requete = liste.Where(x => x > 1);

// Modification de la liste après création de la requête :
liste.Add(10);

// Exécution réelle lors du foreach :
foreach (var item in requete)
{
    Console.WriteLine(item); // Affiche 2, 3 ET 10 !
}
```

---

## 4. Pipeline LINQ Complexe : Analyse Financière et Statistiques

```csharp
using System;
using System.Collections.Generic;
using System.Linq;

namespace BrainX.Analytics;

public record Transaction(string Reference, string Client, string Pays, decimal Montant, DateTime Date);

public class AnalyseurTransactions
{
    public static void Main()
    {
        var transactions = new List<Transaction>
        {
            new("TX-101", "Orange SN", "Sénégal", 450000m, new DateTime(2026, 11, 01)),
            new("TX-102", "TotalEnergies", "France", 1200000m, new DateTime(2026, 11, 02)),
            new("TX-103", "Wave CI", "Côte d'Ivoire", 890000m, new DateTime(2026, 11, 03)),
            new("TX-104", "Sonatel", "Sénégal", 340000m, new DateTime(2026, 11, 04)),
            new("TX-105", "Société Générale", "France", 2300000m, new DateTime(2026, 11, 05)),
            new("TX-106", "Free SN", "Sénégal", 210000m, new DateTime(2026, 11, 06))
        };

        Console.WriteLine("=== 1. Agrégations & Filtres ===");
        decimal volumeTotal = transactions.Sum(t => t.Montant);
        decimal panierMoyen = transactions.Average(t => t.Montant);
        Console.WriteLine($"Volume d'affaires global : {volumeTotal:N0} FCFA");
        Console.WriteLine($"Panier moyen : {panierMoyen:N0} FCFA");

        Console.WriteLine("
=== 2. Groupement par Pays (GroupBy) ===");
        var statsParPays = transactions
            .GroupBy(t => t.Pays)
            .Select(groupe => new
            {
                Pays = groupe.Key,
                NombreTransactions = groupe.Count(),
                TotalVolume = groupe.Sum(t => t.Montant),
                PlusGrosMontant = groupe.Max(t => t.Montant)
            })
            .OrderByDescending(stat => stat.TotalVolume);

        foreach (var stat in statsParPays)
        {
            Console.WriteLine($"Pays: {stat.Pays,-15} | {stat.NombreTransactions} tx | Total: {stat.TotalVolume,12:N0} FCFA | Record: {stat.PlusGrosMontant,10:N0} FCFA");
        }

        Console.WriteLine("
=== 3. Top 3 des transactions les plus élevées ===");
        var top3 = transactions
            .OrderByDescending(t => t.Montant)
            .Take(3);

        foreach (var t in top3)
        {
            Console.WriteLine($"[{t.Reference}] {t.Client,-20} : {t.Montant:N0} FCFA");
        }
    }
}
```
