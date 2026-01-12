import { config } from "dotenv"
import { TwitterApi } from "twitter-api-v2"
import { readFile, readdir, stat } from "node:fs/promises"
import { join, resolve, extname } from "node:path"
import { PDFParse } from "pdf-parse"

config()

config()


const twitterClient = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET
})

export async function createPost(status, media) {
    // Convert string to array if needed
    const mediaArray = typeof media === 'string' ? [media] : media;
    
    if (mediaArray && mediaArray.length > 0) {
        try {
            
            const mediaIds = [];
            for (const mediaPath of mediaArray) {
                try {
                    // Handle both absolute and relative paths
                    const absolutePath = mediaPath.includes(':') ? mediaPath : resolve(mediaPath);
                      console.log(`Uploading media from: ${absolutePath}`);
                    const mediaId = await twitterClient.v1.uploadMedia(absolutePath);
                    console.log(`✅ Media uploaded successfully, ID: ${mediaId}`);
                    mediaIds.push(mediaId);
                } catch (error) {
                    console.error(`Error uploading media ${mediaPath}:`, error.message);
                    throw new Error(`Failed to upload media: ${mediaPath} - ${error.message}`);
                }
            }
            console.log(`Posting tweet with ${mediaIds.length} media files...`);
            const newPost = await twitterClient.v2.tweet({
                text: status,
                media: {
                    media_ids: mediaIds
                }
            });
            console.log(`✅ Tweet posted successfully`);
            return {
                content: [
                    {
                        type: "text",
                        text: `Tweeted: ${status}`
                    }
                ]
            };
        } catch (error) {
            console.error('❌ Error creating tweet with media:', error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error: ${error.message || error}`
                    }
                ]
            };
        }
    }
    
    const newPost = await twitterClient.v2.tweet(status);
    return {
        content: [
            {
                type: "text",
                text: `Tweeted: ${status}`
            }
        ]
    };
}

export async function readDirectory(dirPath) {
    try {
        const absolutePath = resolve(dirPath)
        const stats = await stat(absolutePath)
        
        if (!stats.isDirectory()) {
            throw new Error(`Path is not a directory: ${dirPath}`)
        }

        const files = await readdir(absolutePath, { withFileTypes: true })
        
        const fileList = files.map(file => ({
            name: file.name,
            type: file.isDirectory() ? 'directory' : 'file',
            path: join(dirPath, file.name)
        }))

        return {
            content: [
                {
                    type: "text",
                    text: `Directory contents of ${absolutePath}:\n${fileList.map(f => `${f.type === 'directory' ? '📁' : '📄'} ${f.name}`).join('\n')}`
                }
            ],
            metadata: {
                totalItems: fileList.length,
                files: fileList
            }
        }
    } catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error reading directory: ${error.message}`
                }
            ]
        }
    }
}

export async function readFileContent(filePath) {
    try {
        const absolutePath = resolve(filePath)
        const stats = await stat(absolutePath)
        
        if (stats.isDirectory()) {
            throw new Error(`Path is a directory, not a file: ${filePath}`)
        }

        const fileExtension = extname(absolutePath).toLowerCase()
        let content = ''
        let encoding = 'utf-8'

        // Handle PDF files
        if (fileExtension === '.pdf') {
            try {
                const fileBuffer = await readFile(absolutePath)
                const parser = new PDFParse({ data: new Uint8Array(fileBuffer) })
                const pdfData = await parser.getText()
                content = pdfData.text
                encoding = 'pdf-extracted'
            } catch (pdfError) {
                content = `Error parsing PDF: ${pdfError.message}`
            }
        } else {
            // Handle text files
            content = await readFile(absolutePath, 'utf-8')
        }
        
        return {
            content: [
                {
                    type: "text",
                    text: content
                }
            ],
            metadata: {
                fileName: absolutePath,
                size: stats.size,
                fileType: fileExtension,
                encoding: encoding
            }
        }
    } catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error reading file: ${error.message}`
                }
            ]
        }
    }
}


export async function GithubDataFetcher(username, repo) {
    let apiUrl = `https://api.github.com/users/${username}`;
    
    // If repo is provided, fetch specific repo details; otherwise fetch all repos
    if (repo) {
        apiUrl = `https://api.github.com/repos/${username}/${repo}`;
    } else {
        apiUrl = `${apiUrl}/repos`;
    }
    
    try {
         const response = await fetch(apiUrl, {
            headers: { 
                'User-Agent': 'mcp-server-2026', // Required by GitHub API
                'Accept': 'application/vnd.github.v3+json'
            }
        });
         if (!response.ok) {
            throw new Error(`GitHub API error: ${response.statusText}`);
        }
      const data = await response.json();
        return {
            content:[
                {
                    type: "text",
                    text: JSON.stringify(data, null, 2)
                }
            ]
        };

    } catch (error) {
         return {
            content: [
                {
                    type: "text",
                    text: `Error fetching GitHub data: ${error.message}`
                }
            ],
         isError: true,
        }
    }
}

export async function FetchGithubReadme(username, repo) {
    const apiUrl = `https://api.github.com/repos/${username}/${repo}/readme`;
    
    try {
        const response = await fetch(apiUrl, {
            headers: { 
                'User-Agent': 'mcp-server-2026',
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Could not fetch README: ${response.statusText}`);
        }
        
        const readmeContent = await response.text();
        
        return {
            content: [
                {
                    type: "text",
                    text: readmeContent
                }
            ]
        };
    } catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error fetching README: ${error.message}`
                }
            ],
            isError: true
        };
    }
}

export async function FetchGithubFileContent(username, repo, filePath) {
    const apiUrl = `https://api.github.com/repos/${username}/${repo}/contents/${filePath}`;
    
    try {
        const response = await fetch(apiUrl, {
            headers: { 
                'User-Agent': 'mcp-server-2026',
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Could not fetch file: ${response.statusText}`);
        }
        
        const fileContent = await response.text();
        
        return {
            content: [
                {
                    type: "text",
                    text: fileContent
                }
            ],
            metadata: {
                filePath: filePath,
                source: `${username}/${repo}`
            }
        };
    } catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error fetching file content: ${error.message}`
                }
            ],
            isError: true
        };
    }
}

export async function FetchGithubRepoStructure(username, repo, path = '') {
    let apiUrl = `https://api.github.com/repos/${username}/${repo}/contents`;
    if (path) {
        apiUrl += `/${path}`;
    }
    
    try {
        const response = await fetch(apiUrl, {
            headers: { 
                'User-Agent': 'mcp-server-2026',
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Could not fetch repo structure: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Format the file structure in a readable way
        let structureText = `📁 ${path ? path : repo}\n`;
        
        if (Array.isArray(data)) {
            data.forEach(item => {
                const indent = '  ';
                if (item.type === 'dir') {
                    structureText += `${indent}📁 ${item.name}/\n`;
                } else {
                    structureText += `${indent}📄 ${item.name}\n`;
                }
            });
        } else {
            structureText = `This is a file, not a directory`;
        }
        
        return {
            content: [
                {
                    type: "text",
                    text: structureText
                }
            ],
            metadata: {
                items: Array.isArray(data) ? data.map(item => ({
                    name: item.name,
                    type: item.type,
                    path: item.path
                })) : []
            }
        };
    } catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error fetching repo structure: ${error.message}`
                }
            ],
            isError: true
        };
    }
}

export async function SendMessageToTelegram(message, chatId = null) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const defaultChatId = process.env.TELEGRAM_CHAT_ID;
    const finalChatId = chatId || defaultChatId;
    
    if (!finalChatId) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error: No chat ID provided and TELEGRAM_CHAT_ID not set in environment`
                }
            ],
            isError: true
        };
    }
    
    const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: finalChatId,
                text: message
            })
        });
        const data = await response.json();
        if (!data.ok) {
            throw new Error(`Telegram API error: ${data.description}`);
        }
        return {
            content: [
                {
                    type: "text",
                    text: `Message sent to Telegram chat ID ${chatId}`
                }
            ]
        };
    } catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error sending message to Telegram: ${error.message}`
                }
            ],
            isError: true
        };
    }
}
