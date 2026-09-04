import { providerConfigSchema } from "@/lib/provider";
import { COOKIE_NAME, decryptConfig, encryptConfig, readCookie } from "@/lib/secure-cookie";

export async function GET(request: Request) {
  try {
    const value = readCookie(request, COOKIE_NAME);
    if (!value) return Response.json({ configured: false });
    const config = await decryptConfig(value);
    return Response.json({ configured: true, provider: config.provider, model: config.model });
  } catch {
    return Response.json({ configured: false });
  }
}

export async function POST(request: Request) {
  try {
    const config = providerConfigSchema.parse(await request.json());
    const encrypted = await encryptConfig(config);
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return Response.json(
      { configured: true, provider: config.provider, model: config.model },
      { headers: { "Set-Cookie": `${COOKIE_NAME}=${encrypted}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}` } },
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Không thể lưu cấu hình" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return Response.json({ configured: false }, { headers: { "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}` } });
}
