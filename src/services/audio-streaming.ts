/**
 * Service de streaming audio continu
 * Capture le microphone et envoie le PCM en temps réel
 */

export class AudioStreamingService {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private isRunning: boolean = false;
  private onAudioData: ((data: Float32Array) => void) | null = null;
  private analyser: AnalyserNode | null = null;

  async start(onDataCallback: (data: Float32Array) => void): Promise<void> {
    try {
      this.onAudioData = onDataCallback;

      // Initialiser le contexte audio
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000, // Gemini Live utilise 16kHz
      });

      // Demander l'accès au microphone
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false, // Désactiver pour un meilleur contrôle
        },
      });

      // Créer la source média
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Créer un worklet pour le traitement audio sans clics
      await this.setupAudioWorklet();

      this.isRunning = true;
      console.log('✅ Microphone activé pour streaming audio');
    } catch (error) {
      console.error('❌ Erreur accès microphone:', error);
      throw error;
    }
  }

  private async setupAudioWorklet(): Promise<void> {
    if (!this.audioContext) throw new Error('AudioContext non initialisé');

    // Créer un worklet inline pour éviter les problèmes de CORS
    const workletCode = `
      class AudioCaptureProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.buffer = [];
        }

        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (input.length > 0) {
            const inputData = input[0];
            
            // Envoyer les données brutes au thread principal
            this.port.postMessage({
              type: 'audio',
              data: Array.from(inputData)
            });
          }
          return true;
        }
      }

      registerProcessor('audio-capture', AudioCaptureProcessor);
    `;

    try {
      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);
      await this.audioContext.audioWorklet.addModule(workletUrl);

      this.processor = new AudioWorkletNode(this.audioContext, 'audio-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 1,
      });

      // Recevoir les données audio
      this.processor.port.onmessage = (event: MessageEvent) => {
        if (event.data.type === 'audio' && this.onAudioData) {
          const float32Array = new Float32Array(event.data.data);
          this.onAudioData(float32Array);
        }
      };

      // Connecter la source au processor
      this.source?.connect(this.processor);

      // Créer un analyser pour l'affichage du waveform (optionnel)
      this.analyser = this.audioContext.createAnalyser();
      this.source?.connect(this.analyser);

      URL.revokeObjectURL(workletUrl);
    } catch (error) {
      console.error('❌ Erreur setup worklet:', error);
      // Fallback: utiliser ScriptProcessorNode (déprécié mais compatible)
      this.setupScriptProcessor();
    }
  }

  private setupScriptProcessor(): void {
    if (!this.audioContext || !this.source) return;

    // Fallback pour les navigateurs sans AudioWorklet
    const bufferSize = 4096;
    const scriptProcessor = this.audioContext.createScriptProcessor(
      bufferSize,
      1, // Mono input
      0  // No output
    );

    scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
      const inputData = event.inputBuffer.getChannelData(0);
      if (this.onAudioData) {
        this.onAudioData(new Float32Array(inputData));
      }
    };

    this.source.connect(scriptProcessor);
    scriptProcessor.connect(this.audioContext.destination);
    this.processor = scriptProcessor as any;
  }

  stop(): void {
    this.isRunning = false;

    if (this.processor) {
      this.processor.disconnect();
    }
    if (this.source) {
      this.source.disconnect();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }

    this.processor = null;
    this.source = null;
    this.mediaStream = null;
    this.audioContext = null;

    console.log('✅ Streaming audio arrêté');
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  isActive(): boolean {
    return this.isRunning;
  }

  // Convertir Float32Array en PCM 16-bit
  static float32ToPCM16(float32Array: Float32Array): Uint8Array {
    const pcm = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const sample = float32Array[i];
      // Clamp to [-1, 1]
      const s = Math.max(-1, Math.min(1, sample));
      // Convert to 16-bit PCM
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return new Uint8Array(pcm.buffer);
  }
}
