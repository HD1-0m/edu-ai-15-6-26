import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Gemini API client on the server side
  // Always use process.env.GEMINI_API_KEY for the Gemini API on server-side only
  const apiKey = process.env.GEMINI_API_KEY || "";
  
  const getAiClient = () => {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    return new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  };

  // Helper helper function to call Gemini generateContent with retries and fallback models
  // to gracefully handle temporary 503 "High Demand" or 429 rate limit errors
  const generateContentWithRetry = async (
    ai: any,
    params: {
      model: string;
      contents: any;
      config?: any;
    },
    fallbacks: string[] = []
  ) => {
    const modelsToTry = [params.model, ...fallbacks];
    let lastError: any = null;

    for (const model of modelsToTry) {
      let retries = 3;
      let delay = 1000; // start with 1s for better recovery on 503 error

      while (retries > 0) {
        try {
          console.log(`[Gemini API] Requesting ${model} (${retries} attempts left)...`);
          const response = await ai.models.generateContent({
            ...params,
            model: model,
          });
          return response;
        } catch (error: any) {
          lastError = error;
          const errorMessage = error.message || String(error);
          const isTransient = 
            errorMessage.includes("503") || 
            errorMessage.includes("UNAVAILABLE") || 
            errorMessage.includes("429") || 
            errorMessage.includes("high demand") || 
            errorMessage.includes("ResourceExhausted") ||
            errorMessage.includes("Rate limit");

          console.warn(`[Gemini API] Error for ${model}:`, errorMessage);

          if (isTransient && retries > 1) {
            console.log(`[Gemini API] Transient error detected. Retrying in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 2; // exponential backoff
            retries--;
          } else {
            console.log(`[Gemini API] Non-transient or exhausted retries for model: ${model}`);
            break; // Try next fallback model
          }
        }
      }
    }

    throw lastError || new Error("Failed to generate content after retries and fallbacks");
  };

  // API endpoints for proxying Gemini API requests safely
  app.post("/api/gemini/chat", async (req, res) => {
    try {
      const { prompt, image, settings } = req.body;
      const ai = getAiClient();
      
      let contents: any = prompt;
      if (image && image.data && image.mimeType) {
        contents = [
          {
            parts: [
              { text: prompt || "Analyze this file/image." },
              { inlineData: { data: image.data, mimeType: image.mimeType } }
            ]
          }
        ];
      }
      
      const selectedModel = settings?.model || "gemini-3.5-flash";
      const temperature = settings?.temperature !== undefined ? parseFloat(settings.temperature) : 0.7;
      
      const response = await generateContentWithRetry(ai, {
        model: selectedModel,
        contents: contents,
        config: {
          systemInstruction: settings?.systemInstruction || "You are a friendly and academic EduAI Teacher.",
          temperature: temperature
        }
      }, ["gemini-3.1-flash-lite"]);
      res.json({ text: response.text || "I was unable to formulate a response." });
    } catch (error: any) {
      console.error("Server API Chat Error:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  });

  app.post("/api/gemini/search", async (req, res) => {
    try {
      const { queryStr } = req.body;
      const ai = getAiClient();
      const response = await generateContentWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: queryStr,
        config: {
          tools: [{ googleSearch: {} }]
        }
      }, ["gemini-3.1-flash-lite"]);

      const sources: { title: string; uri: string }[] = [];
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        chunks.forEach((chunk: any) => {
          if (chunk.web) {
            sources.push({
              title: chunk.web.title || "Web Resource",
              uri: chunk.web.uri || ""
            });
          }
        });
      }

      res.json({
        text: response.text || "No results generated.",
        sources
      });
    } catch (error: any) {
      console.error("Server API Search Error:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  });

  app.post("/api/gemini/tts", async (req, res) => {
    try {
      const { text } = req.body;
      const ai = getAiClient();
      const response = await generateContentWithRetry(ai, {
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: `Read clearly: ${text}` }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" }
            }
          }
        }
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        throw new Error("No speech audio returned from Gemini.");
      }
      res.json({ base64Audio });
    } catch (error: any) {
      console.error("Server API TTS Error:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  });

  app.post("/api/gemini/quiz", async (req, res) => {
    try {
      const { topic, count } = req.body;
      const ai = getAiClient();
      const prompt = `Generate exactly ${count} multiple-choice test questions covering the topic: "${topic}".`;
      const response = await generateContentWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                question: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                correctIndex: { type: Type.INTEGER },
                explanation: { type: Type.STRING }
              },
              required: ["id", "question", "options", "correctIndex", "explanation"]
            }
          }
        }
      }, ["gemini-3.1-flash-lite"]);
      const bodyText = response.text || "[]";
      res.json({ results: JSON.parse(bodyText.trim()) });
    } catch (error: any) {
      console.error("Server API Quiz Error:", error);
      res.status(500).json({ error: error.message || String(error) });
    }
  });

  // Serve static assets in production, otherwise mount Vite in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
