---
title: Service DNS Bind/Named sur RHEL / Rocky Linux (avec SELinux & Firewalld)
teacher: Équipe Pédagogique Systèmes BrainX
course_date: '2026-11-24'
description: 'Administration du serveur de noms named sous RHEL 9 / Rocky Linux 9
  : configuration de /etc/named.conf, organisation des zones sous /var/named/, permissions
  et droits d''accès SELinux, et ouverture du port UDP/TCP 53 dans Firewalld.'
keywords: Linux, RHEL, Rocky Linux, DNS, bind, named, /etc/named.conf, /var/named,
  firewalld, SELinux, Port 53
is_published: true
---

# 1. Spécificités de BIND sous RHEL / Rocky Linux

Sous RHEL et Rocky Linux :
- Le démon s'appelle **`named`** (et non `bind9`).
- La configuration principale est centralisée dans **`/etc/named.conf`**.
- Les fichiers de zones doivent impérativement résider dans **`/var/named/`** avec des permissions strictes attribuées au groupe système `named`.
- SELinux applique le type `named_zone_t` sur tous les fichiers de zone.

---

# 2. Installation

```bash
sudo dnf install -y bind bind-utils
```

---

# 3. Configuration de `/etc/named.conf`

Éditez `/etc/named.conf` :

```text
options {
    listen-on port 53 { 127.0.0.1; 192.168.10.10; };
    listen-on-v6 port 53 { none; };
    directory       "/var/named";
    dump-file       "/var/named/data/cache_dump.db";
    statistics-file "/var/named/data/named_stats.txt";
    memstatistics-file "/var/named/data/named_mem_stats.txt";

    allow-query     { localhost; 192.168.10.0/24; };
    recursion yes;

    forwarders {
        8.8.8.8;
        1.1.1.1;
    };

    dnssec-validation yes;
};

logging {
    channel default_debug {
        file "data/named.run";
        severity dynamic;
    };
};

// Zone racine
zone "." IN {
    type hint;
    file "named.ca";
};

// Inclusion de nos zones personnalisées
zone "entreprise.local" IN {
    type master;
    file "entreprise.local.zone";
    allow-update { none; };
};

zone "10.168.192.in-addr.arpa" IN {
    type master;
    file "10.168.192.zone";
    allow-update { none; };
};
```

---

# 4. Création des Zones sous `/var/named/` et Droits d'Accès

Créez `/var/named/entreprise.local.zone` :
```text
$TTL 1D
@       IN SOA  ns1.entreprise.local. root.entreprise.local. (
                                        2026112401      ; serial
                                        1D              ; refresh
                                        1H              ; retry
                                        1W              ; expire
                                        3H )            ; minimum
@       IN NS   ns1.entreprise.local.
ns1     IN A    192.168.10.10
app     IN A    192.168.10.50
www     IN CNAME app.entreprise.local.
```

### Attribution Cruciale des Droits et du Contexte SELinux
> ⚠️ **Le piège classique sous RHEL** :
> Par défaut, si vous créez un fichier avec `root`, l'utilisateur `named` ne peut pas le lire !

```bash
# Définir le propriétaire root et le groupe named
sudo chown root:named /var/named/entreprise.local.zone
sudo chmod 640 /var/named/entreprise.local.zone

# Restaurer le bon contexte de sécurité SELinux
sudo restorecon -v /var/named/entreprise.local.zone
```

---

# 5. Pare-feu et Démarrage du Service

```bash
# Vérifier la syntaxe
sudo named-checkconf /etc/named.conf
sudo named-checkzone entreprise.local /var/named/entreprise.local.zone

# Ouvrir le port 53 (TCP et UDP) dans Firewalld
sudo firewall-cmd --permanent --add-service=dns
sudo firewall-cmd --reload

# Activer et démarrer le démon
sudo systemctl enable --now named
sudo systemctl status named
```
