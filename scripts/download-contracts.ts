/**
 * Script de téléchargement automatique du corpus de contrats
 * Sources: SEC EDGAR (USA) + Banque Mondiale
 *
 * Usage: npm run contracts:download
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const CONTRACTS_DIR = path.join(ROOT, 'contracts');

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'JurisVoice-AI/1.0 (legal-compliance-research@jurisvoice.ai)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function downloadFile(url: string, destPath: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'JurisVoice-AI/1.0 (legal-compliance-research@jurisvoice.ai)' },
    });
    if (!res.ok) return false;
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 80);
}

// ─── SEC EDGAR ───────────────────────────────────────────────────────────────

const EDGAR_SEARCH_QUERIES = [
  { q: '"Master Service Agreement"', folder: 'master-service-agreements', target: 4 },
  { q: '"Data Processing Agreement"', folder: 'data-processing-agreements', target: 3 },
  { q: '"Cloud Services Agreement"', folder: 'cloud-services-agreements', target: 3 },
  { q: '"Supply Agreement"', folder: 'supply-agreements', target: 3 },
];

async function downloadEdgarContracts(): Promise<void> {
  console.log('\n📋 SEC EDGAR — Téléchargement des contrats (Exhibit 10)\n');

  for (const query of EDGAR_SEARCH_QUERIES) {
    const destDir = path.join(CONTRACTS_DIR, 'sec-edgar', query.folder);
    const existingFiles = fs.readdirSync(destDir).filter(f => !f.startsWith('.'));

    if (existingFiles.length >= query.target) {
      console.log(`  ✓ ${query.folder}: ${existingFiles.length} contrats déjà présents`);
      continue;
    }

    console.log(`  🔍 Recherche: ${query.q}`);

    try {
      const searchUrl = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(query.q)}&forms=EX-10&dateRange=custom&startdt=2020-01-01&enddt=2024-12-31`;
      const data = await fetchJson(searchUrl);
      const hits = data.hits?.hits || [];

      if (hits.length === 0) {
        console.log(`     ⚠ Aucun résultat pour cette requête`);
        continue;
      }

      let downloaded = existingFiles.length;
      for (const hit of hits.slice(0, query.target * 3)) {
        if (downloaded >= query.target) break;

        const source = hit._source;
        const accession = source?.period_of_report || source?.file_date || '';
        const entityName = sanitizeFilename(source?.entity_name || 'unknown');
        const filingUrl = source?.file_date
          ? `https://www.sec.gov${hit._id}`
          : null;

        if (!filingUrl) continue;

        // Try to get the actual document from the filing index
        try {
          const indexUrl = filingUrl.replace(/\/$/, '') + '-index.json';
          const filingIndex = await fetchJson(indexUrl).catch(() => null);

          if (filingIndex?.documents) {
            const exhibit = filingIndex.documents.find(
              (d: any) => d.type?.includes('EX-10') && (d.document?.endsWith('.htm') || d.document?.endsWith('.txt'))
            );
            if (exhibit) {
              const baseUrl = filingUrl.substring(0, filingUrl.lastIndexOf('/') + 1);
              const docUrl = baseUrl + exhibit.document;
              const filename = `${entityName}_${sanitizeFilename(exhibit.document)}`;
              const destPath = path.join(destDir, filename);

              if (!fs.existsSync(destPath)) {
                const ok = await downloadFile(docUrl, destPath);
                if (ok) {
                  console.log(`     ✅ ${filename}`);
                  downloaded++;
                }
              }
            }
          }
        } catch {
          // Skip this filing
        }

        await sleep(500); // Respecter le rate limit SEC
      }

      console.log(`     → ${downloaded}/${query.target} contrats dans ${query.folder}`);
    } catch (err: any) {
      console.error(`     ❌ Erreur: ${err.message}`);
    }

    await sleep(1000);
  }
}

// ─── SEC EDGAR — Contrats de référence connus ─────────────────────────────

const KNOWN_CONTRACTS: { url: string; filename: string; folder: string }[] = [
  {
    // Microsoft Azure Customer Agreement (public)
    url: 'https://www.sec.gov/Archives/edgar/data/789019/000078901921000006/ex1001microsoftcorporati.htm',
    filename: 'Microsoft_Azure_Customer_Agreement.htm',
    folder: 'cloud-services-agreements',
  },
  {
    // AWS Service Agreement exhibit (Exhibit 10)
    url: 'https://www.sec.gov/Archives/edgar/data/1018724/000101872422000003/exhibit1001.htm',
    filename: 'Amazon_AWS_Service_Agreement.htm',
    folder: 'cloud-services-agreements',
  },
];

async function downloadKnownContracts(): Promise<void> {
  console.log('\n📄 Téléchargement des contrats de référence connus...\n');
  for (const contract of KNOWN_CONTRACTS) {
    const destDir = path.join(CONTRACTS_DIR, 'sec-edgar', contract.folder);
    const destPath = path.join(destDir, contract.filename);

    if (fs.existsSync(destPath)) {
      console.log(`  ✓ ${contract.filename} (déjà téléchargé)`);
      continue;
    }

    console.log(`  ⬇ ${contract.filename}...`);
    const ok = await downloadFile(contract.url, destPath);
    console.log(ok ? `  ✅ Téléchargé` : `  ⚠ Échec (URL peut-être obsolète)`);
    await sleep(500);
  }
}

// ─── World Bank ──────────────────────────────────────────────────────────────

async function downloadWorldBankContracts(): Promise<void> {
  console.log('\n🌍 Banque Mondiale — Téléchargement des contrats internationaux\n');

  const destDir = path.join(CONTRACTS_DIR, 'world-bank');
  const existingFiles = fs.readdirSync(destDir).filter(f => !f.startsWith('.'));

  if (existingFiles.length >= 5) {
    console.log(`  ✓ ${existingFiles.length} contrats Banque Mondiale déjà présents`);
    return;
  }

  try {
    // World Bank Projects API
    const searchUrl = 'https://search.worldbank.org/api/v2/projects?format=json&fl=id,project_name,pdfurl,docdt,countryname&rows=10&apilang=fr&majdocty=Contract';
    const data = await fetchJson(searchUrl);
    const docs = data.documents ? Object.values(data.documents) : [];

    if (docs.length === 0) {
      console.log('  ⚠ Aucun résultat API Banque Mondiale — tentative via OCDS...');
      await downloadOcdsContracts();
      return;
    }

    let downloaded = existingFiles.length;
    for (const doc of docs.slice(0, 10) as any[]) {
      if (downloaded >= 5) break;
      if (!doc.pdfurl) continue;

      const filename = sanitizeFilename(`WorldBank_${doc.project_name || doc.id || 'contract'}.pdf`);
      const destPath = path.join(destDir, filename);

      if (fs.existsSync(destPath)) continue;

      console.log(`  ⬇ ${doc.project_name || doc.id}...`);
      const ok = await downloadFile(doc.pdfurl, destPath);
      if (ok) {
        console.log(`  ✅ ${filename}`);
        downloaded++;
      }
      await sleep(800);
    }
    console.log(`  → ${downloaded} contrats téléchargés`);
  } catch (err: any) {
    console.error(`  ❌ Erreur Banque Mondiale: ${err.message}`);
    await downloadOcdsContracts();
  }
}

async function downloadOcdsContracts(): Promise<void> {
  // Open Contracting Data Standard — données publiques de marchés
  try {
    const url = 'https://data.open-contracting.org/api/3/action/datastore_search?resource_id=ocds-sample&limit=5';
    const data = await fetchJson(url);
    const records = data.result?.records || [];

    const destDir = path.join(CONTRACTS_DIR, 'open-contracting');
    let idx = 0;
    for (const record of records.slice(0, 5)) {
      const filename = `OCDS_contract_${idx++}.json`;
      const destPath = path.join(destDir, filename);
      fs.writeFileSync(destPath, JSON.stringify(record, null, 2));
      console.log(`  ✅ ${filename}`);
    }
  } catch {
    // Provide sample OCDS contract structure instead
    const samplePath = path.join(CONTRACTS_DIR, 'open-contracting', 'OCDS_sample_structure.json');
    if (!fs.existsSync(samplePath)) {
      fs.writeFileSync(samplePath, JSON.stringify({
        note: "Téléchargez les contrats OCDS depuis https://data.open-contracting.org",
        ocid: "ocds-sample-001",
        contracts: [{
          id: "sample-contract-1",
          title: "Contrat de fourniture de services cloud",
          description: "Accord-cadre pour services d'hébergement cloud",
          value: { amount: 500000, currency: "EUR" },
          period: { startDate: "2024-01-01", endDate: "2026-12-31" },
          items: [{ description: "Services d'hébergement en nuage sécurisés" }],
          dataSecurity: { standard: "ISO 27001", hosting: "EU", gdprCompliant: true }
        }]
      }, null, 2));
      console.log('  📝 Structure OCDS d\'exemple créée');
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('   JurisVoice AI — Téléchargement du corpus contrats');
  console.log('═══════════════════════════════════════════════════');

  // Créer les dossiers si nécessaire
  const dirs = [
    'sec-edgar/master-service-agreements',
    'sec-edgar/data-processing-agreements',
    'sec-edgar/supply-agreements',
    'sec-edgar/cloud-services-agreements',
    'world-bank',
    'enron',
    'open-contracting',
  ];
  for (const d of dirs) {
    fs.mkdirSync(path.join(CONTRACTS_DIR, d), { recursive: true });
  }

  await downloadKnownContracts();
  await downloadEdgarContracts();
  await downloadWorldBankContracts();

  console.log('\n═══════════════════════════════════════════════════');
  console.log('✅ Téléchargement terminé !');
  console.log('\nPour indexer les contrats dans le RAG:');
  console.log('   npm run rag:index');
  console.log('═══════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n💥 Erreur:', err.message);
  process.exit(1);
});
