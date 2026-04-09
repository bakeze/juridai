/**
 * RAG Corpus Indexing Script — BM25 (zéro API, zéro dépendance ML)
 * Extrait le texte des PDFs et sauvegarde les chunks pour la recherche BM25.
 *
 * Usage: npm run rag:index
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadCorpusPdfs, saveIndex } from '../ragService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env.local') });

async function buildIndex() {
  console.log('═══════════════════════════════════════════');
  console.log('   JurisVoice AI — Indexation du corpus RAG');
  console.log('   (BM25 — zéro API, zéro limite)');
  console.log('═══════════════════════════════════════════\n');

  console.log('📖 Extraction du texte des PDFs...\n');
  const chunks = await loadCorpusPdfs();

  console.log(`\n📦 ${chunks.length} chunks extraits\n`);

  if (chunks.length === 0) {
    console.error('❌ Aucun chunk trouvé. Vérifiez que rag/corpus/ contient des PDFs.');
    process.exit(1);
  }

  const byJurisdiction = chunks.reduce<Record<string, number>>((acc, c) => {
    acc[c.jurisdiction] = (acc[c.jurisdiction] || 0) + 1;
    return acc;
  }, {});
  console.log('📊 Distribution par juridiction:');
  for (const [j, count] of Object.entries(byJurisdiction)) {
    console.log(`   ${j.padEnd(15)} ${count} chunks`);
  }

  console.log('\n💾 Sauvegarde de l\'index...');
  saveIndex(chunks);

  console.log('\n🎉 Index RAG créé instantanément');
  console.log('📍 Fichier: rag/index/chunks.json');
  console.log('\n▶ Démarrez le serveur avec: npm run dev');
}

buildIndex().catch(err => {
  console.error('\n💥 Erreur fatale:', err);
  process.exit(1);
});
