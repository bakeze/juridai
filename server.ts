import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Charger les variables d'environnement depuis .env.local
const envPath = path.join(__dirname, '.env.local');
console.log('📂 Searching for .env.local at:', envPath);

const envResult = dotenv.config({ path: envPath });
if (envResult.error) {
  console.warn('⚠️ Warning loading .env.local:', envResult.error.message);
} else {
  console.log('✅ .env.local loaded successfully');
}

console.log('✅ Variables d\'environnement chargées');
console.log('📦 ELEVENLABS_API_KEY:', process.env.ELEVENLABS_API_KEY ? '✓ Configurée' : '✗ Non configurée');
if (process.env.ELEVENLABS_API_KEY) {
  console.log('   Préfixe:', process.env.ELEVENLABS_API_KEY.substring(0, 15) + '...');
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Debug endpoint to check configuration
  app.get("/api/health", (req, res) => {
    console.log('🔍 Health check - ELEVENLABS_API_KEY:', process.env.ELEVENLABS_API_KEY ? '✓' : '✗');
    res.json({
      status: 'ok',
      elevenlabsConfigured: !!process.env.ELEVENLABS_API_KEY,
      elevenlabsKeyPreview: process.env.ELEVENLABS_API_KEY ? process.env.ELEVENLABS_API_KEY.substring(0, 10) + '...' : null,
    });
  });

  // API Routes
  app.post("/api/tts/elevenlabs", async (req, res) => {
    const { text, voiceId } = req.body;
    const apiKey = process.env.ELEVENLABS_API_KEY;

    console.log('📤 TTS Request - apiKey present:', !!apiKey, 'text length:', text?.length);

    if (!apiKey) {
      console.error('❌ ELEVENLABS_API_KEY is undefined!');
      console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('ELEVEN')));
      return res.status(500).json({ error: "ELEVENLABS_API_KEY not configured on server" });
    }

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId || '21m00Tcm4TlvDq8ikWAM'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return res.status(response.status).json(errorData);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      res.set('Content-Type', 'audio/mpeg');
      res.send(buffer);
    } catch (error) {
      console.error("ElevenLabs Proxy Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
