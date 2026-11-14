import type Env from "./interfaces/EnvInterface";
import type { WhatsAppTemplate } from "./notices";

const GRAPH_URL = "https://graph.facebook.com";
const DEFAULT_API_VERSION = "v23.0";
const DEFAULT_TEMPLATE_LANGUAGE = "es_AR";

// Prefijo de los celulares argentinos cargados sin código de país (como los guarda la web).
const DEFAULT_COUNTRY_PREFIX = "549";

export type NoticeRecipient = { names: string; phoneNumber: string | null };

/**
 * Formatos del número a probar, en orden. El bot guarda el número como lo manda Meta (ya con
 * código de país) y la web suele guardarlo sin él. Además, Meta registra los celulares argentinos
 * sin el 9 (y los de AMBA con el 15), así que se prueban esas variantes primero, igual que el
 * host (mcp-host/whatsapp.py).
 */
export function whatsAppRecipients(phoneNumber: string): string[] {
  const digits = phoneNumber.replace(/\D/g, "");
  const international =
    phoneNumber.trim().startsWith("+") || digits.startsWith("54") ? digits : DEFAULT_COUNTRY_PREFIX + digits;

  if (international.startsWith("54911")) {
    return ["541115" + international.slice(5), "54" + international.slice(3), international];
  }

  if (international.startsWith("549")) {
    return ["54" + international.slice(3), international];
  }

  return [international];
}

async function sendTemplate(
  env: Env,
  phoneNumber: string,
  template: WhatsAppTemplate,
  fetchFn: typeof fetch,
): Promise<void> {
  const url = `${GRAPH_URL}/${env.WHATSAPP_API_VERSION ?? DEFAULT_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  let lastError = "";

  for (const to of whatsAppRecipients(phoneNumber)) {
    const response = await fetchFn(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template.name,
          language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE ?? DEFAULT_TEMPLATE_LANGUAGE },
          components: [{ type: "body", parameters: template.parameters.map((text) => ({ type: "text", text })) }],
        },
      }),
    });

    if (response.ok) return;

    lastError = `${response.status} ${await response.text()}`;
  }

  throw new Error(`WhatsApp API: ${lastError}`);
}

/**
 * Manda a cada destinatario su aviso por WhatsApp. Si el WhatsApp del club no está configurado
 * no hace nada. Nunca falla, igual que notify de la web: un aviso que no se pudo mandar se
 * registra, pero no debe deshacer ni frenar la operación que lo originó.
 */
export async function notify(
  env: Env,
  recipients: NoticeRecipient[],
  buildTemplate: (recipient: NoticeRecipient) => WhatsAppTemplate,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return;

  await Promise.all(
    recipients
      .filter((recipient) => recipient.phoneNumber)
      .map((recipient) =>
        sendTemplate(env, recipient.phoneNumber!, buildTemplate(recipient), fetchFn).catch((error) => {
          console.error("notify (whatsapp)", error);
        }),
      ),
  );
}
