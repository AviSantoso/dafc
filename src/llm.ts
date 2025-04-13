import { writeFile } from "fs/promises";
import OpenAI from "openai";
import { config } from "./config";
import { sleep } from "./utils";

// Ensure API key is present before initializing OpenAI client
if (!config.OPENAI_API_KEY) {
  console.error("FATAL: OPENAI_API_KEY is not configured. Exiting.");
  process.exit(1);
}

const openai = new OpenAI({
  baseURL: config.OPENAI_API_BASE,
  apiKey: config.OPENAI_API_KEY, // Use the configured API key
  defaultHeaders: {
    // Add headers recommended by OpenRouter
    "HTTP-Referer": "https://github.com/AviSantoso/dafc", // Replace with your app URL or repo
    "X-Title": "DAFC CLI", // Replace with your app name
  },
});

export async function queryLLM(
  context: string,
  userPrompt: string,
  systemPrompt: string | null // Allow system prompt to be null
): Promise<void> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  // Add system prompt if provided
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  // Combine context and user prompt for the user message
  // Ensure context isn't accidentally empty causing double newlines
  const userMessageContent = context
    ? `Project Context:\n${context}\n\n---\n\nUser Request:\n${userPrompt}`
    : `User Request:\n${userPrompt}`;

  messages.push({ role: "user", content: userMessageContent });

  let attempt = 0;
  while (attempt < config.MAX_RETRIES) {
    try {
      console.log(
        `\nSending request to model '${config.OPENAI_MODEL}' via ${
          config.OPENAI_API_BASE
        }${
          attempt > 0 ? ` (attempt ${attempt + 1}/${config.MAX_RETRIES})` : ""
        }...`
      );
      const startTime = Date.now();

      const stream = await openai.chat.completions.create({
        model: config.OPENAI_MODEL,
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

      // Check for OpenAI specific error structure first
      if (error instanceof OpenAI.APIError) {
        console.error(`Status: ${error.status}`);
        console.error(`Type: ${error.type}`);
        console.error(`Code: ${error.code}`);
        console.error(`Message: ${error.message}`);

        if (error.status === 401) {
          console.error("\nAuthentication Failed. Please verify:");
          console.error(
            `1. Your OPENAI_API_KEY in .env or environment is correct for the service at ${config.OPENAI_API_BASE}.`
          );
          console.error("2. You have sufficient credits/permissions.");
          console.error(
            "3. The model name is correct and available via the endpoint."
          );
          process.exit(1); // Don't retry auth errors
        }
        if (error.status === 402) {
          console.error(
            "\nPayment Required. Check your account credits/billing."
          );
          process.exit(1);
        }
        if (error.status === 429) {
          console.error(
            "\nRate Limited or Quota Exceeded. Please wait before trying again or check your limits."
          );
          // Exponential backoff will handle retry delay
        }
        if (error.status === 400 && error.code === "context_length_exceeded") {
          console.error(
            "\nContext Length Exceeded. The model cannot handle the amount of context provided."
          );
          console.error(
            "Try excluding more files/directories or simplifying your request."
          );
          process.exit(1); // Don't retry context length errors
        }
      } else if (
        error.code === "ENOTFOUND" ||
        error.message.includes("fetch failed")
      ) {
        // Handle generic network errors
        console.error(
          `Network error - Could not reach API endpoint (${config.OPENAI_API_BASE}). Check connection and OPENAI_API_BASE.`
        );
      } else {
        // Handle other unexpected errors
        console.error(`An unexpected error occurred: ${error.message}`);
        if (error.stack) {
          console.error(error.stack);
        }
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
