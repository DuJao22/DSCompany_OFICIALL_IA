import { GoogleGenAI, Type } from "@google/genai";
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: "Você é um especialista em extração de dados. Você recebeu o seguinte link do Google Maps: https://maps.app.goo.gl/2NUGV7FBixEDqqFE9",
      config: {
        tools: [{ googleSearch: {} }],
        toolConfig: { includeServerSideToolInvocations: true },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            success: { type: Type.BOOLEAN, description: "True se encontrou o estabelecimento exato, False se não conseguiu ou se o link for inválido" },
            errorMessage: { type: Type.STRING, description: "Mensagem de erro amigável se success for false" },
            name: { type: Type.STRING, description: "Nome da empresa" },
          },
          required: ["success"]
        }
      }
    });
    console.log(response.text);
  } catch (e) {
    console.error("ERROR:", e);
  }
}
run();
