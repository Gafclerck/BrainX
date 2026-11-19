---
title: Serveur de Messagerie Postfix (SMTP) et Dovecot (IMAP) sur Debian / Ubuntu
teacher: Équipe Pédagogique Systèmes BrainX
course_date: '2026-11-27'
description: 'Mise en place d''une chaîne complète de messagerie électronique d''entreprise
  sous Debian/Ubuntu : routage SMTP avec Postfix (port 25 et soumission 587), stockage
  des boîtes au format Maildir/, consultation sécurisée en IMAP/IMAPS avec Dovecot
  et authentification SASL.'
keywords: Linux, Debian, Ubuntu, Mail, Postfix, Dovecot, SMTP, IMAP, Maildir, SASL,
  TLS, Port 25, Port 587, Port 993
is_published: true
---

# 1. Architecture d'un Système de Messagerie

Un serveur de messagerie complet articule plusieurs composants complémentaires :
- **MTA (Mail Transfer Agent)** : **Postfix**. Responsable de l'envoi, du relais et de la réception des courriels sur le réseau mondial via le protocole SMTP (port 25 entre serveurs, port 587 pour la soumission authentifiée des clients).
- **MDA / MRA (Mail Delivery / Retrieval Agent)** : **Dovecot**. Dépose les courriels dans les boîtes aux lettres des utilisateurs et permet aux clients (Thunderbird, Outlook, Webmail) de consulter leurs messages via IMAP (port 143) ou IMAPS sécurisé (port 993).
- **Format de stockage Maildir/** : Chaque message est un fichier indépendant stocké dans `~/Maildir/new/`, `~/Maildir/cur/` ou `~/Maildir/tmp/`, évitant les risques de corruption des anciens fichiers monolithiques `mbox`.

---

# 2. Installation sous Debian / Ubuntu

```bash
sudo apt update
sudo apt install -y postfix dovecot-imapd dovecot-pop3d
```

Lors de l'invite de configuration Postfix :
- Type de configuration : **Site Internet**.
- Nom de courrier du système : **`entreprise.local`**.

---

# 3. Configuration de Postfix (`/etc/postfix/main.cf`)

Éditez `/etc/postfix/main.cf` pour activer le format Maildir et délimiter les réseaux autorisés :

```ini
# /etc/postfix/main.cf
myhostname = mail.entreprise.local
mydomain = entreprise.local
myorigin = $mydomain

# Écoute sur toutes les interfaces réseau
inet_interfaces = all
inet_protocols = ipv4

# Domaines pour lesquels ce serveur accepte les mails
mydestination = $myhostname, localhost.$mydomain, localhost, $mydomain

# Réseaux de confiance autorisés à relayer des messages sans authentification
mynetworks = 127.0.0.0/8, 192.168.10.0/24

# Format de stockage moderne Maildir
home_mailbox = Maildir/

# Taille maximale des boîtes (0 = illimitée)
mailbox_size_limit = 0
recipient_delimiter = +
```

---

# 4. Configuration de Dovecot

### 4.1 Définition de l'emplacement Maildir
Éditez `/etc/dovecot/conf.d/10-mail.conf` :
```text
# Déclaration de l'emplacement Maildir dans le répertoire personnel de chaque utilisateur
mail_location = maildir:~/Maildir
```

### 4.2 Protocoles Activés
Éditez `/etc/dovecot/dovecot.conf` :
```text
protocols = imap pop3 lmtp
```

### 4.3 Authentification Plaintext Locale
Éditez `/etc/dovecot/conf.d/10-auth.conf` :
```text
disable_plaintext_auth = no
auth_mechanisms = plain login
```

---

# 5. Démarrage et Test d'Envoi / Réception

```bash
# Redémarrer les services
sudo systemctl restart postfix
sudo systemctl restart dovecot

# Créer un utilisateur de test
sudo adduser commercial1

# Envoyer un courriel en ligne de commande via telnet ou mailx
mail -s "Bienvenue" commercial1@entreprise.local <<< "Ceci est un test de messagerie."

# Vérifier la présence du message dans le dossier Maildir
sudo ls -l /home/commercial1/Maildir/new/
```
