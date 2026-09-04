import type { ProviderConfig } from "./provider";

export const COOKIE_NAME = "on_tap_ai_config";

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function getKey() {
  const secret = process.env.COOKIE_SECRET || "on-tap-ai-local-development-only";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptConfig(config: ProviderConfig) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await getKey(), new TextEncoder().encode(JSON.stringify(config)));
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`;
}

export async function decryptConfig(value: string): Promise<ProviderConfig> {
  const [ivPart, contentPart] = value.split(".");
  if (!ivPart || !contentPart) throw new Error("Cookie cấu hình không hợp lệ");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlToBytes(ivPart) }, await getKey(), base64UrlToBytes(contentPart));
  return JSON.parse(new TextDecoder().decode(decrypted)) as ProviderConfig;
}

export function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") || "";
  return header.split(";").map((item) => item.trim().split("=")).find(([key]) => key === name)?.slice(1).join("=");
}
