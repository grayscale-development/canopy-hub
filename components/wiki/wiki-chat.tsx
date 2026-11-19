"use client"

import * as React from "react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import {
  Loader2Icon,
  FileTextIcon,
  ArrowLeftIcon,
  ArrowDownIcon,
  Trash2Icon,
  PaperclipIcon,
  SendIcon,
  SquareIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
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

interface ChatThread {
  id: string
  title: string | null
  updatedAt: string
}

export interface WikiChatHandle {
  newChat: () => void
  showHistory: () => void
}

function relativeTime(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ""
  const elapsed = Math.max(0, Date.now() - date.getTime())
  if (elapsed < 60_000) return "Just now"
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`
  const today = new Date()
  const yesterday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - 1
  )
  if (date >= yesterday) return "Yesterday"
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  })
}

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
  stopRequested?: boolean
  error?: boolean
  replyTo?: string
  trustedLinks?: boolean
  retryQuestion?: string
  retryFile?: File | null
}

const activeThreadKey = "milo-active-thread"
const disclaimer = "Milo can make mistakes. Don't paste borrower info."
const feedbackReasons = [
  "Wrong or outdated",
  "Missing information",
  "Wrong link",
  "Other",
] as const

function subscribePhone(callback: () => void) {
  const media = window.matchMedia("(max-width: 639px)")
  media.addEventListener("change", callback)
  return () => media.removeEventListener("change", callback)
}

function isPhone() {
  return window.matchMedia("(max-width: 639px)").matches
}

function serverIsPhone() {
  return false
}

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
  ref,
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
  ref?: React.Ref<WikiChatHandle>
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
  const [view, setView] = React.useState<"chat" | "history">("chat")
  const [threads, setThreads] = React.useState<ChatThread[]>([])
  const [listState, setListState] = React.useState<
    "loading" | "ready" | "error"
  >("loading")
  const [confirmId, setConfirmId] = React.useState<string | null>(null)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const [historyStatus, setHistoryStatus] = React.useState("")
  // A fresh object requests the same thread again; null cancels a pending load.
  const [loadTarget, setLoadTarget] = React.useState<{ id?: string } | null>({})
  const backButton = React.useRef<HTMLButtonElement>(null)
  const confirmButton = React.useRef<HTMLButtonElement>(null)
  const deleteButtons = React.useRef(new Map<string, HTMLButtonElement>())
  const listVersion = React.useRef(0)
  const loadVersion = React.useRef(0)
  const activeThread = React.useRef<string | null>(null)
  const [threadId, setThreadId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [input, setInput] = React.useState(initialDraft)
  const phone = React.useSyncExternalStore(
    subscribePhone,
    isPhone,
    serverIsPhone
  )
  const [file, setFile] = React.useState<File | null>(null)
  const [fileError, setFileError] = React.useState("")
  const fileInput = React.useRef<HTMLInputElement>(null)
  const composer = React.useRef<HTMLTextAreaElement>(null)
  const threadView = React.useRef<HTMLDivElement>(null)
  const scrollbar = React.useRef<HTMLDivElement>(null)
  const scrollbarDrag = React.useRef<{
    pointerId: number
    offset: number
  } | null>(null)
  const [scrollMetrics, setScrollMetrics] = React.useState({
    height: 0,
    content: 0,
    top: 0,
  })
  const measureScroll = React.useCallback(() => {
    const el = threadView.current
    if (!el) return
    const next = {
      height: el.clientHeight,
      content: el.scrollHeight,
      top: el.scrollTop,
    }
    setScrollMetrics((old) =>
      old.height === next.height &&
      old.content === next.content &&
      old.top === next.top
        ? old
        : next
    )
  }, [])
  const nearBottom = React.useRef(true)
  const [showJump, setShowJump] = React.useState(false)
  const [scrolling, setScrolling] = React.useState(false)
  const scrollTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const smoothNext = React.useRef(false)
  const programmaticScroll = React.useRef(false)
  const pinToBottom = React.useCallback(
    (smooth = false) => {
      nearBottom.current = true
      setShowJump(false)
      smoothNext.current = smooth
    },
    [setShowJump]
  )
  const activeRequest = React.useRef<AbortController | null>(null)
  const activeStop = React.useRef<(() => void) | null>(null)
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
    if (!draftRequest) return
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setView("chat")
      setInput(draftRequest.value)
    })
    return () => {
      active = false
    }
  }, [draftRequest])

  React.useEffect(() => {
    if (confirmId) confirmButton.current?.focus()
  }, [confirmId])

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

  React.useLayoutEffect(() => {
    const el = threadView.current
    if (!el || !nearBottom.current || view !== "chat") return
    if (
      smoothNext.current &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
      typeof el.scrollTo === "function"
    ) {
      programmaticScroll.current = true
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    } else {
      el.scrollTop = el.scrollHeight
    }
    smoothNext.current = false
    measureScroll()
  }, [messages, view, measureScroll])

  React.useEffect(() => {
    const el = threadView.current
    if (!el || view !== "chat") return
    const observer = new ResizeObserver(measureScroll)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => observer.disconnect()
  }, [view, messages.length, measureScroll])

  React.useEffect(
    () => () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current)
    },
    []
  )

  React.useEffect(() => {
    let active = true
    const version = loadVersion.current
    async function restoreThread() {
      if (!loadTarget) return
      try {
        const saved = loadTarget.id ?? localStorage.getItem(activeThreadKey)
        if (!saved) return
        const response = await fetch(
          `/api/wiki/chat?threadId=${encodeURIComponent(saved)}`
        )
        if (!active || version !== loadVersion.current) return
        if (!response.ok) {
          if (response.status === 403 || response.status === 404) {
            localStorage.removeItem(activeThreadKey)
            activeThread.current = null
            setThreadId(null)
          } else if (active) {
            setRestoreError(true)
          }
          return
        }
        const data = await response.json()
        if (
          active &&
          version === loadVersion.current &&
          Array.isArray(data.messages)
        ) {
          activeThread.current = saved
          setThreadId(saved)
          try {
            localStorage.setItem(activeThreadKey, saved)
          } catch {
            /* Storage is optional. */
          }
          setMessages(
            data.messages
              .filter(
                (message: ChatMessage) =>
                  message.role === "user" || message.role === "assistant"
              )
              .flatMap(
                (message: ChatMessage, index: number, all: ChatMessage[]) => {
                  if (
                    message.role === "assistant" &&
                    message.stopped &&
                    message.replyTo &&
                    all.some(
                      (item) =>
                        item.id === message.replyTo && item.stopRequested
                    )
                  )
                    return []
                  // Replies to a stopped question are placed right after it below.
                  if (
                    message.role === "assistant" &&
                    !message.stopped &&
                    message.replyTo &&
                    all.some(
                      (item) =>
                        item.id === message.replyTo && item.stopRequested
                    )
                  )
                    return []
                  const restore = (item: ChatMessage) => ({
                    ...item,
                    serverId: item.id,
                    cards: Array.isArray(item.cards)
                      ? item.cards.map(displayCard)
                      : [],
                  })
                  if (message.role === "user" && message.stopRequested) {
                    // A stop that reached the server after the answer was saved keeps
                    // the full answer; otherwise show the saved partial or the Stopped line.
                    const partial =
                      all.find(
                        (item) =>
                          item.role === "assistant" &&
                          !item.stopped &&
                          item.replyTo === message.id
                      ) ??
                      all.find(
                        (item) =>
                          item.role === "assistant" &&
                          item.stopped &&
                          item.replyTo === message.id
                      )
                    return [
                      restore(message),
                      partial
                        ? restore(partial)
                        : {
                            id: `stopped-${message.id}`,
                            role: "assistant" as const,
                            content: "",
                            stopped: true,
                          },
                    ]
                  }
                  return [restore(message)]
                }
              )
          )
        }
      } catch {
        if (active && version === loadVersion.current) setRestoreError(true)
      } finally {
        if (active && version === loadVersion.current) {
          setLoadingHistory(false)
          if (loadTarget.id)
            requestAnimationFrame(() => composer.current?.focus())
        }
      }
    }
    void restoreThread()
    return () => {
      active = false
    }
  }, [loadTarget])

  function stopActiveAnswer() {
    activeStop.current?.()
  }

  function newChat() {
    loadVersion.current++
    activeThread.current = null
    stopActiveAnswer()
    setLoadTarget(null)
    setLoadingHistory(false)
    setRestoreError(false)
    setThreadId(null)
    setMessages([])
    setInput("")
    setFile(null)
    setFileError("")
    setConfirmId(null)
    setView("chat")
    try {
      localStorage.removeItem(activeThreadKey)
    } catch {
      /* Storage is optional. */
    }
    requestAnimationFrame(() => composer.current?.focus())
  }

  async function loadList() {
    const version = ++listVersion.current
    setListState("loading")
    setConfirmId(null)
    try {
      const response = await fetch("/api/wiki/chat")
      if (!response.ok) throw new Error("Unable to load chats")
      const data = await response.json()
      if (!Array.isArray(data.threads)) throw new Error("Invalid response")
      if (version !== listVersion.current) return
      setThreads(data.threads)
      setListState("ready")
    } catch {
      if (version === listVersion.current) setListState("error")
    }
  }

  function showHistory() {
    setHistoryStatus("")
    setView("history")
    void loadList()
  }

  function openThread(id: string) {
    pinToBottom()
    loadVersion.current++
    activeThread.current = id
    stopActiveAnswer()
    setLoadingHistory(true)
    setRestoreError(false)
    setMessages([])
    setThreadId(id)
    setLoadTarget({ id })
    setView("chat")
  }

  async function deleteThread(id: string) {
    if (deletingId) return
    setDeletingId(id)
    setHistoryStatus("")
    try {
      const response = await fetch(
        `/api/wiki/chat?threadId=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      )
      if (!response.ok) throw new Error("Unable to delete")
      setThreads((current) => current.filter((thread) => thread.id !== id))
      setConfirmId(null)
      if (activeThread.current === id) {
        loadVersion.current++
        activeThread.current = null
        stopActiveAnswer()
        setLoadTarget(null)
        setLoadingHistory(false)
        setRestoreError(false)
        setThreadId(null)
        setMessages([])
        setInput("")
        setFile(null)
        setFileError("")
        try {
          localStorage.removeItem(activeThreadKey)
        } catch {
          /* Storage is optional. */
        }
      }
      setHistoryStatus("Chat deleted.")
      requestAnimationFrame(() => backButton.current?.focus())
    } catch {
      setHistoryStatus("Couldn't delete chat. Please try again.")
      requestAnimationFrame(() => confirmButton.current?.focus())
    } finally {
      setDeletingId(null)
    }
  }

  React.useImperativeHandle(ref, () => ({ newChat, showHistory }))

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

      pinToBottom(true)
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
      let stopRequested = false
      const finishStop = () => {
        if (!sentThreadId || !sentUserId) return
        void fetch("/api/wiki/chat/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: sentThreadId,
            userMessageId: sentUserId,
          }),
          keepalive: true,
        }).catch(() => {})
        abortController.abort()
      }
      const stop = () => {
        stopRequested = true
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId ? { ...message, stopped: true } : message
          )
        )
        setPending(false)
        finishStop()
      }
      activeStop.current = stop
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
              if (stopRequested) {
                finishStop()
                throw new DOMException("Aborted", "AbortError")
              }
              activeThread.current = data.threadId
              setThreadId(data.threadId)
              try {
                localStorage.setItem(activeThreadKey, data.threadId)
              } catch {
                /* Storage is optional. */
              }
            }
            if (stopRequested) continue
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
              activeThread.current = data.threadId
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
          const stopped =
            stopRequested || (abortController.signal.aborted && !timedOut)
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
            activeStop.current = null
            setPending(false)
          }
        }
      }
    },
    [pending, threadId, pageContext, pinToBottom]
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
    setView("chat")
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

  async function flagAnswer(
    answer: ChatMessage,
    reason: string,
    feedback = false
  ) {
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
      if (!response.ok) {
        if (response.status === 409) {
          setFlagError("This answer has already been shared with managers.")
          return
        }
        throw new Error("Could not share feedback. Please try again.")
      }
      setMessages((current) =>
        current.map((item) =>
          item.id === answer.id ? { ...item, flagged: true } : item
        )
      )
      setShareAnswer(null)
      setShareReason("")
      setShareMessage("")
      setFlagError("")
      if (feedback) toast.success("Thanks, managers will see this.")
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
  const [shareMessage, setShareMessage] = React.useState("")
  const [ratingStatus, setRatingStatus] = React.useState("")
  const ratingTrigger = React.useRef<HTMLButtonElement | null>(null)
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
      setRatingStatus(
        rating === "up" ? "Helpful rating saved." : "Unhelpful rating saved."
      )
    } catch {
      toast.error("Could not save feedback. Please try again.")
    } finally {
      setRatingPending(null)
    }
  }

  if (view === "history") {
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
        <p
          className={cn("text-sm", historyStatus ? "px-4 pt-3" : "sr-only")}
          role="status"
          aria-live="polite"
        >
          {historyStatus}
        </p>
        <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Back"
            ref={backButton}
            onClick={() => {
              setView("chat")
              requestAnimationFrame(() => composer.current?.focus())
            }}
          >
            <ArrowLeftIcon />
          </Button>
          <h3 className="font-semibold">Recent chats</h3>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {listState === "loading" ? (
            <div
              aria-label="Loading recent chats"
              role="status"
              className="space-y-2"
            >
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-16 animate-pulse rounded-lg bg-muted"
                />
              ))}
            </div>
          ) : listState === "error" ? (
            <div className="space-y-3 text-sm" role="alert">
              <p>Couldn&apos;t load recent chats. Please try again.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadList()}
              >
                Retry
              </Button>
            </div>
          ) : threads.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">No chats yet.</p>
          ) : (
            <ul className="divide-y">
              {threads.map((thread) => {
                const title = thread.title?.trim() || "Untitled chat"
                return (
                  <li
                    key={thread.id}
                    className="flex min-h-16 items-center gap-1 py-1"
                  >
                    <button
                      type="button"
                      onClick={() => openThread(thread.id)}
                      className="min-w-0 flex-1 rounded-md px-2 py-2 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="block truncate text-sm font-medium">
                        {title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {relativeTime(thread.updatedAt)}
                      </span>
                    </button>
                    {confirmId === thread.id ? (
                      <div className="flex shrink-0 items-center gap-1 text-xs">
                        <span>Delete?</span>
                        <Button
                          type="button"
                          variant="destructive"
                          ref={confirmButton}
                          size="xs"
                          disabled={deletingId !== null}
                          onClick={() => void deleteThread(thread.id)}
                        >
                          Delete
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          disabled={deletingId !== null}
                          onClick={() => {
                            setConfirmId(null)
                            requestAnimationFrame(() =>
                              deleteButtons.current.get(thread.id)?.focus()
                            )
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete chat ${title}`}
                        ref={(element) => {
                          if (element)
                            deleteButtons.current.set(thread.id, element)
                          else deleteButtons.current.delete(thread.id)
                        }}
                        disabled={deletingId !== null}
                        onClick={() => setConfirmId(thread.id)}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    )
  }

  const thumbHeight =
    scrollMetrics.content > scrollMetrics.height && scrollMetrics.height > 0
      ? Math.min(
          scrollMetrics.height,
          Math.max(
            24,
            (scrollMetrics.height * scrollMetrics.height) /
              scrollMetrics.content
          )
        )
      : 0
  const thumbTop =
    scrollMetrics.content > scrollMetrics.height
      ? ((scrollMetrics.height - thumbHeight) * scrollMetrics.top) /
        (scrollMetrics.content - scrollMetrics.height)
      : 0
  const moveScrollbar = (
    event: React.PointerEvent<HTMLDivElement>,
    offset: number
  ) => {
    const el = threadView.current
    const rect = scrollbar.current?.getBoundingClientRect()
    if (!el || !rect || rect.height <= thumbHeight) return
    const fraction = Math.max(
      0,
      Math.min(
        1,
        (event.clientY - rect.top - offset) / (rect.height - thumbHeight)
      )
    )
    el.scrollTop = fraction * (el.scrollHeight - el.clientHeight)
    measureScroll()
  }

  const FeedbackRoot = phone ? Sheet : Dialog
  const FeedbackContent = phone ? SheetContent : DialogContent
  const FeedbackTitle = phone ? SheetTitle : DialogTitle
  const selectedAnswer = messages.find((message) => message.id === shareAnswer)
  const closeFeedback = () => {
    setShareAnswer(null)
    setShareReason("")
    setShareMessage("")
    setFlagError("")
  }

  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-1 flex-col",
        scrolling && "is-scrolling",
        className
      )}
    >
      <span className="sr-only" role="status" aria-live="polite">
        {ratingStatus}
      </span>
      <FeedbackRoot
        open={!!shareAnswer}
        onOpenChange={(open) => !open && closeFeedback()}
      >
        <FeedbackContent
          {...(phone ? { side: "bottom" as const } : {})}
          showCloseButton={false}
          aria-describedby={undefined}
          className={cn(
            "max-h-[90dvh] overflow-y-auto p-5",
            phone
              ? "rounded-t-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))]"
              : "max-w-md"
          )}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (ratingTrigger.current && !ratingTrigger.current.disabled) {
              ratingTrigger.current.focus()
            } else {
              composer.current?.focus()
            }
          }}
          onEscapeKeyDown={(event) => {
            event.preventDefault()
            closeFeedback()
          }}
        >
          <FeedbackTitle>What went wrong?</FeedbackTitle>
          <span className="sr-only" role="status" aria-live="polite">
            {ratingStatus}
          </span>
          <p className="text-sm text-muted-foreground">
            Share your question and Milo&apos;s answer with managers.
          </p>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Optional reason"
          >
            {feedbackReasons.map((reason) => (
              <Button
                key={reason}
                type="button"
                variant={shareReason === reason ? "secondary" : "outline"}
                size="sm"
                className="rounded-full"
                aria-pressed={shareReason === reason}
                onClick={() =>
                  setShareReason(shareReason === reason ? "" : reason)
                }
              >
                {reason}
              </Button>
            ))}
          </div>
          <label
            htmlFor="milo-feedback-message"
            className="text-sm font-medium"
          >
            Tell managers more (optional)
          </label>
          <textarea
            id="milo-feedback-message"
            value={shareMessage}
            onChange={(event) => setShareMessage(event.target.value)}
            maxLength={1800}
            rows={3}
            className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:text-sm"
          />
          {flagError ? (
            <p role="alert" className="text-sm text-destructive">
              {flagError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={flagPending}
              onClick={closeFeedback}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                flagPending || ratingPending !== null || !selectedAnswer
              }
              onClick={() => {
                if (!selectedAnswer) return
                const reason = `Reason: ${shareReason || "Not specified"}\nMessage: ${shareMessage.trim() || "Not provided"}`
                void flagAnswer(selectedAnswer, reason, true)
              }}
            >
              Send to managers
            </Button>
          </div>
        </FeedbackContent>
      </FeedbackRoot>
      <div
        ref={threadView}
        role="region"
        aria-label="Chat messages"
        tabIndex={0}
        className={cn(
          "slim-scrollbar milo-overlay-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6",
          !messages.length &&
            !loadingHistory &&
            !restoreError &&
            "flex flex-col"
        )}
        onWheel={() => {
          programmaticScroll.current = false
        }}
        onTouchStart={() => {
          programmaticScroll.current = false
        }}
        onPointerDown={() => {
          programmaticScroll.current = false
        }}
        onKeyDown={() => {
          programmaticScroll.current = false
        }}
        onScroll={(event) => {
          const el = event.currentTarget
          const distance = el.scrollHeight - el.scrollTop - el.clientHeight
          if (distance <= 1) programmaticScroll.current = false
          if (!programmaticScroll.current) {
            nearBottom.current = distance <= 80
            setShowJump(!nearBottom.current)
          }
          measureScroll()
          setScrolling(true)
          if (scrollTimer.current) clearTimeout(scrollTimer.current)
          scrollTimer.current = setTimeout(() => setScrolling(false), 800)
        }}
      >
        {restoreError ? (
          <div role="alert" className="mb-4 text-sm text-muted-foreground">
            <p>Couldn&apos;t load this chat. Try again or start a new chat.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                setRestoreError(false)
                setLoadingHistory(true)
                setLoadTarget({ id: loadTarget?.id })
              }}
            >
              Retry
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
                  <div className="min-w-0">
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
                            Shares your question and answer with wiki managers.
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
                      <div className="mt-1 flex items-center gap-3 sm:gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="relative size-7 text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground max-sm:after:absolute max-sm:after:-inset-1.5"
                          aria-label="Helpful answer"
                          aria-pressed={answer.rating === "up"}
                          disabled={ratingPending !== null}
                          onClick={() => void rateAnswer(answer, "up")}
                        >
                          <ThumbsUpIcon className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="relative size-7 text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground max-sm:after:absolute max-sm:after:-inset-1.5"
                          aria-label="Unhelpful answer"
                          aria-pressed={answer.rating === "down"}
                          disabled={ratingPending !== null}
                          onClick={(event) => {
                            ratingTrigger.current = event.currentTarget
                            setRatingStatus("")
                            setShareAnswer(answer.id)
                            setShareReason("")
                            setShareMessage("")
                            setFlagError("")
                            void rateAnswer(answer, "down")
                          }}
                        >
                          <ThumbsDownIcon className="size-3.5" />
                        </Button>
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
                </section>
              )
            )}
          </div>
        ) : !loadingHistory ? (
          <div className="my-auto sm:my-0">
            <p className="text-base font-medium">
              {firstName ? `Hi, ${firstName}.` : "Hi."} How can I help?
            </p>
          </div>
        ) : null}
      </div>
      {thumbHeight > 0 ? (
        <div
          ref={scrollbar}
          aria-hidden="true"
          className="milo-scrollbar-track absolute top-0 right-0 w-1.5 touch-none"
          style={{ height: scrollMetrics.height }}
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return
            event.preventDefault()
            programmaticScroll.current = false
            const rect = event.currentTarget.getBoundingClientRect()
            const withinThumb =
              event.clientY >= rect.top + thumbTop &&
              event.clientY <= rect.top + thumbTop + thumbHeight
            const offset = withinThumb
              ? event.clientY - rect.top - thumbTop
              : thumbHeight / 2
            scrollbarDrag.current = { pointerId: event.pointerId, offset }
            event.currentTarget.setPointerCapture(event.pointerId)
            moveScrollbar(event, offset)
          }}
          onPointerMove={(event) => {
            if (scrollbarDrag.current?.pointerId === event.pointerId)
              moveScrollbar(event, scrollbarDrag.current.offset)
          }}
          onPointerUp={() => {
            scrollbarDrag.current = null
          }}
          onPointerCancel={() => {
            scrollbarDrag.current = null
          }}
          onLostPointerCapture={() => {
            scrollbarDrag.current = null
          }}
        >
          <div
            className="milo-scrollbar-thumb absolute right-0 w-full rounded-full"
            style={{ height: thumbHeight, top: thumbTop }}
          />
        </div>
      ) : null}

      <div className="relative shrink-0">
        {showJump ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Jump to latest"
            className="absolute right-4 bottom-2 z-10 size-9 rounded-full bg-background shadow-md"
            onClick={() => {
              pinToBottom()
              const el = threadView.current
              if (el) el.scrollTop = el.scrollHeight
            }}
          >
            <ArrowDownIcon aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <form onSubmit={askQuestion} className="shrink-0 border-t p-4">
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
        <div className="rounded-3xl border bg-background p-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          {file ? (
            <div className="mb-1 inline-flex max-w-full items-center gap-1 rounded-full bg-muted py-1 pr-1 pl-3 text-xs">
              <span className="min-w-0 truncate">{file.name}</span>
              <button
                type="button"
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-base hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`Remove ${file.name}`}
                onClick={() => {
                  setFile(null)
                  if (fileInput.current) fileInput.current.value = ""
                }}
              >
                ×
              </button>
            </div>
          ) : null}
          <textarea
            ref={composer}
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                !phone
              ) {
                event.preventDefault()
                void sendQuestion(input, file)
              }
            }}
            rows={1}
            placeholder="Ask Milo…"
            aria-label="Ask a follow-up"
            disabled={pending || loadingHistory || restoreError}
            className="slim-scrollbar block field-sizing-content max-h-40 min-h-10 w-full resize-none overflow-y-auto bg-transparent px-3 py-2 text-base leading-6 outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
          />
          <div className="flex items-center justify-between">
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              tabIndex={-1}
              accept=".eml,.txt,.pdf,.docx"
              onChange={(event) => {
                const selected = event.currentTarget.files?.[0] ?? null
                if (
                  selected &&
                  !/\.(?:eml|txt|pdf|docx)$/i.test(selected.name)
                ) {
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
                    variant="ghost"
                    size="icon-sm"
                    disabled={pending || loadingHistory || restoreError}
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
            <Button
              type={pending ? "button" : "submit"}
              size="icon-sm"
              aria-label={pending ? "Stop" : "Send follow-up"}
              onClick={pending ? () => activeStop.current?.() : undefined}
              disabled={
                loadingHistory ||
                restoreError ||
                (!pending &&
                  ((!input.trim() && !file) ||
                    input.length > MILO_SOURCE_MAX_CHARS))
              }
              className="cursor-pointer rounded-full disabled:bg-muted disabled:text-foreground disabled:opacity-100"
            >
              {pending ? <SquareIcon /> : <SendIcon />}
            </Button>
          </div>
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
        <p className="mt-2 text-center text-[11px] whitespace-nowrap text-muted-foreground">
          {disclaimer}
        </p>
      </form>
    </div>
  )
}
