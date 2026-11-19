---
title: Serveur Web Apache2 sur Debian / Ubuntu (VirtualHosts & Modules)
teacher: Équipe Pédagogique Systèmes BrainX
course_date: '2026-11-25'
description: 'Installation et administration avancée d''Apache2 sous Debian/Ubuntu
  : arborescence modulaire sites-available / sites-enabled, utilisation des commandes
  a2ensite, a2dissite, a2enmod, création de VirtualHosts sécurisés, redirection HTTPS
  et journalisation par hôte virtuel.'
keywords: Linux, Debian, Ubuntu, Apache2, VirtualHosts, a2ensite, a2enmod, /etc/apache2/,
  DocumentRoot, SSL, HTTPS
is_published: true
---

# 1. Architecture Modulaire d'Apache2 sous Debian

Contrairement aux autres distributions où tout est condensé dans un unique fichier, Debian et Ubuntu découpent la configuration d'Apache2 sous `/etc/apache2/` de façon ultra-modulaire :
- `apache2.conf` : Configuration globale du serveur.
- `ports.conf` : Définition des ports d'écoute (`Listen 80`, `Listen 443`).
- `sites-available/` : Répertoire contenant les définitions de tous les VirtualHosts disponibles (fichiers `.conf`).
- `sites-enabled/` : Répertoire contenant les **liens symboliques** pointant vers les sites effectivement activés.
- `mods-available/` & `mods-enabled/` : Modules Apache (ex. `rewrite`, `ssl`, `headers`).

---

# 2. Commandes d'Administration Dédiées Debian

Debian fournit des scripts d'assistance exclusifs très pratiques :
- **`a2ensite <fichier.conf>`** (*Apache 2 Enable Site*) : Active un site en créant le lien symbolique dans `sites-enabled/`.
- **`a2dissite <fichier.conf>`** (*Apache 2 Disable Site*) : Désactive un site en supprimant le lien symbolique.
- **`a2enmod <module>`** (*Apache 2 Enable Module*) : Active un module (ex. `sudo a2enmod rewrite ssl`).
- **`a2dismod <module>`** (*Apache 2 Disable Module*) : Désactive un module.

---

# 3. Création d'un VirtualHost Professionnel

Supposons que nous déployions l'application web `portail.entreprise.local`.

### 3.1 Création de l'Arborescence et des Droits
```bash
sudo mkdir -p /var/www/portail/public
sudo chown -R www-data:www-data /var/www/portail
sudo chmod -R 755 /var/www/portail
```

Créez une page d'accueil de test `/var/www/portail/public/index.html` :
```html
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><title>Portail Entreprise</title></head>
<body><h1>Bienvenue sur le Portail Entreprise (Apache2 sur Debian)</h1></body>
</html>
```

### 3.2 Fichier de Configuration du VirtualHost
Créez `/etc/apache2/sites-available/portail.conf` :

```apache
<VirtualHost *:80>
    ServerName portail.entreprise.local
    ServerAlias www.portail.entreprise.local
    ServerAdmin admin@entreprise.local

    DocumentRoot /var/www/portail/public

    <Directory /var/www/portail/public>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # Journaux personnalisés dédiés à ce site
    ErrorLog ${APACHE_LOG_DIR}/portail_error.log
    CustomLog ${APACHE_LOG_DIR}/portail_access.log combined
</VirtualHost>
```

---

# 4. Activation, Test et Rechargement

```bash
# 1. Activer le module de réécriture d'URL
sudo a2enmod rewrite

# 2. Activer notre nouveau site virtuel
sudo a2ensite portail.conf

# 3. Désactiver le site par défaut si non nécessaire
sudo a2dissite 000-default.conf

# 4. Vérifier la syntaxe globale
sudo apache2ctl configtest
# Doit renvoyer : Syntax OK

# 5. Recharger Apache à chaud sans couper les connexions
sudo systemctl reload apache2
```
