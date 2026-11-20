# Guide d'Exploitation : Création et Gestion du Premier Administrateur en Production

Ce guide détaille la procédure opérationnelle standard pour créer ou promouvoir le premier compte administrateur / éditeur (Publisher) sur la plateforme **BrainX** en environnement de production.

---

## 1. Contexte d'Architecture & Sécurité

Dans l'architecture de BrainX, un compte administrateur complet nécessite plusieurs niveaux d'autorisation :
- **Authentification par Email** : L'adresse email est normalisée en minuscules (`UserManager.normalize_email`).
- **`is_active = True`** : Le compte est actif.
- **`is_email_verified = True`** : Obligatoire pour accéder aux endpoints utilisateurs protégés (ex: `/api/v1/me/`, téléchargement des ressources de cours).
- **`is_publisher = True`** (AD-9) : Attribue le privilège d'Éditeur. Déverrouille l'Espace Éditeur sur le frontend (`/publisher/dashboard`) et donne le droit d'écrire/modifier des cours, modules, chapitres, leçons et ressources sur l'API (`/api/v1/courses/`, etc.).
- **`is_staff = True` & `is_superuser = True`** : Garantit le statut administrateur global Django.

La commande `bootstrap_admin` garantit que ces cinq conditions sont satisfaites de manière atomique et sécurisée.

---

## 2. Procédure Opérationnelle en Production

### Méthode 1 : Interactive (Recommandée)

Cette méthode est la plus sûre : le mot de passe est saisi directement dans le terminal avec masquage, sans être consigné dans l'historique shell ou dans des logs.

1. **Connexion SSH à l'hôte de production (AWS EC2) :**
   ```bash
   ssh -i /path/to/key.pem ubuntu@api.brainx.edu
   ```

2. **Accéder au répertoire de déploiement :**
   ```bash
   cd /opt/brainx
   ```

3. **Exécuter la commande dans le conteneur API :**
   ```bash
   docker compose -f docker-compose.prod.yml exec api python manage.py bootstrap_admin
   ```

4. **Renseigner les invites :**
   ```text
   Admin email address: admin@brainx.edu
   Password: [Saisie masquée]
   Password (again): [Saisie masquée]
   ```

5. **Confirmation :**
   ```text
   Administrator account 'admin@brainx.edu' created successfully:
     - Active: True
     - Email Verified: True
     - Publisher: True
     - Staff: True
     - Superuser: True
   ```

---

### Méthode 2 : Automatisée / Non-Interactive (CI/CD ou Cloud-Init)

Pour un déploiement automatisé (via Terraform, Ansible ou script d'initialisation) :

```bash
docker compose -f docker-compose.prod.yml exec -e DJANGO_SUPERUSER_EMAIL="admin@brainx.edu" -e DJANGO_SUPERUSER_PASSWORD="VotreMotDePasseTresComplexe2026!" api python manage.py bootstrap_admin --noinput
```

> [!WARNING]
> En cas d'utilisation de variables d'environnement, veillez à ne jamais commiter de mots de passe en clair dans vos fichiers Git et nettoyez les variables d'environnement après exécution si elles ne sont pas gérées par un gestionnaire de secrets dédié (ex: AWS Secrets Manager, GitHub Secrets).

---

## 3. Idempotence & Mise à Niveau d'un Compte Existant

Si l'administrateur a déjà créé son compte via le flux d'inscription standard (`/register`) ou si la commande est exécutée à nouveau :
- La commande détecte automatiquement l'existence du compte.
- Elle met à niveau tous les privilèges manquants (`is_email_verified`, `is_publisher`, `is_staff`, `is_superuser`).
- En mode interactif, elle demande si le mot de passe doit être modifié.
- En cas de mise à jour de privilèges ou de mot de passe, **tous les refresh tokens JWT existants sont immédiatement révoqués** (`blacklist_outstanding_refresh_tokens`), garantissant qu'aucune session résiduelle périmée ne subsiste.

---

## 4. Vérification & Smoke Test

Après création :
1. **Accès Frontend** :
   - Rendez-vous sur `https://brainx.vercel.app/login`
   - Connectez-vous avec l'email et le mot de passe créés.
2. **Vérification du Dashboard Éditeur** :
   - Vérifiez que le lien **"Espace Éditeur"** apparaît dans la barre de navigation supérieure.
   - Accédez à `https://brainx.vercel.app/publisher/dashboard`.
3. **Vérification API (facultatif via cURL)** :
   ```bash
   # Récupérer les tokens JWT
   curl -X POST https://api.brainx.edu/api/v1/login/ \
     -H "Content-Type: application/json" \
     -d '{"email": "admin@brainx.edu", "password": "VotreMotDePasseTresComplexe2026!"}'
   
   # Tester l'accès protégé
   curl -X GET https://api.brainx.edu/api/v1/courses/?page=1 \
     -H "Authorization: Bearer <ACCESS_TOKEN>"
   ```
   Une réponse `HTTP 200 OK` confirme la pleine validité du compte administrateur/éditeur.
