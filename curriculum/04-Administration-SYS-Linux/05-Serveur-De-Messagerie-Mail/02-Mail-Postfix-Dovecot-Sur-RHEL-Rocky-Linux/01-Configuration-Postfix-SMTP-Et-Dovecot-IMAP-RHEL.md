---
title: Serveur de Messagerie Postfix et Dovecot sur RHEL / Rocky Linux
teacher: Équipe Pédagogique Systèmes BrainX
course_date: '2026-11-28'
description: 'Déploiement de Postfix et Dovecot sous RHEL 9 / Rocky Linux 9 : configuration
  des boîtes Maildir, politiques de sécurité SELinux pour l''écriture dans les répertoires
  utilisateurs, et gestion des règles Firewalld pour SMTP, SMTPS, IMAP et IMAPS.'
keywords: Linux, RHEL, Rocky Linux, Postfix, Dovecot, Firewalld, SELinux, Maildir,
  SMTP, IMAP, setsebool
is_published: true
---

# 1. Installation sous RHEL 9 / Rocky Linux 9

```bash
sudo dnf install -y postfix dovecot s-nail
```

---

# 2. Configuration de Postfix (`/etc/postfix/main.cf`)

Éditez `/etc/postfix/main.cf` :

```ini
myhostname = mail.entreprise.local
mydomain = entreprise.local
myorigin = $mydomain
inet_interfaces = all
inet_protocols = ipv4
mydestination = $myhostname, localhost.$mydomain, localhost, $mydomain
mynetworks = 127.0.0.0/8, 192.168.10.0/24
home_mailbox = Maildir/
```

---

# 3. Configuration de Dovecot (`/etc/dovecot/`)

Éditez `/etc/dovecot/conf.d/10-mail.conf` :
```text
mail_location = maildir:~/Maildir
```

Éditez `/etc/dovecot/conf.d/10-auth.conf` :
```text
disable_plaintext_auth = no
auth_mechanisms = plain login
```

---

# 4. Réglages Essentiels SELinux et Pare-feu

### 4.1 Booléens SELinux pour la Messagerie
Sous RHEL, SELinux interdit par défaut à Postfix et Dovecot de créer des répertoires et d'écrire des fichiers dans les répertoires `/home/` des utilisateurs !
Il est impératif d'activer les booléens correspondants :

```bash
# Autoriser Postfix à écrire les mails dans les répertoires personnels
sudo setsebool -P postfix_local_write_mail_spool on

# Autoriser Dovecot à lire et écrire dans les dossiers Maildir des utilisateurs
sudo setsebool -P dovecot_enable_homedirs on
```

### 4.2 Ouverture des Ports dans Firewalld
```bash
sudo firewall-cmd --permanent --add-service=smtp
sudo firewall-cmd --permanent --add-service=smtps
sudo firewall-cmd --permanent --add-service=imap
sudo firewall-cmd --permanent --add-service=imaps
sudo firewall-cmd --reload
```

---

# 5. Activation et Démarrage

```bash
sudo systemctl enable --now postfix
sudo systemctl enable --now dovecot

sudo systemctl status postfix
sudo systemctl status dovecot
```
