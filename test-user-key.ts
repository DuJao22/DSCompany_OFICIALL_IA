import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: 'AIzaSyA3NaOIg5zK4gNnP80j9UHswyn9aExd5Lc' });

async function test() {
  try {
    console.log("Testing WITH googleMaps tool...");
    const res1 = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Extraia os dados deste link: https://maps.app.goo.gl/5MjHBCgJnr8nnciL9",
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: { includeServerSideToolInvocations: true }
      }
    });
    console.log("Success with tool:", res1.text);
  } catch (e: any) {
    console.error("Error with tool:", e.message);
  }

  try {
    console.log("\nTesting WITHOUT tools...");
    const res2 = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Extraia os dados deste link: https://maps.app.goo.gl/5MjHBCgJnr8nnciL9",
    });
    console.log("Success without tool:", res2.text);
  } catch (e: any) {
    console.error("Error without tool:", e.message);
  }
}

test();
