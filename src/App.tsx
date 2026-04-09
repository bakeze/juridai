import React, { useState, useCallback, useEffect } from 'react';
import {
  FileText, Upload, Shield, Scale, Mic, MessageSquare,
  CheckCircle2, AlertCircle, Loader2, Settings, Trash2, Plus,
  ClipboardList, LogOut, User, ChevronDown, Database, RefreshCw
} from 'lucide-react';
import { extractTextFromPdf } from './services/pdf';
import { VoiceAssistant } from './components/VoiceAssistant';
import { Chat } from './components/Chat';
import { Login } from './components/Login';
import { AuditLog } from './components/AuditLog';
import { motion, AnimatePresence } from 'motion/react';
import {
  User as UserType, getStoredToken, getStoredUser, verifyToken,
  logout, canAccessAudit, canRebuildIndex, getRoleLabel, getRoleBadgeColor
} from './services/auth';

type MainTab = 'chat' | 'voice' | 'audit';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const [pdfText, setPdfText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sourceDocuments, setSourceDocuments] = useState<{ name: string; text: string }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isProcessingSource, setIsProcessingSource] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MainTab>('chat');

  const [ragStatus, setRagStatus] = useState<{ loaded: boolean; chunks: number } | null>(null);
  const [isRebuildingRag, setIsRebuildingRag] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    const stored = getStoredUser();
    const token = getStoredToken();
    if (stored && token) {
      setCurrentUser(stored);
      verifyToken()
        .then(user => { if (!user) setCurrentUser(null); else setCurrentUser(user); })
        .finally(() => setIsAuthLoading(false));
    } else {
      setIsAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const token = getStoredToken();
    fetch('/api/rag/status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setRagStatus).catch(() => null);
  }, [currentUser]);

  const handleLogin = (user: UserType) => setCurrentUser(user);
  const handleLogout = () => { logout(); setCurrentUser(null); };

  const combinedContext = [
    ...sourceDocuments.map(doc => `DOCUMENT SOURCE (${doc.name}):\n${doc.text}`),
    pdfText ? `DOCUMENT ACTUEL (${fileName}):\n${pdfText}` : '',
  ].filter(Boolean).join('\n\n---\n\n');

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { setError('Veuillez sélectionner un fichier PDF valide.'); return; }
    setIsProcessing(true); setError(null); setFileName(file.name);
    try {
      const text = await extractTextFromPdf(file);
      if (text.trim().length === 0) throw new Error('PDF vide ou illisible.');
      setPdfText(text);
    } catch { setError('Erreur lors de la lecture du PDF.'); setFileName(null); }
    finally { setIsProcessing(false); }
  }, []);

  const handleSourceUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsProcessingSource(true);
    try {
      for (const file of Array.from(files) as File[]) {
        if (file.type !== 'application/pdf') continue;
        const text = await extractTextFromPdf(file);
        if (text.trim().length > 0) setSourceDocuments(prev => [...prev, { name: file.name, text }]);
      }
    } catch { setError('Erreur lors de l\'ajout des documents sources.'); }
    finally { setIsProcessingSource(false); }
  }, []);

  const handleRebuildRag = async () => {
    if (!confirm('Reconstruire l\'index RAG ? Cette opération peut prendre plusieurs minutes.')) return;
    setIsRebuildingRag(true);
    const token = getStoredToken();
    await fetch('/api/rag/rebuild', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      .catch(() => null);
    setTimeout(() => setIsRebuildingRag(false), 3000);
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!currentUser) return <Login onLogin={handleLogin} />;

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-200">
              <Scale className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900 tracking-tight">JurisVoice AI</h1>
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Assistant Juridique Intelligent</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {ragStatus && (
              <div className={`hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${ragStatus.loaded ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                <Database className="w-3 h-3" />
                {ragStatus.loaded ? `RAG: ${ragStatus.chunks} chunks` : 'RAG: non indexé'}
              </div>
            )}
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold border border-emerald-100">
              <Shield className="w-3 h-3" />
              RGPD & AI Act
            </div>

            <div className="relative">
              <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors text-sm">
                <User className="w-4 h-4 text-zinc-600" />
                <span className="font-medium text-zinc-700 hidden md:block">{currentUser.name}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${getRoleBadgeColor(currentUser.role)}`}>
                  {getRoleLabel(currentUser.role)}
                </span>
                <ChevronDown className="w-3 h-3 text-zinc-400" />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-zinc-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-100">
                    <p className="text-sm font-semibold text-zinc-900">{currentUser.name}</p>
                    <p className="text-xs text-zinc-500">{currentUser.email}</p>
                  </div>
                  {canRebuildIndex(currentUser) && (
                    <button onClick={() => { setShowUserMenu(false); handleRebuildRag(); }} disabled={isRebuildingRag} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50">
                      <RefreshCw className={`w-4 h-4 ${isRebuildingRag ? 'animate-spin' : ''}`} />
                      {isRebuildingRag ? 'Reconstruction...' : 'Reconstruire index RAG'}
                    </button>
                  )}
                  <button onClick={() => { setShowUserMenu(false); handleLogout(); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                    <LogOut className="w-4 h-4" />
                    Se déconnecter
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column */}
        <div className="lg:col-span-4 space-y-6">
          <section className="glass p-6 rounded-3xl space-y-4 border-2 border-indigo-100/50">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" />
                Base de Connaissances
              </h2>
              <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Permanent</span>
            </div>
            <p className="text-xs text-zinc-500">Documents additionnels (en complément du corpus RAG).</p>
            <div className="space-y-2 max-h-[180px] overflow-y-auto pr-2">
              {sourceDocuments.map((doc, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-zinc-100/50 rounded-xl border border-zinc-200 group">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
                    <p className="text-xs font-medium text-zinc-700 truncate">{doc.name}</p>
                  </div>
                  <button onClick={() => setSourceDocuments(prev => prev.filter((_, idx) => idx !== i))} className="p-1.5 text-zinc-400 hover:text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {sourceDocuments.length === 0 && (
                <div className="text-center py-4 border border-dashed border-zinc-200 rounded-xl">
                  <p className="text-[10px] text-zinc-400 italic">Corpus RAG actif — ajoutez des sources spécifiques ici</p>
                </div>
              )}
            </div>
            <label className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-indigo-200 rounded-2xl cursor-pointer hover:bg-indigo-50/50 transition-all group">
              <input type="file" className="hidden" accept=".pdf" multiple onChange={handleSourceUpload} disabled={isProcessingSource} />
              {isProcessingSource ? <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" /> : <Plus className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />}
              <span className="text-xs font-bold text-indigo-600">Ajouter des sources</span>
            </label>
          </section>

          <section className="glass p-6 rounded-3xl space-y-4">
            <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              Contrat à Analyser
            </h2>
            {!pdfText ? (
              <label className={`relative group cursor-pointer border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center transition-all duration-300 ${isProcessing ? 'border-indigo-300 bg-indigo-50/30' : 'border-zinc-200 hover:border-indigo-400 hover:bg-zinc-100/50'}`}>
                <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} disabled={isProcessing} />
                {isProcessing ? <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" /> : <Upload className="w-10 h-10 text-zinc-400 group-hover:text-indigo-500 mb-4 transition-colors" />}
                <p className="text-sm font-medium text-zinc-900">{isProcessing ? 'Analyse en cours...' : 'Cliquez pour uploader un PDF'}</p>
                <p className="text-xs text-zinc-500 mt-2">Contrat, CGU, Accord-cadre...</p>
              </label>
            ) : (
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-indigo-900 truncate">{fileName}</p>
                  <p className="text-xs text-indigo-700 mt-1">{pdfText.length.toLocaleString()} caractères extraits</p>
                  <button onClick={() => { setPdfText(null); setFileName(null); }} className="text-xs font-bold text-indigo-600 mt-3 hover:underline">
                    Changer de document
                  </button>
                </div>
              </div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                <p className="text-xs text-red-700 font-medium">{error}</p>
              </div>
            )}
          </section>

          <section className="glass p-6 rounded-3xl space-y-3">
            <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider">Corpus Réglementaire RAG</h2>
            <ul className="space-y-2">
              {[
                { flag: '🇪🇺', label: 'RGPD + AI Act + DGA', desc: 'Transferts hors UE, systèmes IA' },
                { flag: '🇫🇷', label: 'Loi Informatique & Libertés + CNIL', desc: 'Référentiel IA, données sensibles' },
                { flag: '🇲🇦', label: 'Loi 09-08', desc: 'Protection des données au Maroc' },
                { flag: '🇺🇸', label: 'NIST AI RMF + SP 800-53', desc: 'Cybersécurité & risques IA US' },
                { flag: '🇨🇦', label: 'AIDA / LPRPDE', desc: 'Réglementation IA canadienne' },
              ].map((item, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <span className="text-base leading-none mt-0.5">{item.flag}</span>
                  <div>
                    <p className="text-xs font-semibold text-zinc-900">{item.label}</p>
                    <p className="text-xs text-zinc-500">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex p-1 bg-zinc-200/50 rounded-2xl w-fit">
            {([
              { id: 'chat' as MainTab, icon: MessageSquare, label: 'Chat Juridique' },
              { id: 'voice' as MainTab, icon: Mic, label: 'Assistant Vocal' },
              ...(canAccessAudit(currentUser) ? [{ id: 'audit' as MainTab, icon: ClipboardList, label: 'Journal d\'Audit' }] : []),
            ] as { id: MainTab; icon: any; label: string }[]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'chat' && (
              <motion.div key="chat" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <Chat context={combinedContext} />
              </motion.div>
            )}
            {activeTab === 'voice' && (
              <motion.div key="voice" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col items-center justify-center py-12">
                <VoiceAssistant context={combinedContext} />
              </motion.div>
            )}
            {activeTab === 'audit' && canAccessAudit(currentUser) && (
              <motion.div key="audit" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div className="glass p-6 rounded-3xl">
                  <AuditLog currentUser={currentUser} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <footer className="px-6 py-6 border-t border-zinc-200 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-zinc-400 font-medium">© 2026 JurisVoice AI — Outil d'aide à la décision. Ne remplace pas un avocat.</p>
          <span className="text-xs text-zinc-400">Session: {currentUser.name} · {getRoleLabel(currentUser.role)}</span>
        </div>
      </footer>

      {showUserMenu && <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />}
    </div>
  );
}
