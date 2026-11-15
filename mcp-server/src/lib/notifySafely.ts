// Corre el armado y envío de un aviso sin dejar que un error lo propague: la acción que lo
// originó (cancelar, sumarse, bajarse) ya se guardó y se informa igual.
export async function notifySafely(label: string, send: () => Promise<void>): Promise<void> {
  try {
    await send();
  } catch (error) {
    console.error(`notify ${label}`, error);
  }
}
