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

let tools = [];
const chathistory = [];

const transport = new StreamableHTTPClientTransport(
    new URL('http://localhost:3000/mcp')
);



 await mcpClient.connect(transport).then(async () => {
    console.log("✅ Connected to MCP server\n");

    // Get available tools
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
    })
    main();
  }).catch((error) => {
    console.error("❌ Connection failed:", error.message);
  });


async function main() {
    let toolCall = null;

    // Chat loop
    while(true){
        let userInput;
        
        // Only ask for input if there's no pending tool call
        if(!toolCall){
            userInput = await rl.question('You: ');
            
            chathistory.push({
                role: "user",
                parts: [{
                    text: userInput,
                    type: "text"
                }]
            });
        } else {
            // Execute pending tool call
            console.log('calling Tool :', toolCall.name)
            
            chathistory.push({
                role: "model",
                parts: [{
                    text: `Calling tool: ${toolCall.name}`,
                    type: "text"
                }]
            });

            const toolResult = await mcpClient.callTool({
                name: toolCall.name,
                arguments: toolCall.args
            });

            chathistory.push({
                role: "user",
                parts: [{
                    text: "tool Result: " + toolResult.content[0].text,
                    type: "text"
                }]
            });
            
            toolCall = null; // Clear the pending tool call
        }
        
        try {
            // Send to Gemini API
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: chathistory,
                config:{
                    tools:[
                        {
                            functionDeclarations: tools,
                        }
                    ]
                }
            });
            
            const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text;
            const functionCall = response.candidates?.[0]?.content?.parts?.[0]?.functionCall;
            
            if(functionCall){
                toolCall = functionCall;
                continue;
            }
            
            if (responseText) {
                chathistory.push({
                    role: "model",
                    parts: [{
                        text: responseText,
                        type: "text"
                    }]
                });
                
                console.log(`AI: ${responseText}\n`);
            }
            
        } catch (error) {
            console.error("❌ API Error:", error.message);
            console.log("Try again.\n");
        }
    }
}



