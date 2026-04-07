/// <reference types="vite/client" />

// Déclarer le type global pour Puter.js (Gemini)
declare global {
  interface Window {
    puter: {
      ai: {
        chat: (prompt: string, options?: { model?: string }) => Promise<string>;
      };
    };
  }
}

// Vérifier que Puter.js est chargé
function waitForPuter(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).puter?.ai?.chat) {
      resolve();
    } else {
      const checkInterval = setInterval(() => {
        if ((window as any).puter?.ai?.chat) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      
      // Timeout après 10 secondes
      setTimeout(() => {
        clearInterval(checkInterval);
        console.warn('⚠️ Puter.js n\'a pas chargé dans le délai imparti');
        resolve();
      }, 10000);
    }
  });
}

export async function getChatResponse(prompt: string, context: string) {
  // S'assurer que Puter.js est chargé
  await waitForPuter();

  if (!(window as any).puter?.ai?.chat) {
    throw new Error('❌ Puter.js non disponible. Vérifiez que le script est chargé.');
  }

  const systemInstruction = `Tu es un assistant juridique expert en droit français et marocain. 
Utilise le contexte suivant (extrait d'un document PDF) pour répondre aux questions.
Si la réponse n'est pas dans le document, précise-le tout en apportant tes connaissances juridiques générales (RGPD, AI Act, Loi 09-08 marocaine, etc.).
Réponds de manière concise, professionnelle et en markdown formé pour une bonne lisibilité.

CONTEXTE DU DOCUMENT:
${context}

QUESTION: ${prompt}`;

  try {
    console.log('📤 Envoi à Puter.js (illimité, pas de quota)...');
    const response = await (window as any).puter.ai.chat(systemInstruction, {
      model: 'gemini-3.1-flash-lite-preview'  // Modèle gratuit et rapide
    });
    
    if (!response) {
      throw new Error('Réponse vide de Puter.js');
    }
    
    console.log('✅ Réponse brute reçue de Puter.js:', response);
    
    // Extraire le texte de la réponse Puter.js
    // Structure: {message: {content: 'texte...', ...}, ...}
    let textResponse: string;
    
    if (typeof response === 'string') {
      textResponse = response;
    } else if (response?.message?.content) {
      // Cas le plus courant: Puter.js retourne {message: {content: '...'}}
      textResponse = response.message.content;
    } else if (response?.message && typeof response.message === 'string') {
      textResponse = response.message;
    } else if (response?.text) {
      textResponse = response.text;
    } else if (response?.content) {
      textResponse = response.content;
    } else if (typeof response.toString === 'function') {
      textResponse = response.toString();
    } else {
      textResponse = String(response);
    }
    
    if (!textResponse || textResponse.trim().length === 0) {
      throw new Error('Réponse vide après extraction du texte');
    }
    
    console.log('✅ Texte extrait:', textResponse.substring(0, 100) + '...');
    return textResponse;
  } catch (err) {
    console.error('❌ Erreur Puter.js:', err);
    throw new Error(`Erreur lors de la génération de réponse: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Fonction legacy - gardée pour compatibilité mais non utilisée
export async function createLiveSession() {
  throw new Error('Gemini Live API n\'est plus supportée. Utilisez Web Speech API + ElevenLabs pour la voix.');
}

