import readline from 'readline/promises';
import {config} from 'dotenv';
import { GoogleGenAI } from "@google/genai"
config();

const ai = new GoogleGenAI({});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const chathistory = [];

async function Giveanswer() {
  while (true) {
    try {
      const question = await rl.question('Your question here: ');
      
      if (question.toLowerCase() === 'stop' || question.toLowerCase() === 'exit') {
        rl.close();
        break;
      }
      
      chathistory.push({
        role: "user",
        parts: [{text: question, type: "text"}]
      });

      const response = await ai.models.generateContent({
        model: "gemini-2-flash",
        contents: chathistory,
      });

      chathistory.push({role: 'model', parts: [{text: response.text, type: 'text'}]});
      console.log(`AI - ${response.candidates[0].content.parts[0].text}`);
      
    } catch (error) {
      console.log('Error:', error);
      rl.close();
      break;
    }
  }
}

Giveanswer();