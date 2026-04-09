import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { GeminiLiveSession } from '../services/gemini-live';
import { AudioStreamingService } from '../services/audio-streaming';
import { motion } from 'motion/react';

interface VoiceAssistantProps {
  context: string;
}

/**
 * Assistant vocal avec streaming audio en temps réel - VERSION 2
 * Utilise Gemini 2.0 Live pour une conversation fluide
 */
export const VoiceAssistant: React.FC<VoiceAssistantProps> = ({ context }) => {
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState('🔊 Prêt');
  const [error, setError] = useState('');
  const [waveform, setWaveform] = useState<number[]>(Array(30).fill(0));
  const [volume, setVolume] = useState(0.8);
  const [transcript, setTranscript] = useState('');
  const [debugInfo, setDebugInfo] = useState('');

  const geminiSessionRef = useRef<GeminiLiveSession | null>(null);
  const audioStreamingRef = useRef<AudioStreamingService | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const waveformIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sessionReadyRef = useRef(false);

  // Animation waveform
  useEffect(() => {
    if (!isActive) return;

    waveformIntervalRef.current = setInterval(() => {
      if (isListening && analyserRef.current) {
        try {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          const normalizedValue = (average / 255) * 60;
          setWaveform((prev) => [...prev.slice(1), Math.max(normalizedValue, 5)]);
        } catch (e) {
          setWaveform((prev) => [...prev.slice(1), Math.random() * 20]);
        }
      } else {
        setWaveform((prev) => [
          ...prev.slice(1),
          isSpeaking ? Math.random() * 40 : Math.random() * 10,
        ]);
      }
    }, 50);

    return () => {
      if (waveformIntervalRef.current) clearInterval(waveformIntervalRef.current);
    };
  }, [isActive, isListening, isSpeaking]);

  const startSession = async () => {
    if (!context?.trim()) {
      setError('❌ Veuillez charger un document PDF');
      return;
    }

    try {
      setIsActive(true);
      setError('');
      setDebugInfo('');
      setStatus('🔌 Connexion...');
      sessionReadyRef.current = false;

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      console.log('🔑 API Key présente:', !!apiKey);
      console.log('📄 Contexte:', context.substring(0, 50) + '...');

      if (!apiKey) {
        throw new Error('VITE_GEMINI_API_KEY non configurée dans .env.local');
      }

      // Initialiser l'audio
      setDebugInfo('1️⃣ Init microphone...');
      audioStreamingRef.current = new AudioStreamingService();

      // Créer la session Gemini
      setDebugInfo('2️⃣ Init Gemini Live...');
      geminiSessionRef.current = new GeminiLiveSession(apiKey, {
        onOpen: () => {
          console.log('✅ Gemini session ouverte!');
          setDebugInfo('✅ Session ouverte');
          sessionReadyRef.current = true;
          setStatus('🎤 En écoute...');
          setIsListening(true);
        },
        onMessage: (data: any) => {
          console.log('📨 Message:', data?.type);
          if (data?.type === 'speaking') {
            setIsSpeaking(true);
            setIsListening(false);
            setStatus('🔊 Réponse...');
          }
          if (data?.type === 'turnComplete') {
            setIsSpeaking(false);
            setIsListening(true);
            setStatus('🎤 En écoute...');
          }
        },
        onClose: () => {
          console.log('Session fermée');
          setIsListening(false);
          setIsSpeaking(false);
          sessionReadyRef.current = false;
        },
        onError: (err: any) => {
          const msg = err?.message || String(err);
          console.error('❌ Erreur:', msg);
          setError(msg);
          setIsActive(false);
          sessionReadyRef.current = false;
        },
      });

      // Connecter
      setDebugInfo('3️⃣ Connexion...');
      console.log('Appel connect...');
      await geminiSessionRef.current.connect({}, context);
      
      console.log('✅ Connecté! Démarrage audio...');
      setDebugInfo('4️⃣ Microphone...');

      // Attendre un peu que la session soit vraiment prête
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Démarrer l'audio
      if (!audioStreamingRef.current) {
        throw new Error('Audio streaming non initialisé');
      }

      await audioStreamingRef.current.start((float32Array: Float32Array) => {
        if (sessionReadyRef.current && geminiSessionRef.current?.isConnected()) {
          const pcm16 = AudioStreamingService.float32ToPCM16(float32Array);
          geminiSessionRef.current?.sendAudioData(pcm16);
        }
      });

      const analyser = audioStreamingRef.current.getAnalyser();
      if (analyser) analyserRef.current = analyser;

      console.log('✅ Microphone actif!');
      setDebugInfo('✅ Prêt!');
      setStatus('🎤 En écoute...');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('❌ Erreur:', msg);
      setError(msg);
      setDebugInfo('❌ ' + msg);
      setIsActive(false);
      stopSession();
    }
  };

  const stopSession = () => {
    console.log('⏹️ Arrêt');
    setIsActive(false);
    setIsListening(false);
    setIsSpeaking(false);
    setStatus('⏹️ Arrêté');
    setTranscript('');
    setDebugInfo('');
    sessionReadyRef.current = false;

    if (audioStreamingRef.current) {
      try {
        audioStreamingRef.current.stop();
      } catch (e) {
        console.error('Erreur arrêt audio:', e);
      }
      audioStreamingRef.current = null;
    }

    if (geminiSessionRef.current) {
      try {
        geminiSessionRef.current.close();
      } catch (e) {
        console.error('Erreur fermeture session:', e);
      }
      geminiSessionRef.current = null;
    }

    if (waveformIntervalRef.current) {
      clearInterval(waveformIntervalRef.current);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    geminiSessionRef.current?.setVolume(newVolume);
  };

  useEffect(() => {
    return () => {
      if (isActive) stopSession();
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 p-8 glass rounded-3xl w-full max-w-md mx-auto">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-bold text-zinc-900">JurisVoice Live</h2>
        <p className="text-xs text-zinc-500">{debugInfo || '✨ Prêt'}</p>
      </div>

      <button
        onClick={isActive ? stopSession : startSession}
        className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
          isActive
            ? 'bg-red-500 text-white shadow-lg'
            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg'
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

      <div className="flex items-end justify-center gap-1 h-16 w-full">
        {waveform.map((h, i) => (
          <div
            key={i}
            className={`flex-1 transition-all duration-75 rounded-full ${
              isListening
                ? 'bg-indigo-500'
                : isSpeaking
                  ? 'bg-purple-500'
                  : 'bg-gray-300'
            }`}
            style={{ height: `${Math.max(h, 3)}px` }}
          />
        ))}
      </div>

      {isActive && (
        <div className="flex items-center gap-2 w-full px-4">
          <VolumeX className="w-4 h-4" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={handleVolumeChange}
            className="flex-1"
          />
          <Volume2 className="w-4 h-4" />
        </div>
      )}

      <div className="text-center space-y-1 w-full">
        <p className="text-sm font-medium">{status}</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {transcript && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full bg-indigo-50 p-3 rounded-lg text-sm text-indigo-900"
        >
          {transcript}
        </motion.div>
      )}

      <p className="text-xs text-center text-zinc-500">
        {isActive ? '🎙️ Parlez...' : '👆 Cliquez pour parler'}
      </p>
    </div>
  );
};
