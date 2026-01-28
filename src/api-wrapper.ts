import express from 'express';
import { spawn, execSync } from 'child_process';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Simple MCP client wrapper - calls the MCP server via stdio
async function callMCPTool(toolName: string, args: Record<string, any>) {
  return new Promise((resolve, reject) => {
    try {
      // This is a simplified version - in production you'd use the proper MCP client
      // For now, we'll create a subprocess that runs the MCP server and captures output
      const child = spawn('node', ['./build/index.js'], {
        cwd: process.cwd(),
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output: stdout });
        } else {
          reject(new Error(stderr || `Process exited with code ${code}`));
        }
      });

      // Send tool call as JSON to stdin
      const toolCall = JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      });

      child.stdin?.write(toolCall + '\n');
      child.stdin?.end();
    } catch (error) {
      reject(error);
    }
  });
}

// List available tools
app.get('/api/tools', async (req, res) => {
  try {
    // Mock response - in production, query actual MCP server
    const tools = [
      {
        name: 'ai_element_filter',
        description: 'Filter Revit elements by category and other criteria',
        inputSchema: {
          type: 'object',
          properties: {
            filterCategory: { type: 'string' },
            includeInstances: { type: 'boolean' }
          }
        }
      },
      {
        name: 'create_line_based_element',
        description: 'Create walls, beams, or pipes in Revit',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            locationLine: { type: 'object' },
            thickness: { type: 'number' },
            height: { type: 'number' }
          }
        }
      },
      {
        name: 'create_point_based_element',
        description: 'Create doors, windows, or furniture in Revit',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            locationPoint: { type: 'object' },
            width: { type: 'number' },
            height: { type: 'number' }
          }
        }
      },
      {
        name: 'operate_element',
        description: 'Select, color, delete, or modify Revit elements',
        inputSchema: {
          type: 'object',
          properties: {
            elementIds: { type: 'array', items: { type: 'string' } },
            action: { type: 'string', enum: ['Select', 'SetColor', 'Delete', 'Hide', 'Isolate'] }
          }
        }
      },
      {
        name: 'send_code_to_revit',
        description: 'Send C# code to execute in Revit',
        inputSchema: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            parameters: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      {
        name: 'get_current_view_elements',
        description: 'Get elements from the current Revit view',
        inputSchema: {
          type: 'object',
          properties: {
            modelCategoryList: { type: 'array', items: { type: 'string' } },
            limit: { type: 'number' }
          }
        }
      },
      {
        name: 'get_selected_elements',
        description: 'Get currently selected elements in Revit',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number' }
          }
        }
      },
      {
        name: 'delete_element',
        description: 'Delete elements from Revit by ID',
        inputSchema: {
          type: 'object',
          properties: {
            elementIds: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    ];

    res.json({ tools });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Execute tool
app.post('/api/execute', async (req, res) => {
  try {
    const { toolName, arguments: toolArgs } = req.body;

    if (!toolName) {
      return res.status(400).json({ error: 'toolName is required' });
    }

    // Call the MCP tool
    const result = await callMCPTool(toolName, toolArgs || {});

    res.json({ result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
          summary: 'List available Revit tools',
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
                      description: 'Name of the tool to execute (e.g., ai_element_filter, create_line_based_element)'
                    },
                    arguments: {
                      type: 'object',
                      description: 'Tool-specific arguments'
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
            },
            '500': {
              description: 'Tool execution error'
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
const server = app.listen(PORT, () => {
  console.log(`🚀 Revit MCP API wrapper running on http://localhost:${PORT}`);
  console.log(`📋 OpenAPI schema: http://localhost:${PORT}/openapi.json`);
  console.log(`🔧 List tools: http://localhost:${PORT}/api/tools`);
  console.log(`⚙️  Execute tool: POST http://localhost:${PORT}/api/execute`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  server.close(() => {
    process.exit(0);
  });
});
