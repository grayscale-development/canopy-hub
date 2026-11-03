"use client"

import * as React from "react"
import Link from "next/link"
import { Loader2Icon, SendIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface Citation {
  title: string
  url: string | null
  snippet: string
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  citations?: Citation[]
}

type StreamEvent =
  | { type: "meta"; threadId: string }
  | { type: "token"; token: string }
  | { type: "done"; threadId: string; citations: Citation[] }

function MessageContent({ content }: { content: string }) {
  return <p className="text-sm leading-6 whitespace-pre-wrap">{content}</p>
}

function ResourceLink({
  citation,
  onNavigate,
}: {
  citation: Citation
  onNavigate?: () => void
}) {
  const content = (
    <>
      <span className="block font-medium text-foreground">{citation.title}</span>
      {citation.snippet ? (
        <span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-muted-foreground">
          {citation.snippet}
        </span>
      ) : null}
    </>
  )

  if (!citation.url) {
    return <div className="rounded-md border p-3">{content}</div>
  }

  return (
    <Link
      href={citation.url}
      onClick={onNavigate}
      className="block cursor-pointer rounded-md border p-3 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {content}
    </Link>
  )
}

export function WikiChat({
  className,
  queuedPrompt,
  onQueuedPromptConsumed,
  onNavigate,
}: {
  className?: string
  queuedPrompt?: string | null
  onQueuedPromptConsumed?: () => void
  onNavigate?: () => void
}) {
  const [threadId, setThreadId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [input, setInput] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const consumedPromptRef = React.useRef<string | null>(null)
  const isMountedRef = React.useRef(false)

  React.useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const sendQuestion = React.useCallback(
    async (questionValue: string) => {
      const question = questionValue.trim()
      if (!question || pending) {
        return
      }

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: question,
      }
      const assistantId = crypto.randomUUID()
      setMessages((current) => [
        ...current,
        userMessage,
        { id: assistantId, role: "assistant", content: "" },
      ])
      setInput("")
      setPending(true)

      try {
        const response = await fetch("/api/wiki/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId, message: question }),
        })

        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string
          } | null
          throw new Error(payload?.error ?? "Chat request failed.")
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { value, done } = await reader.read()
          if (done) {
            break
          }

          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split("\n\n")
          buffer = parts.pop() ?? ""

          for (const part of parts) {
            const line = part.trim()
            if (!line.startsWith("data: ")) {
              continue
            }

            const data = JSON.parse(line.slice(6)) as StreamEvent
            if (data.type === "meta") {
              setThreadId(data.threadId)
            }
            if (data.type === "token") {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId
                    ? { ...message, content: message.content + data.token }
                    : message
                )
              )
            }
            if (data.type === "done") {
              setThreadId(data.threadId)
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId
                    ? { ...message, citations: data.citations }
                    : message
                )
              )
            }
          }
        }
      } catch (error) {
        if (isMountedRef.current) {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content:
                      error instanceof Error
                        ? error.message
                        : "Unable to answer right now.",
                  }
                : message
            )
          )
        }
      } finally {
        if (isMountedRef.current) {
          setPending(false)
        }
      }
    },
    [pending, threadId]
  )

  React.useEffect(() => {
    const prompt = queuedPrompt?.trim()
    if (!prompt || pending || consumedPromptRef.current === prompt) {
      return
    }

    consumedPromptRef.current = prompt
    onQueuedPromptConsumed?.()
    void sendQuestion(prompt)
  }, [onQueuedPromptConsumed, pending, queuedPrompt, sendQuestion])

  function askQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendQuestion(input)
  }

  const answers = messages.filter((message) => message.role === "assistant")
  const resources = answers.flatMap((message) => message.citations ?? [])

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {answers.length ? (
          <div className="space-y-6">
            {answers.map((answer, index) => (
              <section key={answer.id}>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  {index ? "Follow-up answer" : "Answer"}
                </h3>
                {pending && !answer.content ? (
                  <div
                    className="flex h-12 items-center"
                    aria-label="Milo is thinking"
                  >
                    <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                    <span className="sr-only">Loading answer</span>
                  </div>
                ) : (
                  <MessageContent content={answer.content} />
                )}
              </section>
            ))}

            {!pending && resources.length ? (
              <section>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  Resources
                </h3>
                <div className="space-y-2">
                  {resources.map((citation, index) => (
                    <ResourceLink
                      key={`${citation.title}-${citation.url ?? "source"}-${index}`}
                      citation={citation}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Ask a question to get started.</p>
        )}
      </div>

      <form onSubmit={askQuestion} className="border-t p-4">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
            placeholder="Ask a follow-up"
            aria-label="Ask a follow-up"
            disabled={pending}
            className="h-10 cursor-text"
          />
          <Button
            type="submit"
            size="sm"
            disabled={pending || !input.trim()}
            className="cursor-pointer"
          >
            <SendIcon />
            <span className="sr-only">Send follow-up</span>
          </Button>
        </div>
      </form>
    </div>
  )
}
