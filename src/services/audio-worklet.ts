/**
 * AudioWorklet Processor pour le traitement du streaming audio
 * Cela remplace le ScriptProcessorNode déprécié
 */

export const audioWorkletCode = `
class AudioProcessorWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = (event) => {
      // Recevoir les messages du thread principal si nécessaire
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (input.length > 0) {
      const inputData = input[0];
      
      // Copier les données vers la sortie (passthrough)
      for (let i = 0; i < inputData.length; i++) {
        output[0][i] = inputData[i];
      }
      
      // Envoyer les données au thread principal pour traitement
      this.port.postMessage({
        type: 'audiodata',
        data: inputData,
      });
    }
    
    return true; // Continuer le traitement
  }
}

registerProcessor('audio-processor', AudioProcessorWorklet);
`;

export async function initializeAudioWorklet(audioContext: AudioContext): Promise<void> {
  try {
    // Créer un blob avec le code du worklet
    const blob = new Blob([audioWorkletCode], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);
    
    // Ajouter le worklet au contexte audio
    await audioContext.audioWorklet.addModule(workletUrl);
  } catch (error) {
    console.error('Erreur lors de l\'initialisation du AudioWorklet:', error);
    throw error;
  }
}

export function createAudioWorkletNode(audioContext: AudioContext): AudioWorkletNode {
  return new AudioWorkletNode(audioContext, 'audio-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    channelCountMode: 'explicit',
    channelInterpretation: 'discrete',
    processorOptions: {
      inputChannelCount: [1],
      outputChannelCount: [1],
    },
  } as any);
}
