import "dotenv/config";
import { createServer, type IncomingMessage } from "node:http";

import worker from "./src/index";
import type Env from "./src/lib/interfaces/EnvInterface";

import { Headers, Request } from "node-fetch";

import { Buffer } from "node:buffer";

import dotenv from "dotenv";

dotenv.config();

const PORT = Number(process.env.PORT) || 8787;

if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL in .env");
if (!process.env.MCP_API_KEY) throw new Error("Missing MCP_API_KEY in .env");

const env: Env = {
  DB: { connectionString: process.env.DATABASE_URL },
  MCP_API_KEY: process.env.MCP_API_KEY,
};

function streamToBuffer(stream: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const url = `http://${req.headers.host}${req.url}`;
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (value !== undefined) headers.set(key, value);
  }

  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";

  return new Request(url, {
    method,
    headers,
    body: hasBody ? (await streamToBuffer(req) as BodyInit) : undefined,
  });
}

const server = createServer(async (req, res) => {
  try {
    const webRequest = await toWebRequest(req);
    const webResponse = await worker.fetch(webRequest, env);

    res.statusCode = webResponse.status;
    webResponse.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await webResponse.arrayBuffer()));
  } catch (error) {
    console.error("Local dev server error:", error);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

server.listen(PORT, () => {
  console.log(`Quento MCP server (local) listening on http://localhost:${PORT}`);
});
