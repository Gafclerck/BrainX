---
title: Service DNS Bind9 sur Debian / Ubuntu (Zones Directe et Inverse)
teacher: Équipe Pédagogique Systèmes BrainX
course_date: '2026-11-23'
description: 'Mise en place complète d''un serveur de noms de domaine (DNS) autoritaire
  et récursif avec Bind9 sous Debian/Ubuntu : configuration des ACLs, déclaration
  des zones directes et inverses, enregistrements SOA, NS, A, CNAME, PTR, MX et outils
  de diagnostic dig/named-checkzone.'
keywords: Linux, Debian, Ubuntu, DNS, Bind9, named.conf, Zone directe, Zone inverse,
  SOA, NS, A, CNAME, PTR, dig
is_published: true
---

# 1. Rôle et Architecture du Serveur DNS Bind9

Le Domain Name System (DNS) convertit les noms de machines lisibles par l'homme (`serveur1.entreprise.local`) en adresses IP routables (`192.168.10.10`), et réciproquement (résolution inverse).
Sous Debian et Ubuntu, **BIND (Berkeley Internet Name Domain)** version 9 est le serveur de référence.

---

# 2. Installation des Paquets

```bash
sudo apt update
sudo apt install -y bind9 bind9utils bind9-doc dnsutils
```
- `bind9` : Démon du serveur DNS.
- `bind9utils` : Outils d'administration et de validation (`named-checkconf`, `named-checkzone`).
- `dnsutils` : Outils de requête client (`dig`, `nslookup`, `host`).

---

# 3. Structure des Fichiers sous `/etc/bind/`

L'organisation sous Debian sépare élégamment les responsabilités :
- `named.conf` : Fichier maître qui inclut les 3 fichiers suivants :
  - `named.conf.options` : Options globales (écoute réseau, forwarders, récursion, sécurité).
  - `named.conf.local` : Déclaration de vos zones locales spécifiques (directes et inverses).
  - `named.conf.default-zones` : Déclaration des zones racines et locales de bouclage (`localhost`).

---

# 4. Configuration des Options Globales : `named.conf.options`

Éditez `/etc/bind/named.conf.options` :

```text
acl "reseau_local" {
    192.168.10.0/24;
    127.0.0.1;
};

options {
    directory "/var/cache/bind";

    // Écoute sur l'interface locale et l'adresse IP du serveur
    listen-on port 53 { 127.0.0.1; 192.168.10.10; };
    listen-on-v6 { none; };

    // Serveurs relais (Forwarders) pour les requêtes extérieures vers Internet
    forwarders {
        8.8.8.8;
        1.1.1.1;
    };

    // Autoriser la récursion uniquement pour le réseau local de l'entreprise
    allow-query { "reseau_local"; };
    recursion yes;

    // Masquer le numéro de version de BIND pour des raisons de sécurité
    version "Non divulgué";
    
    dnssec-validation auto;
};
```

---

# 5. Déclaration des Zones dans `named.conf.local`

Éditez `/etc/bind/named.conf.local` :

```text
// Zone directe
zone "entreprise.local" {
    type master;
    file "/etc/bind/db.entreprise.local";
    allow-transfer { none; }; // Empêche les transferts de zone non autorisés
};

// Zone inverse pour le sous-réseau 192.168.10.0/24
zone "10.168.192.in-addr.arpa" {
    type master;
    file "/etc/bind/db.192.168.10";
    allow-transfer { none; };
};
```

---

# 6. Fichiers de Zone

### 6.1 Fichier de Zone Directe (`/etc/bind/db.entreprise.local`)
```text
$TTL    86400
@       IN      SOA     ns1.entreprise.local. admin.entreprise.local. (
                              2026112301 ; Numéro de Série YYYYMMDDNN
                                  604800 ; Refresh (1 semaine)
                                   86400 ; Retry (1 jour)
                                 2419200 ; Expire (4 semaines)
                                   86400 ; Minimum TTL (1 jour)
)

; Serveurs de noms
@       IN      NS      ns1.entreprise.local.

; Enregistrements A (Noms vers Adresses IPv4)
ns1             IN      A       192.168.10.10
serveur-web     IN      A       192.168.10.20
mail            IN      A       192.168.10.30

; Enregistrements CNAME (Alias)
www             IN      CNAME   serveur-web.entreprise.local.

; Enregistrement MX (Serveur de Messagerie)
@               IN      MX  10  mail.entreprise.local.
```

### 6.2 Fichier de Zone Inverse (`/etc/bind/db.192.168.10`)
```text
$TTL    86400
@       IN      SOA     ns1.entreprise.local. admin.entreprise.local. (
                              2026112301 ; Série
                                  604800 ; Refresh
                                   86400 ; Retry
                                 2419200 ; Expire
                                   86400 ; TTL
)

; Serveurs de noms
@       IN      NS      ns1.entreprise.local.

; Enregistrements PTR (Adresses IPv4 vers Noms d'hôtes)
10      IN      PTR     ns1.entreprise.local.
20      IN      PTR     serveur-web.entreprise.local.
30      IN      PTR     mail.entreprise.local.
```

---

# 7. Validation et Tests avec `dig`

```bash
# 1. Vérification du fichier de configuration global
sudo named-checkconf

# 2. Vérification de la zone directe
sudo named-checkzone entreprise.local /etc/bind/db.entreprise.local

# 3. Vérification de la zone inverse
sudo named-checkzone 10.168.192.in-addr.arpa /etc/bind/db.192.168.10

# 4. Redémarrage du service
sudo systemctl restart bind9

# 5. Test de résolution directe avec dig
dig @127.0.0.1 www.entreprise.local +short
# Résultat attendu : 192.168.10.20

# 6. Test de résolution inverse
dig @127.0.0.1 -x 192.168.10.20 +short
# Résultat attendu : serveur-web.entreprise.local.
```
