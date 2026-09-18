/**
 * Tipo del env inyectado por Cloudflare
*/
export default interface Env {
  DB: {
    connectionString: string;
  },
  MCP_API_KEY: string;
}