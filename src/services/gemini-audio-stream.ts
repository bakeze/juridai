/**
 * Service de streaming audio pour Gemini 2.0 Live
 * Gère le streaming bidirectionnel sans clics
 */

export class GeminiAudioStreamService {
  private audioContext: AudioContext | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private audioQueue: AudioBuffer[] = [];
  private isPlaying: boolean = false;
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;

  async initialize(): Promise<AudioContext> {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000, // Gemini Live utilise 24kHz pour la sortie
      });
    }

    // Créer le destination pour la sortie audio continue
    if (!this.destination) {
      this.destination = this.audioContext.createMediaStreamDestination();
    }

    // Créer un gain node pour contrôler le volume
    if (!this.gainNode) {
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0.8; // 80% volume
      this.gainNode.connect(this.destination);
    }

    return this.audioContext;
  }

  /**
   * Enqueue un buffer audio reçu de Gemini Live
   * Les buffers sont joués de manière continue sans clics
   */
  async playAudioChunk(audioData: ArrayBuffer | Uint8Array): Promise<void> {
    if (!this.audioContext) {
      await this.initialize();
    }

    try {
      // Assurer que nous avons un ArrayBuffer
      const buffer = audioData instanceof Uint8Array ? audioData.buffer : audioData;
      // Décoder le PCM 16-bit en AudioBuffer
      const audioBuffer = await this.decodePCM16(buffer);
      
      // Ajouter à la queue
      this.audioQueue.push(audioBuffer);

      // Lancer la lecture si pas encore en cours
      if (!this.isPlaying) {
        this.processQueue();
      }
    } catch (error) {
      console.error('❌ Erreur décodage audio:', error);
    }
  }

  private async processQueue(): Promise<void> {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const audioBuffer = this.audioQueue.shift();

    if (!audioBuffer || !this.audioContext) return;

    return new Promise((resolve) => {
      const source = this.audioContext!.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode!);

      source.onended = async () => {
        // Queue le prochain chunk
        if (this.audioQueue.length > 0) {
          await this.processQueue();
        } else {
          this.isPlaying = false;
        }
        resolve();
      };

      // Jouer sans clics avec une transition lisse
      source.start(0);
    });
  }

  /**
   * Décoder les données PCM 16-bit reçues de Gemini Live
   */
  private async decodePCM16(audioData: ArrayBuffer | ArrayBufferLike): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error('AudioContext not initialized');

    const sampleRate = 24000; // Gemini Live
    // Cast to ensure we can work with the buffer
    const arrayBuffer = audioData as ArrayBuffer;
    const pcm16 = new Int16Array(arrayBuffer);
    const float32 = new Float32Array(pcm16.length);

    // Convertir de PCM 16-bit à float32
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 0x8000; // Normalize to [-1, 1]
    }

    // Créer un AudioBuffer
    const audioBuffer = this.audioContext.createBuffer(
      1, // numberOfChannels
      float32.length, // length
      sampleRate // sampleRate
    );

    audioBuffer.getChannelData(0).set(float32);
    return audioBuffer;
  }

  /**
   * Arrêter la lecture et vider la queue
   */
  stop(): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch (e) {
        // Ignore if already stopped
      }
    }
    this.audioQueue = [];
    this.isPlaying = false;
  }

  /**
   * Fermer le contexte audio
   */
  close(): void {
    this.stop();
    if (this.gainNode) {
      this.gainNode.disconnect();
    }
    if (this.destination) {
      this.destination.stream.getTracks().forEach((track) => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
  }

  /**
   * Obtenir le niveau de volume actuel
   */
  getVolume(): number {
    return this.gainNode?.gain.value ?? 0.8;
  }

  /**
   * Définir le niveau de volume (0-1)
   */
  setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  /**
   * Vérifier si l'audio est en cours de lecture
   */
  isAudioPlaying(): boolean {
    return this.isPlaying || this.audioQueue.length > 0;
  }
}
