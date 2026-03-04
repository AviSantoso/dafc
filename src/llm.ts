import OpenAI from "openai";
import { config } from "./config.js";

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      baseURL: config.OPENAI_API_BASE,
      apiKey: config.OPENROUTER_API_KEY,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/AviSantoso/dafc",
        "X-Title": "DAFC CLI",
      },
    });
  }
  return client;
}

export async function streamChat(
  messages: Message[],
  onChunk: (s: string) => void,
): Promise<string> {
  const stream = await getClient().chat.completions.create({
    model: config.OPENAI_MODEL,
    messages,
    temperature: config.TEMPERATURE,
    stream: true,
  });

  let full = "";
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    if (content) {
      full += content;
      onChunk(content);
    }
  }
  return full;
}
