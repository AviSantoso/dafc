import { writeFile } from "fs/promises";
import OpenAI from "openai";
import { config } from "./config";
import { sleep } from "./utils";

const openai = new OpenAI({
  baseURL: config.API_BASE_URL,
  apiKey: config.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://github.com/AviSantoso/dafc",
    "X-Title": "DAFC CLI",
  },
});

export async function queryLLM(
  context: string,
  userPrompt: string,
  systemPrompt: string | null
): Promise<void> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  // Combine context and user prompt
  const combinedContent = context
    ? `Project Context:\n${context}\n\nUser Request:\n${userPrompt}`
    : userPrompt;

  messages.push({ role: "user", content: combinedContent });

  let attempt = 0;
  while (attempt < config.MAX_RETRIES) {
    try {
      console.log(
        `\nSending request to ${config.MODEL_NAME}${
          attempt > 0 ? ` (attempt ${attempt + 1}/${config.MAX_RETRIES})` : ""
        }...`
      );
      const startTime = Date.now();

      const stream = await openai.chat.completions.create({
        model: config.MODEL_NAME,
        messages,
        temperature: config.TEMPERATURE,
        stream: true,
      });

      let fullResponse = "";
      process.stdout.write("\nLLM Response: ");

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        process.stdout.write(content); // Stream to console
        fullResponse += content;
      }

      // Write complete response to file
      await writeFile(config.RESPONSE_FILE, fullResponse, "utf-8");
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(`\n\n✅ Response stream complete (${elapsed}s).`);
      console.log(`   Full response saved to ${config.RESPONSE_FILE}`);
      console.log("-".repeat(40));
      return; // Success - exit the retry loop
    } catch (error: any) {
      console.error("\n❌ LLM API Error:");

      if (error.response) {
        console.error(`Status: ${error.response.status}`);
        const errorMsg = error.response.data?.error?.message || error.message;
        console.error(`Message: ${errorMsg}`);

        if (error.response.status === 401) {
          console.error("\nAuthentication Failed. Please verify:");
          console.error(
            "1. Your OPENROUTER_API_KEY in .env or environment is correct."
          );
          console.error("2. You have sufficient credits on OpenRouter.");
          console.error("3. The model name is correct and available.");
          process.exit(1); // Don't retry auth errors
        }
        if (error.response.status === 402) {
          console.error("\nPayment Required. Check your OpenRouter credits.");
          process.exit(1);
        }
        if (error.response.status === 429) {
          console.error("\nRate Limited. Please wait before trying again.");
          // Exponential backoff will handle retry delay
        }
      } else if (
        error.code === "ENOTFOUND" ||
        error.message.includes("fetch failed")
      ) {
        console.error(
          "Network error - Could not reach API endpoint. Check connection and API_BASE_URL."
        );
      } else {
        console.error(error.message);
      }

      attempt++;
      if (attempt >= config.MAX_RETRIES) {
        console.error(
          `\nFailed after ${config.MAX_RETRIES} attempts. Exiting.`
        );
        process.exit(1);
      }

      const delay = config.BASE_DELAY * Math.pow(2, attempt); // Exponential backoff
      console.log(`\nRetrying in ${delay / 1000} seconds...`);
      await sleep(delay);
    }
  }
}
