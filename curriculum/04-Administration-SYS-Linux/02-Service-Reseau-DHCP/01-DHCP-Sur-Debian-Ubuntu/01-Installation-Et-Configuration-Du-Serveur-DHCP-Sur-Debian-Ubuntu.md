---
title: Service DHCP sur Debian / Ubuntu (isc-dhcp-server & Kea)
teacher: Équipe Pédagogique Systèmes BrainX
course_date: '2026-11-21'
description: 'Mise en œuvre complète d''un serveur d''attribution dynamique d''adresses
  IPv4 sous Debian 12 / Ubuntu 24.04 LTS : déclaration des sous-réseaux, plages de
  baux, passerelle par défaut, serveurs DNS et réservation d''adresses statiques par
  adresse MAC.'
keywords: Linux, Debian, Ubuntu, DHCP, isc-dhcp-server, dhcpd.conf, Baux, MAC, Reservation
  statique, Kea
is_published: true
---

# 1. Principe du Protocole DHCP (Dynamic Host Configuration Protocol)

Le protocole DHCP (RFC 2131) permet d'automatiser l'affectation des paramètres réseau aux postes clients au démarrage via le cycle d'échange **DORA** (sur les ports UDP 67 côté serveur et UDP 68 côté client) :
1. **Discover** : Le client diffuse un broadcast (*Qui peut m'attribuer une adresse IP ?*).
2. **Offer** : Le serveur DHCP propose une adresse disponible accompagnée d'une durée de bail (*lease*).
3. **Request** : Le client valide l'offre et demande officiellement l'adresse au serveur.
4. **Acknowledge (ACK)** : Le serveur confirme l'attribution et enregistre le bail.

---

# 2. Installation de `isc-dhcp-server`

Sur Debian 12 et Ubuntu Server :
```bash
sudo apt update
sudo apt install -y isc-dhcp-server
```

> ℹ️ **[Note sur Kea DHCP]** : Bien que l'ISC développe désormais Kea pour succéder à isc-dhcp-server, isc-dhcp-server reste le moteur le plus largement déployé et audité dans les examens d'administration système.

---

# 3. Configuration de l'Interface d'Écoute

Le serveur doit savoir sur quelle interface physique écouter les requêtes DHCP broadcast.
Éditez `/etc/default/isc-dhcp-server` :

```bash
sudo nano /etc/default/isc-dhcp-server
```

Renseignez le nom de votre carte réseau interne (ex. `eth0`, `ens33` ou `enp0s3`) :
```ini
# /etc/default/isc-dhcp-server
INTERFACESv4="ens33"
INTERFACESv6=""
```

---

# 4. Fichier de Configuration Principal : `/etc/dhcp/dhcpd.conf`

Effectuez une sauvegarde préalable :
```bash
sudo cp /etc/dhcp/dhcpd.conf /etc/dhcp/dhcpd.conf.bak
```

Éditez `/etc/dhcp/dhcpd.conf` avec la configuration complète pour un réseau d'entreprise `192.168.10.0/24` :

```text
# Définitions globales du domaine
option domain-name "entreprise.local";
option domain-name-servers 192.168.10.10, 8.8.8.8;

# Durée des baux en secondes (86400s = 24 heures)
default-lease-time 86400;
max-lease-time 172800;

# Le serveur se déclare autoritaire sur ce réseau
authoritative;

# Déclaration du sous-réseau
subnet 192.168.10.0 netmask 255.255.255.0 {
    # Plage d'adresses dynamiques distribuées aux clients
    range 192.168.10.50 192.168.10.150;

    # Passerelle par défaut (Routeur)
    option routers 192.168.10.1;

    # Masque de sous-réseau et adresse de broadcast
    option subnet-mask 255.255.255.0;
    option broadcast-address 192.168.10.255;
    
    # Serveur NTP pour la synchronisation horaire
    option ntp-servers 192.168.10.1;
}

# Réservation statique par adresse physique MAC (ex. Imprimante ou Serveur de fichiers)
host imprimante-direction {
    hardware ethernet 00:11:22:33:44:55;
    fixed-address 192.168.10.20;
    option host-name "imprimante-dir";
}
```

---

# 5. Validation de la Syntaxe et Démarrage du Service

Avant de démarrer le service, validez la syntaxe du fichier de configuration :
```bash
# Vérification de syntaxe sans démarrer
sudo dhcpd -t -cf /etc/dhcp/dhcpd.conf
```
Si aucune erreur n'apparaît, activez et démarrez le démon :
```bash
sudo systemctl enable --now isc-dhcp-server
sudo systemctl status isc-dhcp-server
```

---

# 6. Surveillance et Diagnostic des Baux

### 6.1 Inspection du Fichier des Baux Actifs
Chaque adresse allouée est consignée dans `/var/lib/dhcp/dhcpd.leases` :
```bash
cat /var/lib/dhcp/dhcpd.leases
```

### 6.2 Suivi des Négociations en Temps Réel
Pour observer les requêtes DORA des machines clientes :
```bash
sudo journalctl -u isc-dhcp-server -f
```
Vous verrez défiler les messages :
`DHCPDISCOVER from 08:00:27:... via ens33`
`DHCPOFFER on 192.168.10.50 to 08:00:27:... via ens33`
`DHCPREQUEST for 192.168.10.50 from 08:00:27:... via ens33`
`DHCPACK on 192.168.10.50 to 08:00:27:... via ens33`
