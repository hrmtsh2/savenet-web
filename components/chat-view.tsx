"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import ReactMarkdown from "react-markdown"
import { MessagesSquare, Plus, Send, Sparkles, ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { sendChatMessage, loadConversation } from "@/app/actions"
import { ReferencedPostCard } from "@/components/referenced-post-card"
import type { CategoryWithCount, ConversationListItem, ReferencedPost } from "@/lib/types"

interface UiMessage {
  role: "user" | "assistant"
  content: string
  referencedPosts?: ReferencedPost[]
}

export function ChatView({
  categories,
  conversations: initialConversations,
}: {
  categories: CategoryWithCount[]
  conversations: ConversationListItem[]
}) {
  const [conversations, setConversations] = useState<ConversationListItem[]>(initialConversations)
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, startSending] = useTransition()
  const [loadingConv, startLoading] = useTransition()

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, sending])

  const activeCategory = categories.find((c) => c.id === categoryId)
  const started = categoryId != null

  function startNewChat() {
    setConversationId(null)
    setCategoryId(null)
    setMessages([])
    setInput("")
  }

  function pickCategory(id: number) {
    setCategoryId(id)
    setConversationId(null)
    setMessages([])
  }

  function resume(id: number) {
    if (id === conversationId) return
    startLoading(async () => {
      const res = await loadConversation(id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      const uiMessages: UiMessage[] = res.messages.map((m) => ({
        role: m.role,
        content: m.content,
        referencedPosts: m.referenced_post_ids
          .map((pid) => res.postsById[pid])
          .filter(Boolean) as ReferencedPost[],
      }))
      setConversationId(res.conversation.id)
      setCategoryId(res.conversation.category_id)
      setMessages(uiMessages)
    })
  }

  function onSend() {
    const text = input.trim()
    if (!text || sending) return
    if (categoryId == null) {
      toast.error("Pick a category first")
      return
    }

    const isNew = conversationId == null
    setMessages((prev) => [...prev, { role: "user", content: text }])
    setInput("")

    startSending(async () => {
      const res = await sendChatMessage({ conversationId, categoryId, message: text })
      if (!res.ok) {
        toast.error(res.error)
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Sorry, I couldn't generate a recommendation. Please try again." },
        ])
        return
      }
      const { result } = res
      setConversationId(result.conversationId)
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.reply, referencedPosts: result.referencedPosts },
      ])

      if (isNew) {
        const cat = categories.find((c) => c.id === categoryId)
        setConversations((prev) => [
          {
            id: result.conversationId,
            title: text.length <= 60 ? text : text.slice(0, 57) + "…",
            category_id: categoryId,
            category_name: cat?.name ?? null,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ])
      }
    })
  }

  // Group conversations by category name for the sidebar.
  const grouped = conversations.reduce<Record<string, ConversationListItem[]>>((acc, c) => {
    const key = c.category_name ?? "Uncategorized"
    ;(acc[key] ||= []).push(c)
    return acc
  }, {})

  return (
    <div className="grid flex-1 gap-6 lg:grid-cols-[260px_1fr]">
      {/* Sidebar */}
      <aside className="flex flex-col gap-4">
        <Button onClick={startNewChat} className="w-full justify-start gap-2">
          <Plus className="h-4 w-4" />
          New chat
        </Button>

        <div className="flex flex-col gap-4 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="px-1 text-xs text-muted-foreground">No conversations yet.</p>
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="flex flex-col gap-1">
                <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</p>
                {items.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => resume(c.id)}
                    className={cn(
                      "truncate rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                      c.id === conversationId
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                    )}
                  >
                    {c.title || "Untitled chat"}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <Card className="flex h-[calc(100vh-16rem)] flex-col overflow-hidden p-0">
        {!started ? (
          <CategoryPicker categories={categories} onPick={pickCategory} />
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={startNewChat}>
                <ArrowLeft className="h-4 w-4" />
                Categories
              </Button>
              <Badge variant="secondary" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {activeCategory?.name}
              </Badge>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
              {messages.length === 0 && !loadingConv ? (
                <EmptyConversation categoryName={activeCategory?.name ?? ""} />
              ) : null}

              {loadingConv ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading conversation…
                </div>
              ) : null}

              {messages.map((m, i) => (
                <MessageBubble key={i} message={m} />
              ))}

              {sending ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching your saved posts…
                </div>
              ) : null}
            </div>

            <div className="border-t border-border p-3">
              <div className="flex items-end gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      onSend()
                    }
                  }}
                  placeholder={`Ask about your ${activeCategory?.name ?? "saved"} posts…`}
                  className="min-h-[44px] max-h-32 resize-none"
                  rows={1}
                />
                <Button onClick={onSend} disabled={sending || !input.trim()} size="icon" className="h-11 w-11 shrink-0">
                  <Send className="h-4 w-4" />
                  <span className="sr-only">Send</span>
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

function CategoryPicker({
  categories,
  onPick,
}: {
  categories: CategoryWithCount[]
  onPick: (id: number) => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MessagesSquare className="h-6 w-6" />
        </span>
        <h2 className="text-lg font-semibold">Which collection should I search?</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          I&apos;ll only recommend from posts you saved in the category you choose.
        </p>
      </div>

      <div className="grid w-full max-w-xl gap-3 sm:grid-cols-2">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c.id)}
            disabled={c.post_count === 0}
            className={cn(
              "flex flex-col gap-1 rounded-xl border border-border p-4 text-left transition-colors",
              c.post_count === 0
                ? "cursor-not-allowed opacity-50"
                : "hover:border-primary/50 hover:bg-secondary/50",
            )}
          >
            <span className="font-medium">{c.name}</span>
            <span className="text-xs text-muted-foreground">
              {c.post_count} saved {c.post_count === 1 ? "post" : "posts"}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function EmptyConversation({ categoryName }: { categoryName: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Sparkles className="h-7 w-7 text-primary" />
      <p className="text-sm font-medium">Ask me anything about your {categoryName} posts</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        e.g. &quot;Where should I eat tonight?&quot; or &quot;Find me a quick weeknight recipe.&quot;
      </p>
    </div>
  )
}

function MessageBubble({ message }: { message: UiMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-secondary px-4 py-3 text-sm leading-relaxed text-secondary-foreground">
        <div className="markdown-reply space-y-2">
          <ReactMarkdown
            components={{
              a: ({ ...props }) => <a {...props} className="text-primary underline" target="_blank" rel="noreferrer" />,
              ul: ({ ...props }) => <ul {...props} className="ml-4 list-disc space-y-1" />,
              ol: ({ ...props }) => <ol {...props} className="ml-4 list-decimal space-y-1" />,
              strong: ({ ...props }) => <strong {...props} className="font-semibold text-foreground" />,
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>

      {message.referencedPosts && message.referencedPosts.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {message.referencedPosts.map((p) => (
            <ReferencedPostCard key={p.id} post={p} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
