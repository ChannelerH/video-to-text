import { respData, respErr } from "@/lib/resp";
import { Resend } from "resend";
import { readJson } from "@/lib/read-json";

export async function POST(req: Request) {
  try {
    const { emails, subject, content } = await readJson<{ emails?: string | string[]; subject?: string; content?: string }>(req);
    if (!emails || (Array.isArray(emails) && emails.length === 0) || !subject || !content) {
      return respErr("invalid params");
    }

    const resend = new Resend(process.env.RESEND_API_KEY!);

    const result = await resend.emails.send({
      from: process.env.RESEND_SENDER_EMAIL!,
      to: emails,
      subject,
      html: content,
    });

    console.log("send email result", result);

    return respData(result);
  } catch (e) {
    console.log("send email failed:", e);
    return respErr("send email failed");
  }
}
