import readline from 'readline/promises';
import {config} from 'dotenv';
import { GoogleGenAI } from "@google/genai"
import { Client } from '@modelcontextprotocol/sdk/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
config();

const ai = new GoogleGenAI({});


const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const mcpClient = new Client({
   name: "example-client",
   version: "1.0.0",
})

 const transport = new StreamableHTTPClientTransport(
    new URL('http://localhost:3000/mcp')
  );

mcpClient.connect(transport)
    .then(async () => {
        console. log("✅ Connected to MCP server");

        // Get available tools from MCP server
        tools = (await mcpClient.listTools()).tools. map(tool => {
            return {
                name:  tool.name,
                description: tool.description,
                parameters: {
                    type: tool.inputSchema. type,
                    properties: tool.inputSchema.properties,
                    required: tool.inputSchema.required
                }
            };
        });

        console.log("📋 Available tools:", tools. map(t => t.name).join(', '));
        console.log("\n💬 Start chatting!  (Ctrl+C to exit)\n");

        chatLoop();
    })
    .catch(error => {
        console.error("❌ Connection failed:", error);
        process.exit(1);
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
        model: "gemini-2.5-flash",
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