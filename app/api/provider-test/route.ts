import { createAIClient, providerConfigSchema } from "@/lib/provider";
import { COOKIE_NAME, decryptConfig, readCookie } from "@/lib/secure-cookie";

export async function POST(request: Request) {
  try {
    const value = readCookie(request, COOKIE_NAME);
    if (!value) return Response.json({ error: "Bạn chưa lưu cấu hình AI" }, { status: 401 });
    const config = providerConfigSchema.parse(await decryptConfig(value));
    const response = await createAIClient(config).chat.completions.create({
      model: config.model,
      messages: [{role: "user", content: "Reply with exactly: OK"}],
      max_tokens: 8,
      temperature: 0,
    });
    return Response.json({ ok: Boolean(response.choices[0]?.message?.content) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể kết nối provider";
    return Response.json({ error: message }, { status: 502 });
  }
}
