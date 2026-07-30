"use client"

import * as React from "react"
import Link from "next/link"
import {
  BotIcon,
  FlagIcon,
  HistoryIcon,
  PlusIcon,
  SendIcon,
  UserIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  canFlag?: boolean
  flagged?: boolean
}

interface ChatThread {
  id: string
  title: string
  updatedAt: string
}

type StreamEvent =
  | { type: "meta"; threadId: string }
  | { type: "token"; token: string }
  | {
      type: "done"
      threadId: string
      userMessageId?: string | null
      assistantMessageId?: string | null
      citations: Citation[]
    }

const MILO_CHAT_THREAD_STORAGE_KEY = "milo-chat-thread-id"
const FLAG_REASON_OPTIONS = [
  "Incorrect answer",
  "Wrong source",
  "Missing context",
  "Outdated info",
  "Confusing response",
  "Other",
]

function isInternalHubPath(value: string) {
  return /^\/[A-Za-z0-9][A-Za-z0-9/_-]*(?:\?[^\s\])}.,;!?]*)?$/.test(value)
}

function splitTrailingPunctuation(value: string) {
  const match = value.match(/^(.+?)([.,;:!?)]*)$/)
  return {
    body: match?.[1] ?? value,
    trailing: match?.[2] ?? "",
  }
}

function InlineMessageText({
  text,
  emphasis = false,
}: {
  text: string
  emphasis?: boolean
}) {
  const parts = text.split(
    /(\*\*[^*]+\*\*|\[\d+\]|\/[A-Za-z0-9][A-Za-z0-9/_-]*(?:\?[^\s\])}.,;!?]*)?)/g
  )

  return (
    <>
      {parts.map((part, index) => {
        if (!part) {
          return null
        }

        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <InlineMessageText
              key={`${part}-${index}`}
              text={part.slice(2, -2)}
              emphasis
            />
          )
        }

        if (/^\[\d+\]$/.test(part)) {
          return (
            <sup
              key={`${part}-${index}`}
              className="ml-0.5 align-super text-[10px] leading-none font-medium text-muted-foreground/70"
            >
              {part}
            </sup>
          )
        }

        const { body, trailing } = splitTrailingPunctuation(part)
        if (isInternalHubPath(body)) {
          return (
            <React.Fragment key={`${part}-${index}`}>
              <Link
                href={body}
                className={cn(
                  "font-medium text-primary underline-offset-2 hover:underline",
                  emphasis && "font-semibold"
                )}
              >
                {body}
              </Link>
              {trailing}
            </React.Fragment>
          )
        }

        if (emphasis) {
          return (
            <strong key={`${part}-${index}`} className="font-semibold">
              {part}
            </strong>
          )
        }

        return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
      })}
    </>
  )
}

function MessageContent({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  return (
    <p className={cn("text-sm leading-6 whitespace-pre-wrap", className)}>
      <InlineMessageText text={content} />
    </p>
  )
}

function FlagMiloResponseButton({
  assistantMessageId,
  onFlagged,
}: {
  assistantMessageId: string
  onFlagged: (assistantMessageId: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState("")
  const [details, setDetails] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function submitFlag(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedReason = reason.trim()
    const trimmedDetails = details.trim()
    if (!trimmedReason || pending) {
      return
    }

    setPending(true)
    setError(null)

    try {
      const response = await fetch("/api/wiki/chat/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantMessageId,
          reason: trimmedDetails
            ? `${trimmedReason}: ${trimmedDetails}`
            : trimmedReason,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(payload?.error ?? "Unable to flag this response.")
      }

      onFlagged(assistantMessageId)
      setOpen(false)
      setReason("")
      setDetails("")
      toast.success("Milo response flagged")
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to flag this response."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setError(null)
        }
      }}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="absolute top-2 right-1 opacity-0 transition-opacity group-hover/milo-message:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        aria-label="Flag Milo response"
        onClick={() => setOpen(true)}
      >
        <FlagIcon className="size-3.5" />
      </Button>
      <DialogContent>
        <form onSubmit={submitFlag} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Flag Milo Response</DialogTitle>
          </DialogHeader>

          <fieldset className="grid gap-3">
            <legend className="mb-3 text-sm font-medium">
              Why are you flagging this?
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {FLAG_REASON_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={cn(
                    "rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    reason === option &&
                      "border-primary bg-primary/10 text-primary"
                  )}
                  onClick={() => setReason(option)}
                  disabled={pending}
                  aria-pressed={reason === option}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>

          {reason ? (
            <label className="grid gap-2 text-sm font-medium">
              Add more info
              <textarea
                value={details}
                onChange={(event) => setDetails(event.currentTarget.value)}
                className="min-h-24 resize-y rounded-md border bg-background px-3 py-2 text-sm font-normal shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder="Optional"
                disabled={pending}
                maxLength={1800}
              />
            </label>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !reason.trim()}>
              {pending ? "Flagging..." : "Flag Response"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FlaggedMessageIcon() {
  return (
    <div
      className="absolute top-2 right-1 flex size-8 items-center justify-center text-amber-500"
      aria-label="Flagged message"
      title="Flagged"
    >
      <FlagIcon className="size-3.5 fill-amber-400" />
    </div>
  )
}

export function WikiChat({
  className,
  showTitle = true,
  queuedPrompt,
  onQueuedPromptConsumed,
}: {
  className?: string
  showTitle?: boolean
  queuedPrompt?: string | null
  onQueuedPromptConsumed?: () => void
}) {
  const [threadId, setThreadId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [threads, setThreads] = React.useState<ChatThread[]>([])
  const [showSessions, setShowSessions] = React.useState(false)
  const [input, setInput] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [loadingThread, setLoadingThread] = React.useState(false)
  const [isReadyForQueuedPrompt, setIsReadyForQueuedPrompt] =
    React.useState(false)
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null)
  const bottomSentinelRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null)
  const shouldFollowScrollRef = React.useRef(true)

  const scrollToBottom = React.useCallback(
    (behavior: ScrollBehavior = "auto") => {
      bottomSentinelRef.current?.scrollIntoView({ block: "end", behavior })
    },
    []
  )

  const handleMessagesScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget
      const distanceFromBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight
      shouldFollowScrollRef.current = distanceFromBottom < 24
    },
    []
  )

  const refreshThreads = React.useCallback(async () => {
    const response = await fetch("/api/wiki/chat", { method: "GET" })
    if (!response.ok) {
      return
    }

    const payload = (await response.json()) as { threads?: ChatThread[] }
    setThreads(payload.threads ?? [])
  }, [])

  const loadThread = React.useCallback(
    async (nextThreadId: string) => {
      setLoadingThread(true)
      try {
        const response = await fetch(
          `/api/wiki/chat?threadId=${encodeURIComponent(nextThreadId)}`,
          { method: "GET" }
        )

        if (!response.ok) {
          return
        }

        const payload = (await response.json()) as {
          thread?: ChatThread
          messages?: ChatMessage[]
        }
        setThreadId(payload.thread?.id ?? nextThreadId)
        setMessages(
          (payload.messages ?? []).map((message) => ({
            ...message,
            canFlag: message.role === "assistant",
          }))
        )
        setShowSessions(false)
        window.localStorage.setItem(MILO_CHAT_THREAD_STORAGE_KEY, nextThreadId)
        shouldFollowScrollRef.current = true
        requestAnimationFrame(() => scrollToBottom())
      } finally {
        setLoadingThread(false)
      }
    },
    [scrollToBottom]
  )

  React.useEffect(() => {
    let isCurrent = true

    async function loadInitialState() {
      await refreshThreads()
      const savedThreadId = window.localStorage.getItem(
        MILO_CHAT_THREAD_STORAGE_KEY
      )

      if (savedThreadId) {
        await loadThread(savedThreadId)
      }

      if (isCurrent) {
        setIsReadyForQueuedPrompt(true)
      }
    }

    void loadInitialState()

    return () => {
      isCurrent = false
    }
  }, [loadThread, refreshThreads])

  function startNewChat() {
    setThreadId(null)
    setMessages([])
    setShowSessions(false)
    shouldFollowScrollRef.current = true
    window.localStorage.removeItem(MILO_CHAT_THREAD_STORAGE_KEY)
  }

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
      shouldFollowScrollRef.current = true
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
              window.localStorage.setItem(
                MILO_CHAT_THREAD_STORAGE_KEY,
                data.threadId
              )
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
              window.localStorage.setItem(
                MILO_CHAT_THREAD_STORAGE_KEY,
                data.threadId
              )
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId
                    ? {
                        ...message,
                        id: data.assistantMessageId ?? message.id,
                        citations: data.citations,
                        canFlag: Boolean(data.assistantMessageId),
                      }
                    : message.id === userMessage.id && data.userMessageId
                      ? { ...message, id: data.userMessageId }
                      : message
                )
              )
            }
          }
        }
      } catch (error) {
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
      } finally {
        setPending(false)
        refreshThreads()
      }
    },
    [pending, refreshThreads, threadId]
  )

  function askQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendQuestion(input)
  }

  function resizeInput() {
    const element = inputRef.current
    if (!element) {
      return
    }

    element.style.height = "auto"
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`
  }

  React.useLayoutEffect(() => {
    resizeInput()
  }, [input])

  React.useEffect(() => {
    const nextPrompt = queuedPrompt?.trim()
    if (!nextPrompt || !isReadyForQueuedPrompt || pending) {
      return
    }

    setInput(nextPrompt)

    const timeout = window.setTimeout(() => {
      void sendQuestion(nextPrompt)
      onQueuedPromptConsumed?.()
    }, 120)

    return () => window.clearTimeout(timeout)
  }, [
    isReadyForQueuedPrompt,
    onQueuedPromptConsumed,
    pending,
    queuedPrompt,
    sendQuestion,
  ])

  React.useLayoutEffect(() => {
    if (!shouldFollowScrollRef.current) {
      return
    }

    const frame = requestAnimationFrame(() => scrollToBottom())
    return () => cancelAnimationFrame(frame)
  }, [messages, loadingThread, showSessions, scrollToBottom])

  return (
    <aside
      className={cn(
        "flex max-h-[42rem] min-h-[28rem] flex-col rounded-lg border bg-card",
        className
      )}
    >
      {showTitle ? (
        <div className="border-b p-4">
          <h2 className="text-base font-semibold">Ask Milo</h2>
        </div>
      ) : null}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowSessions((current) => !current)}
          aria-pressed={showSessions}
        >
          <HistoryIcon />
          Sessions
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={startNewChat}
          className="ml-auto"
        >
          <PlusIcon />
          New
        </Button>
      </div>
      {showSessions ? (
        <div className="max-h-56 shrink-0 overflow-y-auto border-b p-2">
          {threads.length ? (
            <div className="grid gap-1">
              {threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  className={cn(
                    "rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                    thread.id === threadId && "bg-muted"
                  )}
                  onClick={() => loadThread(thread.id)}
                  disabled={loadingThread}
                >
                  <span className="block truncate font-medium">
                    {thread.title || "New chat"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {new Date(thread.updatedAt).toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No previous sessions yet.
            </p>
          )}
        </div>
      ) : null}
      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
        onScroll={handleMessagesScroll}
      >
        {loadingThread ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Loading session...
          </div>
        ) : messages.length ? (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "group/milo-message relative",
                "-mx-2 px-3 py-3",
                message.role === "user" && "bg-sky-100/80 dark:bg-sky-900/35"
              )}
            >
              {message.role === "assistant" &&
              message.canFlag &&
              !message.flagged ? (
                <FlagMiloResponseButton
                  assistantMessageId={message.id}
                  onFlagged={(assistantMessageId) =>
                    setMessages((current) => {
                      const assistantIndex = current.findIndex(
                        (item) => item.id === assistantMessageId
                      )
                      let userMessageId: string | null = null

                      for (
                        let index = assistantIndex - 1;
                        index >= 0;
                        index--
                      ) {
                        if (current[index]?.role === "user") {
                          userMessageId = current[index].id
                          break
                        }
                      }

                      return current.map((item) =>
                        item.id === assistantMessageId ||
                        item.id === userMessageId
                          ? { ...item, flagged: true }
                          : item
                      )
                    })
                  }
                />
              ) : null}
              {message.flagged ? <FlaggedMessageIcon /> : null}
              <div className="mb-1.5 flex items-center gap-2">
                <div
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
                    message.role === "user" &&
                      "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-200"
                  )}
                >
                  {message.role === "user" ? (
                    <UserIcon className="size-3.5" />
                  ) : (
                    <BotIcon className="size-3.5" />
                  )}
                </div>
                <span className="text-xs font-semibold text-muted-foreground">
                  {message.role === "user" ? "You" : "Milo"}
                </span>
              </div>
              <div className="min-w-0">
                <MessageContent
                  content={
                    message.content ||
                    (message.role === "assistant" ? "Thinking..." : "")
                  }
                />
                {message.citations?.length ? (
                  <div className="mt-3 space-y-2">
                    {message.citations.map((citation, index) => (
                      <div
                        key={`${citation.title}-${index}`}
                        className="relative rounded-md border p-2 pr-9"
                      >
                        <span className="absolute top-2 right-2 rounded bg-muted px-1.5 py-0.5 text-[10px] leading-none font-medium text-muted-foreground">
                          {index + 1}
                        </span>
                        {citation.url ? (
                          <Link
                            href={citation.url}
                            className="text-xs font-medium hover:underline"
                          >
                            {citation.title}
                          </Link>
                        ) : (
                          <p className="text-xs font-medium">
                            {citation.title}
                          </p>
                        )}
                        <MessageContent
                          content={citation.snippet}
                          className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Ask Milo about Wiki pages, uploaded documents, reports, newsletters,
            or support directory information.
          </div>
        )}
        <div ref={bottomSentinelRef} aria-hidden="true" />
      </div>
      <form onSubmit={askQuestion} className="relative border-t bg-background">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              void sendQuestion(input)
            }
          }}
          placeholder="Ask Milo anything"
          disabled={pending}
          rows={1}
          className="block max-h-40 min-h-14 w-full resize-none border-0 bg-background px-4 py-4 pr-14 text-sm leading-5 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
        />
        <Button
          type="submit"
          size="icon-sm"
          disabled={pending || !input.trim()}
          className="absolute right-3 bottom-3"
        >
          <SendIcon />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </aside>
  )
}
