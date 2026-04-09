# JurisVoice AI

Assistant juridique intelligent spécialisé dans la conformité internationale des contrats industriels.

## Fonctionnement

L'application combine un moteur de recherche documentaire (**RAG BM25**) sur un corpus réglementaire de 15 textes officiels avec un LLM (**Gemini**) pour analyser des contrats et répondre à des questions de conformité multi-juridictionnelle.

```
Question utilisateur
       │
       ▼
  Recherche BM25 ──► Corpus réglementaire (1036 chunks)
       │
       ▼
  Contexte pertinent + Contrat uploadé
       │
       ▼
     Gemini (gemini-2.0-flash)
       │
       ▼
  Réponse avec citations [[SOURCE: RGPD, Article 44]]
```

La recherche RAG est **entièrement locale** (algorithme BM25, zéro appel API, zéro limite).  
Seule la génération de texte utilise l'API Gemini.

---

## Prérequis

- Node.js 18+
- Une clé API Gemini — [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

---

## Installation et démarrage

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer les variables d'environnement
cp .env.example .env.local
# Éditer .env.local et renseigner GEMINI_API_KEY et JWT_SECRET

# 3. Indexer le corpus réglementaire (extraction PDF → index BM25, ~30s)
npm run rag:index

# 4. Démarrer le serveur
npm run dev
```

Application disponible sur **http://localhost:3000**

---

## Configuration (.env.local)

| Variable | Obligatoire | Description |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | Clé API Google AI Studio |
| `VITE_GEMINI_API_KEY` | ✅ | Même clé, exposée au frontend (assistant vocal) |
| `JWT_SECRET` | ✅ | Secret JWT (min. 32 caractères) |
| `ELEVENLABS_API_KEY` | ❌ | Clé ElevenLabs pour la synthèse vocale |
| `ELEVENLABS_VOICE_ID` | ❌ | ID de voix ElevenLabs |

---

## Authentification

L'accès est protégé par JWT (tokens 8h). Les comptes sont définis dans `data/users.json`.

| Utilisateur | Mot de passe | Rôle | Accès |
|---|---|---|---|
| `admin` | `admin` | Administrateur | Tout + rebuild index RAG |
| `alice` | `alice123` | Compliance Officer | Chat + journal d'audit |
| `bob` | `bob123` | Legal Analyst | Chat uniquement |

> **En production** : modifier les mots de passe dans `data/users.json` (hachage SHA-256).

---

## Corpus réglementaire

Les textes sont organisés par juridiction dans `rag/corpus/` :

```
rag/corpus/
├── eu/
│   ├── CELEX_32016R0679_EN_TXT.pdf   — RGPD
│   ├── CELEX_32022R0868_EN_TXT.pdf   — Data Governance Act
│   └── CELEX_32024R1689_EN_TXT.pdf   — AI Act
├── france/
│   ├── JORF_19780107_6.pdf            — Loi Informatique et Libertés
│   ├── JORF_NC_19780107_6.pdf         — Version consolidée
│   ├── guide_has_cnil_recommandations_ia.pdf
│   └── synthese_des_reponses_annotation_et_securite-ia_0.pdf
├── usa/
│   ├── NIST.AI.100-1.pdf              — NIST AI Risk Management Framework
│   ├── NIST.SP.800-53r5.pdf           — NIST Security Controls
│   ├── 2023-18624.pdf                 — Executive Order on AI
│   ├── 2023-24216.pdf
│   └── 2023-24283.pdf
├── international/
│   ├── IEC_62443.pdf                  — Cybersécurité systèmes industriels
│   ├── ISO_IEC_27001_2022.pdf         — Management sécurité information
│   └── ISO_IEC_42001_2023.pdf         — Management systèmes IA
├── morocco/                           — Loi 09-08 (à ajouter)
└── canada/                            — AIDA (à ajouter)
```

Pour **ajouter un texte** : déposer le PDF dans le bon dossier juridiction, puis relancer `npm run rag:index`.

Pour **télécharger des contrats** (SEC EDGAR / World Bank) :
```bash
npm run contracts:download
```

---

## Architecture

```
juridai/
├── server.ts              — Serveur Express (API REST + proxy Vite en dev)
├── rag/
│   ├── ragService.ts      — Indexation, chunking, recherche BM25
│   ├── corpus/            — PDFs réglementaires (organisés par juridiction)
│   ├── index/
│   │   └── chunks.json    — Index BM25 (généré par npm run rag:index)
│   └── scripts/
│       └── index-corpus.ts — Script d'indexation
├── src/
│   ├── App.tsx            — Authentification, layout, onglets
│   ├── components/
│   │   ├── Chat.tsx       — Interface de chat + sélecteur de juridiction
│   │   ├── Login.tsx      — Formulaire de connexion
│   │   ├── AuditLog.tsx   — Journal d'audit (filtres, export CSV)
│   │   └── SourceCitation.tsx — Visualisation des citations réglementaires
│   └── services/
│       ├── chat.ts        — Client API /api/chat
│       ├── auth.ts        — Gestion JWT (login, logout, rôles)
│       └── audit.ts       — Client API /api/audit
├── data/
│   └── users.json         — Comptes utilisateurs (SHA-256)
├── audit/
│   └── audit.jsonl        — Journal d'audit append-only
├── contracts/             — Corpus de contrats (SEC EDGAR, World Bank)
└── scripts/
    └── download-contracts.ts — Téléchargement automatique de contrats
```

### API REST

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | — | Connexion, retourne un token JWT |
| `GET` | `/api/auth/me` | JWT | Profil utilisateur courant |
| `POST` | `/api/chat` | JWT | Requête RAG + Gemini + audit |
| `GET` | `/api/rag/status` | JWT | État de l'index RAG |
| `POST` | `/api/rag/rebuild` | admin | Reconstruction de l'index en arrière-plan |
| `GET` | `/api/audit` | admin / compliance_officer | Journal d'audit avec filtres |
| `DELETE` | `/api/audit` | admin | Effacement du journal |
| `POST` | `/api/tts` | JWT | Synthèse vocale ElevenLabs |

---

## Journal d'audit

Chaque requête chat est enregistrée dans `audit/audit.jsonl` (format JSONL, append-only) :

```json
{
  "timestamp": "2026-04-09T10:23:41.000Z",
  "action": "chat_query",
  "userId": "u2",
  "username": "alice",
  "role": "compliance_officer",
  "query": "Le contrat respecte-t-il le RGPD pour les transferts de données ?",
  "jurisdictionFilter": "eu",
  "ragChunksUsed": ["eu/celex-32016r0679-en-txt_12", "eu/celex-32016r0679-en-txt_44"],
  "citationsFound": ["RGPD, Article 44", "RGPD, Article 46"],
  "responseLength": 1842,
  "hasContractContext": true
}
```

Accessible via l'onglet **Audit** (rôles `admin` et `compliance_officer`), avec filtres par action/utilisateur et export CSV.

---

## Citations réglementaires

Le modèle est instruit pour citer ses sources au format :

```
[[SOURCE: RGPD, Article 44]]
[[SOURCE: AI Act, Article 5]]
[[SOURCE: NIST AI RMF, GOVERN 1.1]]
```

Ces balises sont parsées côté frontend et affichées sous chaque réponse sous forme de badges colorés groupés par juridiction.

---

## Scripts

```bash
npm run dev              # Démarrer le serveur (dev avec hot reload Vite)
npm run build            # Build de production
npm run rag:index        # (Re)construire l'index RAG depuis les PDFs
npm run contracts:download  # Télécharger des contrats SEC EDGAR / World Bank
npm run lint             # Vérification TypeScript
```
