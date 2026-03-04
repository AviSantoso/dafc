import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput, useApp, Static } from "ink";
import clipboard from "clipboardy";
import { writeFile } from "fs/promises";
import { join } from "path";
import type { Message } from "./llm.js";
import { streamChat } from "./llm.js";

interface ChatMessage {
  role: "user" | "assistant" | "info";
  content: string;
}

function formatConversationMarkdown(
  patterns: string[],
  messages: ChatMessage[]
): string {
  const date = new Date().toLocaleString();
  const lines: string[] = [
    `# dafc conversation`,
    ``,
    `**Date:** ${date}`,
    `**Watching:** ${patterns.join(" ")}`,
    ``,
    `---`,
    ``,
  ];

  for (const msg of messages) {
    if (msg.role === "user") {
      lines.push(`### You`, ``, msg.content, ``, `---`, ``);
    } else if (msg.role === "assistant") {
      lines.push(`### Assistant`, ``, msg.content, ``, `---`, ``);
    }
    // skip "info" messages (system notices) — not part of the conversation
  }

  return lines.join("\n");
}

export interface AppProps {
  patterns: string[];
  initialFileCount: number;
  initialMessages: Message[];
  cwd: string;
  registerUpdater: (
    fn: (context: string, fileCount: number) => void
  ) => void;
}

export function App({
  patterns,
  initialFileCount,
  initialMessages,
  cwd,
  registerUpdater,
}: AppProps) {
  const { exit } = useApp();
  const messagesRef = useRef<Message[]>(initialMessages);
  const lastAssistantRef = useRef(
    "I'm ready to help you explore this codebase."
  );

  const [staticMessages, setStaticMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "I'm ready to help you explore this codebase.",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [fileCount, setFileCount] = useState(initialFileCount);
  const [contextUpdated, setContextUpdated] = useState(false);

  useEffect(() => {
    registerUpdater((context, count) => {
      messagesRef.current[1].content = context;
      setFileCount(count);
      setContextUpdated(true);
      setStaticMessages((prev) => [
        ...prev,
        { role: "info", content: "[context updated]" },
      ]);
      setTimeout(() => setContextUpdated(false), 3000);
    });
  }, []);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
      return;
    }

    if (isStreaming) return;

    if (key.return) {
      const trimmed = inputText.trim();
      if (!trimmed) return;

      setInputText("");

      if (trimmed === "/exit") {
        exit();
        return;
      }

      if (trimmed === "/copy") {
        clipboard
          .write(lastAssistantRef.current)
          .then(() => {
            setStaticMessages((prev) => [
              ...prev,
              { role: "info", content: "Copied!" },
            ]);
          })
          .catch(() => {
            setStaticMessages((prev) => [
              ...prev,
              { role: "info", content: "Copy failed." },
            ]);
          });
        return;
      }

      if (trimmed === "/save") {
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .replace("T", "_")
          .slice(0, 19);
        const filename = `dafc_${timestamp}.md`;
        const filepath = join(cwd, filename);
        const md = formatConversationMarkdown(
          patterns,
          staticMessages
        );
        writeFile(filepath, md, "utf-8")
          .then(() => {
            setStaticMessages((prev) => [
              ...prev,
              { role: "info", content: `Saved to ${filename}` },
            ]);
          })
          .catch((err: Error) => {
            setStaticMessages((prev) => [
              ...prev,
              { role: "info", content: `Save failed: ${err.message}` },
            ]);
          });
        return;
      }

      setStaticMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed },
      ]);
      messagesRef.current.push({ role: "user", content: trimmed });

      setIsStreaming(true);
      setStreamingContent("");

      streamChat(messagesRef.current, (chunk) => {
        setStreamingContent((prev) => prev + chunk);
      })
        .then((full) => {
          messagesRef.current.push({ role: "assistant", content: full });
          lastAssistantRef.current = full;
          setStaticMessages((prev) => [
            ...prev,
            { role: "assistant", content: full },
          ]);
          setStreamingContent("");
          setIsStreaming(false);
        })
        .catch((err: Error) => {
          setStaticMessages((prev) => [
            ...prev,
            { role: "info", content: `Error: ${err.message}` },
          ]);
          setIsStreaming(false);
          setStreamingContent("");
        });

      return;
    }

    if (key.backspace || key.delete) {
      setInputText((prev) => prev.slice(0, -1));
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setInputText((prev) => prev + input);
    }
  });

  return (
    <Box flexDirection="column">
      <Static items={staticMessages}>
        {(msg, i) => {
          if (msg.role === "user") {
            return (
              <Box key={i} flexDirection="column" marginTop={1}>
                <Text bold color="green">
                  You:
                </Text>
                <Text>{msg.content}</Text>
              </Box>
            );
          }
          if (msg.role === "assistant") {
            return (
              <Box key={i} flexDirection="column" marginTop={1}>
                <Text bold color="cyan">
                  Assistant:
                </Text>
                <Text>{msg.content}</Text>
              </Box>
            );
          }
          return (
            <Box key={i}>
              <Text color="yellow" dimColor>
                {msg.content}
              </Text>
            </Box>
          );
        }}
      </Static>

      {isStreaming && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="cyan">
            Assistant:
          </Text>
          <Text>{streamingContent}▋</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text bold>dafc</Text>
        <Text dimColor> — watching </Text>
        <Text color="cyan">{fileCount} files</Text>
        <Text dimColor>  {patterns.join(" ")}</Text>
        {contextUpdated && <Text color="yellow">  [context updated]</Text>}
      </Box>

      <Box>
        <Text color="green" bold>
          {">"}{" "}
        </Text>
        <Text>{inputText}</Text>
        {!isStreaming && <Text color="green">█</Text>}
      </Box>
    </Box>
  );
}
