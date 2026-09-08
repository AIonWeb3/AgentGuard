export async function connectFreighter(): Promise<string> {
  const api = await import("@stellar/freighter-api");
  const access = await api.requestAccess();
  if (access.error || !access.address) {
    throw new Error(access.error?.message ?? "Freighter access was denied");
  }
  return access.address;
}
