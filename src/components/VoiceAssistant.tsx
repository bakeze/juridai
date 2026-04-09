import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { getChatResponse } from '../services/gemini';
import { generateElevenLabsSpeech, stopAudio } from '../services/elevenlabs';
import { motion } from 'motion/react';

interface VoiceAssistantProps {
  context: string;
}

/**
 * Assistant vocal - Simple et Fiable
 * Utilise Web Speech API + Gemini Chat + Web Speech Synthesis
 */
export const VoiceAssistant: React.FC<VoiceAssistantProps> = ({ context }) => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState('');

  const recognitionRef = useRef<any>(null);
  const transcriptBufferRef = useRef('');

  // Initialiser reconnaissance vocale
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError('Web Speech API non supportée dans ce navigateur');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'fr-FR';

    recognition.onstart = () => {
      console.log('🎤 Écoute commencée');
      transcriptBufferRef.current = '';
      setTranscript('');
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          transcriptBufferRef.current += text + ' ';
        } else {
          interim += text;
        }
      }
      const finalTranscript = transcriptBufferRef.current + interim;
      setTranscript(finalTranscript);
      console.log('📝 Transcription:', finalTranscript);
    };

    recognition.onend = () => {
      console.log('🛑 Écoute terminée');
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error('❌ Erreur reconnaissance:', event.error);
      setError(`Erreur: ${event.error}`);
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      stopAudio();
    };
  }, []);

  const startListening = () => {
    if (!context?.trim()) {
      setError('⚠️ Veuillez charger un document PDF avant');
      return;
    }

    if (!recognitionRef.current) {
      setError('Reconnaissance vocale non supportée');
      return;
    }

    console.log('▶️ Démarrage écoute...');
    setIsListening(true);
    transcriptBufferRef.current = '';
    setTranscript('');
    setResponse('');
    setError('');
    recognitionRef.current.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  // Quand la transcription est terminée, envoyer automatiquement
  useEffect(() => {
    if (!isListening && transcript.trim() && !isProcessing && !isPlaying) {
      handleAutomaticSend();
    }
  }, [isListening, transcript]);

  const handleAutomaticSend = async () => {
    if (!transcript.trim() || isProcessing) return;

    setIsProcessing(true);
    try {
      console.log('📤 Envoi automatique:', transcript);
      
      // Obtenir réponse de Gemini
      const aiResponse = await getChatResponse(transcript, context);
      setResponse(aiResponse);
      console.log('✅ Réponse:', aiResponse.substring(0, 100));

      // Lire la réponse
      setIsPlaying(true);
      console.log('🔊 Lecture...');
      
      try {
        await generateElevenLabsSpeech(aiResponse);
        console.log('✅ Lecture terminée');
      } catch (audioErr) {
        console.error('❌ Erreur lecture:', audioErr);
      } finally {
        setIsPlaying(false);
        
        // Redémarrer l'écoute automatiquement après la réponse
        setTimeout(() => {
          if (recognitionRef.current && !isListening) {
            console.log('▶️ Redémarrage écoute automatique...');
            transcriptBufferRef.current = '';
            setTranscript('');
            recognitionRef.current.start();
            setIsListening(true);
          }
        }, 500);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('❌ Erreur:', msg);
      setError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStopSpeaking = () => {
    console.log('🛑 Arrêt de la lecture');
    stopAudio();
    setIsPlaying(false);
    
    // Redémarrer l'écoute
    setTimeout(() => {
      if (recognitionRef.current && !isListening) {
        console.log('▶️ Redémarrage écoute après arrêt...');
        transcriptBufferRef.current = '';
        setTranscript('');
        setResponse('');
        recognitionRef.current.start();
        setIsListening(true);
      }
    }, 300);
  };

  return (
    <div className="flex flex-col items-center gap-6 p-8 glass rounded-3xl w-full max-w-md mx-auto">
      {/* Bouton Principal - Microphone ou Stop */}
      {isPlaying ? (
        <button
          onClick={handleStopSpeaking}
          className="w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 bg-orange-500 text-white shadow-lg hover:bg-orange-600"
        >
          <div className="text-3xl">⏹️</div>
        </button>
      ) : (
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={isProcessing}
          className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
            isListening
              ? 'bg-red-500 text-white shadow-lg animate-pulse'
              : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg'
          } disabled:opacity-50`}
        >
          {isListening ? (
            <MicOff className="w-10 h-10" />
          ) : (
            <Mic className="w-10 h-10" />
          )}
        </button>
      )}

      {/* Titre */}
      <div className="text-center space-y-1">
        <h2 className="text-lg font-bold text-zinc-900">JurisVoice</h2>
        <p className="text-xs text-zinc-500">
          {isListening ? '🎤 En écoute...' : isProcessing ? '💭 Traitement...' : isPlaying ? '🔊 Lecture' : '✨ Prêt'}
        </p>
      </div>

      {/* Transcription */}
      {transcript && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full bg-indigo-50 p-4 rounded-2xl"
        >
          <p className="text-xs font-bold text-indigo-600 mb-1">Vous:</p>
          <p className="text-sm text-indigo-900">"{transcript}"</p>
        </motion.div>
      )}

      {/* Réponse */}
      {response && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full bg-purple-50 p-4 rounded-2xl"
        >
          <p className="text-xs font-bold text-purple-600 mb-1">JurisVoice:</p>
          <p className="text-sm text-purple-900 leading-relaxed">{response}</p>
        </motion.div>
      )}

      {/* Messages */}
      {error && (
        <p className="text-xs text-red-600 text-center">{error}</p>
      )}

      <p className="text-xs text-center text-zinc-500">
        {isListening ? 'Parlez maintenant' : 'Cliquez le micro pour parler'}
      </p>
    </div>
  );
};
