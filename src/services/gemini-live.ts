/// <reference types="vite/client" />
import { GoogleGenAI, Modality } from '@google/genai';
import { GeminiAudioStreamService } from './gemini-audio-stream';

export class GeminiLiveSession {
  private client: GoogleGenAI;
  private session: any = null;
  private apiKey: string;
  private callbacks: any;
  private isOpen: boolean = false;
  private audioStreamService: GeminiAudioStreamService | null = null;
  private audioBuffer: Uint8Array[] = [];
  private audioProcessingInterval: NodeJS.Timeout | null = null;

  constructor(apiKey: string, callbacks: any = {}) {
    if (!apiKey) {
      console.error('❌ VITE_GEMINI_API_KEY n\'est pas défini!');
      throw new Error('Clé API Gemini manquante');
    }
    this.apiKey = apiKey;
    this.callbacks = callbacks;
    this.client = new GoogleGenAI({ apiKey });
    console.log('✅ GoogleGenAI client initialisé');
  }

  async connect(config: any, context: string): Promise<void> {
    try {
      console.log('🔌 Connexion à Gemini Live...');
      console.log('📝 Contexte:', context.substring(0, 100) + '...');

      // Initialiser le service de streaming audio
      this.audioStreamService = new GeminiAudioStreamService();
      await this.audioStreamService.initialize();
      console.log('🎵 Service audio initié');

      const systemInstruction = `Tu es un assistant juridique expert en droit français et marocain.
Contexte du document: ${context}
Réponds de manière concise, professionnelle et en conversant naturellement.
Parle de manière fluide et naturelle, comme une vraie conversation en temps réel.`;

      // Créer la session Live avec le modèle correct et configurations audio optimisées
      console.log('🚀 Connexion à gemini-2.0-flash-exp...');
      this.session = await this.client.live.connect({
        model: 'gemini-2.0-flash-exp',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Puck', // Voix masculine naturelle
              },
            },
          },
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
        },
        callbacks: {
          onOpen: () => {
            console.log('✅ Session Gemini Live connectée');
            this.isOpen = true;
            this.setupAudioProcessing();
            this.callbacks.onOpen?.();
          },
          onMessage: (data: any) => {
            console.log('📨 Message:', data?.type);
            
            // Traiter les données audio reçues
            if (data?.serverContent?.modelTurn?.parts) {
              console.log('🎵 Réception audio');
              for (const part of data.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  const buffer = new Uint8Array(part.inlineData.data);
                  this.audioBuffer.push(buffer);
                  console.log('📦 Audio enqueuée, buffer:', buffer.length, 'bytes');
                }
              }
            }
            
            // Notifier que Gemini répond
            if (data?.serverContent?.modelTurn) {
              this.callbacks.onMessage?.({ type: 'speaking', data });
            }
            
            // Notifier quand Gemini a fini
            if (data?.serverContent?.turnComplete) {
              this.callbacks.onMessage?.({ type: 'turnComplete', data });
            }
          },
          onClose: () => {
            console.log('🔌 Session fermée');
            this.isOpen = false;
            this.stopAudioProcessing();
            this.callbacks.onClose?.();
          },
          onError: (error: any) => {
            console.error('❌ Erreur session Gemini:', error);
            this.isOpen = false;
            this.stopAudioProcessing();
            this.callbacks.onError?.(error);
          },
        },
      } as any);
    } catch (error) {
      console.error('❌ Erreur connexion Gemini Live:', error);
      this.callbacks.onError?.(error);
      throw error;
    }
  }

  /**
   * Configuration du traitement audio en continu
   * Cela élimine les clics en assurant une lecture fluide
   */
  private setupAudioProcessing(): void {
    // Traiter les buffers audio de manière régulière
    this.audioProcessingInterval = setInterval(async () => {
      while (this.audioBuffer.length > 0 && this.isOpen) {
        const audioData = this.audioBuffer.shift();
        if (audioData && this.audioStreamService) {
          try {
            await this.audioStreamService.playAudioChunk(audioData);
          } catch (error) {
            console.error('❌ Erreur playback audio:', error);
          }
        }
      }
    }, 50); // Traiter tous les 50ms pour un streaming fluide
  }

  private stopAudioProcessing(): void {
    if (this.audioProcessingInterval) {
      clearInterval(this.audioProcessingInterval);
      this.audioProcessingInterval = null;
    }
    if (this.audioStreamService) {
      this.audioStreamService.stop();
    }
  }

  /**
   * Envoyer les données audio capturées au microphone
   * Les données doivent être en PCM 16-bit à 16kHz
   */
  sendAudioData(audioData: ArrayBuffer | Uint8Array): void {
    if (!this.session || !this.isOpen) {
      return;
    }

    try {
      // Assurer que nous avons un ArrayBuffer ou compatible
      const buffer = audioData instanceof Uint8Array ? audioData.buffer : audioData;
      // Envoyer les données audio PCM en streaming
      this.session.sendRealtimeInput({
        mimeType: 'audio/pcm;rate=16000',
        data: buffer,
      });
    } catch (error) {
      if (!this.isOpen) {
        return;
      }
      console.debug('Audio send warning:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Contrôler le volume de la réponse audio
   */
  setVolume(volume: number): void {
    if (this.audioStreamService) {
      this.audioStreamService.setVolume(volume);
    }
  }

  /**
   * Obtenir le volume actuel
   */
  getVolume(): number {
    return this.audioStreamService?.getVolume() ?? 0.8;
  }

  /**
   * Vérifier si l'audio est en cours de lecture
   */
  isAudioPlaying(): boolean {
    return this.audioStreamService?.isAudioPlaying() ?? false;
  }

  close(): void {
    this.isOpen = false;
    this.stopAudioProcessing();
    if (this.audioStreamService) {
      this.audioStreamService.close();
      this.audioStreamService = null;
    }
    if (this.session) {
      try {
        this.session.close?.();
      } catch (error) {
        console.debug('Session close warning:', error instanceof Error ? error.message : error);
      }
      this.session = null;
    }
  }

  isConnected(): boolean {
    return this.session !== null && this.isOpen;
  }
}
