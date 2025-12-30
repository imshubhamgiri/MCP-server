/**
 * Enhanced logging utilities for MCP server
 * Logs JSON-RPC method details to help track MCP lifecycle
 */

export const logRequest = (method, details) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 📋 ${method}`);
    if (details) {
        console.log(`    └─ ${details}`);
    }
};

export const logMcpLifecycle = (req, body) => {
    const timestamp = new Date().toISOString();
    const httpMethod = req.method;
    
    // Try to extract JSON-RPC method from request body
    let jsonRpcMethod = null;
    let details = '';

    try {
        if (body && body.method) {
            jsonRpcMethod = body.method;
            
            // Add parameter details based on method
            switch (jsonRpcMethod) {
                case 'initialize':
                    details = `Protocol: ${body.params?.protocolVersion || 'unknown'}, Client: ${body.params?.clientInfo?.name || 'unknown'}`;
                    break;
                case 'list_tools':
                    details = 'Requesting available tools';
                    break;
                case 'list_resources':
                    details = 'Requesting available resources';
                    break;
                case 'call_tool':
                    details = `Tool: ${body.params?.name || 'unknown'}`;
                    break;
                case 'read_resource':
                    details = `Resource: ${body.params?.uri || 'unknown'}`;
                    break;
                case 'list_prompts':
                    details = 'Requesting available prompts';
                    break;
                default:
                    details = '';
            }
        }
    } catch (e) {
        // If body parsing fails, silently continue
    }

    console.log(`[${timestamp}] ${httpMethod} /mcp`);
    if (jsonRpcMethod) {
        console.log(`    ├─ Method: ${jsonRpcMethod}`);
        if (details) {
            console.log(`    └─ Details: ${details}`);
        }
    }
};

export const logStages = () => {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    MCP LIFECYCLE STAGES                        ║
╠════════════════════════════════════════════════════════════════╣
║ 1️⃣  INITIALIZE   - Client ↔ Server handshake & capabilities   ║
║ 2️⃣  LIST_TOOLS   - Client requests available tools            ║
║ 3️⃣  LIST_RESOURCES - Client requests available resources      ║
║ 4️⃣  CALL_TOOL    - Client executes a specific tool            ║
║ 5️⃣  READ_RESOURCE - Client reads resource content             ║
║ 6️⃣  (repeat as needed)                                        ║
╚════════════════════════════════════════════════════════════════╝
    `);
};
