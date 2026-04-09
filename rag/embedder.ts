/**
 * Embedder local — @xenova/transformers
 * Modèle: multilingual-e5-small (384 dims, ~120MB, FR/EN/etc.)
 * Téléchargé automatiquement au premier usage dans node_modules/.cache
 */

// @ts-ignore — pas de types officiels pour xenova
import { pipeline, env } from '@xenova/transformers';

// Cache dans node_modules/.cache pour éviter de re-télécharger
env.cacheDir = './node_modules/.cache/xenova';

const MODEL = 'Xenova/multilingual-e5-small';

let _pipe: any = null;
let _loading: Promise<any> | null = null;

async function getPipe() {
  if (_pipe) return _pipe;
  if (_loading) return _loading;
  _loading = pipeline('feature-extraction', MODEL, { quantized: true }).then((p: any) => {
    _pipe = p;
    _loading = null;
    return p;
  });
  return _loading;
}

export async function embed(text: string): Promise<number[]> {
  const pipe = await getPipe();
  const out = await pipe(`query: ${text}`, { pooling: 'mean', normalize: true });
  return Array.from(out.data as Float32Array);
}

export async function embedPassage(text: string): Promise<number[]> {
  const pipe = await getPipe();
  const out = await pipe(`passage: ${text}`, { pooling: 'mean', normalize: true });
  return Array.from(out.data as Float32Array);
}

export async function embedBatch(texts: string[], mode: 'query' | 'passage' = 'passage'): Promise<number[][]> {
  const pipe = await getPipe();
  const results: number[][] = [];
  for (const text of texts) {
    const prefixed = mode === 'query' ? `query: ${text}` : `passage: ${text}`;
    const out = await pipe(prefixed, { pooling: 'mean', normalize: true });
    results.push(Array.from(out.data as Float32Array));
  }
  return results;
}

export async function warmup(): Promise<void> {
  console.log(`[Embedder] Chargement du modèle ${MODEL}...`);
  await getPipe();
  console.log('[Embedder] Modèle prêt.');
}
