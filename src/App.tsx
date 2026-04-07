import React, { useState, useCallback } from 'react';
import { FileText, Upload, Shield, Scale, Mic, MessageSquare, CheckCircle2, AlertCircle, Loader2, Settings, Trash2, Plus } from 'lucide-react';
import { extractTextFromPdf } from './services/pdf';
import { VoiceAssistantLive } from './components/VoiceAssistantLive';
import { Chat } from './components/Chat';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [pdfText, setPdfText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sourceDocuments, setSourceDocuments] = useState<{ name: string, text: string }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isProcessingSource, setIsProcessingSource] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'voice'>('chat');

  const combinedContext = [
    ...sourceDocuments.map(doc => `DOCUMENT SOURCE (${doc.name}):\n${doc.text}`),
    pdfText ? `DOCUMENT ACTUEL (${fileName}):\n${pdfText}` : ''
  ].filter(Boolean).join('\n\n---\n\n');

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Veuillez sélectionner un fichier PDF valide.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setFileName(file.name);

    try {
      const text = await extractTextFromPdf(file);
      if (text.trim().length === 0) {
        throw new Error('Le PDF semble vide ou illisible.');
      }
      setPdfText(text);
    } catch (err) {
      console.error('PDF Error:', err);
      setError('Erreur lors de la lecture du PDF. Assurez-vous qu\'il contient du texte extractible.');
      setFileName(null);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleSourceUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingSource(true);
    setError(null);

    try {
      const fileList = Array.from(files) as File[];
      for (const file of fileList) {
        if (file.type !== 'application/pdf') continue;
        const text = await extractTextFromPdf(file);
        if (text.trim().length > 0) {
          setSourceDocuments(prev => [...prev, { name: file.name, text }]);
        }
      }
    } catch (err) {
      console.error('Source PDF Error:', err);
      setError('Erreur lors de l\'ajout des documents sources.');
    } finally {
      setIsProcessingSource(false);
    }
  }, []);

  const removeSourceDocument = (index: number) => {
    setSourceDocuments(prev => prev.filter((_, i) => i !== index));
  };

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
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold border border-emerald-100">
              <Shield className="w-3 h-3" />
              Conformité RGPD & AI Act
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Document Upload & Info */}
        <div className="lg:col-span-4 space-y-6">
          {/* Knowledge Base / Settings */}
          <section className="glass p-6 rounded-3xl space-y-4 border-2 border-indigo-100/50">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" />
                Base de Connaissances
              </h2>
              <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Permanent</span>
            </div>
            <p className="text-xs text-zinc-500">Documents de référence sur lesquels l'IA se basera systématiquement.</p>
            
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
              {sourceDocuments.map((doc, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-zinc-100/50 rounded-xl border border-zinc-200 group">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-zinc-400" />
                    <p className="text-xs font-medium text-zinc-700 truncate">{doc.name}</p>
                  </div>
                  <button 
                    onClick={() => removeSourceDocument(i)}
                    className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {sourceDocuments.length === 0 && (
                <div className="text-center py-4 border border-dashed border-zinc-200 rounded-xl">
                  <p className="text-[10px] text-zinc-400 font-medium italic">Aucun document source configuré</p>
                </div>
              )}
            </div>

            <label className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-indigo-200 rounded-2xl cursor-pointer hover:bg-indigo-50/50 transition-all group">
              <input type="file" className="hidden" accept=".pdf" multiple onChange={handleSourceUpload} disabled={isProcessingSource} />
              {isProcessingSource ? (
                <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />
              )}
              <span className="text-xs font-bold text-indigo-600">Ajouter des sources</span>
            </label>
          </section>

          <section className="glass p-6 rounded-3xl space-y-4">
            <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              Analyse Actuelle
            </h2>
            <p className="text-xs text-zinc-500">Document spécifique à analyser pour cette session.</p>
            
            {!pdfText ? (
              <label className={`relative group cursor-pointer border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center transition-all duration-300 ${
                isProcessing ? 'border-indigo-300 bg-indigo-50/30' : 'border-zinc-200 hover:border-indigo-400 hover:bg-zinc-100/50'
              }`}>
                <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} disabled={isProcessing} />
                {isProcessing ? (
                  <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
                ) : (
                  <Upload className="w-10 h-10 text-zinc-400 group-hover:text-indigo-500 mb-4 transition-colors" />
                )}
                <p className="text-sm font-medium text-zinc-900">
                  {isProcessing ? 'Analyse en cours...' : 'Cliquez pour uploader un PDF'}
                </p>
                <p className="text-xs text-zinc-500 mt-2">Contrat, CGU, Règlementation...</p>
              </label>
            ) : (
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-indigo-900 truncate">{fileName}</p>
                  <p className="text-xs text-indigo-700 mt-1">Analyse terminée • {pdfText.length.toLocaleString()} caractères</p>
                  <button 
                    onClick={() => { setPdfText(null); setFileName(null); }}
                    className="text-xs font-bold text-indigo-600 mt-3 hover:underline"
                  >
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

          <section className="glass p-6 rounded-3xl space-y-4">
            <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider">Capacités d'Analyse</h2>
            <ul className="space-y-3">
              {[
                { icon: Shield, label: 'Conformité RGPD', desc: 'Analyse des transferts hors UE' },
                { icon: Scale, label: 'AI Act Compliance', desc: 'Validation des systèmes IA' },
                { icon: FileText, label: 'Loi 09-08 (Maroc)', desc: 'Protection des données locales' },
              ].map((item, i) => (
                <li key={i} className="flex gap-3">
                  <div className="bg-zinc-100 p-2 rounded-lg h-fit">
                    <item.icon className="w-4 h-4 text-zinc-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">{item.label}</p>
                    <p className="text-xs text-zinc-500">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Right Column: Interaction */}
        <div className="lg:col-span-8 space-y-6">
          {!combinedContext ? (
            <div className="h-full min-h-[500px] flex flex-col items-center justify-center glass rounded-3xl p-12 text-center">
              <div className="w-20 h-20 bg-zinc-100 rounded-full flex items-center justify-center mb-6">
                <FileText className="w-10 h-10 text-zinc-300" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 mb-2">En attente de documents</h3>
              <p className="text-zinc-500 max-w-md">
                Uploadez des documents sources ou un fichier à analyser pour commencer l'analyse interactive.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Tabs */}
              <div className="flex p-1 bg-zinc-200/50 rounded-2xl w-fit">
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold transition-all ${
                    activeTab === 'chat' ? 'bg-white text-indigo-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  Chat Interactif
                </button>
                <button
                  onClick={() => setActiveTab('voice')}
                  className={`flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold transition-all ${
                    activeTab === 'voice' ? 'bg-white text-indigo-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  <Mic className="w-4 h-4" />
                  Assistant Vocal
                </button>
              </div>

              <AnimatePresence mode="wait">
                {activeTab === 'chat' ? (
                  <motion.div
                    key="chat"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <Chat context={combinedContext} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="voice"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex flex-col items-center justify-center py-12"
                  >
                    <VoiceAssistantLive documentContext={combinedContext} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-zinc-200 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-zinc-400 font-medium">
            © 2026 JurisVoice AI. Outil d'aide à la décision juridique. Ne remplace pas un avocat.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-xs font-bold text-zinc-500 hover:text-indigo-600 transition-colors">Confidentialité</a>
            <a href="#" className="text-xs font-bold text-zinc-500 hover:text-indigo-600 transition-colors">Conditions d'utilisation</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

