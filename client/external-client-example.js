
async function callAgent(prompt) {
    try {
        console.log(`\n📤 Sending prompt to agent: "${prompt}"\n`);

        const response = await fetch('http://localhost:3000/agent/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prompt })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP ${response.status}`);
        }

        const result = await response.json();
        
        console.log(`✅ Agent Response:`);
        console.log(`📝 ${result.finalResponse}\n`);
        
        return result;

    } catch (error) {
        console.error(`❌ Error:`, error.message);
    }
}

async function checkAgentHealth() {
    try {
        const response = await fetch('http://localhost:3000/agent/health');
        const data = await response.json();
        console.log(`\n🏥 Agent Health:`, data);
    } catch (error) {
        console.error(`❌ Health check failed:`, error.message);
    }
}

async function listAvailableTools() {
    try {
        const response = await fetch('http://localhost:3000/agent/tools');
        const data = await response.json();
        console.log(`\n🔧 Available Tools (${data.count}):`);
        data.tools.forEach(tool => {
            console.log(`   - ${tool.name}: ${tool.description}`);
        });
    } catch (error) {
        console.error(`❌ Failed to fetch tools:`, error.message);
    }
}

// Example usage
async function main() {
    console.log("🚀 External Client Example\n");
    
    // Check agent health
    await checkAgentHealth();
    
    // List available tools
    await listAvailableTools();
    
    // // Send a prompt
    // await callAgent("Analyze this job posting and give me insights");
}

main().catch(console.error);
