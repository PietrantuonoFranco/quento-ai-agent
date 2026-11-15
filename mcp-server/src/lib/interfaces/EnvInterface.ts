/**
 * Tipo del env inyectado por Cloudflare
*/
export default interface Env {
  DB: {
    connectionString: string;
  },
  MCP_API_KEY: string;
  // WhatsApp Cloud API del club, para los avisos a terceros (ver lib/whatsapp.ts). Sin
  // token o sin phone number id no se manda ningún aviso.
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_API_VERSION?: string; // por defecto v23.0
  WHATSAPP_TEMPLATE_LANGUAGE?: string; // por defecto es_AR
}
