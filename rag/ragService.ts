import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFParse } from 'pdf-parse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface RagChunk {
  id: string;
  text: string;
  source: string;
  jurisdiction: string;
  regulation: string;
}

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;
const INDEX_PATH = path.join(__dirname, 'index', 'chunks.json');
const CORPUS_PATH = path.join(__dirname, 'corpus');

// BM25 parameters
const K1 = 1.5;
const B = 0.75;

let chunkStore: RagChunk[] = [];
let isLoaded = false;

// ─── Tokenizer ───────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

// ─── BM25 Search ─────────────────────────────────────────────────────────────

function buildIdf(queryTerms: string[], chunks: RagChunk[]): Map<string, number> {
  const N = chunks.length;
  const df = new Map<string, number>();
  for (const term of queryTerms) {
    let count = 0;
    for (const chunk of chunks) {
      if (chunk.text.toLowerCase().includes(term)) count++;
    }
    df.set(term, count);
  }
  const idf = new Map<string, number>();
  for (const [term, freq] of df) {
    idf.set(term, Math.log((N - freq + 0.5) / (freq + 0.5) + 1));
  }
  return idf;
}

function bm25(queryTerms: string[], chunk: RagChunk, avgLen: number, idf: Map<string, number>): number {
  const tokens = tokenize(chunk.text);
  const len = tokens.length;
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);

  let score = 0;
  for (const term of queryTerms) {
    const freq = tf.get(term) || 0;
    if (freq === 0) continue;
    const idfVal = idf.get(term) || 0;
    score += idfVal * (freq * (K1 + 1)) / (freq + K1 * (1 - B + B * len / avgLen));
  }
  return score;
}

// ─── Text Chunker ─────────────────────────────────────────────────────────────

export function chunkText(
  text: string,
  source: string,
  jurisdiction: string,
  regulation: string
): RagChunk[] {
  const chunks: RagChunk[] = [];
  const paragraphs = text.split(/\n{2,}/);
  let buffer = '';
  let index = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed || trimmed.length < 20) continue;

    if (buffer.length + trimmed.length > CHUNK_SIZE && buffer.length > 100) {
      chunks.push({
        id: `${jurisdiction}/${regulation}_${index++}`,
        text: buffer.trim(),
        source,
        jurisdiction,
        regulation,
      });
      const words = buffer.split(' ');
      buffer = words.slice(-Math.floor(CHUNK_OVERLAP / 6)).join(' ') + '\n\n' + trimmed;
    } else {
      buffer = buffer ? buffer + '\n\n' + trimmed : trimmed;
    }
  }

  if (buffer.trim().length > 50) {
    chunks.push({
      id: `${jurisdiction}/${regulation}_${index}`,
      text: buffer.trim(),
      source,
      jurisdiction,
      regulation,
    });
  }

  return chunks;
}

// ─── PDF Extraction ──────────────────────────────────────────────────────────

export async function extractPdfText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    await parser.load();
    const result = await parser.getText();
    return result.text || '';
  } catch (err) {
    console.error(`[RAG] Failed to extract ${path.basename(filePath)}:`, (err as Error).message);
    return '';
  } finally {
    await parser.destroy();
  }
}

// ─── Corpus Loading ──────────────────────────────────────────────────────────

export async function loadCorpusPdfs(): Promise<RagChunk[]> {
  const chunks: RagChunk[] = [];

  async function walkDir(dir: string, jurisdiction: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkDir(fullPath, entry.name);
      } else if (entry.name.endsWith('.pdf')) {
        console.log(`  [RAG] Extracting ${jurisdiction}/${entry.name}...`);
        const text = await extractPdfText(fullPath);
        if (text.length < 100) continue;
        const regulation = entry.name.replace('.pdf', '').toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const fileChunks = chunkText(text, `${jurisdiction}/${entry.name}`, jurisdiction, regulation);
        chunks.push(...fileChunks);
        console.log(`         → ${fileChunks.length} chunks`);
      }
    }
  }

  await walkDir(CORPUS_PATH, 'root');
  return chunks;
}

// ─── Index Management ────────────────────────────────────────────────────────

export function loadIndex(): boolean {
  if (isLoaded) return true;
  if (!fs.existsSync(INDEX_PATH)) {
    console.warn('[RAG] Index not found — run: npm run rag:index');
    return false;
  }
  try {
    const raw = fs.readFileSync(INDEX_PATH, 'utf-8');
    chunkStore = JSON.parse(raw);
    isLoaded = true;
    console.log(`[RAG] Index loaded: ${chunkStore.length} chunks`);
    return true;
  } catch (err) {
    console.error('[RAG] Failed to load index:', err);
    return false;
  }
}

export function saveIndex(chunks: RagChunk[]): void {
  const indexDir = path.dirname(INDEX_PATH);
  if (!fs.existsSync(indexDir)) fs.mkdirSync(indexDir, { recursive: true });
  // Strip embeddings if present (legacy compatibility)
  const clean = chunks.map(({ id, text, source, jurisdiction, regulation }) =>
    ({ id, text, source, jurisdiction, regulation })
  );
  fs.writeFileSync(INDEX_PATH, JSON.stringify(clean), 'utf-8');
  chunkStore = clean;
  isLoaded = true;
  console.log(`[RAG] Index saved: ${clean.length} chunks`);
}

export function resetIndex(): void {
  chunkStore = [];
  isLoaded = false;
}

// ─── Search (BM25) ───────────────────────────────────────────────────────────

export function search(
  query: string,
  topK = 5,
  jurisdictionFilter?: string
): RagChunk[] {
  if (!isLoaded) loadIndex();
  if (chunkStore.length === 0) return [];

  let candidates = chunkStore;
  if (jurisdictionFilter) {
    const filtered = chunkStore.filter(c => c.jurisdiction === jurisdictionFilter);
    if (filtered.length > 0) candidates = filtered;
  }

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return candidates.slice(0, topK);

  const avgLen = candidates.reduce((sum, c) => sum + tokenize(c.text).length, 0) / candidates.length;
  const idf = buildIdf(queryTerms, candidates);

  const scored = candidates.map(chunk => ({
    chunk,
    score: bm25(queryTerms, chunk, avgLen, idf),
  }));
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map(s => s.chunk);
}

// ─── Status ──────────────────────────────────────────────────────────────────

export function getStatus() {
  return {
    loaded: isLoaded,
    chunks: chunkStore.length,
    indexExists: fs.existsSync(INDEX_PATH),
    corpusPath: CORPUS_PATH,
    jurisdictions: isLoaded
      ? [...new Set(chunkStore.map(c => c.jurisdiction))].filter(j => j !== 'root')
      : [],
  };
}
