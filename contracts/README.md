# Corpus de Contrats — JurisVoice AI

Ce dossier contient les contrats utilisés pour les tests de conformité multi-juridictionnels.

## Structure

```
contracts/
├── sec-edgar/                    # Contrats issus de la base SEC EDGAR (USA)
│   ├── master-service-agreements/  # MSA (Accord-cadre de services)
│   ├── data-processing-agreements/ # DPA (Accord de traitement des données)
│   ├── supply-agreements/          # Contrats de fourniture
│   └── cloud-services-agreements/  # Contrats Cloud (SaaS/IaaS/PaaS)
├── world-bank/                   # Contrats Banque Mondiale (international)
├── enron/                        # Dataset Enron (emails juridiques & contrats)
└── open-contracting/             # Standard Open Contracting (OCDS)
```

## Téléchargement Automatique

Exécutez le script de téléchargement automatique :

```bash
npm run contracts:download
```

Ce script télécharge automatiquement :
- **10-15 contrats SEC EDGAR** (Exhibit 10 — Master Service Agreements, DPA, Cloud Services)
- **5 contrats Banque Mondiale** (marchés publics internationaux)

> Durée estimée : 2-5 minutes (selon la connexion)

## Téléchargement Manuel

### SEC EDGAR (Full-Text Search)
1. Accédez à [https://efts.sec.gov/LATEST/search-index](https://efts.sec.gov/LATEST/search-index)
2. Recherchez par type : `EX-10` (Exhibit 10 = contrats matériels)
3. Filtres recommandés : `"Master Service Agreement"`, `"Data Processing Agreement"`, `"Cloud Services Agreement"`
4. Téléchargez les fichiers `.htm` ou `.txt` des dépôts

**Sources recommandées :**
- Microsoft: [CIK 789019](https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=789019&type=EX-10)
- Salesforce: [CIK 1108524](https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1108524&type=EX-10)
- Amazon/AWS: [CIK 1018724](https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1018724&type=EX-10)
- Google/Alphabet: [CIK 1652044](https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1652044&type=EX-10)

### Banque Mondiale — Marchés Publics
- API: [https://search.worldbank.org/api/v2/projects](https://search.worldbank.org/api/v2/projects)
- Portal contrats: [https://procurement.worldbank.org](https://procurement.worldbank.org)

### Dataset Enron
- Source: [https://www.cs.cmu.edu/~enron/](https://www.cs.cmu.edu/~enron/)
- Ou via Kaggle: `kaggle datasets download -d wcukierski/enron-email-dataset`

## Format des Contrats

Placez les contrats dans le bon sous-dossier. Formats acceptés :
- `.pdf` — PDF natifs (préféré)
- `.txt` — Texte brut
- `.htm` / `.html` — HTML (format SEC EDGAR natif)

## Après Ajout de Contrats

Ré-indexez le corpus RAG pour inclure les nouveaux contrats :

```bash
npm run rag:index
```

## Exemples de Questions de Conformité

Une fois les contrats chargés, vous pouvez poser des questions comme :

1. *"Ce contrat prévoit-il un hébergement aux USA ? Est-il conforme au RGPD si les données concernent des clients européens ?"*
2. *"La clause de sous-traitance de données est-elle conforme à l'article 28 du RGPD ?"*
3. *"Qui est responsable en cas d'erreur d'interprétation automatisée selon la réglementation française ?"*
4. *"L'absence de validation humaine est-elle compatible avec l'AI Act ?"*
5. *"Ce contrat est-il conforme à la loi marocaine 09-08 si les données concernent des citoyens marocains ?"*
