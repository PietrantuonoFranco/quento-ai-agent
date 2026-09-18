import { WebStandardStreamableHTTPServerTransport } from
  "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { mcpServer, registerTools } from "./server";
import type Env from "./lib/interfaces/EnvInterface";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      if (new URL(req.url).pathname === "/health") {
        return new Response("ok");
      }

      if (
        req.method !== "POST" ||
        !req.headers.get("content-type")?.includes("application/json")
      ) {
        return new Response("MCP Server running", { status: 200 });
      }

      // 🔐 Auth
      const apiKey = req.headers.get("x-api-key");

      if (!apiKey) {
        return new Response("Missing API key", { status: 401 });
      }

      if (apiKey !== env.MCP_API_KEY) {
        return new Response("Invalid API key", { status: 403 });
      }

      // ✅ REGISTRAR TOOLS CON CONTEXTO
      registerTools(env);

      const transport = new WebStandardStreamableHTTPServerTransport({
        enableJsonResponse: true,
      });

      await mcpServer.connect(transport);

      const response = await transport.handleRequest(req);

      await mcpServer.close();

      return response;
    } catch (error) {
      console.error("Error handling MCP request:", error);

      return new Response(
        JSON.stringify({ error: "Internal MCP server error" }),
        { status: 500 }
      );
    }
  },
};