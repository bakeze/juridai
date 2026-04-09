import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Loader2, Volume2, VolumeX, Globe } from 'lucide-react';
import { generateElevenLabsSpeech } from '../services/elevenlabs';
import { sendChatMessage, parseCitations, stripCitationTags, detectJurisdiction, ParsedCitation, RagSourceChunk } from '../services/chat';
import { SourceCitation } from './SourceCitation';
import { motion, AnimatePresence } from 'motion/react';

interface Message {
  id: string;
  role: 'user' | 'bot';
  text: string;
  displayText: string; // text with citation tags stripped for display
  citations: ParsedCitation[];
  ragChunks: RagSourceChunk[];
}

interface ChatProps {
  context: string;
}

const JURISDICTION_OPTIONS = [
  { value: '', label: '🌐 Toutes juridictions' },
  { value: 'eu', label: '🇪🇺 Union Européenne' },
  { value: 'france', label: '🇫🇷 France' },
  { value: 'morocco', label: '🇲🇦 Maroc' },
  { value: 'usa', label: '🇺🇸 États-Unis' },
  { value: 'canada', label: '🇨🇦 Canada' },
];

export const Chat: React.FC<ChatProps> = ({ context }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isReading, setIsReading] = useState<string | null>(null);
  const [autoPlayVoice, setAutoPlayVoice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jurisdictionFilter, setJurisdictionFilter] = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleReadAloud = async (message: Message, isAuto = false) => {
    try {
      setError(null);
      if (!isAuto && isReading === message.id) {
        audioRef.current?.pause();
        setIsReading(null);
        return;
      }
      setIsReading(message.id);
      const audioUrl = await generateElevenLabsSpeech(message.displayText);
      if (audioUrl) {
        audioRef.current?.pause();
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.onended = () => setIsReading(null);
        audio.onerror = () => { setError('Erreur audio'); setIsReading(null); };
        await audio.play();
      } else {
        setIsReading(null);
      }
    } catch {
      setIsReading(null);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      displayText: input,
      citations: [],
      ragChunks: [],
    };

    setMessages(prev => [...prev, userMsg]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      // Auto-detect jurisdiction if not manually set
      const jurisdiction = jurisdictionFilter || detectJurisdiction(currentInput);

      const { response, citations: citationStrings, ragChunks } = await sendChatMessage(
        currentInput,
        context,
        jurisdiction || undefined
      );

      const citations = parseCitations(response);
      const displayText = stripCitationTags(response);

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        text: response,
        displayText,
        citations,
        ragChunks,
      };

      setMessages(prev => [...prev, botMsg]);

      if (autoPlayVoice) handleReadAloud(botMsg, true);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'analyse');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[680px] glass rounded-2xl overflow-hidden relative">
      {/* Header */}
      <div className="p-4 border-b border-zinc-100 bg-white/50 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-zinc-900 flex items-center gap-2 shrink-0">
          <Bot className="w-5 h-5 text-indigo-600" />
          Analyse Juridique Multi-Juridictionnelle
        </h3>
        <div className="flex items-center gap-2">
          {/* Jurisdiction filter */}
          <div className="flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-zinc-400" />
            <select
              value={jurisdictionFilter}
              onChange={e => setJurisdictionFilter(e.target.value)}
              className="text-xs bg-zinc-100 border-none rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {JURISDICTION_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setAutoPlayVoice(!autoPlayVoice)}
            className={`p-2 rounded-lg transition-all ${autoPlayVoice ? 'bg-indigo-50 text-indigo-600' : 'bg-zinc-100 text-zinc-400'}`}
            title={autoPlayVoice ? 'Lecture auto activée' : 'Lecture auto désactivée'}
          >
            {autoPlayVoice ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border-b border-red-200 text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">×</button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/30">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 text-sm space-y-3">
            <Bot className="w-10 h-10 text-zinc-300" />
            <div className="text-center space-y-1">
              <p className="font-medium text-zinc-500">Posez une question de conformité juridique</p>
              <p className="text-xs">Ex: "Ce contrat respecte-t-il le RGPD pour l'hébergement aux USA ?"</p>
            </div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map(msg => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[82%] space-y-1 ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                <div
                  className={`p-3 rounded-2xl text-sm ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : 'bg-white border border-zinc-200 text-zinc-800 rounded-tl-none shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1 opacity-70 text-[10px] uppercase font-bold tracking-wider">
                    {msg.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                    {msg.role === 'user' ? 'Vous' : 'JurisVoice AI'}
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed">{msg.displayText}</div>

                  {msg.role === 'bot' && (
                    <button
                      onClick={() => handleReadAloud(msg)}
                      className={`mt-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                        isReading === msg.id ? 'text-indigo-600' : 'text-zinc-400 hover:text-indigo-500'
                      }`}
                    >
                      {isReading === msg.id ? (
                        <><VolumeX className="w-3 h-3" />Arrêter</>
                      ) : (
                        <><Volume2 className="w-3 h-3" />Écouter</>
                      )}
                    </button>
                  )}
                </div>

                {/* Sources & Citations */}
                {msg.role === 'bot' && (msg.citations.length > 0 || msg.ragChunks.length > 0) && (
                  <div className="w-full">
                    <SourceCitation citations={msg.citations} ragChunks={msg.ragChunks} />
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-zinc-200 p-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span className="text-xs text-zinc-500">Analyse en cours...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-zinc-100">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Posez votre question de conformité..."
            className="flex-1 bg-zinc-100 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
