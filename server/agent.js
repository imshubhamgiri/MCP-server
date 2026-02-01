// server/agent.js
import { GoogleGenAI } from "@google/genai";
import {
    createPost,
    GithubDataFetcher,
    readDirectory,
    readFileContent,
    FetchGithubReadme,
    FetchGithubFileContent,
    FetchGithubRepoStructure,
    SendMessageToTelegram,
    job_score,
    readLocalResume,
    FetchGithubLanguages,
    enrichResumeWithAI,
    scoreJobMatch
} from './mcp.tool.js';

const ai = new GoogleGenAI({});

// Tool definitions for Gemini
const TOOL_DEFINITIONS = [
    {
        name: "read-local-resume",
        description: "Reads a local PDF resume file and extracts text content",
        parameters: {
            type: "object",
            properties: {
                resumePath: { type: "string", description: "The path to the resume PDF file" }
            },
            required: ["resumePath"]
        }
    },
    {
        name: "github-user-fetcher",
        description: "Fetches GitHub user information and repositories by username",
        parameters: {
            type: "object",
            properties: {
                username: { type: "string", description: "The GitHub username" },
                repo: { type: "string", description: "Optional: specific repo name" }
            },
            required: ["username"]
        }
    },
    {
        name: "github-languages",
        description: "Fetches the programming languages used in a GitHub repository",
        parameters: {
            type: "object",
            properties: {
                username: { type: "string", description: "The GitHub username" },
                repo: { type: "string", description: "The repository name" }
            },
            required: ["username", "repo"]
        }
    },
    {
        name: "github-readme-fetcher",
        description: "Fetches the README.md file from a GitHub repository",
        parameters: {
            type: "object",
            properties: {
                username: { type: "string", description: "The GitHub username" },
                repo: { type: "string", description: "The repository name" }
            },
            required: ["username", "repo"]
        }
    },
    {
        name: "github-repo-structure",
        description: "Fetches the file and folder structure of a GitHub repository",
        parameters: {
            type: "object",
            properties: {
                username: { type: "string", description: "The GitHub username" },
                repo: { type: "string", description: "The repository name" },
                path: { type: "string", description: "Optional: directory path within repo" }
            },
            required: ["username", "repo"]
        }
    },
    {
        name: "enrich-resume-with-ai",
        description: "Enriches a resume with GitHub data using AI",
        parameters: {
            type: "object",
            properties: {
                resumeText: { type: "string", description: "The base resume text" },
                githubData: { type: "string", description: "GitHub data as JSON string" }
            },
            required: ["resumeText", "githubData"]
        }
    },
    {
        name: "score-job-match",
        description: "Scores job description match against resume using AI",
        parameters: {
            type: "object",
            properties: {
                jobDescription: { type: "string", description: "The job description text" },
                resumeText: { type: "string", description: "The resume text" },
                scoreThreshold: { type: "number", description: "Score threshold (default 6)" }
            },
            required: ["jobDescription", "resumeText"]
        }
    },
    {
        name: "read_file",
        description: "Reads the contents of any type of file from the local system",
        parameters: {
            type: "object",
            properties: {
                filepath: { type: "string", description: "The file path to read" }
            },
            required: ["filepath"]
        }
    },
    {
        name: "read_directory",
        description: "Lists all files and folders in a given directory",
        parameters: {
            type: "object",
            properties: {
                directory: { type: "string", description: "The directory path" }
            },
            required: ["directory"]
        }
    }
];

// Map tool names to functions
const TOOL_FUNCTIONS = {
    "read-local-resume": readLocalResume,
    "github-user-fetcher": GithubDataFetcher,
    "github-languages": FetchGithubLanguages,
    "github-readme-fetcher": FetchGithubReadme,
    "github-repo-structure": FetchGithubRepoStructure,
    "enrich-resume-with-ai": enrichResumeWithAI,
    "score-job-match": scoreJobMatch,
    "read_file": readFileContent,
    "read_directory": readDirectory
};

async function callTool(toolName, toolArgs) {
    const toolFunc = TOOL_FUNCTIONS[toolName];
    if (!toolFunc) {
        throw new Error(`Unknown tool: ${toolName}`);
    }

    console.log(`🔧 Calling tool: ${toolName}`, JSON.stringify(toolArgs, null, 2));
    
    // Call the function with the arguments
    const result = await toolFunc(...Object.values(toolArgs));
    
    // Convert result to text if needed
    const resultText = result.content?.[0]?.text || JSON.stringify(result);
    console.log(`✅ Tool ${toolName} completed`);
    
    return resultText;
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
    const MAX_ITERATIONS = 15; // Prevent infinite loops

    while (continueLoop && iterations < MAX_ITERATIONS) {
        iterations++;
        console.log(`\n--- Iteration ${iterations} ---`);

        try {
            // Send to Gemini API with available tools
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: chatHistory,
                config: {
                    tools: [
                        {
                            functionDeclarations: TOOL_DEFINITIONS
                        }
                    ]
                }
            });

            const parts = response.candidates?.[0]?.content?.parts || [];
            let hasToolCall = false;

            // Process text parts
            const textParts = [];
            for (const part of parts) {
                if (part.text) {
                    const cleanText = part.text.replace(/<ctrl\d+>/g, '');
                    if (cleanText.trim()) {
                        textParts.push({ text: cleanText });
                        console.log(`💭 AI: ${cleanText.substring(0, 100)}...`);
                        steps.push({
                            type: "ai-response",
                            content: cleanText
                        });
                    }
                }
            }

            // Add AI response to history
            if (textParts.length > 0) {
                chatHistory.push({
                    role: "model",
                    parts: textParts
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

                        // Limit result size for context window
                        const truncatedResult = toolResult.length > 5000 
                            ? toolResult.substring(0, 5000) + '\n... (truncated)'
                            : toolResult;

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
                                text: `Tool result for ${toolName}: ${truncatedResult}`,
                                type: "text"
                            }]
                        });

                        console.log(`✅ Tool result received (${toolResult.length} chars)`);
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
        toolsUsed: executedTools,
        steps,
        toolCount: executedTools.length,
        iterations,
        timestamp: new Date().toISOString()
    };
}