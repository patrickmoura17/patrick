// Local-mode password hashing (PBKDF2-SHA256). Supabase Auth handles passwords in cloud mode.
const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

export async function hashPassword(password: string, salt?: string): Promise<string> {
  const s = salt ?? hex(crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer);
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(s), iterations: 120000 }, key, 256);
  return `pbkdf2$${s}$${hex(bits)}`;
}

export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  if (!stored) return false;
  const [, salt] = stored.split("$");
  return (await hashPassword(password, salt)) === stored;
}
