import { getStoredToken } from './auth';

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  userId?: string;
  username?: string;
  role?: string;
  query?: string;
  jurisdictionFilter?: string | null;
  ragChunksUsed?: string[];
  citationsFound?: string[];
  responseLength?: number;
  hasContractContext?: boolean;
  error?: string;
  ip?: string;
}

export interface AuditResponse {
  entries: AuditEntry[];
  total: number;
  offset: number;
  limit: number;
}

export async function fetchAuditLog(params?: {
  action?: string;
  username?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditResponse> {
  const token = getStoredToken();
  const qs = new URLSearchParams();
  if (params?.action) qs.set('action', params.action);
  if (params?.username) qs.set('username', params.username);
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));

  const res = await fetch(`/api/audit?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur de chargement des logs');
  }
  return res.json();
}

export function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    login_success: 'Connexion réussie',
    login_failed: 'Échec de connexion',
    chat_query: 'Requête d\'analyse',
    chat_error: 'Erreur d\'analyse',
    rag_rebuild_complete: 'Reconstruction index RAG',
    rag_rebuild_error: 'Erreur reconstruction RAG',
  };
  return labels[action] || action;
}

export function getActionColor(action: string): string {
  if (action.includes('error') || action.includes('failed')) return 'text-red-600 bg-red-50';
  if (action.includes('login')) return 'text-blue-600 bg-blue-50';
  if (action === 'chat_query') return 'text-emerald-600 bg-emerald-50';
  if (action.includes('rag')) return 'text-purple-600 bg-purple-50';
  return 'text-zinc-600 bg-zinc-50';
}

export function formatAuditTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
