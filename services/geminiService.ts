import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.API_KEY;

// Ensure API Key is present
if (!API_KEY) {
  console.error("API_KEY is missing from environment variables");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Retry wrapper with exponential backoff and jitter
async function retryWithBackoff<T>(operation: () => Promise<T>, retries = 5, baseDelay = 2000): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Enhanced error checking for rate limiting (429) or server overload (503)
      // Checking various properties where libraries might hide the status code
      const errorCode = error.status || error.code || error?.error?.code || error?.response?.status;
      const errorMessage = error.message || JSON.stringify(error);
      const errorBody = error.response?.data || error.body || {};
      
      const isRateLimit = errorCode === 429 || 
                          errorMessage.includes('429') || 
                          errorMessage.includes('quota') || 
                          errorMessage.includes('RESOURCE_EXHAUSTED') ||
                          JSON.stringify(errorBody).includes('RESOURCE_EXHAUSTED');
      
      const isServerOverload = errorCode === 503 || errorMessage.includes('503');
      
      if ((isRateLimit || isServerOverload) && i < retries - 1) {
        // Exponential backoff with jitter: 2s, 4s, 8s, 16s + random jitter
        const waitTime = baseDelay * Math.pow(2, i) + (Math.random() * 1000);
        console.warn(`API request failed (Attempt ${i + 1}/${retries}) due to ${isRateLimit ? 'Rate Limit' : 'Server Error'}. Retrying in ${Math.round(waitTime)}ms...`);
        await delay(waitTime);
        continue;
      }
      
      // If it's not a retryable error, throw immediately
      if (!isRateLimit && !isServerOverload) {
        throw error;
      }
    }
  }
  
  throw lastError || new Error("Max retries exceeded");
}

function formatError(error: any): string {
  let msg = error.message || "알 수 없는 오류가 발생했습니다.";
  
  // Try to parse JSON error message if it's a stringified JSON
  try {
     // If message looks like JSON object
     if (typeof msg === 'string' && (msg.trim().startsWith('{') || msg.includes('{"error":'))) {
         // Sometimes the message is a text containing JSON, try to extract it or parse it if it's pure JSON
         const parsed = JSON.parse(msg);
         if (parsed.error && parsed.error.message) {
             msg = parsed.error.message;
         }
     }
  } catch (e) {
      // ignore parsing error
  }

  if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
    return "⚠️ 사용량 한도(Quota)를 초과했습니다. 1분 정도 기다린 후 다시 시도해주세요. (Code 429)";
  }
  if (msg.includes('503')) {
    return "⚠️ 서비스가 일시적으로 혼잡합니다. 잠시 후 다시 시도해주세요. (Code 503)";
  }
  if (msg.includes('SAFETY')) {
    return "⚠️ 안전 정책에 의해 콘텐츠 생성이 차단되었습니다.";
  }
  
  return `오류 발생: ${msg}`;
}

export async function generateContent(systemPrompt: string, userInput: string): Promise<string> {
  try {
    return await retryWithBackoff(async () => {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: userInput,
        config: {
          systemInstruction: systemPrompt,
        },
      });
      return response.text || "";
    });
  } catch (error: any) {
    console.error("Generate Content Error:", error);
    throw new Error(formatError(error));
  }
}

export async function* generateContentStream(systemPrompt: string, userInput: string): AsyncGenerator<string, void, unknown> {
  try {
    // We retry the initial connection setup
    const responseStream = await retryWithBackoff(async () => {
      return await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: userInput,
        config: {
          systemInstruction: systemPrompt,
        },
      });
    });

    for await (const chunk of responseStream) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  } catch (error: any) {
    console.error("Generate Stream Error:", error);
    throw new Error(formatError(error));
  }
}