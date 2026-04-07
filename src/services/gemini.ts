/// <reference types="vite/client" />
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";

const API_KEY = (import.meta as any).env.VITE_GEMINI_API_KEY || '';

if (!API_KEY) {
  console.error('❌ VITE_GEMINI_API_KEY non configurée dans .env.local');
}

export const ai = new GoogleGenAI({ apiKey: API_KEY });

export async function getChatResponse(prompt: string, context: string) {
  const systemInstruction = `Tu es un assistant juridique expert. 
  Utilise le contexte suivant (extrait d'un document PDF) pour répondre aux questions.
  Si la réponse n'est pas dans le document, précise-le tout en apportant tes connaissances juridiques générales (RGPD, AI Act, Loi 09-08 marocaine, etc.).
  Réponds de manière concise et professionnelle.
  
  CONTEXTE DU DOCUMENT:
  ${context}`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      systemInstruction,
    }
  });

  return response.text;
}

export async function createLiveSession(context: string, voiceName: string = 'Kore', callbacks: {
  onOpen?: () => void | Promise<void>;
  onMessage?: (message: LiveServerMessage) => void;
  onClose?: () => void;
  onError?: (error: any) => void;
}) {
  const session = await ai.live.connect({
    model: "gemini-3.1-flash-live-preview",
    callbacks: {
      onopen: callbacks.onOpen,
      onmessage: callbacks.onMessage || (() => {}),
      onclose: callbacks.onClose,
      onerror: callbacks.onError,
    },
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName as any } },
      },
      systemInstruction: `Tu es un assistant juridique expert. 
      Utilise le contexte suivant pour répondre aux questions de manière concise et professionnelle.
      Réponds directement à la voix.
      
      CONTEXTE:
      ${context}`,
      outputAudioTranscription: {},
      inputAudioTranscription: {},
    },
  });

  return session;
}

