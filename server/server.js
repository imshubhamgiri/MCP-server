import express from 'express';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import * as z from 'zod/v4';
import { logMcpLifecycle, logStages } from './logger.js';
import { createPost, GithubDataFetcher, readDirectory, readFileContent, FetchGithubReadme, FetchGithubFileContent,
 FetchGithubRepoStructure , SendMessageToTelegram , job_score, readLocalResume, FetchGithubLanguages, enrichResumeWithAI, scoreJobMatch} from './mcp.tool.js';

const app = createMcpExpressApp();
app.use(express.json());


// Store transports by session ID for stateful operation
const transports = {};

const getServer = () => {
    // Create an MCP server with implementation details
    const server = new McpServer(
        {
            name: 'stateless-streamable-http-server',
            version: '1.0.0'
        },
        { capabilities: { logging: {} } }
    );

    // Register a simple prompt
    server.registerPrompt(
        'greeting-template',
        {
            description: 'A simple greeting prompt template',
            argsSchema: {
                name: z.string().describe('Name to include in greeting')
            }
        },
        async ({ name }) => {
            return {
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: `Please greet ${name} in a friendly manner.`
                        }
                    }
                ]
            };
        }
    );

    // Register a tool specifically for testing resumability
    server.registerTool(
        'start-notification-stream',
        {
            description: 'Starts sending periodic notifications for testing resumability',
            inputSchema: {
                interval: z.number().describe('Interval in milliseconds between notifications').default(100),
                count: z.number().describe('Number of notifications to send (0 for 100)').default(10)
            }
        },
        async ({ interval, count }, extra) => {
            const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            let counter = 0;

            while (count === 0 || counter < count) {
                counter++;
                try {
                    await server.sendLoggingMessage(
                        {
                            level: 'info',
                            data: `Periodic notification #${counter} at ${new Date().toISOString()}`
                        },
                        extra.sessionId
                    );
                } catch (error) {
                    console.error('Error sending notification:', error);
                }
                // Wait for the specified interval
                await sleep(interval);
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Started sending periodic notifications every ${interval}ms`
                    }
                ]
            };
        }
    );

    server.registerTool(
        'add_two_numbers',
        {
            description: 'Adds two numbers together',
            inputSchema: z.object({
                a: z.number().describe('First number'),
                b: z.number().describe('Second number')
            })
        },
        async ({ a, b }) => {
            const sum = a + b;
            return {
                content: [{
                    type: 'text',
                    text: `The sum of ${a} and ${b} is ${sum}.`
                }]
            };
        }
    )

    server.registerTool(
        'create_post',
        {
            description: 'Creates a new post on X formally Known as  Twitter',
            inputSchema: z.object({
                status: z.string().describe('The text content of the tweet'),
                media: z.union([z.array(z.string()), z.string()]).optional().describe('Optional array/single of media file paths to attach to the tweet')
            })
        },
        async ({ status, media }) => {
            const result = await createPost(status, media);
            return result;
        }
    )

    server.registerTool(
        'read_directory',
        {
            description: 'Lists all files and folders in a given directory',
            inputSchema: z.object({
                directory: z.string().describe('The directory path to read (absolute or relative)')
            })
        },
        async ({ directory }) => {
            return await readDirectory(directory);
        }
    )

    server.registerTool(
        'read_file',
        {
            description: 'Reads the contents of a any type of file(pdf or text) from the local system',
            inputSchema: z.object({
                filepath: z.string().describe('The file path to read (absolute or relative)')
            })
        },
        async ({ filepath }) => {
            return await readFileContent(filepath);
        }
    )
    server.registerTool(
        'job-score-matcher',
        {
        description : 'Matches job descriptions with candidate resumes and provides a compatibility score',
        inputSchema: z.object({
            jobDescription: z.string().describe('The job description text'),
        })
        },
        async ({ jobDescription, resumeText }) => {
         
            return await job_score(jobDescription, resumeText);
        }
    )

    server.registerTool(
        'github-user-fetcher',
        {
            description: 'Fetches GitHub user information and repositories by username. If repo is not provided, fetches all repos for the user.',
            inputSchema: z.object({
                username: z.string().describe('The GitHub username to fetch information for'),
                repo: z.string().optional().describe('Optional: The specific repository name to fetch details for. If not provided, fetches all repositories')
            })
        },
        async({ username, repo }) =>{
            return await GithubDataFetcher(username, repo);
        }
    )

    server.registerTool(
        'github-readme-fetcher',
        {
            description: 'Fetches the README.md file from a GitHub repository',
            inputSchema: z.object({
                username: z.string().describe('The GitHub username/organization'),
                repo: z.string().describe('The repository name')
            })
        },
        async({ username, repo }) => {
            return await FetchGithubReadme(username, repo);
        }
    )

    server.registerTool(
        'github-file-fetcher',
        {
            description: 'Fetches the contents of a specific file from a GitHub repository (code files, configs, etc.)',
            inputSchema: z.object({
                username: z.string().describe('The GitHub username/organization'),
                repo: z.string().describe('The repository name'),
                filePath: z.string().describe('The file path in the repo (e.g., src/main.js, package.json, docs/guide.md)')
            })
        },
        async({ username, repo, filePath }) => {
            return await FetchGithubFileContent(username, repo, filePath);
        }
    )

    server.registerTool(
        'github-repo-structure',
        {
            description: 'Fetches the file and folder structure of a GitHub repository or a specific directory within it',
            inputSchema: z.object({
                username: z.string().describe('The GitHub username/organization'),
                repo: z.string().describe('The repository name'),
                path: z.string().optional().describe('Optional: The directory path within the repo (e.g., src, docs). If not provided, shows root directory')
            })
        },
        async({ username, repo, path }) => {
            return await FetchGithubRepoStructure(username, repo, path);
        }
    )

    server.registerTool(
        'send-telegram-message',
        {
            description: 'Sends a message to a specified Telegram chat using a bot',
            inputSchema: z.object({
                message: z.string().describe('The message text to send'),
                chatId: z.string().optional().describe('The Telegram chat ID to send the message to (optional )')
            })
        },
        async({ message, chatId }) => {
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            if (!botToken) {
                throw new Error('Telegram bot token is not configured.');
            }
            return await SendMessageToTelegram(message, chatId);
        }
    )

    server.registerTool(
        'read-local-resume',
        {
            description: 'Reads a local PDF resume file and extracts text content',
            inputSchema: z.object({
                resumePath: z.string().describe('The path to the resume PDF file')
            })
        },
        async({ resumePath }) => {
            return await readLocalResume(resumePath);
        }
    )

    server.registerTool(
        'github-languages',
        {
            description: 'Fetches the programming languages used in a GitHub repository',
            inputSchema: z.object({
                username: z.string().describe('The GitHub username/organization'),
                repo: z.string().describe('The repository name')
            })
        },
        async({ username, repo }) => {
            return await FetchGithubLanguages(username, repo);
        }
    )

    server.registerTool(
        'enrich-resume-with-ai',
        {
            description: 'Enriches a resume with GitHub data using AI (Gemini)',
            inputSchema: z.object({
                resumeText: z.string().describe('The base resume text'),
                githubData: z.union([z.string(), z.object({}).passthrough()]).describe('GitHub data (languages, projects, user info)')
            })
        },
        async({ resumeText, githubData }) => {
            return await enrichResumeWithAI(resumeText, githubData);
        }
    )

    server.registerTool(
        'score-job-match',
        {
            description: 'Scores job description match against resume using AI (Gemini)',
            inputSchema: z.object({
                jobDescription: z.string().describe('The job description text'),
                resumeText: z.string().describe('The candidate resume text'),
                scoreThreshold: z.number().optional().describe('Score threshold for application decision (1-10, default 6)')
            })
        },
        async({ jobDescription, resumeText, scoreThreshold = 6 }) => {
            return await scoreJobMatch(jobDescription, resumeText, scoreThreshold);
        }
    )
    


    // Create a simple resource at a fixed URI
    server.registerResource(
        'greeting-resource',
        'https://example.com/greetings/default',
        { mimeType: 'text/plain' },
        async () => {
            return {
                contents: [
                    {
                        uri: 'https://example.com/greetings/default',
                        text: 'Hello, world!'
                    }
                ]
            };
        }
    );
    return server;
};

// const app = createMcpExpressApp()

app.all('/mcp', async (req, res) => {
    logMcpLifecycle(req, req.body);
    
    const server = getServer();
    try {
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);

        res.on('close', () => {
            console.log('    └─ Connection closed');
            transport.close().catch(err => console.error('Error closing transport:', err));
            server.close().catch(err => console.error('Error closing server:', err));
        });

    } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error'
                },
                id: null
            });
        }
    }
});

const PORT = 3000;
app.listen(PORT, error => {
    if (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
    logStages();
    console.log(`✅ MCP Stateless HTTP Server listening on port ${PORT}`);
    console.log(`📍 Endpoint: http://localhost:${PORT}/mcp`);
    console.log(`🔧 Mode: STATELESS (no session IDs)\n`);
});

process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down server...');
    process.exit(0);
});

import { runAgentWorkflow } from './agent.js';

app.post('/agent-workflow', async (req, res) => {
    const { prompt } = req.body;
    
    if (!prompt) {
        return res.status(400).json({ 
            success: false,
            error: 'Missing "prompt" in request body. Example: {"prompt": "Read my resume and analyze it"}' 
        });
    }

    console.log(`\n📥 Received /agent-workflow request`);
    
    try {
        // Run agent directly - NO network call to MCP server needed
        const result = await runAgentWorkflow(prompt);
        
        console.log(`✅ Agent workflow completed successfully\n`);
        
        res.json(result);

    } catch (error) {
        console.error('❌ Error in agent workflow:', error.message);
        res.status(500).json({ 
            success: false,
            error: error.message,
            details: error.stack
        });
    }
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        endpoints: {
            '/mcp': 'MCP Protocol endpoint',
            '/agent-workflow': 'AI agent workflow endpoint',
            '/health': 'Health check'
        }
    });
});