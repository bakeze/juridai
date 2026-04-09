import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import fs from "fs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { GoogleGenAI } from "@google/genai";
import {
  loadIndex,
  search,
  getStatus,
  saveIndex,
  loadCorpusPdfs,
  RagChunk,
} from "./rag/ragService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env.local") });

// ─── Constants ────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || "jurisvoice-dev-secret-CHANGE_IN_PRODUCTION";
const USERS_PATH = path.join(__dirname, "data", "users.json");
const AUDIT_PATH = path.join(__dirname, "audit", "audit.jsonl");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

// ─── Startup ─────────────────────────────────────────────────────────────────

// Ensure audit directory exists
fs.mkdirSync(path.join(__dirname, "audit"), { recursive: true });

// Load RAG index at startup (non-blocking)
loadIndex();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function loadUsers(): any[] {
  if (!fs.existsSync(USERS_PATH)) return [];
  return JSON.parse(fs.readFileSync(USERS_PATH, "utf-8"));
}

function writeAuditLog(entry: Record<string, unknown>): void {
  try {
    const line = JSON.stringify({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...entry }) + "\n";
    fs.appendFileSync(AUDIT_PATH, line, "utf-8");
  } catch (err) {
    console.error("[Audit] Failed to write log:", err);
  }
}

function extractCitations(text: string): string[] {
  const matches = text.match(/\[\[SOURCE:\s*([^\]]+)\]\]/g) || [];
  return [...new Set(matches.map(m => m.replace(/\[\[SOURCE:\s*/, "").replace(/\]\]/, "").trim()))];
}

function formatRagContext(chunks: RagChunk[]): string {
  if (chunks.length === 0) return "";
  const grouped: Record<string, RagChunk[]> = {};
  for (const c of chunks) {
    if (!grouped[c.jurisdiction]) grouped[c.jurisdiction] = [];
    grouped[c.jurisdiction].push(c);
  }
  return Object.entries(grouped).map(([j, cs]) =>
    `### Réglementation ${j.toUpperCase()} :\n` + cs.map(c => `[${c.regulation.toUpperCase()}]\n${c.text}`).join("\n\n")
  ).join("\n\n---\n\n");
}

async function callGemini(prompt: string, systemInstruction: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY non configurée");
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-04-17",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { systemInstruction },
  });
  return response.text || "";
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────

interface AuthRequest extends Request {
  user?: { id: string; username: string; role: string; name: string };
}

function authMiddleware(roles?: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Non authentifié" });

    try {
      const payload = jwt.verify(token, JWT_SECRET) as any;
      if (roles && !roles.includes(payload.role)) {
        return res.status(403).json({ error: "Accès interdit — rôle insuffisant" });
      }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: "Token invalide ou expiré" });
    }
  };
}

// ─── Server ───────────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const PORT = 3000;


  app.use(express.json({ limit: "10mb" }));

  // ── Health ────────────────────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      geminiConfigured: !!GEMINI_API_KEY,
      elevenlabsConfigured: !!process.env.ELEVENLABS_API_KEY,
      ragStatus: getStatus(),
    });
  });

  // ── Auth Routes ───────────────────────────────────────────────────────────
  app.post("/api/auth/login", (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Identifiants manquants" });
    }

    const users = loadUsers();
    const user = users.find(
      (u: any) => u.username === username && u.passwordHash === hashPassword(password)
    );

    if (!user) {
      writeAuditLog({ action: "login_failed", username, ip: req.ip });
      return res.status(401).json({ error: "Identifiants incorrects" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    writeAuditLog({ action: "login_success", userId: user.id, username: user.username, role: user.role });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, name: user.name, email: user.email } });
  });

  app.get("/api/auth/me", authMiddleware(), (req: AuthRequest, res: Response) => {
    res.json({ user: req.user });
  });

  // ── Chat (proxied via server for audit logging) ───────────────────────────
  app.post("/api/chat", authMiddleware(), async (req: AuthRequest, res: Response) => {
    const { query, contractContext, jurisdictionFilter } = req.body;
    if (!query) return res.status(400).json({ error: "query requis" });

    try {
      // 1. RAG search
      let ragChunks: RagChunk[] = [];
      const ragStatus = getStatus();

      if (ragStatus.loaded) {
        ragChunks = search(query, 6, jurisdictionFilter);
      }

      const ragContext = formatRagContext(ragChunks);

      // 2. Build system instruction
      const systemInstruction = `Tu es JurisVoice AI, un assistant juridique expert spécialisé dans la conformité internationale des contrats.
Tu analyses des contrats pour des entreprises industrielles opérant dans plusieurs juridictions (UE, France, Maroc, USA, Canada).

${ragContext ? `CORPUS RÉGLEMENTAIRE PERTINENT (base de connaissances RAG):\n${ragContext}\n\n` : ""}
${contractContext ? `DOCUMENT CONTRACTUEL EN COURS D'ANALYSE:\n${contractContext}\n\n` : ""}

CADRE DE RAISONNEMENT OBLIGATOIRE:
Pour toute question de conformité, tu DOIS suivre ces étapes et les nommer explicitement:
1. 🔍 IDENTIFICATION: Extraire la clause ou le point pertinent du contrat
2. 🇪🇺 ANALYSE EU: Vérifier la conformité avec le droit européen (RGPD Art.XX, AI Act Art.XX, DGA Art.XX)
3. 🏛️ ANALYSE NATIONALE: Appliquer le droit national concerné (France, Maroc, USA/NIST, Canada/AIDA)
4. ⚖️ CONFLITS INTER-JURIDICTIONNELS: Identifier les incompatibilités entre juridictions et la loi applicable
5. 📋 SYNTHÈSE: Conclusion argumentée avec recommandations concrètes

FORMAT DE CITATION OBLIGATOIRE — utilise EXACTEMENT ce format pour chaque référence légale:
[[SOURCE: NOM_RÈGLEMENT, Article X]]

Exemples corrects: [[SOURCE: RGPD, Article 44]], [[SOURCE: AI Act, Article 5]], [[SOURCE: Loi 09-08, Article 23]], [[SOURCE: NIST AI RMF, GOVERN 1.1]]

RÈGLES ABSOLUES:
- Réponds toujours en français
- Cite au minimum 2 sources pour chaque analyse
- Si des réglementations sont en conflit, explique quelle loi prime et pourquoi (lex specialis, lex posterior, principe de faveur)
- Ne jamais affirmer une conformité sans citer la base légale précise
- Pour les transferts de données hors UE: toujours vérifier Art.44-49 RGPD ET la loi nationale du pays destinataire
- Pour les systèmes IA: toujours croiser AI Act avec RGPD (Art.22 décisions automatisées)`;

      // 3. Call Gemini
      const response = await callGemini(query, systemInstruction);
      const citations = extractCitations(response);

      // 4. Audit log
      writeAuditLog({
        action: "chat_query",
        userId: req.user!.id,
        username: req.user!.username,
        role: req.user!.role,
        query: query.substring(0, 200),
        jurisdictionFilter: jurisdictionFilter || null,
        ragChunksUsed: ragChunks.map(c => c.id),
        citationsFound: citations,
        responseLength: response.length,
        hasContractContext: !!contractContext,
      });

      res.json({
        response,
        citations,
        ragChunks: ragChunks.map(({ id, regulation, jurisdiction, source }) => ({ id, regulation, jurisdiction, source })),
      });
    } catch (err: any) {
      console.error("[Chat] Error:", err);
      writeAuditLog({ action: "chat_error", userId: req.user?.id, error: err?.message });
      res.status(500).json({ error: err?.message || "Erreur interne" });
    }
  });

  // ── RAG Routes ────────────────────────────────────────────────────────────
  app.get("/api/rag/status", authMiddleware(), (_req, res) => {
    res.json(getStatus());
  });

  app.post("/api/rag/rebuild", authMiddleware(["admin"]), async (_req, res) => {
    res.json({ message: "Reconstruction de l'index RAG démarrée en arrière-plan. Consultez les logs serveur." });

    // Background rebuild
    (async () => {
      try {
        console.log("[RAG] Démarrage de la reconstruction de l'index...");
        const chunks = await loadCorpusPdfs();
        console.log(`[RAG] ${chunks.length} chunks extraits, démarrage de l'embedding...`);

        saveIndex(chunks);
        console.log(`\n[RAG] Index reconstruit: ${embedded.length} chunks`);
        writeAuditLog({ action: "rag_rebuild_complete", chunks: embedded.length });
      } catch (err: any) {
        console.error("[RAG] Rebuild error:", err);
        writeAuditLog({ action: "rag_rebuild_error", error: err?.message });
      }
    })();
  });

  // ── Audit Routes ──────────────────────────────────────────────────────────
  app.get("/api/audit", authMiddleware(["admin", "compliance_officer"]), (req, res) => {
    try {
      if (!fs.existsSync(AUDIT_PATH)) return res.json({ entries: [], total: 0 });

      const raw = fs.readFileSync(AUDIT_PATH, "utf-8");
      const lines = raw.trim().split("\n").filter(Boolean);
      const entries = lines.map(l => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);

      // Filters
      const { action, username, from, to, limit = 100, offset = 0 } = req.query;
      let filtered = entries;
      if (action) filtered = filtered.filter((e: any) => e.action === action);
      if (username) filtered = filtered.filter((e: any) => e.username === username);
      if (from) filtered = filtered.filter((e: any) => e.timestamp >= from);
      if (to) filtered = filtered.filter((e: any) => e.timestamp <= to);

      // Newest first
      filtered.reverse();
      const total = filtered.length;
      const page = filtered.slice(Number(offset), Number(offset) + Number(limit));

      res.json({ entries: page, total, offset: Number(offset), limit: Number(limit) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message });
    }
  });

  app.delete("/api/audit", authMiddleware(["admin"]), (_req, res) => {
    if (fs.existsSync(AUDIT_PATH)) fs.writeFileSync(AUDIT_PATH, "", "utf-8");
    res.json({ message: "Journal d'audit effacé" });
  });

  // ── ElevenLabs TTS Proxy ──────────────────────────────────────────────────
  app.post("/api/tts/elevenlabs", async (req, res) => {
    const { text, voiceId } = req.body;
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY non configurée" });

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId || "21m00Tcm4TlvDq8ikWAM"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
          body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        }
      );
      if (!response.ok) return res.status(response.status).json(await response.json());
      const buffer = Buffer.from(await response.arrayBuffer());
      res.set("Content-Type", "audio/mpeg").send(buffer);
    } catch (err) {
      console.error("[ElevenLabs]", err);
      res.status(500).json({ error: "Erreur interne TTS" });
    }
  });

  // ── Vite / Static ─────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 JurisVoice AI — http://localhost:${PORT}`);
    console.log(`   Gemini:     ${GEMINI_API_KEY ? "✅" : "❌ non configuré"}`);
    console.log(`   ElevenLabs: ${process.env.ELEVENLABS_API_KEY ? "✅" : "❌ non configuré"}`);
    console.log(`   RAG Index:  ${getStatus().loaded ? `✅ ${getStatus().chunks} chunks` : "⚠️  non indexé (npm run rag:index)"}`);
    console.log(`   JWT Secret: ${JWT_SECRET === "jurisvoice-dev-secret-CHANGE_IN_PRODUCTION" ? "⚠️  par défaut" : "✅"}\n`);
  });
}

startServer();
