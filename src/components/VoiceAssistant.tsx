import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { createLiveSession } from '../services/gemini';
import { initializeAudioWorklet, createAudioWorkletNode } from '../services/audio-worklet';
import { LiveServerMessage } from '@google/genai';

interface VoiceAssistantProps {
  context: string;
}

export const VoiceAssistant: React.FC<VoiceAssistantProps> = ({ context }) => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [volume, setVolume] = useState(0);
  const [modelResponse, setModelResponse] = useState('');
  
  const sessionRef = useRef<any>(null);
  const isSessionClosingRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioQueue = useRef<Int16Array[]>([]);
  const isPlaying = useRef(false);
  const currentAudioRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    return () => {
      stopSession();
    };
  }, []);

  const startSession = async () => {
    if (!context || isActive) return;
    
    // Réinitialiser le flag de fermeture pour une nouvelle session
    isSessionClosingRef.current = false;
    
    setIsConnecting(true);
    setTranscription('');
    setModelResponse('');

    try {
      // Initialiser l'audio context
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      }
      
      // Obtenir le flux audio microphone
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      // Reprendre le contexte audio s'il est suspendu
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      console.log('Création de la session Live...');
      
      let sessionReadyResolve: () => void;
      let sessionReadyReject: (err: any) => void;
      const sessionReady = new Promise<void>((resolve, reject) => {
        sessionReadyResolve = resolve;
        sessionReadyReject = reject;
      });

      // Créer les callbacks avant de créer la session
      const callbacks = {
        onOpen: async () => {
          console.log('✅ Session Live ouverte');
          try {
            // À ce moment, sessionRef.current DOIT être défini
            // Si c'est pas le cas, attendre un peu
            let attempts = 0;
            while (!sessionRef.current && attempts < 50) {
              await new Promise(r => setTimeout(r, 10));
              attempts++;
            }
            
            if (!sessionRef.current) {
              throw new Error('Session non disponible après attente');
            }
            // Démarrer le streaming audio
            await startStreaming(sessionRef.current);
            console.log('✅ Streaming démarré');
            sessionReadyResolve?.();
          } catch (err) {
            console.error('❌ Erreur au démarrage du streaming:', err);
            sessionReadyReject?.(err);
          }
        },
        onMessage: (message: LiveServerMessage) => {
          // Handle audio output
          const parts = message.serverContent?.modelTurn?.parts;
          if (parts) {
            for (const part of parts) {
              if (part.inlineData?.data) {
                const base64Audio = part.inlineData.data;
                const binaryString = atob(base64Audio);
                const bytes = new Int16Array(binaryString.length / 2);
                for (let i = 0; i < bytes.length; i++) {
                  bytes[i] = (binaryString.charCodeAt(i * 2) & 0xFF) | (binaryString.charCodeAt(i * 2 + 1) << 8);
                }
                audioQueue.current.push(bytes);
                if (!isPlaying.current) playNextChunk();
              }
            }
          }
          
          // Handle interruptions
          if (message.serverContent?.interrupted) {
            audioQueue.current = [];
            isPlaying.current = false;
            if (currentAudioRef.current) {
              try {
                currentAudioRef.current.stop();
              } catch (e) {
                // Ignore if already stopped
              }
              currentAudioRef.current = null;
            }
          }

          // Handle text transcription
          const inputTranscript = (message.serverContent as any)?.inputAudioTranscription?.text || 
                                 (message.serverContent as any)?.inputTranscription?.text;
          if (inputTranscript) setTranscription(inputTranscript);
          
          const outputTranscript = message.serverContent?.modelTurn?.parts?.[0]?.text || 
                                 (message.serverContent as any)?.outputAudioTranscription?.text ||
                                 (message.serverContent as any)?.outputTranscription?.text;
          if (outputTranscript) setModelResponse(prev => prev + outputTranscript);
        },
        onClose: () => {
          console.log('Session Live fermée');
          isSessionClosingRef.current = true;
          setIsActive(false);
        },
        onError: (err) => {
          console.error('❌ Live API Error:', err);
          isSessionClosingRef.current = true;
          setIsConnecting(false);
          sessionReadyReject?.(err);
          stopSession();
        }
      };

      console.log('Appel de createLiveSession...');
      
      // Créer la session (ATTENTION: onOpen peut s'appeler pendant ce await)
      // On utilise sessionRef.current pour que les callbacks puissent y accéder
      try {
        const sessionPromise = createLiveSession(context, 'Kore', callbacks);
        const session = await sessionPromise;
        sessionRef.current = session;
        console.log('✅ Session créée et stockée');
      } catch (err) {
        console.error('Erreur lors de createLiveSession:', err);
        throw err;
      }

      // Attendre que le streaming soit prêt
      console.log('En attente du démarrage du streaming...');
      await sessionReady;

      // Marquer la session comme active
      setIsActive(true);
      setIsConnecting(false);
      console.log('✅ Session active et prête !');
    } catch (err) {
      console.error('❌ Failed to start voice session:', err);
      setIsConnecting(false);
      stopSession();
    }
  };

  const startStreaming = async (session: any) => {
    if (!audioContextRef.current || !streamRef.current || !session) {
      throw new Error('Audio context, stream, ou session manquante');
    }

    try {
      // Initialiser le AudioWorklet (remplace ScriptProcessorNode déprécié)
      console.log('Initialisation du AudioWorklet...');
      await initializeAudioWorklet(audioContextRef.current);
    } catch (err) {
      console.error('Erreur lors de l\'initialisation du AudioWorklet:', err);
      throw err;
    }

    const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
    
    // Créer le worklet processor
    processorRef.current = createAudioWorkletNode(audioContextRef.current);
    
    // Créer un analyser pour le volume en temps réel
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 2048;

    // Recevoir les données audio du worklet
    processorRef.current.port.onmessage = (event) => {
      if (event.data.type === 'audiodata' && !isMuted) {
        const inputData = event.data.data as Float32Array;
        
        // Calculer le volume RMS pour la visualisation
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        setVolume(Math.min(rms * 2, 1)); // Normaliser entre 0 et 1

        // Convertir en PCM 16-bit et envoyer au serveur
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        
        const uint8Array = new Uint8Array(pcmData.buffer);
        let binary = '';
        for (let i = 0; i < uint8Array.byteLength; i++) {
          binary += String.fromCharCode(uint8Array[i]);
        }
        
        try {
          session.sendRealtimeInput({
            audio: { data: btoa(binary), mimeType: 'audio/pcm;rate=16000' }
          });
        } catch (err) {
          console.error('Erreur lors de l\'envoi du stream audio:', err);
        }
      }
    };

    // Connecter les nœuds audio
    source.connect(processorRef.current);
    processorRef.current.connect(analyserRef.current);
    analyserRef.current.connect(audioContextRef.current.destination);
    
    console.log('✅ AudioWorklet connecté et streaming actif');
  };

  const playNextChunk = () => {
    if (audioQueue.current.length === 0 || !audioContextRef.current || isMuted) {
      isPlaying.current = false;
      return;
    }

    isPlaying.current = true;
    const chunk = audioQueue.current.shift()!;
    const buffer = audioContextRef.current.createBuffer(1, chunk.length, 16000);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < chunk.length; i++) data[i] = chunk[i] / 0x7FFF;

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = playNextChunk;
    currentAudioRef.current = source;
    source.start();
  };

  const stopSession = () => {
    // Éviter les fermetures multiples
    if (isSessionClosingRef.current) return;
    isSessionClosingRef.current = true;

    setIsActive(false);
    setIsConnecting(false);
    setVolume(0);
    
    // Fermer la session WebSocket en toute sécurité
    if (sessionRef.current) {
      try {
        sessionRef.current.close?.();
      } catch (err) {
        console.warn('Erreur lors de la fermeture de la session:', err);
      }
      sessionRef.current = null;
    }

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch (err) {
        console.warn('Erreur lors de la déconnexion du processeur:', err);
      }
      processorRef.current = null;
    }

    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch (err) {
        console.warn('Erreur lors de la déconnexion de l\'analyser:', err);
      }
      analyserRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (err) {
          console.warn('Erreur lors de l\'arrêt de la piste audio:', err);
        }
      });
      streamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (err) {
        console.warn('Erreur lors de la fermeture du contexte audio:', err);
      }
      audioContextRef.current = null;
    }

    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.stop();
      } catch (err) {
        console.warn('Erreur lors de l\'arrêt du buffer source:', err);
      }
      currentAudioRef.current = null;
    }

    audioQueue.current = [];
    isPlaying.current = false;
  };

  return (
    <div className="flex flex-col items-center gap-6 p-8 glass rounded-3xl w-full max-w-md mx-auto">
      <div className="relative">
        {isActive && (
          <div 
            className="absolute inset-0 rounded-full border-4 border-indigo-400 opacity-20 transition-transform duration-75"
            style={{ transform: `scale(${1 + volume * 2})` }}
          />
        )}
        <button
          onClick={isActive ? stopSession : startSession}
          disabled={isConnecting}
          className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 z-10 ${
            isActive 
              ? 'bg-red-500 text-white shadow-xl shadow-red-200' 
              : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-xl shadow-indigo-100'
          } disabled:opacity-50`}
        >
          {isConnecting ? (
            <Loader2 className="w-10 h-10 animate-spin" />
          ) : isActive ? (
            <MicOff className="w-10 h-10" />
          ) : (
            <Mic className="w-10 h-10" />
          )}
        </button>

        {isActive && (
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`absolute -right-12 top-1/2 -translate-y-1/2 p-3 rounded-full transition-all ${
              isMuted ? 'bg-red-100 text-red-600' : 'bg-zinc-100 text-zinc-600'
            }`}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        )}
      </div>
      
      <div className="text-center space-y-2">
        <h3 className="text-lg font-bold text-zinc-900">
          {isActive ? 'JurisVoice en direct' : isConnecting ? 'Connexion...' : 'Démarrer JurisVoice'}
        </h3>
        <p className="text-sm text-zinc-500">
          {isActive ? 'Je vous écoute en temps réel' : 'Cliquez pour parler au document'}
        </p>
      </div>

      {(transcription || modelResponse) && (
        <div className="w-full space-y-4 animate-in fade-in slide-in-from-bottom-4">
          {transcription && (
            <div className="bg-zinc-100/50 p-4 rounded-2xl border border-zinc-200">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Vous :</p>
              <p className="text-sm text-zinc-700 italic">"{transcription}"</p>
            </div>
          )}
          
          {modelResponse && (
            <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
              <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-1">JurisVoice :</p>
              <p className="text-sm text-indigo-900 leading-relaxed">{modelResponse}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
;
