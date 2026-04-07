/// <reference types="vite/client" />
import { GoogleGenAI, Modality } from '@google/genai';

export class GeminiLiveSession {
  private client: GoogleGenAI;
  private session: any = null;
  private apiKey: string;
  private callbacks: any;
  private isOpen: boolean = false;

  constructor(apiKey: string, callbacks: any = {}) {
    this.apiKey = apiKey;
    this.callbacks = callbacks;
    this.client = new GoogleGenAI({ apiKey });
  }

  async connect(config: any, context: string): Promise<void> {
    try {
      console.log('🔌 Connexion à Gemini Live API...');

      const systemInstruction = `Tu es un assistant juridique expert en droit français et marocain.
Contexte du document: ${context}
Réponds de manière concise, professionnelle et en conversant naturellement.`;

      // Créer la session Live avec le modèle correct
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
            this.callbacks.onOpen?.();
          },
          onMessage: (data: any) => {
            console.log('📨 Message reçu:', data);
            this.callbacks.onMessage?.(data);
          },
          onClose: () => {
            console.log('🔌 Session fermée');
            this.isOpen = false;
            this.callbacks.onClose?.();
          },
          onError: (error: any) => {
            console.error('❌ Erreur session:', error);
            this.isOpen = false;
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

  sendAudioData(audioData: ArrayBuffer): void {
    if (!this.session || !this.isOpen) {
      return; // Silently ignore if not ready - race condition is normal
    }

    try {
      // Envoyer les données audio PCM
      this.session.sendRealtimeInput({
        mimeType: 'audio/pcm;rate=16000',
        data: audioData,
      });
    } catch (error) {
      // Silently ignore WebSocket errors - session may be closing
      if (!this.isOpen) {
        return;
      }
      console.debug('Audio send warning:', error instanceof Error ? error.message : error);
    }
  }

  close(): void {
    this.isOpen = false; // Mark as closed immediately to stop audio sending
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
