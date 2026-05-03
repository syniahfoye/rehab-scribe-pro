/**
 * Sends recorded audio to OpenAI Whisper. Requires OPENAI_API_KEY on the server.
 * Browser never sees the key; traffic is browser → your API → OpenAI.
 */
export async function transcribeWithOpenAIWhisper(params: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key?.trim()) {
    throw new Error("OPENAI_API_KEY is not set on the server.");
  }

  const uint8 = new Uint8Array(params.buffer);
  const blob = new Blob([uint8], { type: params.mimeType || "audio/webm" });
  const form = new FormData();
  form.append("file", blob, params.filename || "visit.webm");
  form.append("model", "whisper-1");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI transcription failed (${res.status}): ${raw.slice(0, 500)}`);
  }

  try {
    const data = JSON.parse(raw) as { text?: string };
    return (data.text ?? "").trim();
  } catch {
    throw new Error("OpenAI returned non-JSON response.");
  }
}
