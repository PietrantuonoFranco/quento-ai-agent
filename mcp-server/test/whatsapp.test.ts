import { afterEach, describe, expect, it, vi } from "vitest";

import { notify, whatsAppRecipients } from "../src/lib/whatsapp";
import type Env from "../src/lib/interfaces/EnvInterface";
import { env } from "./helpers";

const whatsappEnv: Env = {
  ...env,
  WHATSAPP_ACCESS_TOKEN: "token",
  WHATSAPP_PHONE_NUMBER_ID: "123",
};

const template = { name: "quento_partido_cancelado", parameters: ["Ana", "Juan"] };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("whatsAppRecipients", () => {
  it("usa tal cual un número que ya viene con código de país (como lo guarda el bot)", () => {
    expect(whatsAppRecipients("5491234567890")).toContain("5491234567890");
  });

  it("agrega 549 a un celular argentino cargado sin código de país (como en la web)", () => {
    expect(whatsAppRecipients("221 604-9987")).toContain("5492216049987");
  });

  it("respeta un número con +", () => {
    expect(whatsAppRecipients("+1 555 0100")).toEqual(["15550100"]);
  });

  it("prueba primero las variantes con las que Meta registra los celulares argentinos", () => {
    expect(whatsAppRecipients("5491123456789")).toEqual(["541115" + "23456789", "541123456789", "5491123456789"]);
    expect(whatsAppRecipients("5492216049987")).toEqual(["542216049987", "5492216049987"]);
  });
});

describe("notify", () => {
  it("no manda nada si el WhatsApp del club no está configurado", async () => {
    const fetchFn = vi.fn();

    await notify(env, [{ names: "Ana", phoneNumber: "5492216049987" }], () => template, fetchFn);

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("manda la plantilla a cada destinatario con la API de Meta", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

    await notify(
      whatsappEnv,
      [
        { names: "Ana", phoneNumber: "5492216049987" },
        { names: "Leo", phoneNumber: "5492216040000" },
      ],
      (recipient) => ({ ...template, parameters: [recipient.names] }),
      fetchFn,
    );

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v23.0/123/messages");
    expect(init.headers.Authorization).toBe("Bearer token");
    expect(JSON.parse(init.body)).toEqual({
      messaging_product: "whatsapp",
      to: "542216049987",
      type: "template",
      template: {
        name: "quento_partido_cancelado",
        language: { code: "es_AR" },
        components: [{ type: "body", parameters: [{ type: "text", text: "Ana" }] }],
      },
    });
  });

  it("si Meta rechaza un formato del número prueba el siguiente", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response("bad", { status: 400 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await notify(whatsappEnv, [{ names: "Ana", phoneNumber: "5492216049987" }], () => template, fetchFn);

    expect(fetchFn.mock.calls.map(([, init]) => JSON.parse(init.body).to)).toEqual(["542216049987", "5492216049987"]);
  });

  it("nunca falla: un aviso que no se pudo mandar no frena la operación", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchFn = vi.fn().mockRejectedValue(new Error("network down"));

    await expect(
      notify(whatsappEnv, [{ names: "Ana", phoneNumber: "5492216049987" }], () => template, fetchFn),
    ).resolves.toBeUndefined();
  });
});
