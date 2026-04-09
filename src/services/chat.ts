import { getStoredToken } from './auth';

export interface RagSourceChunk {
  id: string;
  regulation: string;
  jurisdiction: string;
  source: string;
}

export interface ChatResponse {
  response: string;
  citations: string[];
  ragChunks: RagSourceChunk[];
}

export async function sendChatMessage(
  query: string,
  contractContext: string,
  jurisdictionFilter?: string
): Promise<ChatResponse> {
  const token = getStoredToken();

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, contractContext, jurisdictionFilter }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erreur serveur: ${res.status}`);
  }

  return res.json();
}

// ─── Citation Parser (for display) ───────────────────────────────────────────

export interface ParsedCitation {
  raw: string;       // "[[SOURCE: RGPD, Article 44]]"
  label: string;     // "RGPD, Article 44"
  regulation: string; // "RGPD"
  reference: string; // "Article 44"
}

export function parseCitations(text: string): ParsedCitation[] {
  const regex = /\[\[SOURCE:\s*([^\]]+)\]\]/g;
  const seen = new Set<string>();
  const results: ParsedCitation[] = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    const label = match[1].trim();
    if (seen.has(label)) continue;
    seen.add(label);

    const parts = label.split(',').map(s => s.trim());
    results.push({
      raw: match[0],
      label,
      regulation: parts[0] || label,
      reference: parts.slice(1).join(', ') || '',
    });
  }
  return results;
}

export function stripCitationTags(text: string): string {
  return text.replace(/\[\[SOURCE:[^\]]+\]\]/g, '').replace(/\s{2,}/g, ' ').trim();
}

// ─── Jurisdiction detection from query ────────────────────────────────────────

export function detectJurisdiction(query: string): string | undefined {
  const q = query.toLowerCase();
  if (q.includes('maroc') || q.includes('morocco') || q.includes('09-08')) return 'morocco';
  if (q.includes('canada') || q.includes('aida') || q.includes('lprpde')) return 'canada';
  if (q.includes('france') || q.includes('cnil') || q.includes('informatique et libertés')) return 'france';
  if (q.includes('usa') || q.includes('états-unis') || q.includes('nist') || q.includes('federal')) return 'usa';
  return undefined; // no filter = all jurisdictions
}
