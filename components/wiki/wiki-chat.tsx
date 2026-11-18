"use client"

import * as React from "react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import {
  Loader2Icon,
  PaperclipIcon,
  SendIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  MILO_FILE_MAX_BYTES,
  MILO_SOURCE_MAX_CHARS,
} from "@/lib/milo/source-limits"
import { WikiChatCard } from "@/components/wiki/wiki-chat-card"
import {
  fetchMiloResults,
  MiloSearchResults,
  searchableQuery,
  useMiloSearch,
  type MiloSearchResult,
} from "@/components/wiki/milo-search-results"
import {
  cardEventSchema,
  displayCard,
  type DisplayCard,
  type MiloStreamEvent,
} from "@/lib/milo/chat-cards"
import { cn } from "@/lib/utils"
import { inlineCitations } from "@/lib/milo/inline-citations"

interface Citation {
  title: string
  url: string | null
  snippet: string
  updatedAt?: string
  updatedBy?: string
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  citations?: Citation[]
  cards?: DisplayCard[]
  serverId?: string
  abstained?: boolean
  flagged?: boolean
  rating?: "up" | "down"
  matchingPages?: MiloSearchResult[]
}

const activeThreadKey = "milo-active-thread"
function MessageContent({
  content,
  citations = [],
  onNavigate,
}: {
  content: string
  citations?: Citation[]
  onNavigate?: () => void
}) {
  return (
    <div className="space-y-3 text-sm leading-6 break-words">
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h3 className="font-semibold">{children}</h3>,
          h2: ({ children }) => <h3 className="font-semibold">{children}</h3>,
          h3: ({ children }) => <h3 className="font-semibold">{children}</h3>,
          ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1 pl-5">{children}</ol>
          ),
          a: ({ href, children }) =>
            href ? (
              <Link
                href={href}
                onClick={onNavigate}
                className="text-sidebar-primary underline underline-offset-4 hover:no-underline dark:text-chart-2"
              >
                {children}
              </Link>
            ) : (
              <>{children}</>
            ),
        }}
      >
        {inlineCitations(content, citations)}
      </ReactMarkdown>
    </div>
  )
}

export function WikiChat({
  className,
  queuedPrompt,
  initialDraft = "",
  draftRequest,
  autoFocus = false,
  onQueuedPromptConsumed,
  onNavigate,
}: {
  className?: string
  queuedPrompt?: string | null
  initialDraft?: string
  draftRequest?: { value: string }
  autoFocus?: boolean
  onQueuedPromptConsumed?: () => void
  onNavigate?: () => void
}) {
  const [threadId, setThreadId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [input, setInput] = React.useState(initialDraft)
  const [file, setFile] = React.useState<File | null>(null)
  const [fileError, setFileError] = React.useState("")
  const fileInput = React.useRef<HTMLInputElement>(null)
  const composer = React.useRef<HTMLTextAreaElement>(null)
  const threadView = React.useRef<HTMLDivElement>(null)
  const [pending, setPending] = React.useState(false)
  const [loadingHistory, setLoadingHistory] = React.useState(true)
  const search = useMiloSearch(input, pending || loadingHistory)
  const searchRequests = React.useRef(new Set<AbortController>())
  const consumedPromptRef = React.useRef<string | null>(null)
  const isMountedRef = React.useRef(false)

  React.useEffect(() => {
    if (draftRequest) setInput(draftRequest.value)
  }, [draftRequest])

  React.useEffect(() => {
    if (
      autoFocus &&
      !pending &&
      !loadingHistory &&
      document.activeElement?.getAttribute("aria-label") === "Close"
    ) {
      composer.current?.focus()
    }
  }, [autoFocus, loadingHistory, pending])

  React.useEffect(() => {
    if (threadView.current)
      threadView.current.scrollTop = threadView.current.scrollHeight
  }, [messages.length])

  React.useEffect(() => {
    isMountedRef.current = true
    const requests = searchRequests.current
    return () => {
      isMountedRef.current = false
      for (const controller of requests) controller.abort()
      requests.clear()
    }
  }, [])

  React.useEffect(() => {
    let active = true
    async function restoreThread() {
      try {
        const saved = localStorage.getItem(activeThreadKey)
        if (!saved) return
        const response = await fetch(
          `/api/wiki/chat?threadId=${encodeURIComponent(saved)}`
        )
        if (!response.ok) {
          if (response.status === 403 || response.status === 404) {
            localStorage.removeItem(activeThreadKey)
          }
          return
        }
        const data = await response.json()
        if (active && Array.isArray(data.messages)) {
          setThreadId(saved)
          setMessages(
            data.messages
              .filter(
                (message: ChatMessage) =>
                  message.role === "user" || message.role === "assistant"
              )
              .map((message: ChatMessage) => ({
                ...message,
                serverId: message.id,
                cards: Array.isArray(message.cards)
                  ? message.cards.map(displayCard)
                  : [],
              }))
          )
        }
      } catch {
        // A failed restore should not prevent a new conversation.
      } finally {
        if (active) setLoadingHistory(false)
      }
    }
    void restoreThread()
    return () => {
      active = false
    }
  }, [])

  const sendQuestion = React.useCallback(
    async (questionValue: string, attachment?: File | null) => {
      const question = questionValue.trim()
      if (
        (!question && !attachment) ||
        pending ||
        question.length > MILO_SOURCE_MAX_CHARS
      ) {
        return
      }

      const matchingQuery = searchableQuery(questionValue)
      const cachedResults =
        search.completed && search.query === matchingQuery
          ? search.results
          : null
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: question || attachment?.name || "",
      }
      const assistantId = crypto.randomUUID()
      setMessages((current) => [
        ...current,
        userMessage,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          matchingPages: cachedResults ?? [],
        },
      ])
      setPending(true)

      try {
        const form = attachment ? new FormData() : null
        if (form && attachment) {
          form.set("message", question)
          if (threadId) form.set("threadId", threadId)
          form.set("file", attachment)
        }
        const chatRequest = fetch("/api/wiki/chat", {
          method: "POST",
          ...(form
            ? { body: form }
            : {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ threadId, message: question }),
              }),
        })

        if (matchingQuery && !cachedResults) {
          const controller = new AbortController()
          searchRequests.current.add(controller)
          void fetchMiloResults(matchingQuery, controller.signal)
            .then((results) => {
              if (!controller.signal.aborted && isMountedRef.current) {
                setMessages((current) =>
                  current.map((message) =>
                    message.id === assistantId
                      ? { ...message, matchingPages: results }
                      : message
                  )
                )
              }
            })
            .catch(() => {})
            .finally(() => searchRequests.current.delete(controller))
        }
        const response = await chatRequest
        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string
          } | null
          throw new Error(payload?.error ?? "Chat request failed.")
        }

        setInput("")
        setFile(null)
        setFileError("")
        if (fileInput.current) fileInput.current.value = ""
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

            const data = JSON.parse(line.slice(6)) as MiloStreamEvent
            if (data.type === "meta") {
              setThreadId(data.threadId)
              try {
                localStorage.setItem(activeThreadKey, data.threadId)
              } catch {
                /* Storage is optional. */
              }
            }
            if (data.type === "card") {
              const event = cardEventSchema.safeParse(data)
              if (event.success) {
                setMessages((current) =>
                  current.map((message) =>
                    message.id === assistantId
                      ? {
                          ...message,
                          serverId: event.data.messageId,
                          cards: [
                            ...(message.cards ?? []),
                            displayCard(event.data.card),
                          ],
                        }
                      : message
                  )
                )
              }
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
                    ? {
                        ...message,
                        citations: data.citations,
                        abstained: data.abstained,
                        serverId: data.assistantMessageId ?? message.serverId,
                      }
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
    [pending, threadId, search.completed, search.query, search.results]
  )

  React.useEffect(() => {
    const prompt = queuedPrompt?.trim()
    if (!prompt) {
      consumedPromptRef.current = null
      return
    }
    if (pending || loadingHistory || consumedPromptRef.current === prompt) {
      return
    }

    consumedPromptRef.current = prompt
    onQueuedPromptConsumed?.()
    void sendQuestion(prompt)
  }, [
    loadingHistory,
    onQueuedPromptConsumed,
    pending,
    queuedPrompt,
    sendQuestion,
  ])

  function askQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendQuestion(input, file)
  }

  const answers = messages.filter((message) => message.role === "assistant")
  const questions = answers.map(
    (answer) => messages[messages.indexOf(answer) - 1]
  )
  async function flagAnswer(answer: ChatMessage, reason: string) {
    if (!answer.serverId || flagPending) return
    setFlagPending(true)
    try {
      const response = await fetch("/api/wiki/chat/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantMessageId: answer.serverId,
          reason,
        }),
      })
      if (!response.ok && response.status !== 409)
        throw new Error("Could not share feedback. Please try again.")
      setMessages((current) =>
        current.map((item) =>
          item.id === answer.id ? { ...item, flagged: true } : item
        )
      )
      setShareAnswer(null)
      setShareReason("")
      setFlagError("")
    } catch {
      setFlagError("Could not share feedback. Please try again.")
    } finally {
      setFlagPending(false)
    }
  }
  const [flagError, setFlagError] = React.useState("")
  const [flagPending, setFlagPending] = React.useState(false)
  const [shareAnswer, setShareAnswer] = React.useState<string | null>(null)
  const [shareReason, setShareReason] = React.useState("")
  const [ratingPending, setRatingPending] = React.useState<string | null>(null)

  async function rateAnswer(answer: ChatMessage, rating: "up" | "down") {
    if (!answer.serverId || ratingPending) return
    setRatingPending(answer.id)
    try {
      const response = await fetch("/api/wiki/chat/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantMessageId: answer.serverId, rating }),
      })
      if (!response.ok) throw new Error()
      setMessages((current) =>
        current.map((item) =>
          item.id === answer.id ? { ...item, rating } : item
        )
      )
    } catch {
      toast.error("Could not save feedback. Please try again.")
    } finally {
      setRatingPending(null)
    }
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div
        ref={threadView}
        className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
      >
        {answers.length ? (
          <div className="space-y-6">
            {answers.map((answer, index) => (
              <section key={answer.id}>
                {questions[index]?.role === "user" ? (
                  <div className="mb-6">
                    <h3 className="mb-1 text-sm font-medium text-muted-foreground">
                      Your question
                    </h3>
                    <p className="text-sm leading-6 font-medium break-words whitespace-pre-wrap">
                      {questions[index].content}
                    </p>
                  </div>
                ) : null}
                {(() => {
                  const renderedAnswer = inlineCitations(
                    answer.content,
                    answer.citations ?? []
                  )
                  const links = new Set(
                    Array.from(
                      renderedAnswer.matchAll(/\]\(([^\s)]+)\)/g),
                      (match) => match[1]
                    )
                  )
                  const matches = (answer.matchingPages ?? []).filter(
                    (result) => !links.has(result.url)
                  )
                  return matches.length ? (
                    <div className="mb-4 text-sm">
                      <h3 className="mb-1 font-medium text-muted-foreground">
                        Matching pages
                      </h3>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {matches.map((result) => (
                          <Link
                            key={`${result.type}-${result.id}`}
                            href={result.url}
                            onClick={onNavigate}
                            className="text-sidebar-primary underline underline-offset-4 hover:no-underline dark:text-chart-2"
                          >
                            {result.title}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null
                })()}
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  {index ? "Follow-up answer" : "Answer"}
                </h3>
                <div aria-live="polite">
                  {pending && !answer.content && !answer.cards?.length ? (
                    <div
                      className="flex h-12 items-center"
                      aria-label="Milo is thinking"
                    >
                      <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                      <span className="sr-only">Loading answer</span>
                    </div>
                  ) : answer.content &&
                    !answer.cards?.some(
                      (card) =>
                        card.type === "error" && card.message === answer.content
                    ) ? (
                    <MessageContent
                      content={answer.content}
                      citations={answer.citations}
                      onNavigate={onNavigate}
                    />
                  ) : null}
                </div>
                <div
                  aria-live="polite"
                  className={cn(answer.cards?.length && "mt-3 space-y-3")}
                >
                  {answer.cards?.map((card, cardIndex) => (
                    <WikiChatCard
                      key={cardIndex}
                      card={card}
                      threadId={threadId}
                      messageId={answer.serverId}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
                {answer.abstained && !pending ? (
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        answer.flagged || !answer.serverId || flagPending
                      }
                      onClick={() =>
                        void flagAnswer(
                          answer,
                          "Milo could not find an answer in the wiki."
                        )
                      }
                    >
                      {answer.flagged ? "Gap flagged" : "Flag this gap"}
                    </Button>
                    {!answer.flagged ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Shares your question and answer with wiki managers.
                      </p>
                    ) : null}
                    {flagError ? (
                      <p role="alert" className="mt-2 text-sm text-destructive">
                        {flagError}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {!pending && answer.serverId ? (
                  <div className="mt-3 flex items-center gap-1">
                    <Button
                      type="button"
                      variant={answer.rating === "up" ? "secondary" : "ghost"}
                      size="icon"
                      aria-label="Helpful answer"
                      aria-pressed={answer.rating === "up"}
                      disabled={ratingPending !== null}
                      onClick={() => void rateAnswer(answer, "up")}
                    >
                      <ThumbsUpIcon />
                    </Button>
                    <Button
                      type="button"
                      variant={answer.rating === "down" ? "secondary" : "ghost"}
                      size="icon"
                      aria-label="Unhelpful answer"
                      aria-pressed={answer.rating === "down"}
                      disabled={ratingPending !== null}
                      onClick={() => void rateAnswer(answer, "down")}
                    >
                      <ThumbsDownIcon />
                    </Button>
                    {answer.rating ? (
                      <span
                        className="text-sm text-muted-foreground"
                        role="status"
                      >
                        Thanks for your feedback
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {!pending && answer.rating === "down" && !answer.flagged ? (
                  <div className="mt-2 space-y-2 text-sm">
                    <p>Want to tell the wiki managers what went wrong?</p>
                    {shareAnswer === answer.id ? (
                      <div className="space-y-2">
                        <p className="text-muted-foreground">
                          Sharing sends your question, Milo&apos;s answer, and
                          your reason to wiki managers.
                        </p>
                        <label
                          htmlFor={`milo-reason-${answer.id}`}
                          className="font-medium"
                        >
                          What went wrong?
                        </label>
                        <textarea
                          id={`milo-reason-${answer.id}`}
                          value={shareReason}
                          maxLength={2000}
                          rows={3}
                          className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                          onChange={(event) =>
                            setShareReason(event.target.value)
                          }
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={!shareReason.trim() || flagPending}
                            onClick={() =>
                              void flagAnswer(answer, shareReason.trim())
                            }
                          >
                            Share feedback
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setShareAnswer(null)
                              setShareReason("")
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                        {flagError ? (
                          <p role="alert" className="text-destructive">
                            {flagError}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShareAnswer(answer.id)
                          setShareReason("")
                          setFlagError("")
                        }}
                      >
                        Tell managers
                      </Button>
                    )}
                  </div>
                ) : null}
                {answer.flagged && !answer.abstained ? (
                  <p
                    className="mt-2 text-sm text-muted-foreground"
                    role="status"
                  >
                    Shared with wiki managers
                  </p>
                ) : null}
              </section>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ask a question, or paste or attach source material to extract wiki
            changes.
          </p>
        )}
      </div>

      <form onSubmit={askQuestion} className="border-t p-4">
        <MiloSearchResults search={search} onNavigate={() => setInput("")} />
        {file ? (
          <div className="mb-2 flex items-center gap-2 text-sm">
            <span className="min-w-0 truncate">{file.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setFile(null)
                if (fileInput.current) fileInput.current.value = ""
              }}
            >
              Remove
            </Button>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <input
            ref={fileInput}
            type="file"
            className="sr-only"
            tabIndex={-1}
            accept=".eml,.txt,.pdf,.docx"
            onChange={(event) => {
              const selected = event.currentTarget.files?.[0] ?? null
              if (selected && !/\.(?:eml|txt|pdf|docx)$/i.test(selected.name)) {
                setFileError("Choose an .eml, .txt, .pdf, or .docx file.")
                setFile(null)
              } else if (selected && selected.size > MILO_FILE_MAX_BYTES) {
                setFileError("File is too large. Choose a file under 5 MB.")
                setFile(null)
              } else {
                setFileError("")
                setFile(selected)
              }
              event.currentTarget.value = ""
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={pending || loadingHistory}
            onClick={() => fileInput.current?.click()}
            aria-label="Attach a file"
          >
            <PaperclipIcon />
          </Button>
          <textarea
            ref={composer}
            value={input}
            onChange={(event) => {
              search.clearSelection()
              setInput(event.currentTarget.value)
            }}
            onKeyDown={(event) => {
              if (search.onKeyDown(event)) {
                if (event.key === "Enter") setInput("")
                return
              }
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                void sendQuestion(input, file)
              }
            }}
            {...search.inputProps}
            rows={Math.min(8, Math.max(1, input.split("\n").length))}
            placeholder="Ask a question or paste source text"
            aria-label="Ask a follow-up"
            disabled={pending || loadingHistory}
            className="field-sizing-content max-h-40 min-h-10 min-w-0 flex-1 resize-y rounded-lg border bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button
            type="submit"
            size="sm"
            disabled={
              pending ||
              loadingHistory ||
              (!input.trim() && !file) ||
              input.length > MILO_SOURCE_MAX_CHARS
            }
            className="cursor-pointer"
          >
            <SendIcon />
            <span className="sr-only">Send follow-up</span>
          </Button>
        </div>
        {input.length > MILO_SOURCE_MAX_CHARS ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            Text is too long. Use 100,000 characters or fewer.
          </p>
        ) : null}
        {fileError ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {fileError}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">
          Attach .eml, .txt, .pdf, or .docx (up to 5 MB).
        </p>
      </form>
    </div>
  )
}
