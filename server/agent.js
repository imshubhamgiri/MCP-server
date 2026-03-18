// server/agent.js
import { GoogleGenAI } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import express from 'express';

const ai = new GoogleGenAI({});

// MCP Client - will be initialized on startup
let mcpClient = null;
let TOOL_DEFINITIONS = [];

export async function initializeMCPAgent() {
    try {
        mcpClient = new Client({
            name: "agent-server",
            version: "1.0.0",
        });

        const transport = new StreamableHTTPClientTransport(
            new URL('http://localhost:3000/mcp')
        );

        await mcpClient.connect(transport);
        console.log("✅ Agent connected to MCP server");

        // Fetch tools dynamically from MCP server
        const toolsResponse = await mcpClient.listTools();
        const fetchedTools = toolsResponse.tools || [];

        console.log(`📦 Found ${fetchedTools.length} tools from MCP server`);

        // Convert MCP tools to Gemini function declarations
        TOOL_DEFINITIONS = fetchedTools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: {
                type: tool.inputSchema.type || "object",
                properties: tool.inputSchema.properties || {},
                required: tool.inputSchema.required || []
            }
        }));

        console.log(`✅ Loaded ${TOOL_DEFINITIONS.length} tool definitions for Gemini`);
        return true;

    } catch (error) {
        console.error("❌ Failed to initialize MCP Agent:", error.message);
        throw error;
    }
}


async function callTool(toolName, toolArgs) {
    if (!mcpClient) {
        throw new Error("MCP Client not initialized. Call initializeMCPAgent() first.");
    }

    console.log(`🔧 Calling tool: ${toolName}`, JSON.stringify(toolArgs, null, 2));
    
    try {
        const result = await mcpClient.callTool({
            name: toolName,
            arguments: toolArgs
        });

        const resultText = result.content?.[0]?.text || JSON.stringify(result);
        console.log(`✅ Tool ${toolName} completed`);
        
        return resultText;

    } catch (toolError) {
        console.error(`❌ Tool Error (${toolName}):`, toolError.message);
        throw toolError;
    }
}

export async function runAgentWorkflow(prompt) {
    console.log(`\n🤖 Starting agent workflow`);
    console.log(`📝 Prompt: "${prompt.substring(0, 100)}..."\n`);

    const chatHistory = [{
        role: "user",
        parts: [{
            text: prompt,
            type: "text"
        }]
    }];

    const executedTools = [];
    const steps = [];

    let continueLoop = true;
    let iterations = 0;
    const MAX_ITERATIONS = 50; // Prevent infinite loops

    while (continueLoop && iterations < MAX_ITERATIONS) {
        iterations++;
        console.log(`\n--- Iteration ${iterations} ---`);

        try {
            
            const response = await ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: chatHistory,
                config: {
                    systemInstruction: "You are an AI agent that can use tools to gather information and complete tasks. Use the available tools as needed to fulfill the user's request.",
                    tools: [
                        {
                            functionDeclarations: TOOL_DEFINITIONS
                        }
                    ]
                }
            });

            const parts = response.candidates?.[0]?.content?.parts || [];
            let hasToolCall = false;

            // Process text parts and prepare complete model response
            const modelParts = [];
            for (const part of parts) {
                if (part.text) {
                    const cleanText = part.text.replace(/<ctrl\d+>/g, '');
                    if (cleanText.trim()) {
                        modelParts.push({ text: cleanText }  );
                        console.log(`💭 AI: ${cleanText.substring(0, 100)}...`);
                        steps.push({
                            type: "ai-response",
                            content: cleanText
                        });
                    }
                }
                if (part.functionCall) {
                    modelParts.push({ functionCall: part.functionCall });
                }
            }

            // Add AI response to history (with both text AND function calls)
            if (modelParts.length > 0) {
                chatHistory.push({
                    role: "model",
                    parts: modelParts
                });
            }

            // Process tool calls
            for (const part of parts) {
                if (part.functionCall) {
                    hasToolCall = true;
                    const toolCall = part.functionCall;
                    const toolName = toolCall.name;
                    const toolArgs = toolCall.args;

                    console.log(`\n🔧 Tool Call: ${toolName}`);
                    console.log(`   Arguments:`, JSON.stringify(toolArgs, null, 2));

                    steps.push({
                        type: "tool-call",
                        toolName: toolName,
                        arguments: toolArgs
                    });

                    try {
                        const toolResult = await callTool(toolName, toolArgs);

                        // Track tool usage
                        executedTools.push({
                            name: toolName,
                            args: toolArgs,
                            status: "success"
                        });

                        // Add result to history
                        chatHistory.push({
                            role: "user",
                            parts: [{
                                text: `Tool result for ${toolName}: ${toolResult}`,
                                type: "text"
                            }]
                        });

                        // console.log(`Tool result received (${toolResult.length} chars)`);
                        steps.push({
                            type: "tool-result",
                            toolName: toolName,
                            status: "success",
                            resultLength: toolResult.length
                        });

                    } catch (toolError) {
                        console.error(`❌ Tool Error (${toolName}):`, toolError.message);

                        // Track failed tool
                        executedTools.push({
                            name: toolName,
                            args: toolArgs,
                            status: "error",
                            error: toolError.message
                        });

                        // Add error to history
                        chatHistory.push({
                            role: "user",
                            parts: [{
                                text: `Tool execution failed for ${toolName}: ${toolError.message}. Please acknowledge and continue if possible.`,
                                type: "text"
                            }]
                        });

                        steps.push({
                            type: "tool-error",
                            toolName: toolName,
                            error: toolError.message
                        });
                    }
                }
            }

            // If no tool calls, we're done
            if (!hasToolCall) {
                console.log("\n✅ Agent completed - no more tool calls needed");
                continueLoop = false;
            }

        } catch (error) {
            console.error(`❌ API Error in iteration ${iterations}:`, error.message);
            if (error.message.includes("quota") || error.message.includes("401")) {
                throw error;
            }
            // For other errors, continue loop
        }
    }

    if (iterations >= MAX_ITERATIONS) {
        console.warn(`⚠️ Reached maximum iterations (${MAX_ITERATIONS})`);
    }

    // Extract final response from last AI message
    const lastModelMessage = chatHistory.filter(m => m.role === 'model').pop();
    const finalResponse = lastModelMessage?.parts
        ?.find(p => p.text)
        ?.text || 'Workflow completed without final message';

    console.log(`\n🎉 Agent workflow finished`);
    console.log(`📊 Tools used: ${executedTools.length}`);
    console.log(`📝 Total iterations: ${iterations}\n`);

    return {
        success: true,
        finalResponse,
        // toolsUsed: executedTools,
        // steps,
        // toolCount: executedTools.length,
        // iterations,
        timestamp: new Date().toISOString()
    };
}


export function createAgentRouter() {
    const router = express.Router();

    // Health check endpoint
    router.get('/health', (req, res) => {
        res.json({
            status: "healthy",
            toolsAvailable: TOOL_DEFINITIONS.length,
            timestamp: new Date().toISOString()
        });
    });

    router.post('/chat', async (req, res) => {
        const { prompt } = req.body;

        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({
                error: "Missing or invalid 'prompt' in request body"
            });
        }

        if (!mcpClient) {
            return res.status(503).json({
                error: "Agent not initialized. MCP client not connected."
            });
        }

        if (TOOL_DEFINITIONS.length === 0) {
            return res.status(503).json({
                error: "No tools available. Agent cannot process requests."
            });
        }

        try {
            const result = await runAgentWorkflow(prompt);
            res.json(result);
        } catch (error) {
            console.error("Agent error:", error.message);
            res.status(500).json({
                error: "Agent workflow failed",
                message: error.message
            });
        }
    });

    // List available tools - useful for frontend to show capabilities
    router.get('/tools', (req, res) => {
        res.json({
            tools: TOOL_DEFINITIONS,
            count: TOOL_DEFINITIONS.length
        });
    });

    return router;
}