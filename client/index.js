import readline from 'readline/promises';
import {config} from 'dotenv';
import { GoogleGenAI } from "@google/genai"
import { Client } from '@modelcontextprotocol/sdk/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
config();



const ai = new GoogleGenAI({
  apiKey: "AIzaSyCLB4MRQZeuHJ3HMRooxL6GK9ZinlDSYSI"
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const mcpClient = new Client({
   name: "example-client",
   version: "1.0.0",
})

let tools = [];
const transport = new StreamableHTTPClientTransport(
    new URL('http://localhost:3000/mcp')
  );

mcpClient.connect(transport)
    .then(async () => {
        console.log("✅ Connected to MCP server");

        // Get available tools from MCP server
        tools = (await mcpClient.listTools()).tools.map(tool => {
            return {
                name: tool.name,
                description: tool.description,
                parameters: {
                    type: tool.inputSchema.type,
                    properties: tool.inputSchema.properties,
                    required: tool.inputSchema.required
                }
            };
        });

        // console.log("📋 Available tools:", tools)
        // console.log("\n💬 Start chatting!  (Ctrl+C to exit)\n");
        Giveanswer();

    })
    .catch(error => {
        console.error("❌ Connection failed:", error);
        // process.exit(1);
    });

const chathistory = [];

async function Giveanswer(toolCall) {
  while (true) {
    if (toolCall) {
      console.log("calling tool ", toolCall.name)

      chathistory.push({
        role: "model",
        parts: [{
          text: `calling tool ${toolCall.name}`,
          type: "text"
        }]
      })

      const toolResult = await mcpClient.callTool({
        name: toolCall.name,
        arguments: toolCall.args
      })

      chathistory.push({
        role: "user",
        parts: [{
          text: "Tool result : " + toolResult.content[0].text,
          type: "text"
        }]
      })
    } else {
      const question = await rl.question('You: ');
      chathistory.push({
        role: "user",
        parts: [{
          text: question,
          type: "text"
        }]
      })
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: chathistory,
        config: {
          tools: [
            {
              functionDeclarations: tools,
            }
          ]
        }
      })

      const functionCall = response.candidates?.[0]?.content?.parts?.[0]?.functionCall
      const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text

      if (functionCall) {
        toolCall = functionCall
        continue
      }

      chathistory.push({
        role: "model",
        parts: [{
          text: responseText,
          type: "text"
        }]
      })

      console.log(`AI: ${responseText}`)

      toolCall = null
    } catch (error) {
      console.error("❌ API Error:", error.message);
      console.error("Error details:", error);
      break;
    }
  }
}
  