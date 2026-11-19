---
title: Service DHCP sur RHEL / Rocky Linux (dhcp-server & Firewalld)
teacher: Équipe Pédagogique Systèmes BrainX
course_date: '2026-11-22'
description: 'Déploiement du serveur DHCP sous RHEL 9 et Rocky Linux 9 : installation
  du paquet dhcp-server, configuration de dhcpd.conf, intégration du pare-feu Firewalld
  et règles de durcissement SELinux.'
keywords: Linux, RHEL, Rocky Linux, DHCP, dhcp-server, firewalld, dhcpd.conf, SELinux,
  UDP 67
is_published: true
---

# 1. Installation du Paquet `dhcp-server` sur RHEL / Rocky Linux

Sous la famille Red Hat, le démon DHCP est fourni par le paquet `dhcp-server` :
```bash
sudo dnf install -y dhcp-server
```

Sous RHEL, le fichier d'exemple fourni par la documentation est un excellent modèle de départ :
```bash
# Consulter l'exemple officiel
cat /usr/share/doc/dhcp-server/dhcpd.conf.example
```

---

# 2. Configuration de `/etc/dhcp/dhcpd.conf`

Éditez le fichier de configuration principal :
```bash
sudo nano /etc/dhcp/dhcpd.conf
```

Configuration complète d'entreprise :
```text
# Déclarations globales
option domain-name "entreprise.local";
option domain-name-servers 192.168.10.10, 1.1.1.1;

default-lease-time 43200;  # 12 heures
max-lease-time 86400;      # 24 heures

authoritative;

# Déclaration du sous-réseau local
subnet 192.168.10.0 netmask 255.255.255.0 {
    range 192.168.10.100 192.168.10.200;
    option routers 192.168.10.1;
    option subnet-mask 255.255.255.0;
    option broadcast-address 192.168.10.255;
}

# Réservation statique par adresse MAC
host serveur-nas {
    hardware ethernet 52:54:00:12:34:56;
    fixed-address 192.168.10.15;
    option host-name "nas-stockage";
}
```

---

# 3. Ouverture du Pare-feu (Firewalld)

Sous RHEL/Rocky Linux, le pare-feu `firewalld` bloque par défaut tout trafic entrant non autorisé.
Le protocole DHCP écoute sur le port **UDP 67** :

```bash
# Vérifier si le service dhcp est autorisé
sudo firewall-cmd --list-services

# Ajouter le service dhcp de manière permanente
sudo firewall-cmd --permanent --add-service=dhcp

# Recharger les règles du pare-feu
sudo firewall-cmd --reload

# Vérifier l'ouverture effective
sudo firewall-cmd --list-services | grep dhcp
```

---

# 4. Démarrage et Validation sous RHEL 9

```bash
# Vérifier la syntaxe
sudo dhcpd -t -cf /etc/dhcp/dhcpd.conf

# Activer et démarrer le service dhcpd
sudo systemctl enable --now dhcpd

# Vérifier l'état d'exécution
sudo systemctl status dhcpd
```

### Emplacement des Baux sous RHEL
Sous RHEL, l'historique des baux attribués est stocké sous `/var/lib/dhcpd/dhcpd.leases` :
```bash
cat /var/lib/dhcpd/dhcpd.leases
```
