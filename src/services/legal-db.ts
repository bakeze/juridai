import * as fs from 'fs';
import * as path from 'path';

// Import dynamique pour pdf-parse (compatibilité ES modules)
let pdfParse: any = null;

async function getPdfParser() {
  if (!pdfParse) {
    try {
      pdfParse = await import('pdf-parse/lib/pdf-parse.js');
    } catch {
      // Fallback
      pdfParse = await import('pdf-parse');
    }
  }
  return pdfParse;
}

interface LegalDocument {
  filename: string;
  category: string;
  text: string;
  extracted_at: string;
}

interface LegalDatabase {
  documents: LegalDocument[];
  last_updated: string;
  total_words: number;
}

const LEGAL_REFERENCES_DIR = path.join(process.cwd(), 'legal-references');
const LEGAL_DB_CACHE = 'legal-db-cache.json';

let cachedDatabase: LegalDatabase | null = null;

/**
 * Extraction du texte d'un fichier (PDF ou TXT)
 */
async function extractFileText(filePath: string): Promise<string> {
  try {
    // Si c'est un fichier texte, le lire directement
    if (filePath.endsWith('.txt') || filePath.endsWith('.md')) {
      return fs.readFileSync(filePath, 'utf-8');
    }

    // Si c'est un PDF, utiliser pdfParse
    if (filePath.endsWith('.pdf')) {
      const pdfParseModule = await getPdfParser();
      const fileBuffer = fs.readFileSync(filePath);
      const data = await pdfParseModule(fileBuffer);
      return data.text;
    }

    return '';
  } catch (error) {
    console.error(`❌ Erreur extraction ${filePath}:`, error);
    return '';
  }
}

/**
 * Récupère la catégorie basée sur le chemin
 */
function getCategory(filePath: string): string {
  const parts = filePath.split(path.sep);
  const relPath = parts.slice(parts.indexOf('legal-references') + 1).join('/');
  return relPath.split('/')[0] || 'général';
}

/**
 * Scanne le dossier legal-references et extrait tous les PDFs
 */
async function buildLegalDatabase(): Promise<LegalDatabase> {
  console.log('🔍 Scan de la base de connaissances juridique...');

  const documents: LegalDocument[] = [];
  let totalWords = 0;

  if (!fs.existsSync(LEGAL_REFERENCES_DIR)) {
    console.warn('⚠️  Dossier legal-references non trouvé. Création en cours...');
    fs.mkdirSync(LEGAL_REFERENCES_DIR, { recursive: true });
    return {
      documents: [],
      last_updated: new Date().toISOString(),
      total_words: 0,
    };
  }

  // Parcourir récursivement
  function scanDir(dir: string) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        scanDir(filePath);
      } else if (file.endsWith('.pdf')) {
        console.log(`📄 Traitement: ${file}`);
        // Sera traité en parallèle
      }
    }
  }

  // Récupérer tous les fichiers supportés (PDF, TXT, MD)
  const legalFiles: string[] = [];
  function collectLegalFiles(dir: string) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        collectLegalFiles(filePath);
      } else if (file.endsWith('.pdf') || file.endsWith('.txt') || file.endsWith('.md')) {
        legalFiles.push(filePath);
      }
    }
  }

  collectLegalFiles(LEGAL_REFERENCES_DIR);

  // Traiter les fichiers en parallèle (max 3 à la fois)
  const batchSize = 3;
  for (let i = 0; i < legalFiles.length; i += batchSize) {
    const batch = legalFiles.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (filePath) => {
        const text = await extractFileText(filePath);
        const wordCount = text.split(/\s+/).length;
        return {
          filepath: filePath,
          text,
          wordCount,
        };
      })
    );

    for (const result of results) {
      if (result.text) {
        const filename = path.basename(result.filepath);
        const category = getCategory(result.filepath);
        documents.push({
          filename,
          category,
          text: result.text,
          extracted_at: new Date().toISOString(),
        });
        totalWords += result.wordCount;
        console.log(
          `✅ ${filename} (${result.wordCount} mots) - Catégorie: ${category}`
        );
      }
    }
  }

  const database: LegalDatabase = {
    documents,
    last_updated: new Date().toISOString(),
    total_words: totalWords,
  };

  // Sauvegarder en cache
  try {
    fs.writeFileSync(LEGAL_DB_CACHE, JSON.stringify(database, null, 2));
    console.log(`💾 Base de données sauvegardée (${documents.length} documents)`);
  } catch (error) {
    console.warn('⚠️  Impossible de sauvegarder le cache:', error);
  }

  return database;
}

/**
 * Charge la base depuis le cache si disponible
 */
async function loadDatabase(): Promise<LegalDatabase> {
  // Essayer de charger depuis le cache d'abord
  if (fs.existsSync(LEGAL_DB_CACHE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(LEGAL_DB_CACHE, 'utf-8'));
      console.log(`📚 Base de données chargée depuis le cache`);
      return cached;
    } catch (error) {
      console.warn('⚠️  Cache invalide, reconstruction...');
    }
  }

  // Sinon, construire la base
  return buildLegalDatabase();
}

/**
 * Récupère le contexte légal complet
 */
export function getLegalContext(): string {
  if (!cachedDatabase || cachedDatabase.documents.length === 0) {
    return '';
  }

  const sections = cachedDatabase.documents.map(
    (doc) => `## ${doc.filename} (${doc.category})\n\n${doc.text}\n\n---\n`
  );

  return sections.join('\n');
}

/**
 * Récupère le contexte légal par catégorie
 */
export function getLegalContextByCategory(category: string): string {
  if (!cachedDatabase) return '';

  const filtered = cachedDatabase.documents.filter(
    (doc) => doc.category.toLowerCase() === category.toLowerCase()
  );

  if (filtered.length === 0) return '';

  const sections = filtered.map((doc) => `## ${doc.filename}\n\n${doc.text}\n\n---\n`);
  return sections.join('\n');
}

/**
 * Récupère les stats de la base de données
 */
export function getDatabaseStats() {
  if (!cachedDatabase) {
    return {
      documents: 0,
      categories: 0,
      words: 0,
      lastUpdated: null,
    };
  }

  const categories = new Set(cachedDatabase.documents.map((d) => d.category));

  return {
    documents: cachedDatabase.documents.length,
    categories: categories.size,
    words: cachedDatabase.total_words,
    lastUpdated: cachedDatabase.last_updated,
    categoryList: Array.from(categories),
  };
}

/**
 * Réinitialise la base de données
 */
export async function resetDatabase(): Promise<LegalDatabase> {
  console.log('🔄 Réinitialisation de la base de données...');
  cachedDatabase = null;
  if (fs.existsSync(LEGAL_DB_CACHE)) {
    fs.unlinkSync(LEGAL_DB_CACHE);
  }
  cachedDatabase = await loadDatabase();
  return cachedDatabase;
}

/**
 * Initialise la base de données (à appeler au démarrage du serveur)
 */
export async function initializeLegalDatabase(): Promise<void> {
  try {
    console.log('🚀 Initialisation de la base de connaissances juridique...');
    cachedDatabase = await loadDatabase();
    const stats = getDatabaseStats();
    console.log(`✅ Base de connaissances prête:`);
    console.log(`   - ${stats.documents} documents`);
    console.log(`   - ${stats.categories} catégories`);
    console.log(`   - ${stats.words} mots au total`);
    if (stats.categoryList) {
      console.log(`   - Catégories: ${stats.categoryList.join(', ')}`);
    }
  } catch (error) {
    console.error('❌ Erreur initialisation base de données:', error);
    cachedDatabase = {
      documents: [],
      last_updated: new Date().toISOString(),
      total_words: 0,
    };
  }
}
