import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
console.log("API Key exists:", !!apiKey);
if (apiKey) {
  console.log("API Key length:", apiKey.length);
  console.log("API Key starts with:", apiKey.substring(0, 4));
}

const ai = new GoogleGenAI({ apiKey: apiKey });

async function run() {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Diga 'Olá, mundo!'",
    });
    console.log("Success:", response.text);
  } catch (e: any) {
    console.error("ERROR:", e.message);
    if (e.status) console.error("Status:", e.status);
  }
}
run();
