import readline from 'readline/promises';
import { config } from 'dotenv';
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
    // Chat loop
    while (true) {
        let userInput = await rl.question('You: ');

        chathistory.push({
            role: "user",
            parts: [{
                text: userInput,
                type: "text"
            }]
        });

        // Keep processing until AI stops requesting tools
        let continueLoop = true;

        while (continueLoop) {
            try {
                // Send to Gemini API
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: chathistory,
                    config: {
                        tools: [
                            {
                                functionDeclarations: tools,
                            }
                        ]
                    }
                });

                const parts = response.candidates?.[0]?.content?.parts || [];
                let hasToolCall = false;

                // Add AI response to history BEFORE processing
                // Separate text and functionCall parts
                const modelParts = [];
                for (const part of parts) {
                    if (part.text) {
                        // Clean control characters from text
                        const cleanText = part.text.replace(/<ctrl\d+>/g, '');
                        if (cleanText.trim()) {
                            modelParts.push({ text: cleanText });
                        }
                    }
                    if (part.functionCall) {
                        modelParts.push({ functionCall: part.functionCall });
                    }
                }
                
                if (modelParts.length > 0) {
                    chathistory.push({
                        role: "model",
                        parts: modelParts
                    });
                }

                // Process all parts from the response
                for (const part of parts) {
                    if (part.text) {
                        // Clean control characters from display text
                        const cleanText = part.text.replace(/<ctrl\d+>/g, '');
                        if (cleanText.trim()) {
                            console.log(`AI: ${cleanText}`);
                        }
                    }

                    if (part.functionCall) {
                        hasToolCall = true;
                        const toolCall = part.functionCall;

                        console.log(`\n📞 Calling Tool: ${toolCall.name}`);

                        try {
                            const toolResult = await mcpClient.callTool({
                                name: toolCall.name,
                                arguments: toolCall.args
                            });

                            const toolResultText = toolResult.content[0]?.text || JSON.stringify(toolResult);

                            // Add tool result to history
                            chathistory.push({
                                role: "user",
                                parts: [{
                                    text: `Tool result for ${toolCall.name}: ${toolResultText}`,
                                    type: "text"
                                }]
                            });
                        } catch (toolError) {
                            console.error(`❌ Tool Error (${toolCall.name}):`, toolError.message);

                            // Add error to history so AI knows it failed
                            chathistory.push({
                                role: "user",
                                parts: [{
                                    text: `Tool execution failed for ${toolCall.name}: ${toolError.message}`,
                                    type: "text"
                                }]
                            });
                        }
                    }
                }

                // If no tool calls, we're done with this user input
                if (!hasToolCall) {
                    continueLoop = false;
                    console.log('');
                }

            } catch (error) {
                console.error("❌ API Error:", error.message);
                if (error.message.includes("exceeded your current quota" || error.message.includes("Rate limit exceeded") || error.message.includes("code:400"))) {
                    break;
                }
                console.log("Retrying...\n");
            }
        }
    }
}



