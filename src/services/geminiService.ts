export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface EvaluationResult {
  score: number;
  feedback: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

export const startChat = (systemInstruction?: string) => {
  console.log("startChat called:", systemInstruction);
  return null;
};

// Standard query and text completion wrapper via Server API proxy
export const chatWithAI = async (
  prompt: string,
  settings?: { systemInstruction?: string; temperature?: number; model?: string },
  image?: { data: string; mimeType: string }
): Promise<string> => {
  try {
    const response = await fetch("/api/gemini/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, image, settings }),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.text;
  } catch (error: any) {
    console.error("AI Generation error:", error);
    return `An error occurred: ${error.message || String(error)}. Please try again.`;
  }
};

// Generates bullet points or detailed explanations for complex queries
export const complexReasoning = async (topic: string, detailLevel: string = "comprehensive"): Promise<string> => {
  const prompt = `Perform high-level educational analysis on the topic: "${topic}". The analysis must be ${detailLevel} and clear for students. Use formatting and clear sections.`;
  return chatWithAI(prompt, {
    systemInstruction: "You are a Distinguished Scholar and Academic Counselor. Break down topics hierarchically, exposing foundations, practical applications, and advanced research fields."
  });
};

// Generates dynamic Google Search groundings for real-time tracking
export const searchGrounding = async (queryStr: string): Promise<{ text: string; sources: { title: string; uri: string }[] }> => {
  try {
    const response = await fetch("/api/gemini/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ queryStr }),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${response.status}`);
    }
    const data = await response.json();
    return {
      text: data.text,
      sources: data.sources || [],
    };
  } catch (error: any) {
    console.error("Search Grounding exception:", error);
    return {
      text: `Failed to fetch live search information: ${error.message || String(error)}`,
      sources: []
    };
  }
};

// Generate highly structured Interactive Learning Roadmaps
export const generateLearningPath = async (
  topic: string,
  userStats: { grades?: string; interests?: string; speed?: string }
): Promise<string> => {
  const prompt = `Synthesize a custom multi-step learning path for: "${topic}".
Student Context:
- Target level/Grade: ${userStats.grades || "High School"}
- Key interests: ${userStats.interests || "General Science & Practical Tech"}
- Study speed: ${userStats.speed || "Balanced/Steady"}

Please output a cohesive markdown roadmap outlining 4 core stages of mastery, including practical mini-challenges at each stage.`;
  
  return chatWithAI(prompt, {
    systemInstruction: "You are an Elite Curriculum UX Designer. Format paths visually as timeline cards using clean Markdown and emoji icons."
  });
};

// Generate text of study audio clips or lectures using text-to-speech
export const textToSpeech = async (text: string): Promise<string> => {
  try {
    const response = await fetch("/api/gemini/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.base64Audio;
  } catch (error: any) {
    console.error("Gemini TTS exception:", error);
    throw error;
  }
};

// Custom interactive quiz generation helper (conforms to strict schema)
export const generateQuestions = async (topic: string, count: number = 5): Promise<QuizQuestion[]> => {
  try {
    const response = await fetch("/api/gemini/quiz", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ topic, count }),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.results as QuizQuestion[];
  } catch (error: any) {
    console.error("Quiz questions generator failed:", error);
    // Return a logical fallback set of quiz questions to ensure UI never freezes
    return [
      {
        id: "fallback_1",
        question: `Which fundamental principle is central to understanding: "${topic}"?`,
        options: ["Foundational Mechanics", "Hypothetical Conjecture", "None of the above", "All of the above"],
        correctIndex: 0,
        explanation: "Foundations are always the primary stepping stones to understanding any complex academic structure."
      }
    ];
  }
};

// Placeholder for Live speaker sessions
export const startLiveSession = async (callbacks: any): Promise<any> => {
  console.log("Mocking startLiveSession with callbacks:", callbacks);
  return {
    sendRealtimeInput: () => {},
    close: () => {}
  };
};
