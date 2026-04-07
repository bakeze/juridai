import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Loader2, Send } from 'lucide-react';
import { getChatResponse } from '../services/gemini';
import { generateElevenLabsSpeech, stopAudio } from '../services/elevenlabs';
import { motion } from 'motion/react';

interface VoiceAssistantProps {
  context: string;
}

// Fonction pour formater le texte markdown en mode lisible (sans caractères bruts)
function formatResponseText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')  // **gras** → gras
    .replace(/\*(.+?)\*/g, '$1')       // *italique* → italique
    .replace(/__(.+?)__/g, '$1')       // __gras__ → gras
    .replace(/_(.+?)_/g, '$1')         // _italique_ → italique
    .replace(/`(.+?)`/g, '$1')         // `code` → code
    .replace(/\n\n+/g, '\n')           // Réduire espaces
    .trim();
}

export const VoiceAssistant: React.FC<VoiceAssistantProps> = ({ context }) => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptBufferRef = useRef('');

  // Charger les voix disponibles au démarrage
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      console.log('🎤 Voix disponibles:', voices.length);
      voices.forEach((voice, i) => {
        if (voice.lang?.includes('fr')) {
          console.log(`  [${i}] ${voice.name} (${voice.lang})`);
        }
      });
    };

    // Les voix peuvent ne pas être disponibles immédiatement
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    } else {
      loadVoices();
    }
  }, []);

  // Initialiser la reconnaissance vocale
  useEffect(() => {
    const SpeechRecognition = window.webkitSpeechRecognition || (window as any).SpeechRecognition;
    
    if (!SpeechRecognition) {
      console.error('Web Speech API non supportée');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'fr-FR';

    recognition.onstart = () => {
      console.log('🎤 Écoute commencée');
      transcriptBufferRef.current = '';
      setTranscript('');
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          transcriptBufferRef.current += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      setTranscript(transcriptBufferRef.current + interim);
    };

    recognition.onend = () => {
      console.log('🛑 Écoute terminée');
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error('Erreur reconnaissance:', event.error);
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      // Arrêter la synthèse vocale ElevenLabs en cours
      stopAudio();
    };
  }, []);

  const startListening = () => {
    if (!context) {
      alert('⚠️ Veuillez charger un document PDF avant de démarrer.');
      return;
    }

    if (!recognitionRef.current) {
      alert('Reconnaissance vocale non supportée');
      return;
    }

    setIsListening(true);
    transcriptBufferRef.current = '';
    setTranscript('');
    setResponse('');
    recognitionRef.current.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    stopAudio(); // Arrêter aussi l'audio ElevenLabs en cours de lecture
    setIsListening(false);
  };

  const handleSend = async () => {
    if (!transcript.trim() || isProcessing) return;

    setIsProcessing(true);
    try {
      console.log('📤 Envoi du texte:', transcript);
      
      // Obtenir la réponse de Gemini
      const aiResponse = await getChatResponse(transcript, context);
      setResponse(aiResponse);
      console.log('✅ Réponse reçue:', aiResponse.substring(0, 100) + '...');

      // Générer l'audio avec TTS gratuit (Web Speech API native)
      console.log('🔊 Synthèse vocale TTS native (gratuit & illimité)...');
      setIsPlaying(true);
      
      try {
        await generateElevenLabsSpeech(aiResponse);
        console.log('✅ Synthèse vocale terminée');
      } catch (audioErr) {
        console.error('Erreur ElevenLabs:', audioErr);
      } finally {
        setIsPlaying(false);
      }
    } catch (err) {
      console.error('Erreur:', err);
      alert('Erreur lors du traitement');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 p-8 glass rounded-3xl w-full max-w-md mx-auto">
      {/* Bouton Microphone */}
      <div className="relative">
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={isProcessing}
          className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 z-10 ${
            isListening 
              ? 'bg-red-500 text-white shadow-xl shadow-red-200' 
              : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-xl shadow-indigo-100'
          } disabled:opacity-50`}
        >
          {isProcessing ? (
            <Loader2 className="w-10 h-10 animate-spin" />
          ) : isListening ? (
            <MicOff className="w-10 h-10" />
          ) : (
            <Mic className="w-10 h-10" />
          )}
        </button>
      </div>

      {/* Titre */}
      <div className="text-center space-y-2">
        <h3 className="text-lg font-bold text-zinc-900">
          {isListening ? 'Je vous écoute...' : isProcessing ? 'Traitement...' : isPlaying ? '🔊 Lecture' : 'JurisVoice'}
        </h3>
        <p className="text-sm text-zinc-500">
          {isListening ? 'Parlez maintenant' : 'Cliquez pour parler'}
        </p>
      </div>

      {/* Transcription */}
      {transcript && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full bg-zinc-100/50 p-4 rounded-2xl border border-zinc-200"
        >
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Vous :</p>
          <p className="text-sm text-zinc-700 italic">"{transcript}"</p>
        </motion.div>
      )}

      {/* Réponse */}
      {response && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full bg-indigo-50 p-4 rounded-2xl border border-indigo-100"
        >
          <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-1">JurisVoice :</p>
          <p className="text-sm text-indigo-900 leading-relaxed whitespace-pre-wrap">{formatResponseText(response)}</p>
        </motion.div>
      )}

      {/* Bouton Envoyer */}
      {transcript && !isPlaying && (
        <button
          onClick={handleSend}
          disabled={isProcessing || !transcript}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Send className="w-4 h-4" />
          Envoyer
        </button>
      )}
    </div>
  );
};
