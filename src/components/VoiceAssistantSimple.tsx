import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { getChatResponse } from '../services/gemini';
import { generateElevenLabsSpeech, stopAudio } from '../services/elevenlabs';

interface VoiceAssistantSimpleProps {
  documentContext: string;
}

export const VoiceAssistantSimple: React.FC<VoiceAssistantSimpleProps> = ({
  documentContext,
}) => {
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState('Prêt');
  const [error, setError] = useState('');
  const [waveform, setWaveform] = useState<number[]>(Array(30).fill(0));
  const [transcript, setTranscript] = useState('');

  const recognitionRef = useRef<any>(null);

  // Animation waveform
  useEffect(() => {
    const interval = setInterval(() => {
      setWaveform((prev) => [
        ...prev.slice(1),
        Math.random() * (isListening ? 60 : isSpeaking ? 40 : 10),
      ]);
    }, 50);
    return () => clearInterval(interval);
  }, [isListening, isSpeaking]);

  // Initialiser Web Speech API
  const initializeRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Web Speech API non supportée');
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = false;

    return recognition;
  };

  const startListening = async () => {
    try {
      setIsActive(true);
      setError('');
      setStatus('🎤 En écoute...');
      setIsListening(true);

      if (!recognitionRef.current) {
        recognitionRef.current = initializeRecognition();
      }

      const recognition = recognitionRef.current;

      recognition.onstart = () => {
        setTranscript('');
        setStatus('🎤 En écoute...');
      };

      recognition.onresult = async (event: any) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptSegment = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            // Résultat final - envoyer à Gemini
            await handleRecognizedSpeech(transcriptSegment);
          } else {
            interimTranscript += transcriptSegment;
          }
        }
        if (interimTranscript) {
          setTranscript(interimTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Erreur reconnaissance:', event.error);
        setError(`Erreur: ${event.error}`);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        // Redémarrer la reconnaissance si la session est active
        if (isActive) {
          setTimeout(() => {
            if (isActive && !isSpeaking) {
              recognition.start();
            }
          }, 500);
        }
      };

      recognition.start();
    } catch (err) {
      console.error('Erreur démarrage:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setIsActive(false);
      setIsListening(false);
    }
  };

  const handleRecognizedSpeech = async (userInput: string) => {
    try {
      setTranscript(userInput);
      setStatus('💭 Réflexion...');
      setIsListening(false);

      // Envoyer le texte à Gemini
      const responseText = await getChatResponse(userInput, documentContext);

      setStatus('🔊 Réponse...');
      setIsSpeaking(true);

      // Lire la réponse à haute voix
      await generateElevenLabsSpeech(responseText);

      setIsSpeaking(false);
      setTranscript('');

      // Relancer l'écoute
      if (isActive && recognitionRef.current) {
        setTimeout(() => {
          setStatus('🎤 En écoute...');
          recognitionRef.current?.start();
          setIsListening(true);
        }, 500);
      }
    } catch (err) {
      console.error('Erreur traitement:', err);
      setError(err instanceof Error ? err.message : 'Erreur');
      setIsSpeaking(false);
      setIsListening(false);
    }
  };

  const stopSession = () => {
    setIsActive(false);
    setIsListening(false);
    setIsSpeaking(false);
    setTranscript('');
    setStatus('Arrêté');

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    stopAudio();
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (isActive) {
        stopSession();
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 p-8 glass rounded-3xl w-full max-w-md mx-auto">
      {/* Bouton Microphone */}
      <button
        onClick={isActive ? stopSession : startListening}
        className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
          isActive
            ? 'bg-red-500 text-white shadow-xl shadow-red-200'
            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-xl shadow-indigo-100'
        }`}
      >
        {isActive ? (
          isListening ? (
            <Mic className="w-10 h-10 animate-pulse" />
          ) : (
            <MicOff className="w-10 h-10" />
          )
        ) : (
          <Mic className="w-10 h-10" />
        )}
      </button>

      {/* Waveform */}
      <div className="flex items-end gap-1 h-16">
        {waveform.map((height, i) => (
          <div
            key={i}
            className={`w-1 transition-all duration-100 rounded-full ${
              isListening
                ? 'bg-gradient-to-b from-indigo-400 to-indigo-600'
                : isSpeaking
                  ? 'bg-gradient-to-b from-purple-400 to-purple-600'
                  : 'bg-gray-200'
            }`}
            style={{ height: `${Math.max(height, 4)}px` }}
          />
        ))}
      </div>

      {/* Status */}
      <div className="text-center space-y-2">
        <p className="text-sm font-medium text-zinc-600">{status}</p>
        {transcript && (
          <p className="text-base font-semibold text-zinc-900 italic">"{transcript}"</p>
        )}
        {error && (
          <p className="text-sm text-red-600 font-medium">⚠️ {error}</p>
        )}
      </div>

      {/* Info */}
      <p className="text-xs text-center text-zinc-500">
        {isActive ? 'Parlez en français pour commencer une conversation' : 'Cliquez pour démarrer'}
      </p>
    </div>
  );
};
