import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { GeminiLiveSession } from '../services/gemini-live';
import { AudioStreamingService } from '../services/audio-streaming';

interface VoiceAssistantStreamingProps {
  documentContext: string;
  apiKey?: string;
}

/**
 * Assistant vocal avec streaming audio bidirectionnel en temps réel
 * Utilise Gemini 2.0 Live pour une conversation fluide sans clics
 */
export const VoiceAssistantStreaming: React.FC<VoiceAssistantStreamingProps> = ({
  documentContext,
  apiKey = import.meta.env.VITE_GEMINI_API_KEY,
}) => {
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState('🔊 Prêt pour conversation en direct');
  const [error, setError] = useState('');
  const [waveform, setWaveform] = useState<number[]>(Array(30).fill(0));
  const [volume, setVolume] = useState(0.8);

  const geminiSessionRef = useRef<GeminiLiveSession | null>(null);
  const audioStreamingRef = useRef<AudioStreamingService | null>(null);
  const audioBufferRef = useRef<Float32Array[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const waveformIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Animation waveform en temps réel
  useEffect(() => {
    if (!isActive) return;

    waveformIntervalRef.current = setInterval(() => {
      if (isListening && analyserRef.current) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const normalizedValue = (average / 255) * 60;

        setWaveform((prev) => [
          ...prev.slice(1),
          normalizedValue || Math.random() * 10,
        ]);
      } else {
        setWaveform((prev) => [
          ...prev.slice(1),
          isSpeaking ? Math.random() * 40 : Math.random() * 10,
        ]);
      }
    }, 50);

    return () => {
      if (waveformIntervalRef.current) {
        clearInterval(waveformIntervalRef.current);
      }
    };
  }, [isActive, isListening, isSpeaking]);

  const startSession = async () => {
    try {
      setIsActive(true);
      setError('');
      setStatus('🔌 Connexion...');

      // Initialiser le streaming audio du microphone
      audioStreamingRef.current = new AudioStreamingService();

      // Initialiser la session Gemini Live
      geminiSessionRef.current = new GeminiLiveSession(apiKey, {
        onOpen: () => {
          console.log('✅ Session Gemini Live active');
          setStatus('🎤 En écoute...');
          setIsListening(true);
        },
        onMessage: (data: any) => {
          if (data?.serverContent?.modelTurn?.parts) {
            setIsSpeaking(true);
          }
          if (data?.serverContent?.turnComplete) {
            setIsSpeaking(false);
          }
        },
        onClose: () => {
          console.log('Session fermée');
          setIsListening(false);
          setIsSpeaking(false);
        },
        onError: (error: any) => {
          console.error('Erreur Gemini:', error);
          setError(error?.message || 'Erreur de connexion');
          setIsActive(false);
          setIsListening(false);
        },
      });

      // Connecter la session Gemini
      await geminiSessionRef.current.connect({}, documentContext);

      // Démarrer la capture audio avec streaming
      await audioStreamingRef.current.start((float32Array: Float32Array) => {
        // Convertir en PCM 16-bit et envoyer
        const pcm16 = AudioStreamingService.float32ToPCM16(float32Array);
        geminiSessionRef.current?.sendAudioData(pcm16);
      });

      // Obtenir l'analyser pour le waveform
      const analyser = audioStreamingRef.current.getAnalyser();
      if (analyser) {
        analyserRef.current = analyser;
      }
    } catch (err) {
      console.error('❌ Erreur démarrage:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setIsActive(false);
      setIsListening(false);
    }
  };

  const stopSession = () => {
    setIsActive(false);
    setIsListening(false);
    setIsSpeaking(false);
    setStatus('⏹️ Arrêté');

    if (audioStreamingRef.current) {
      audioStreamingRef.current.stop();
      audioStreamingRef.current = null;
    }

    if (geminiSessionRef.current) {
      geminiSessionRef.current.close();
      geminiSessionRef.current = null;
    }

    if (waveformIntervalRef.current) {
      clearInterval(waveformIntervalRef.current);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (geminiSessionRef.current) {
      geminiSessionRef.current.setVolume(newVolume);
    }
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
      {/* Titre */}
      <div className="text-center space-y-2">
        <h2 className="text-lg font-bold text-zinc-900">Assistant Juridique Live</h2>
        <p className="text-xs text-zinc-500">Streaming audio continu - Aucun clic</p>
      </div>

      {/* Bouton Microphone */}
      <button
        onClick={isActive ? stopSession : startSession}
        className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
          isActive
            ? 'bg-red-500 text-white shadow-xl shadow-red-200'
            : 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-xl shadow-indigo-200'
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

      {/* Waveform animé */}
      <div className="flex items-end justify-center gap-1 h-16 w-full">
        {waveform.map((height, i) => (
          <div
            key={i}
            className={`flex-1 max-w-1 transition-all duration-100 rounded-full ${
              isListening
                ? 'bg-gradient-to-b from-indigo-400 to-indigo-600'
                : isSpeaking
                  ? 'bg-gradient-to-b from-purple-400 to-purple-600'
                  : 'bg-gradient-to-b from-gray-300 to-gray-400'
            }`}
            style={{ height: `${Math.max(height, 3)}px` }}
          />
        ))}
      </div>

      {/* Contrôle du volume */}
      {isActive && (
        <div className="flex items-center gap-2 w-full px-4">
          <VolumeX className="w-4 h-4 text-zinc-500" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={handleVolumeChange}
            className="flex-1 h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer"
          />
          <Volume2 className="w-4 h-4 text-zinc-500" />
        </div>
      )}

      {/* Statut */}
      <div className="text-center space-y-2 w-full">
        <p className="text-sm font-medium text-zinc-600">{status}</p>
        {error && (
          <p className="text-sm text-red-600 font-medium animate-pulse">⚠️ {error}</p>
        )}
      </div>

      {/* Instructions */}
      <p className="text-xs text-center text-zinc-500">
        {isActive
          ? '🎙️ Parlez naturellement - réponses en temps réel'
          : '👆 Cliquez pour démarrer une conversation'}
      </p>

      {/* Indicateurs d'état */}
      {isActive && (
        <div className="flex gap-2 text-xs text-zinc-600">
          {isListening && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 rounded-full">
              🎤 <span className="animate-pulse">Écoute</span>
            </span>
          )}
          {isSpeaking && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 rounded-full">
              🔊 <span className="animate-pulse">Réponse</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
};
