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

export async function createPost(status) {
    const newPost = await twitterClient.v2.tweet(status)

    return {
        content: [
            {
                type: "text",
                text: `Tweeted: ${status}`
            }
        ]
    }
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
