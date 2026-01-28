import express from 'express';
import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

let mcpClient;
let mcpTransport;

// Initialize MCP client connection
async function initializeMCP() {
  try {
    console.log('Initializing MCP client...');
    
    // Spawn the MCP server process
    const serverProcess = spawn('node', ['./build/index.js'], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Create transport
    mcpTransport = new StdioClientTransport({
      command: 'node',
      args: ['./build/index.js']
    });

    // Create and connect client
    mcpClient = new Client({
      name: 'api-wrapper',
      version: '1.0.0'
    });

    await mcpClient.connect(mcpTransport);
    console.log('MCP client connected');
    
    return true;
  } catch (error) {
    console.error('Failed to initialize MCP:', error);
    return false;
  }
}

// List available tools
app.get('/api/tools', async (req, res) => {
  try {
    if (!mcpClient) {
      return res.status(500).json({ error: 'MCP client not initialized' });
    }

    const tools = await mcpClient.listTools();
    res.json({ tools: tools.tools || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute tool
app.post('/api/execute', async (req, res) => {
  try {
    if (!mcpClient) {
      return res.status(500).json({ error: 'MCP client not initialized' });
    }

    const { toolName, arguments: toolArgs } = req.body;

    if (!toolName) {
      return res.status(400).json({ error: 'toolName is required' });
    }

    const result = await mcpClient.callTool({
      name: toolName,
      arguments: toolArgs || {}
    });

    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mcp: mcpClient ? 'connected' : 'disconnected' });
});

// OpenAPI schema for Custom GPT
app.get('/openapi.json', (req, res) => {
  const schema = {
    openapi: '3.0.0',
    info: {
      title: 'Revit MCP API',
      description: 'REST API wrapper for Revit MCP server',
      version: '1.0.0'
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Local server'
      }
    ],
    paths: {
      '/api/tools': {
        get: {
          summary: 'List available tools',
          operationId: 'listTools',
          responses: {
            '200': {
              description: 'List of available tools',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      tools: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            description: { type: 'string' },
                            inputSchema: { type: 'object' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/execute': {
        post: {
          summary: 'Execute a Revit tool',
          operationId: 'executeTool',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['toolName'],
                  properties: {
                    toolName: {
                      type: 'string',
                      description: 'Name of the tool to execute'
                    },
                    arguments: {
                      type: 'object',
                      description: 'Tool arguments'
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Tool execution result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      result: { type: 'object' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/health': {
        get: {
          summary: 'Health check',
          operationId: 'healthCheck',
          responses: {
            '200': {
              description: 'API health status'
            }
          }
        }
      }
    }
  };

  res.json(schema);
});

// Start server
async function start() {
  // Initialize MCP first
  const mcpReady = await initializeMCP();

  if (!mcpReady) {
    console.error('Failed to initialize MCP, but starting API anyway...');
  }

  app.listen(PORT, () => {
    console.log(`Revit MCP API running on http://localhost:${PORT}`);
    console.log(`OpenAPI schema: http://localhost:${PORT}/openapi.json`);
  });
}

start().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  if (mcpClient && mcpTransport) {
    await mcpClient.close();
  }
  process.exit(0);
});
