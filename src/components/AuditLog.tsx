import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, RefreshCw, Filter, ChevronLeft, ChevronRight,
  AlertCircle, CheckCircle2, User, Loader2, Trash2, Download
} from 'lucide-react';
import { fetchAuditLog, getActionLabel, getActionColor, formatAuditTimestamp, AuditEntry } from '../services/audit';
import { getStoredToken, canAccessAudit, User as UserType } from '../services/auth';

interface AuditLogProps {
  currentUser: UserType;
}

const PAGE_SIZE = 20;

const ACTION_OPTIONS = [
  { value: '', label: 'Toutes les actions' },
  { value: 'chat_query', label: 'Requêtes d\'analyse' },
  { value: 'login_success', label: 'Connexions réussies' },
  { value: 'login_failed', label: 'Connexions échouées' },
  { value: 'chat_error', label: 'Erreurs d\'analyse' },
  { value: 'rag_rebuild_complete', label: 'Reconstruction RAG' },
];

export const AuditLog: React.FC<AuditLogProps> = ({ currentUser }) => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('');
  const [usernameFilter, setUsernameFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAuditLog({
        action: actionFilter || undefined,
        username: usernameFilter || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setEntries(data.entries);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [actionFilter, usernameFilter, offset]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!confirm('Effacer tout le journal d\'audit ?')) return;
    const token = getStoredToken();
    await fetch('/api/audit', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setEntries([]);
    setTotal(0);
  };

  const handleExport = () => {
    const csv = [
      'Timestamp,Action,Utilisateur,Rôle,Requête,Citations,Statut',
      ...entries.map(e => [
        e.timestamp,
        e.action,
        e.username || '',
        e.role || '',
        JSON.stringify(e.query || ''),
        (e.citationsFound || []).join('; '),
        e.error ? 'Erreur' : 'OK',
      ].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  if (!canAccessAudit(currentUser)) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
        <AlertCircle className="w-10 h-10 mb-3" />
        <p className="font-medium">Accès réservé aux Responsables Conformité et Administrateurs</p>
      </div>
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-indigo-600" />
          <h2 className="font-bold text-zinc-900">Journal d'Audit</h2>
          <span className="bg-zinc-100 text-zinc-600 text-xs font-bold px-2 py-0.5 rounded-full">{total}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={entries.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-800 border border-zinc-200 hover:border-zinc-300 rounded-lg transition-all disabled:opacity-40">
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          {currentUser.role === 'admin' && (
            <button onClick={handleDelete} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg transition-all">
              <Trash2 className="w-3.5 h-3.5" />
              Effacer
            </button>
          )}
          <button onClick={load} disabled={isLoading} className="p-1.5 text-zinc-500 hover:text-indigo-600 border border-zinc-200 hover:border-indigo-300 rounded-lg transition-all disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl border border-zinc-200">
        <Filter className="w-4 h-4 text-zinc-400 shrink-0" />
        <select
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setOffset(0); }}
          className="flex-1 bg-white border border-zinc-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input
          type="text"
          value={usernameFilter}
          onChange={e => { setUsernameFilter(e.target.value); setOffset(0); }}
          placeholder="Filtrer par utilisateur..."
          className="w-40 bg-white border border-zinc-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Entries */}
      <div className="space-y-1.5">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
          </div>
        )}
        {!isLoading && entries.length === 0 && (
          <div className="text-center py-12 text-zinc-400 text-sm italic">
            Aucun événement dans le journal
          </div>
        )}
        {entries.map(entry => (
          <div
            key={entry.id}
            className="bg-white border border-zinc-200 rounded-xl overflow-hidden"
          >
            <button
              onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 transition-colors"
            >
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getActionColor(entry.action)}`}>
                {getActionLabel(entry.action)}
              </span>
              <span className="flex items-center gap-1 text-xs text-zinc-500 font-medium">
                <User className="w-3 h-3" />
                {entry.username || '—'}
              </span>
              <span className="text-xs text-zinc-400 ml-auto">{formatAuditTimestamp(entry.timestamp)}</span>
              {entry.citationsFound && entry.citationsFound.length > 0 && (
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                  {entry.citationsFound.length} citations
                </span>
              )}
            </button>

            {expandedId === entry.id && (
              <div className="px-4 pb-4 pt-0 border-t border-zinc-100 bg-zinc-50 space-y-2">
                {entry.query && (
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase">Requête</p>
                    <p className="text-xs text-zinc-700 mt-1">{entry.query}</p>
                  </div>
                )}
                {entry.jurisdictionFilter && (
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase">Juridiction</p>
                    <p className="text-xs text-zinc-700 mt-1">{entry.jurisdictionFilter}</p>
                  </div>
                )}
                {entry.citationsFound && entry.citationsFound.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase">Sources citées</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {entry.citationsFound.map((c, i) => (
                        <span key={i} className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
                {entry.ragChunksUsed && entry.ragChunksUsed.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase">Chunks RAG utilisés</p>
                    <p className="text-xs text-zinc-500 mt-1">{entry.ragChunksUsed.join(', ')}</p>
                  </div>
                )}
                {entry.responseLength && (
                  <p className="text-[10px] text-zinc-400">Réponse: {entry.responseLength} caractères</p>
                )}
                {entry.error && (
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="w-3 h-3" />
                    {entry.error}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-500">{total} entrées — page {currentPage}/{totalPages}</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0} className="p-1.5 border border-zinc-200 rounded-lg disabled:opacity-40 hover:border-indigo-300 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setOffset(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total} className="p-1.5 border border-zinc-200 rounded-lg disabled:opacity-40 hover:border-indigo-300 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
