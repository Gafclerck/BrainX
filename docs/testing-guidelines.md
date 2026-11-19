# Guide d'Ingénierie & Post-Mortem : Optimisation des Suites de Tests BrainX

Ce document synthétise le retour d'expérience, les causes racines de l'engorgement initial de la suite de tests (22m 46s pour ~1 100 tests), les leçons d'ingénierie logicielle tirées, ainsi que les règles d'or à appliquer rigoureusement pour maintenir des tests rapides, fiables et maintenables.

---

## 1. Post-Mortem : Pourquoi la suite de tests prenait-elle 22 minutes ?

Lors du diagnostic initial de la plateforme BrainX, l'exécution complète des tests backend nécessitait **22 minutes et 46 secondes** (1 366 secondes) pour 1 168 tests. Après application du plan d'optimisation par étapes (Epics 1 à 4), la suite passe à **47,95 secondes pour 1 119 tests** (**accélération de ~28,5x**, soit plus de 21 minutes économisées par cycle).

### Les 5 causes racines de l'engorgement :

```
                  ┌────────────────────────────────────────────────────────┐
                  │   Goulot d'Étranglement : 22m 46s pour 1 168 tests     │
                  └──────────────────────────┬─────────────────────────────┘
                                             │
      ┌──────────────────────┬───────────────┴──────────────┬──────────────────────┐
      ▼                      ▼                              ▼                      ▼
1. Hashing PBKDF2      2. setUp vs setUpTestData      3. Régénération        4. Fichiers & Tests
(720 000 itérations)   (Re-création SQL complète      OpenAPI systématique   dupliqués
x 1 500 hashes         par méthode de test)           (36x le schéma entier) (Browse/Search/AST)
~12 min perdues        ~7 min perdues                 ~35s perdues           ~3 min perdues
```

### Détail des causes :

1. **Le Hasher de Mot de Passe par Défaut (PBKDF2 SHA-256)** :
   - *Problème* : Par défaut, Django applique 720 000 itérations de hashing PBKDF2 pour des raisons de sécurité en production. Lors de l'exécution des tests, chaque création d'utilisateur (`User.objects.create_user`) déclenchait ce calcul lourd de CPU. Avec plus de 1 500 utilisateurs instanciés au fil des tests, le CPU passait ~12 minutes uniquement à calculer des hashes de mots de passe.
   - *Solution* : Définir `PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]` dans `config.settings.test`. Un hash MD5 prend moins de 0.05ms en test.

2. **L'usage systématique de `setUp(self)` au lieu de `@classmethod setUpTestData(cls)`** :
   - *Problème* : Dans Django `TestCase`, tout ce qui est dans `setUp()` est ré-exécuté *avant chaque méthode de test* avec de vraies requêtes `INSERT` dans la base de données. Des classes de 15 tests ré-inséraient 15 fois la même arborescence (Cours → Modules → Chapitres → Leçons → Utilisateurs), générant des dizaines de milliers d'écritures SQL inutiles.
   - *Solution* : Déplacer les créations d'arborescences statiques dans `@classmethod setUpTestData(cls)`. Les données sont créées **une seule fois par classe**, puis chaque test s'exécute dans une transaction atomique avec rollback instantané.

3. **La Régénération Répétée du Schéma OpenAPI (`drf-spectacular`)** :
   - *Problème* : Plusieurs classes de tests inspectaient le schéma OpenAPI en instanciant `SchemaGenerator().get_schema()` dans leur `setUp()` ou dans chaque méthode de test. Chaque génération parcourait toutes les routes, tous les serializers et tous les filtres (~1s par exécution x 36 = ~35 secondes).
   - *Solution* : Un fichier unique dédié `apps/core/tests/test_openapi_schema.py` génère le schéma **une seule fois** en mémoire (`setUpClass`) et valide l'exhaustivité de l'ensemble des endpoints en **0,126 seconde**.

4. **Duplication de Fichiers de Tests "Jumeaux" (Public vs Authentifié)** :
   - *Problème* : Les suites `test_browse.py` / `test_browse_public.py`, `test_resources.py` / `test_resources_public.py`, et `test_search.py` / `test_search_public.py` dupliquaient 1 000 lignes de code et des dizaines de tests quasi-identiques avec pour seule différence l'omission du token `Authorization`.
   - *Solution* : Fusionner les tests dans un fichier unique, réutiliser les fixtures existantes de la classe mère, et éliminer le code mort.

5. **Anti-patterns : Tests AST de Fichiers Python et Redondances de Privilèges** :
   - *Problème* : Des tests parcouraient le système de fichiers pour lire et parser du code Python (`ast.parse`) pour vérifier si une fonction ou un queryset était appelé. Ces tests étaient fragiles, lents et non-idiomatiques pour des tests unitaires ou d'API.
   - *Solution* : Supprimer les scans AST au profit d'assertions sur l'API ou d'inspection directe des méthodes via `hasattr` / `__dict__`.

---

## 2. Les Règles d'Or du Développeur BrainX

### Règle 1 : Paramétrage Rapide Obligatoire en Test (`config.settings.test`)
Ne testez jamais avec les réglages de production pour le cache, le stockage ou les mots de passe.
```python
# config/settings/test.py
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "staticfiles": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
}
```

### Règle 2 : Préférer `setUpTestData` à `setUp`
- Si la donnée de test n'est pas modifiée en profondeur par le test : **toujours utiliser `setUpTestData(cls)`**.
- Ne réserver `setUp(self)` qu'à l'initialisation de mocks ou de l'état du client (`self.client.force_authenticate`).

```python
class LessonEndpointTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="student", password="pw")
        cls.course = Course.objects.create(name="Maths", code="MATH101")
        # Créé 1 seule fois pour toute la classe !
```

### Règle 3 : `SimpleTestCase` pour tout test sans base de données
Tout test validant un helper pur, une conversion de date, un modèle en mémoire, un regex ou un validateur de schéma doit hériter de `SimpleTestCase`.
- **Zéro connexion à la base de données**.
- **Zéro transaction**.
- **Exécution en quelques millisecondes**.

### Règle 4 : Centralisation des Helpers d'Assertion (DRY)
Ne jamais redéfinir localement une fonction d'assertion d'enveloppe ou de contrat.
- Utiliser : `from apps.core.tests.helpers import assert_envelope, ENVELOPE_KEYS`

### Règle 5 : Tests d'Autorisation Déclaratifs (Matrices de Sécurité)
Plutôt que d'écrire 50 tests `test_anonymous_gets_401` dans chaque fichier :
- Regrouper les tests de sécurité dans une matrice déclarative (voir `apps/content/tests/test_authorization_matrix.py`).
- Tester les codes HTTP (401 vs 403 vs 200) sous forme de boucle de cas ou de paramètres.

### Règle 6 : Frontend (`brainx-web`) - Helpers Partagés & Fixtures
- Utiliser `renderWithProviders` (`src/test/test-utils.tsx`) pour éviter de re-wrapper manuellement avec `<MemoryRouter>` et configurer le store d'authentification.
- Utiliser `createMockResponse` pour éviter de reconstruire des objets `Response` / `Headers` verbeux.
- Importer les fixtures standardisées depuis `src/test/fixtures`.

---

## 3. Garde-fous CI et Budget de Performance

Dans le workflow GitHub Actions (`.github/workflows/ci.yml`) :
- **Budget Backend** : Timeout fixé à 4 minutes (`timeout-minutes: 4`). Tout run dépassant 2m30s en conditions normales doit être investigué.
- **Budget Frontend** : Timeout fixé à 5 minutes (`timeout-minutes: 5`).
- **Commande locale recommandée** :
  ```bash
  # Backend (rapide avec réutilisation du schéma de test)
  python manage.py test --keepdb

  # Frontend
  npm test
  ```

---

## 4. Tableau Récapitulatif : Avant vs Après

| Dimension | Avant Optimisation | Après Optimisation | Gain / Impact |
| :--- | :--- | :--- | :--- |
| **Temps Backend** | **22 min 46 sec** (1 366 s) | **47,95 sec** | **Accélération de 28,5x** |
| **Temps Économisé** | 0 | **~22 minutes par run** | Développeurs & CI débloqués |
| **Nombre de Tests** | 1 168 tests | 1 119 tests pertinents | -49 doublons/inutiles |
| **Qualité & Couverture**| 100% passants | 100% passants | Zéro régression fonctionnelle |
| **Hashing CPU** | PBKDF2 (720k iter) | MD5 | CPU instantané |
| **OpenAPI Overhead** | 35 secondes | 0,126 seconde | -99,6% de temps perdu |
| **I/O Fichiers Disque**| Écritures temporaires réelles | `InMemoryStorage` | Zéro résidu sur disque |
