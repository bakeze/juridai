import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Loader2, Volume2, VolumeX, Settings2 } from 'lucide-react';
import { getChatResponse } from '../services/gemini';
import { generateElevenLabsSpeech } from '../services/elevenlabs';
import { motion, AnimatePresence } from 'motion/react';

interface Message {
  id: string;
  role: 'user' | 'bot';
  text: string;
}

interface ChatProps {
  context: string;
}

export const Chat: React.FC<ChatProps> = ({ context }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isReading, setIsReading] = useState<string | null>(null);
  const [autoPlayVoice, setAutoPlayVoice] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleReadAloud = async (message: Message, isAuto = false) => {
    try {
      setError(null);
      
      if (!isAuto && isReading === message.id) {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        setIsReading(null);
        return;
      }

      setIsReading(message.id);

      const audioUrl = await generateElevenLabsSpeech(message.text);
      
      if (audioUrl) {
        if (audioRef.current) audioRef.current.pause();
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.onended = () => setIsReading(null);
        audio.onerror = () => {
          setError('Erreur lors de la lecture audio');
          setIsReading(null);
        };
        await audio.play();
      } else {
        setError('Erreur lors de la génération de la voix');
        setIsReading(null);
      }
    } catch (err) {
      console.error('Read aloud error:', err);
      setError('Erreur lors de la lecture audio');
      setIsReading(null);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !context || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await getChatResponse(input, context);
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        text: response || "Désolé, je n'ai pas pu générer de réponse.",
      };
      setMessages(prev => [...prev, botMsg]);
      
      if (autoPlayVoice) {
        handleReadAloud(botMsg, true);
      }
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] glass rounded-2xl overflow-hidden relative">
      <div className="p-4 border-b border-zinc-100 bg-white/50 flex items-center justify-between">
        <h3 className="font-semibold text-zinc-900 flex items-center gap-2">
          <Bot className="w-5 h-5 text-indigo-600" />
          Analyse Juridique
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoPlayVoice(!autoPlayVoice)}
            className={`p-2 rounded-lg transition-all ${
              autoPlayVoice ? 'bg-indigo-50 text-indigo-600' : 'bg-zinc-100 text-zinc-400'
            }`}
            title={autoPlayVoice ? "Lecture automatique activée" : "Lecture automatique désactivée"}
          >
            {autoPlayVoice ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border-b border-red-200 text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/30">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 text-sm italic">
            Posez une question sur le document PDF...
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-tr-none'
                    : 'bg-white border border-zinc-200 text-zinc-800 rounded-tl-none shadow-sm'
                }`}
              >
                <div className="flex items-center gap-2 mb-1 opacity-70 text-[10px] uppercase font-bold tracking-wider">
                  {msg.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                  {msg.role === 'user' ? 'Vous' : 'JurisVoice AI'}
                </div>
                <div className="whitespace-pre-wrap">{msg.text}</div>
                
                {msg.role === 'bot' && (
                  <button
                    onClick={() => handleReadAloud(msg)}
                    className={`mt-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      isReading === msg.id ? 'text-indigo-600' : 'text-zinc-400 hover:text-indigo-500'
                    }`}
                  >
                    {isReading === msg.id ? (
                      <>
                        <VolumeX className="w-3 h-3" />
                        Arrêter
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3 h-3" />
                        Écouter (HD)
                      </>
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-zinc-200 p-3 rounded-2xl rounded-tl-none shadow-sm">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-zinc-100">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Posez votre question..."
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
