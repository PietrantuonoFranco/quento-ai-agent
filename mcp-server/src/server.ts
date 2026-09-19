import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAllTools } from "./tools";

import type Env from "./lib/interfaces/EnvInterface";

// MCP server with the listProducts tool registered
export const mcpServer = new McpServer({
  name: "quento-mcp-server",
  version: "1.0.0",
});


interface Tool {
  name: string;
  description: string;
  inputSchema: any;
  execute: (input: any) => Promise<any>;
}

function registerOneTool(tool: Tool) {
  mcpServer.registerTool(
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

let toolsRegistered = false;

export function registerTools(env: Env) {
  if (toolsRegistered) return;

  getAllTools(env).forEach(registerOneTool);
  toolsRegistered = true;
}