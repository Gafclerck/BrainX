---
title: "Fonctionnement du Protocole HTTP et Architectures REST"
teacher: "Dr. Tim Berners"
course_date: "2026-11-15"
description: "Découverte approfondie des requêtes, en-têtes, verbes et codes de retour HTTP 1.1 et HTTP/2."
keywords: "http, rest, client-serveur, api, json, web"
is_published: true
resources:
  - type: document
    title: "Support de cours complet - Protocole HTTP (PDF)"
    file: "attachments/guide-http.pdf"
    note: "Support distribué pour le cours magistral"
  - type: external_link
    title: "MDN Web Docs - Vue d'ensemble du protocole HTTP"
    url: "https://developer.mozilla.org/fr/docs/Web/HTTP/Overview"
---

# Fonctionnement du Protocole HTTP et Architectures REST

## 1. Principes fondamentaux du modèle Client-Serveur
HTTP (*Hypertext Transfer Protocol*) est un protocole de la couche application fonctionnant principalement au-dessus de TCP/IP.
Dans une architecture web moderne, le client (navigateur web, application mobile, frontend SPA) initie une connexion vers le serveur d'API et émet des requêtes atomiques sans état persistant obligatoire (*stateless*).

## 2. Anatomie d'une Requête HTTP
Une requête HTTP se compose de trois éléments clés :
- **La ligne de requête** : La méthode (GET, POST, PUT, DELETE, PATCH), l'URI cible (`/api/v1/courses/`) et la version du protocole (`HTTP/1.1`).
- **Les en-têtes (Headers)** : Métadonnées telles que `Host`, `Authorization: Bearer <token>`, `Content-Type: application/json`.
- **Le corps (Body)** : Charge utile de données transmise (par exemple un payload JSON pour un enregistrement).

## 3. Les Codes de Statut Standardisés
- **2xx (Succès)** : 200 OK, 201 Created, 204 No Content.
- **3xx (Redirection)** : 301 Moved Permanently, 304 Not Modified.
- **4xx (Erreurs Client)** : 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found.
- **5xx (Erreurs Serveur)** : 500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable.
