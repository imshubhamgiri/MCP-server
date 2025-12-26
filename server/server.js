import {mcpServer} from '@modelcontextprotocol/sdk/server/server.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import {z} from 'zod';

const app = express();
app.use(express.json());
const port = 3000;

const server = new McpServer({
  name: 'my-server',
  version: '1.0.0'
});