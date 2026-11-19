---
title: Serveur Web Apache (httpd) sur RHEL / Rocky Linux (avec SELinux & Firewalld)
teacher: Équipe Pédagogique Systèmes BrainX
course_date: '2026-11-26'
description: 'Configuration du serveur web httpd sous RHEL 9 et Rocky Linux 9 : architecture
  /etc/httpd/conf.d/, inclusions automatiques, gestion rigoureuse des contextes de
  sécurité SELinux (httpd_sys_content_t) et règles de pare-feu.'
keywords: Linux, RHEL, Rocky Linux, httpd, Apache, /etc/httpd/, conf.d, SELinux, httpd_sys_content_t,
  firewalld
is_published: true
---

# 1. Différences Clés d'Apache sous RHEL / Rocky Linux

- Le paquet et le service se nomment **`httpd`**.
- La configuration principale est dans **`/etc/httpd/conf/httpd.conf`**.
- **Pas de commandes `a2ensite`** : Tout fichier se terminant par `.conf` placé dans le répertoire **`/etc/httpd/conf.d/`** est automatiquement inclus et actif au démarrage.
- L'utilisateur système du serveur web est **`apache:apache`**.
- **SELinux est actif par défaut** : Tout répertoire hébergeant du contenu web hors de `/var/www/html` sera immédiatement bloqué par une erreur HTTP 403 (Forbidden) si son contexte SELinux n'est pas explicitement appliqué !

---

# 2. Installation du Service

```bash
sudo dnf install -y httpd mod_ssl
```

---

# 3. Création du VirtualHost sous `/etc/httpd/conf.d/`

Créez le répertoire du site web :
```bash
sudo mkdir -p /var/www/vhosts/site-rhel/public
sudo chown -R apache:apache /var/www/vhosts/site-rhel
```

Créez le fichier de configuration `/etc/httpd/conf.d/site-rhel.conf` :

```apache
<VirtualHost *:80>
    ServerName site.entreprise.local
    DocumentRoot /var/www/vhosts/site-rhel/public

    <Directory /var/www/vhosts/site-rhel/public>
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog /var/log/httpd/site-rhel_error.log
    CustomLog /var/log/httpd/site-rhel_access.log combined
</VirtualHost>
```

---

# 4. Le Contexte SELinux Incontournable

Si vous démarrez maintenant, le navigateur affichera une erreur **403 Forbidden**.
Vérifions le contexte SELinux :
```bash
ls -ldZ /var/www/vhosts/site-rhel/public
```

Pour autoriser Apache à lire ce dossier, nous lui appliquons le type **`httpd_sys_content_t`** :
```bash
# 1. Enregistrer la règle de contexte dans la politique SELinux
sudo semanage fcontext -a -t httpd_sys_content_t "/var/www/vhosts/site-rhel(/.*)?"

# 2. Appliquer récursivement le contexte sur les fichiers physiques
sudo restorecon -Rv /var/www/vhosts/site-rhel
```

Si votre application doit autoriser l'envoi de mails ou la connexion à une base de données distante :
```bash
# Autoriser Apache à initier des connexions réseau (ex. vers PostgreSQL ou MySQL)
sudo setsebool -P httpd_can_network_connect on
sudo setsebool -P httpd_can_network_connect_db on
```

---

# 5. Pare-feu et Démarrage

```bash
# Ouvrir les ports HTTP et HTTPS dans Firewalld
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload

# Vérifier la syntaxe
sudo apachectl configtest

# Activer et démarrer httpd
sudo systemctl enable --now httpd
```
