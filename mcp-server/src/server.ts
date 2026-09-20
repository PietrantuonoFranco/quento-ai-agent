import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAllTools } from "./tools";

import type Env from "./lib/interfaces/EnvInterface";
import type Tool from "./lib/interfaces/ToolInterface";

function registerOneTool(server: McpServer, tool: Tool) {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.inputSchema,
    },
    async (args: any) => {
      const result = await tool.execute(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );
}

// Un McpServer solo admite un transporte a la vez, así que se crea uno por request
// (con las tools ligadas al env de esa request) para poder atender requests concurrentes.
export function createMcpServer(env: Env): McpServer {
  const server = new McpServer({
    name: "quento-mcp-server",
    version: "1.0.0",
  });

  getAllTools(env).forEach((tool) => registerOneTool(server, tool));

  return server;
}
