"use client"

import * as React from "react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import {
  Loader2Icon,
  FileTextIcon,
  PaperclipIcon,
  SendIcon,
  SquareIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  MILO_FILE_MAX_BYTES,
  MILO_SOURCE_MAX_CHARS,
} from "@/lib/milo/source-limits"
import { WikiChatCard } from "@/components/wiki/wiki-chat-card"
import {
  cardEventSchema,
  displayCard,
  type DisplayCard,
  type MiloStreamEvent,
} from "@/lib/milo/chat-cards"
import { cn } from "@/lib/utils"
import { inlineCitations, isWikiTagUrl } from "@/lib/milo/inline-citations"

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
  status?: string
  stopped?: boolean
  error?: boolean
  replyTo?: string
  trustedLinks?: boolean
  retryQuestion?: string
  retryFile?: File | null
}

const activeThreadKey = "milo-active-thread"
const disclaimer =
  "Milo can make mistakes. Check the linked page. Don't paste borrower information."

function Sources({
  citations,
  onNavigate,
}: {
  citations: Citation[]
  onNavigate?: () => void
}) {
  const [now, setNow] = React.useState<number | null>(null)
  const [expanded, setExpanded] = React.useState(false)
  React.useEffect(() => {
    queueMicrotask(() => setNow(Date.now()))
  }, [])
  const unique = [
    ...new Map(
      citations
        .filter(
          (citation) =>
            citation.url && !/^\/wiki\/tags(?:[?#]|$)/i.test(citation.url)
        )
        .map((citation) => [citation.url, citation])
    ).values(),
  ]
  if (!unique.length) return null
  return (
    <div className="mt-3 space-y-1.5" aria-label="Sources">
      <p className="text-xs font-medium text-muted-foreground">Sources</p>
      <div className="flex flex-wrap gap-1.5">
        {(expanded ? unique : unique.slice(0, 4)).map((citation) => {
          const age =
            citation.updatedAt && now !== null
              ? Math.floor(
                  (now - new Date(citation.updatedAt).getTime()) / 86400000
                )
              : NaN
          return (
            <Link
              key={citation.url}
              href={citation.url!}
              onClick={onNavigate}
              className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <FileTextIcon className="size-3 shrink-0" aria-hidden="true" />
              <span className="max-w-36 truncate">{citation.title}</span>
              {Number.isFinite(age) && age >= 0 ? (
                <span className="text-muted-foreground">
                  · updated{" "}
                  {age === 0
                    ? "today"
                    : `${age} ${age === 1 ? "day" : "days"} ago`}
                </span>
              ) : null}
            </Link>
          )
        })}
        {unique.length > 4 && !expanded ? (
          <button
            type="button"
            className="self-center rounded text-xs text-muted-foreground underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`Show ${unique.length - 4} more sources`}
            onClick={() => setExpanded(true)}
          >
            +{unique.length - 4} more
          </button>
        ) : null}
      </div>
    </div>
  )
}
function MessageContent({
  content,
  citations = [],
  onNavigate,
  trustedLinks,
}: {
  content: string
  citations?: Citation[]
  onNavigate?: () => void
  trustedLinks?: boolean
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
            href &&
            ((trustedLinks && !isWikiTagUrl(href)) ||
              citations.some(
                (citation) =>
                  citation.url === href || citation.url?.split("#")[0] === href
              )) ? (
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
  pageContext,
  onRemovePage,
  firstName,
}: {
  className?: string
  queuedPrompt?: string | null
  initialDraft?: string
  draftRequest?: { value: string }
  autoFocus?: boolean
  onQueuedPromptConsumed?: () => void
  onNavigate?: () => void
  pageContext?: { pageId: string; title: string } | null
  onRemovePage?: () => void
  firstName?: string
}) {
  const [threadId, setThreadId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [input, setInput] = React.useState(initialDraft)
  const [file, setFile] = React.useState<File | null>(null)
  const [fileError, setFileError] = React.useState("")
  const fileInput = React.useRef<HTMLInputElement>(null)
  const composer = React.useRef<HTMLTextAreaElement>(null)
  const threadView = React.useRef<HTMLDivElement>(null)
  const nearBottom = React.useRef(true)
  const activeRequest = React.useRef<AbortController | null>(null)
  const [pending, setPending] = React.useState(false)
  const [loadingHistory, setLoadingHistory] = React.useState(true)
  const [restoreError, setRestoreError] = React.useState(false)
  const consumedPromptRef = React.useRef<string | null>(null)
  const isMountedRef = React.useRef(false)

  React.useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

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
    if (threadView.current && nearBottom.current)
      threadView.current.scrollTop = threadView.current.scrollHeight
  }, [messages])

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
          } else if (active) {
            setRestoreError(true)
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
        if (active) setRestoreError(true)
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
          retryQuestion: question,
          retryFile: attachment,
        },
      ])
      setInput("")
      setFile(null)
      setFileError("")
      if (fileInput.current) fileInput.current.value = ""
      const abortController = new AbortController()
      activeRequest.current = abortController
      let sentThreadId = threadId
      let sentUserId: string | undefined
      let completed = false
      let timedOut = false
      const timeout = setTimeout(() => {
        timedOut = true
        abortController.abort()
      }, 60_000)
      setPending(true)

      try {
        const form = attachment ? new FormData() : null
        if (form && attachment) {
          form.set("message", question)
          if (threadId) form.set("threadId", threadId)
          form.set("file", attachment)
          if (pageContext)
            form.set(
              "pageContext",
              JSON.stringify({ pageId: pageContext.pageId })
            )
        }
        const chatRequest = fetch("/api/wiki/chat", {
          method: "POST",
          signal: abortController.signal,
          ...(form
            ? { body: form }
            : {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  threadId,
                  message: question,
                  ...(pageContext
                    ? { pageContext: { pageId: pageContext.pageId } }
                    : {}),
                }),
              }),
        })

        const response = await chatRequest
        if (!response.ok || !response.body) {
          throw new Error("Chat request failed.")
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

            const data = JSON.parse(line.slice(6)) as MiloStreamEvent
            if (data.type === "meta") {
              sentThreadId = data.threadId
              sentUserId = data.userMessageId
              setThreadId(data.threadId)
              try {
                localStorage.setItem(activeThreadKey, data.threadId)
              } catch {
                /* Storage is optional. */
              }
            }
            if (data.type === "status") {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId
                    ? { ...message, status: data.text }
                    : message
                )
              )
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
                          error:
                            (event.data.card as { type?: string })?.type ===
                            "error",
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
              completed = true
              setThreadId(data.threadId)
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId
                    ? {
                        ...message,
                        citations: data.citations,
                        content: data.answer ?? message.content,
                        abstained: data.abstained,
                        trustedLinks: data.trustedLinks,
                        error: data.error ?? message.error,
                        serverId: data.assistantMessageId ?? message.serverId,
                      }
                    : message
                )
              )
            }
          }
        }
        if (!completed) throw new Error("Chat stream ended unexpectedly.")
      } catch {
        if (isMountedRef.current) {
          const stopped = abortController.signal.aborted && !timedOut
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    ...(stopped
                      ? { stopped: true }
                      : {
                          content: timedOut
                            ? "Milo took too long. Please try again."
                            : "Milo couldn't answer right now. Please try again.",
                          error: true,
                        }),
                  }
                : message
            )
          )
          if (stopped && sentThreadId && sentUserId) {
            const stoppedThread = sentThreadId
            const stoppedUser = sentUserId
            // The server persists after the disconnected stream has closed.
            void (async () => {
              for (let attempt = 0; attempt < 8; attempt++) {
                await new Promise((resolve) => setTimeout(resolve, 250))
                if (!isMountedRef.current) break
                try {
                  const response = await fetch(
                    `/api/wiki/chat?threadId=${encodeURIComponent(stoppedThread)}`
                  )
                  if (!response.ok) continue
                  const data = (await response.json()) as {
                    messages?: ChatMessage[]
                  }
                  const saved = data.messages?.find(
                    (item) => item.replyTo === stoppedUser && item.stopped
                  )
                  if (saved?.role === "assistant" && saved.stopped) {
                    if (isMountedRef.current)
                      setMessages((current) =>
                        current.map((item) =>
                          item.id === assistantId
                            ? { ...item, serverId: saved.id }
                            : item
                        )
                      )
                    break
                  }
                } catch {
                  /* A later reload can recover the saved message. */
                }
              }
            })()
          }
        }
      } finally {
        clearTimeout(timeout)
        if (isMountedRef.current) {
          if (activeRequest.current === abortController) {
            activeRequest.current = null
            setPending(false)
          }
        }
      }
    },
    [pending, threadId, pageContext]
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
        onScroll={(event) => {
          const el = event.currentTarget
          nearBottom.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
      >
        {restoreError ? (
          <div role="alert" className="mb-4 text-sm text-muted-foreground">
            <p>
              Couldn&apos;t load the previous chat. Reload to try again, or
              start a new question.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => window.location.reload()}
            >
              Reload
            </Button>
          </div>
        ) : null}
        {messages.length ? (
          <div className="space-y-6">
            {messages.map((answer, index) =>
              answer.role === "user" ? (
                <div key={answer.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm leading-6 break-words whitespace-pre-wrap">
                    {answer.content}
                  </p>
                </div>
              ) : (
                <section key={answer.id}>
                  <div className="flex items-start gap-3">
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm"
                      aria-label="Milo"
                    >
                      ✦
                    </span>
                    <div className="min-w-0 flex-1">
                      <div aria-live="polite">
                        {pending &&
                        index === messages.length - 1 &&
                        !answer.content &&
                        !answer.cards?.length ? (
                          <div className="flex min-h-7 items-center gap-2 text-sm text-muted-foreground">
                            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                            <span>{answer.status || "Thinking…"}</span>
                          </div>
                        ) : answer.content &&
                          !answer.cards?.some(
                            (card) =>
                              card.type === "error" &&
                              card.message === answer.content
                          ) ? (
                          <MessageContent
                            content={answer.content}
                            citations={answer.citations}
                            onNavigate={onNavigate}
                            trustedLinks={answer.trustedLinks}
                          />
                        ) : null}
                      </div>
                      {answer.stopped ? (
                        <p
                          role="status"
                          className="mt-2 text-xs text-muted-foreground"
                        >
                          Stopped. Ask another question to continue.
                        </p>
                      ) : null}
                      {answer.error && !pending ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => {
                            const previous = messages[index - 1]
                            if (
                              answer.retryQuestion !== undefined ||
                              answer.retryFile
                            )
                              void sendQuestion(
                                answer.retryQuestion ?? "",
                                answer.retryFile
                              )
                            else if (previous?.role === "user")
                              void sendQuestion(previous.content)
                          }}
                        >
                          Retry
                        </Button>
                      ) : null}
                      <Sources
                        citations={answer.citations ?? []}
                        onNavigate={onNavigate}
                      />
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
                              Shares your question and answer with wiki
                              managers.
                            </p>
                          ) : null}
                          {flagError ? (
                            <p
                              role="alert"
                              className="mt-2 text-sm text-destructive"
                            >
                              {flagError}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {!pending && answer.serverId && !answer.error ? (
                        <div className="mt-3 flex items-center gap-1">
                          <Button
                            type="button"
                            variant={
                              answer.rating === "up" ? "secondary" : "ghost"
                            }
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
                            variant={
                              answer.rating === "down" ? "secondary" : "ghost"
                            }
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
                      {!pending &&
                      answer.rating === "down" &&
                      !answer.flagged ? (
                        <div className="mt-2 space-y-2 text-sm">
                          <p>Want to tell the wiki managers what went wrong?</p>
                          {shareAnswer === answer.id ? (
                            <div className="space-y-2">
                              <p className="text-muted-foreground">
                                Sharing sends your question, Milo&apos;s answer,
                                and your reason to wiki managers.
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
                    </div>
                  </div>
                </section>
              )
            )}
          </div>
        ) : !loadingHistory ? (
          <div className="space-y-4">
            <p className="text-base font-medium">
              {firstName ? `Hi, ${firstName}.` : "Hi."} How can I help?
            </p>
            <div className="flex flex-col items-start gap-2">
              {(pageContext
                ? [
                    "Summarize this page",
                    "What are the key steps on this page?",
                    `Who do I ask about ${pageContext.title.length > 45 ? `${pageContext.title.slice(0, 42)}…` : pageContext.title}?`,
                  ]
                : [
                    "Find a wiki page",
                    "Who is my branch manager?",
                    "Where do I find the latest newsletter?",
                  ]
              ).map((prompt) => (
                <Button
                  key={prompt}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-auto max-w-full justify-start text-left whitespace-normal"
                  disabled={pending}
                  onClick={() => void sendQuestion(prompt, file)}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <form onSubmit={askQuestion} className="border-t p-4">
        {pageContext ? (
          <div className="mb-2 inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs">
            <span className="truncate">About: {pageContext.title}</span>
            <button
              type="button"
              className="ml-1 rounded-sm px-1 text-base leading-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Remove ${pageContext.title} page context`}
              onClick={onRemovePage}
            >
              ×
            </button>
          </div>
        ) : null}
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
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
              </TooltipTrigger>
              <TooltipContent>
                Attach .eml, .txt, .pdf, or .docx (up to 5 MB).
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <textarea
            ref={composer}
            value={input}
            onChange={(event) => {
              setInput(event.currentTarget.value)
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                void sendQuestion(input, file)
              }
            }}
            rows={Math.min(6, Math.max(1, input.split("\n").length))}
            placeholder="Ask a question or paste source text"
            aria-label="Ask a follow-up"
            disabled={pending || loadingHistory}
            className="field-sizing-content max-h-40 min-h-10 min-w-0 flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button
            type={pending ? "button" : "submit"}
            size="icon"
            aria-label={pending ? "Stop" : "Send follow-up"}
            onClick={
              pending
                ? () => {
                    activeRequest.current?.abort()
                    setPending(false)
                  }
                : undefined
            }
            disabled={
              loadingHistory ||
              (!pending &&
                ((!input.trim() && !file) ||
                  input.length > MILO_SOURCE_MAX_CHARS))
            }
            className="cursor-pointer"
          >
            {pending ? <SquareIcon /> : <SendIcon />}
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
        <p className="mt-2 text-xs text-muted-foreground">{disclaimer}</p>
      </form>
    </div>
  )
}
