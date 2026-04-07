
/// <reference types="vite/client" />

let currentUtterance: SpeechSynthesisUtterance | null = null;

// Nettoyer le texte markdown pour une meilleure lecture vocale
function cleanMarkdownText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')  // Enlever **gras**
    .replace(/\*(.+?)\*/g, '$1')       // Enlever *italique*
    .replace(/__(.+?)__/g, '$1')       // Enlever __gras__
    .replace(/_(.+?)_/g, '$1')         // Enlever _italique_
    .replace(/`(.+?)`/g, '$1')         // Enlever `code`
    .replace(/#+\s/g, '')              // Enlever # titres
    .replace(/\n\n+/g, '\n')           // Réduire espaces
    .replace(/[-*]\s/g, '')            // Enlever puces
    .trim();
}

export function stopAudio() {
  window.speechSynthesis.cancel();
  currentUtterance = null;
}

export async function generateElevenLabsSpeech(text: string) {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error('Le texte ne peut pas être vide');
    }

    // Arrêter la synthèse précédente
    stopAudio();

    // Nettoyer le texte markdown
    const cleanText = cleanMarkdownText(text);
    
    console.log('🔊 Synthèse vocale native avec voix naturelle (gratuit & live)...');
    console.log('📝 Texte nettoyé:', cleanText.substring(0, 50) + '...');

    // Utiliser la Web Speech API native du navigateur avec meilleure synthèse
    return new Promise<string>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(cleanText);

      // Configuration pour une voix plus naturelle et humaine
      utterance.lang = 'fr-FR';
      utterance.rate = 0.9;   // Vitesse naturelle
      utterance.pitch = 1.0;   // Pitch normal
      utterance.volume = 1.0;  // Volume maximum

      // Essayer de sélectionner une voix féminine naturelle
      const voices = window.speechSynthesis.getVoices();
      const frenchFemaleVoice = voices.find(v => 
        (v.lang?.includes('fr') || v.lang?.includes('FR')) && 
        (v.name.toLowerCase().includes('female') || 
         v.name.toLowerCase().includes('femme') ||
         v.name.toLowerCase().includes('woman'))
      );
      
      if (frenchFemaleVoice) {
        utterance.voice = frenchFemaleVoice;
        console.log('🎤 Voix sélectionnée:', frenchFemaleVoice.name);
      } else {
        // Fallback: chercher une voix française
        const frenchVoice = voices.find(v => v.lang?.includes('fr'));
        if (frenchVoice) {
          utterance.voice = frenchVoice;
          console.log('🎤 Voix française:', frenchVoice.name);
        }
      }

      utterance.onstart = () => {
        console.log('🎵 Lecture vocale démarrée (LIVE)...');
      };

      utterance.onend = () => {
        console.log('✅ Synthèse vocale terminée');
        currentUtterance = null;
        resolve('played');
      };

      utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
        console.error('❌ Erreur synthèse vocale:', event.error);
        currentUtterance = null;
        reject(new Error(`Erreur TTS: ${event.error}`));
      };

      currentUtterance = utterance;
      console.log('▶️ Démarrage de la lecture audio LIVE...');
      window.speechSynthesis.speak(utterance);
    });
  } catch (error) {
    console.error('❌ Erreur TTS:', error);
    throw error;
  }
}
