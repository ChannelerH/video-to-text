import { respData, respErr } from "@/lib/resp";

import { getUserUuid } from "@/services/user";
import { insertFeedback } from "@/models/feedback";
import { readJson } from "@/lib/read-json";

export async function POST(req: Request) {
  try {
    const body = await readJson<{ content?: string; rating?: number }>(req);
    const { content, rating } = body;
    if (!content) {
      return respErr("invalid params");
    }

    const user_uuid = await getUserUuid();

    const feedback = {
      user_uuid: user_uuid,
      content: content,
      rating: rating,
      created_at: new Date(),
      status: "created",
    };

    const dbFeedback = await insertFeedback(feedback);

    return respData(dbFeedback);
  } catch (e) {
    console.log("add feedback failed", e);
    return respErr("add feedback failed");
  }
}
