---
title: 'Comparatif des Deux Distributions : Paquets, Systemd et Sécurité'
teacher: Équipe Pédagogique Systèmes BrainX
course_date: '2026-11-20'
description: 'Étude comparative approfondie entre la famille Debian (Ubuntu Server
  24.04 LTS / Debian 12) et la famille Red Hat (RHEL 9 / Rocky Linux 9) : gestionnaires
  de paquets, gestion des services avec systemd, filtrage pare-feu et mécanismes de
  contrôle d''accès obligatoire (SELinux vs AppArmor).'
keywords: Linux, Debian, Ubuntu, RHEL, Rocky Linux, APT, DNF, Systemd, UFW, Firewalld,
  SELinux, AppArmor, nftables
is_published: true
---

# 1. Introduction aux Deux Grandes Familles Linux en Production

Dans les infrastructures de production d'entreprise (cloud public, centres de données, virtualisation bare-metal), deux écosystèmes Linux dominent le marché des serveurs :
1. **La Famille Debian** : Représentée par **Debian 12 (Bookworm)** et **Ubuntu Server 24.04 LTS (Noble Numbat)**. Réputée pour sa stabilité légendaire, son gestionnaire APT et sa simplicité de configuration modulaire.
2. **La Famille Red Hat Enterprise Linux (RHEL)** : Représentée par **RHEL 9**, **Rocky Linux 9** et **AlmaLinux 9**. Standard incontournable des banques, des télécoms et des grandes institutions gouvernementales, caractérisée par une politique de sécurité stricte (*Security-Enhanced Linux* - SELinux) et le gestionnaire DNF/RPM.

---

# 2. Matrice Comparative des Composants Fondamentaux

| Composant Système | Famille Debian / Ubuntu Server | Famille RHEL / Rocky Linux |
| :--- | :--- | :--- |
| **Gestionnaire de paquets de bas niveau** | `dpkg` (fichiers `.deb`) | `rpm` (fichiers `.rpm`) |
| **Gestionnaire de paquets réseau** | `apt`, `apt-get` | `dnf` (remplaçant moderne de `yum`) |
| **Dépôts de paquets** | `/etc/apt/sources.list` et `/etc/apt/sources.list.d/*.sources` | `/etc/yum.repos.d/*.repo` |
| **Init & Gestionnaire de services** | `systemd` (`systemctl`, `journalctl`) | `systemd` (`systemctl`, `journalctl`) |
| **Sécurité d'accès obligatoire (MAC)** | **AppArmor** (profils orientés chemins de fichiers) | **SELinux** (labels cryptographiques et contextes stricts) |
| **Pare-feu par défaut** | **UFW** (*Uncomplicated Firewall*) ou `nftables` | **Firewalld** (`firewall-cmd`) avec zones dynamiques |
| **Configuration réseau moderne** | **Netplan** (`/etc/netplan/*.yaml`) | **NetworkManager** (`nmcli`, `/etc/NetworkManager/`) |
| **Comptes de services système** | `www-data` (Apache), `bind` (DNS) | `apache` (Apache), `named` (DNS) |

---

# 3. Gestion des Paquets et Dépôts

### 3.1 Famille Debian / Ubuntu (APT)
```bash
# Mise à jour de l'index des dépôts
sudo apt update

# Mise à jour des paquets installés sans rupture
sudo apt upgrade -y

# Recherche d'un paquet
apt search bind9

# Installation d'un service
sudo apt install -y apache2 bind9 isc-dhcp-server postfix dovecot-imapd

# Suppression propre (en conservant la configuration)
sudo apt remove nom_du_paquet

# Suppression complète (incluant les fichiers de configuration sous /etc)
sudo apt purge nom_du_paquet -y
```

### 3.2 Famille RHEL / Rocky Linux (DNF)
```bash
# Vérification des mises à jour disponibles
sudo dnf check-update

# Mise à jour globale du système
sudo dnf upgrade -y

# Recherche d'un paquet dans les dépôts configurés
dnf search bind

# Installation des paquets équivalents
sudo dnf install -y httpd bind bind-utils dhcp-server postfix dovecot

# Suppression d'un paquet et de ses dépendances orphelines
sudo dnf remove nom_du_paquet -y
```

---

# 4. Gestion des Services avec Systemd

Sur les deux familles, `systemd` est le système d'initialisation standard (PID 1).

### Commandes Universelles Essentielles
```bash
# Démarrer un service immédiatement
sudo systemctl start <nom_service>

# Arrêter un service
sudo systemctl stop <nom_service>

# Redémarrer un service (coupure brève)
sudo systemctl restart <nom_service>

# Recharger la configuration à chaud sans interrompre les connexions actives
sudo systemctl reload <nom_service>

# Activer le démarrage automatique au boot du système
sudo systemctl enable <nom_service>

# Activer ET démarrer en une seule commande
sudo systemctl enable --now <nom_service>

# Consulter l'état détaillé et les dernières erreurs
sudo systemctl status <nom_service>

# Inspecter les journaux temps réel d'un service
sudo journalctl -u <nom_service> -f
```

> ⚠️ **Différence majeure de nommage des services** :
> - Apache : `apache2` sur Debian/Ubuntu ⟷ `httpd` sur RHEL/Rocky.
> - DNS Bind : `bind9` sur Debian/Ubuntu ⟷ `named` sur RHEL/Rocky.
> - Serveur DHCP : `isc-dhcp-server` sur Debian/Ubuntu ⟷ `dhcpd` sur RHEL/Rocky.

---

# 5. Sécurité : UFW vs Firewalld et AppArmor vs SELinux

### 5.1 Filtrage Réseau : UFW (Ubuntu) vs Firewalld (Rocky Linux)

**Configuration sous Ubuntu (UFW) :**
```bash
# Activer le pare-feu
sudo ufw enable

# Autoriser SSH (port 22) pour ne pas se bloquer
sudo ufw allow ssh

# Autoriser les services web et DNS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 53
sudo ufw status verbose
```

**Configuration sous RHEL / Rocky Linux (Firewalld) :**
```bash
# Firewalld utilise le concept de zones (public, internal, dmz)
sudo firewall-cmd --state

# Ouvrir les services de manière permanente dans la zone active
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-service=dns
sudo firewall-cmd --permanent --add-service=dhcp

# Recharger les règles pour application immédiate
sudo firewall-cmd --reload
sudo firewall-cmd --list-all
```

### 5.2 Contrôle d'Accès : AppArmor vs SELinux
- **AppArmor (Ubuntu/Debian)** : S'appuie sur des profils stockés dans `/etc/apparmor.d/`. Un profil restreint les fichiers et capacités réseau qu'un binaire a le droit de manipuler.
- **SELinux (RHEL/Rocky)** : Chaque fichier, processus et port réseau possède un contexte de sécurité (`user:role:type:level`). Par exemple, les fichiers servis par Apache doivent impérativement porter le type `httpd_sys_content_t`.
  ```bash
  # Consulter le mode actuel (Enforcing, Permissive, Disabled)
  getenforce

  # Examiner le contexte SELinux d'un fichier
  ls -lZ /var/www/html/
  ```

---

# 6. Synthèse des Bonnes Pratiques
1. Toujours identifier la famille de distribution avant de modifier des fichiers de configuration.
2. Sous RHEL/Rocky, ne jamais désactiver SELinux en production : configurer les booléens et contextes appropriés.
3. Tester systématiquement la syntaxe des fichiers de configuration avant de redémarrer un service en production.
