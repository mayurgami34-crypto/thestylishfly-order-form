/** Verify the admin master key server-side. Never trust the browser alone. */
export function assertMasterKey(key: unknown) {
  const expected = process.env["ADMIN_MASTER_KEY"];
  if (!expected) throw new Error("Admin master key is not configured");
  if (typeof key !== "string" || key !== expected) throw new Error("Unauthorized");
}