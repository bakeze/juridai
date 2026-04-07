
export async function generateElevenLabsSpeech(text: string, voiceId: string = '21m00Tcm4TlvDq8ikWAM') {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error('Le texte ne peut pas être vide');
    }

    // Use server-side proxy (recommended)
    const response = await fetch('/api/tts/elevenlabs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, voiceId }),
    });

    if (!response.ok) {
      let errorMessage = `ElevenLabs error: ${response.statusText}`;
      try {
        const error = await response.json();
        errorMessage = error.error || errorMessage;
      } catch (e) {
        // Continue with statusText if JSON parsing fails
      }
      throw new Error(errorMessage);
    }

    const blob = await response.blob();
    if (!blob || blob.size === 0) {
      throw new Error('La réponse audio est vide');
    }

    const url = URL.createObjectURL(blob);
    return url;
  } catch (error) {
    console.error("ElevenLabs Error:", error);
    throw error;
  }
}
