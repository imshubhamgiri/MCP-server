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
            // Add a small delay to ensure media is indexed before posting
            await new Promise(resolve => setTimeout(resolve, 1000));
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

export async function readLocalResume(resumePath) {
    try {
        const absolutePath = resolve(resumePath)
        const stats = await stat(absolutePath)
        
        if (stats.isDirectory()) {
            throw new Error(`Path is a directory, not a file: ${resumePath}`)
        }

        const fileExtension = extname(absolutePath).toLowerCase()
        
        // Only accept PDF files for resume
        if (fileExtension !== '.pdf') {
            throw new Error(`Resume must be a PDF file. Received: ${fileExtension}`)
        }

        try {
            const fileBuffer = await readFile(absolutePath)
            const parser = new PDFParse({ data: new Uint8Array(fileBuffer) })
            const pdfData = await parser.getText()
            
            return {
                content: [
                    {
                        type: "text",
                        text: pdfData.text
                    }
                ],
                metadata: {
                    fileName: absolutePath,
                    size: stats.size,
                    fileType: 'pdf',
                    source: 'resume-parser'
                }
            }
        } catch (pdfError) {
            throw new Error(`Error parsing PDF resume: ${pdfError.message}`)
        }
    } catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error reading resume: ${error.message}`
                }
            ],
            isError: true
        }
    }
}

export async function FetchGithubLanguages(username, repo) {
    const apiUrl = `https://api.github.com/repos/${username}/${repo}/languages`;
    
    try {
        const response = await fetch(apiUrl, {
            headers: { 
                'User-Agent': 'mcp-server-2026',
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Could not fetch languages: ${response.statusText}`);
        }
        
        const languagesData = await response.json();
        
        // Calculate total bytes and percentages
        const totalBytes = Object.values(languagesData).reduce((a, b) => a + b, 0);
        const languages = Object.entries(languagesData)
            .map(([name, bytes]) => ({
                name,
                bytes,
                percentage: totalBytes > 0 ? ((bytes / totalBytes) * 100).toFixed(2) : 0
            }))
            .sort((a, b) => b.bytes - a.bytes);
        
        // Format as readable text
        let languageText = `📊 **Tech Stack for ${username}/${repo}:**\n\n`;
        languages.forEach((lang, index) => {
            languageText += `${index + 1}. ${lang.name}: ${lang.percentage}%\n`;
        });
        
        return {
            content: [
                {
                    type: "text",
                    text: languageText
                }
            ],
            metadata: {
                languages: languages,
                totalBytes: totalBytes,
                topLanguage: languages[0]?.name || 'Unknown',
                repository: `${username}/${repo}`
            }
        };
    } catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error fetching language data: ${error.message}`
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


export async function job_score(jobDescription, resumeText, techStack) {
    // Ensure inputs are strings and strip markdown code blocks
    jobDescription = String(jobDescription || '').replace(/^```[\w]*\n?|\n?```$/g, '').trim();
    resumeText = String(resumeText || '').replace(/^```[\w]*\n?|\n?```$/g, '').trim();

    // Step 1: Prepare context from your profile
    const profileContext = `
    Resume: ${resumeText}
    
    `;

    // Step 2: Create the prompt for Gemini
    const prompt = `
    You are a job matching AI. Score this job for a candidate (1-10).
    
    CANDIDATE PROFILE:
    ${profileContext}
    
    JOB DESCRIPTION:
    ${jobDescription}
    
    Consider:
    - Skill match (do they have required languages/frameworks?)
    - Experience level match
    - Tech stack alignment
    - Growth opportunity
    
    Return ONLY a JSON object:
    {
      "score": <number 1-10>,
      "reason": "<brief reason>",
      "matchedSkills": ["skill1", "skill2"],
      "missingSkills": ["skill1"]
    }
    `;

    // Step 3: Call Gemini API
    try {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY environment variable is not set');
        }

        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': process.env.GEMINI_API_KEY
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            })
        });

        const data = await response.json();
        
        // Validate API response structure
        if (!response.ok) {
            throw new Error(`Gemini API error: ${data.error?.message || response.statusText}`);
        }

        if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
            throw new Error('No candidates in Gemini response');
        }

        const candidate = data.candidates[0];
        if (!candidate.content || !candidate.content.parts || !Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0) {
            throw new Error('Invalid candidate content structure in Gemini response');
        }

        const geminiResponse = candidate.content.parts[0].text;
        if (!geminiResponse) {
            throw new Error('No text content in Gemini response');
        }

        // Extract JSON from response (in case it has extra text)
        const jsonMatch = geminiResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error(`Could not find JSON in response: ${geminiResponse}`);
        }

        const scoreData = JSON.parse(jsonMatch[0]);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(scoreData, null, 2)
            }],
            metadata: {
                score: scoreData.score,
                isGoodMatch: scoreData.score >= 8
            }
        };
    } catch (error) {
        return {
            content: [{
                type: "text",
                text: `Error scoring job: ${error.message}`
            }],
            isError: true
        };
    }
}

// ATOMIC TOOLS FOR N8N ORCHESTRATION

export async function enrichResumeWithAI(resumeText, githubData) {
    try {
        if (!resumeText || !githubData) {
            throw new Error('resumeText and githubData are required');
        }

        // githubData should contain:
        // - languages: from FetchGithubLanguages
        // - projects: from getGithubProjects (or similar)
        // - userInfo: from GithubDataFetcher
        // - profileUrl: github profile URL

        const githubInfo = typeof githubData === 'string' ? githubData : JSON.stringify(githubData, null, 2);

        const prompt = `
You are a professional resume enhancement expert. I have a base resume and GitHub profile data.

BASE RESUME:
${resumeText}

GITHUB DATA:
${githubInfo}

Please enhance the resume by:
1. Adding relevant GitHub projects and contributions
2. Highlighting the tech stack from GitHub activity
3. Including GitHub profile link (if provided)
4. Emphasizing key technical achievements
5. Keeping the original format and structure
6. Making it compelling for job applications

Return ONLY the enhanced resume. No explanations, just the resume text.
`;

        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': process.env.GEMINI_API_KEY
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`Gemini API error: ${data.error?.message || response.statusText}`);
        }

        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error('Invalid Gemini response structure');
        }

        const enrichedResume = data.candidates[0].content.parts[0].text;

        return {
            content: [{
                type: "text",
                text: enrichedResume
            }],
            metadata: {
                enrichedAt: new Date().toISOString(),
                method: 'gemini-ai-enriched-with-provided-data',
                dataSource: 'MCP tools'
            }
        };
    } catch (error) {
        return {
            content: [{
                type: "text",
                text: `Error enriching resume: ${error.message}`
            }],
            isError: true
        };
    }
}

export async function scoreJobMatch(jobDescription, resumeText, scoreThreshold = 6) {
    try {
        if (!jobDescription || !resumeText) {
            throw new Error('jobDescription and resumeText are required');
        }

        // Clean inputs
        jobDescription = String(jobDescription || '').replace(/^```[\w]*\n?|\n?```$/g, '').trim();
        resumeText = String(resumeText || '').replace(/^```[\w]*\n?|\n?```$/g, '').trim();

        const prompt = `
You are an expert recruiter and job-fit analyzer. Analyze the match between this job and candidate.

JOB DESCRIPTION:
${jobDescription}

CANDIDATE RESUME:
${resumeText}

Score the job fit (1-10) considering:
- Skill alignment
- Experience level
- Tech stack compatibility
- Growth potential

Return ONLY valid JSON:
{
  "score": <number 1-10>,
  "reason": "<brief explanation>",
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1"],
  "recommendation": "<apply/consider/skip>"
}
`;

        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': process.env.GEMINI_API_KEY
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`Gemini API error: ${data.error?.message || response.statusText}`);
        }

        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error('Invalid Gemini response');
        }

        const geminiText = data.candidates[0].content.parts[0].text;
        const jsonMatch = geminiText.match(/\{[\s\S]*\}/);
        
        if (!jsonMatch) {
            throw new Error(`No JSON found in response: ${geminiText}`);
        }

        const scoreData = JSON.parse(jsonMatch[0]);
        const shouldApply = scoreData.score >= scoreThreshold;

        return {
            content: [{
                type: "text",
                text: JSON.stringify(scoreData, null, 2)
            }],
            metadata: {
                score: scoreData.score,
                shouldApply: shouldApply,
                threshold: scoreThreshold,
                recommendation: scoreData.recommendation,
                matchedCount: scoreData.matchedSkills?.length || 0,
                missingCount: scoreData.missingSkills?.length || 0
            }
        };
    } catch (error) {
        return {
            content: [{
                type: "text",
                text: `Error scoring job: ${error.message}`
            }],
            isError: true
        };
    }
}


