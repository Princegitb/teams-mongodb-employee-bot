require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

async function testModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  
  const modelsToTest = [
    'gemini-3.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-flash-latest',
    'gemini-2.0-flash-lite'
  ];

  for (const model of modelsToTest) {
    try {
      console.log(`\nTesting model: ${model}...`);
      const response = await ai.models.generateContent({
        model: model,
        contents: 'Hello! Respond with "OK" if you hear me.',
      });
      console.log(`Success! Response: "${response.text.trim()}"`);
      return; // Stop if one succeeds!
    } catch (err) {
      console.error(`Failed for ${model}:`, err.message);
    }
  }
}

testModels();
