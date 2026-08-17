"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import ReactMarkdown from "react-markdown"
import { MessagesSquare, Plus, Send, Sparkles, ArrowLeft, Loader2, Check, Ellipsis, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { sendChatMessage, loadConversation, renameConversation, deleteConversation } from "@/app/actions"
import { ReferencedPostCard } from "@/components/referenced-post-card"
import type { CategoryWithCount, ConversationListItem, LabelMatch, ReferencedPost } from "@/lib/types"

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
  const [categoryIds, setCategoryIds] = useState<number[] | null>(null)
  const [labelMatch, setLabelMatch] = useState<LabelMatch>("any")
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, startSending] = useTransition()
  const [loadingConv, startLoading] = useTransition()

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, sending])

  const activeCategories = categories.filter((c) => categoryIds?.includes(c.id) ?? false)
  const started = categoryIds != null && categoryIds.length > 0

  function startNewChat() {
    setConversationId(null)
    setCategoryIds(null)
    setLabelMatch("any")
    setMessages([])
    setInput("")
  }

  function pickCategories(ids: number[], match: LabelMatch) {
    setCategoryIds(ids)
    setLabelMatch(match)
    setConversationId(null)
    setMessages([])
  }

  function resume(conv: ConversationListItem) {
    if (conv.id === conversationId) return
    startLoading(async () => {
      const res = await loadConversation(conv.id)
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
      setCategoryIds(res.conversation.label_ids.length ? res.conversation.label_ids : res.conversation.category_id != null ? [res.conversation.category_id] : null)
      setLabelMatch(res.conversation.label_match)
      setMessages(uiMessages)
    })
  }

  function updateConversationTitle(id: number, title: string) {
    setConversations((previous) => previous.map((conversation) => conversation.id === id ? { ...conversation, title } : conversation))
  }

  function removeConversation(id: number) {
    setConversations((previous) => previous.filter((conversation) => conversation.id !== id))
    if (conversationId === id) startNewChat()
  }

  function onSend() {
    const text = input.trim()
    if (!text || sending) return
    if (!categoryIds || categoryIds.length === 0) {
      toast.error("Pick at least one label first")
      return
    }

    const isNew = conversationId == null
    // use the first selected category as the primary for the conversation
    const primaryCategoryId = categoryIds[0]

    setMessages((prev) => [...prev, { role: "user", content: text }])
    setInput("")

    startSending(async () => {
      const res = await sendChatMessage({
        conversationId,
        categoryId: primaryCategoryId,
        categoryIds,
        labelMatch,
        message: text,
      })
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
        const cat = categories.find((c) => c.id === primaryCategoryId)
        setConversations((prev) => [
          {
            id: result.conversationId,
            title: text.length <= 60 ? text : text.slice(0, 57) + "…",
            category_id: primaryCategoryId,
            label_ids: categoryIds,
            label_match: labelMatch,
            category_name: cat?.name ?? null,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ])
      }
    })
  }

  const grouped = conversations.reduce<Record<string, ConversationListItem[]>>((acc, c) => {
    const key = c.category_name ?? "Uncategorized"
    ;(acc[key] ||= []).push(c)
    return acc
  }, {})

  const placeholderText = activeCategories.length > 0
    ? `Ask about your ${activeCategories.map((c) => c.name).join(", ")} posts…`
    : "Ask about your saved posts…"

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
                  <div
                    key={c.id}
                    className={cn(
                      "group flex items-center rounded-lg transition-colors",
                      c.id === conversationId
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                    )}
                  >
                    <button onClick={() => resume(c)} className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm">
                      {c.title || "Untitled chat"}
                    </button>
                    <ConversationActions conversation={c} onRename={updateConversationTitle} onDelete={removeConversation} />
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <Card className="flex h-[calc(100vh-16rem)] flex-col overflow-hidden p-0">
        {!started ? (
          <CategoryPicker categories={categories} onPick={pickCategories} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <Button variant="ghost" size="sm" className="gap-1.5 shrink-0" onClick={startNewChat}>
                <ArrowLeft className="h-4 w-4" />
                Labels
              </Button>
              {activeCategories.map((c) => (
                <Badge key={c.id} variant="secondary" className="gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  {c.name}
                </Badge>
              ))}
              {activeCategories.length > 1 ? <Badge variant="outline">{labelMatch === "all" ? "All labels" : "Any label"}</Badge> : null}
            </div>

            <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
              {messages.length === 0 && !loadingConv ? (
                <EmptyConversation categoryNames={activeCategories.map((c) => c.name)} />
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
                  placeholder={placeholderText}
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

function ConversationActions({
  conversation,
  onRename,
  onDelete,
}: {
  conversation: ConversationListItem
  onRename: (id: number, title: string) => void
  onDelete: (id: number) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [title, setTitle] = useState(conversation.title || "")
  const [pending, startTransition] = useTransition()

  function rename() {
    startTransition(async () => {
      const result = await renameConversation(conversation.id, title)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      onRename(conversation.id, result.title)
      setRenameOpen(false)
      toast.success("Chat renamed")
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteConversation(conversation.id)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      onDelete(conversation.id)
      setDeleteOpen(false)
      toast.success("Chat deleted")
    })
  }

  return (
    <>
      <div className="relative pr-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-70 hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation()
            setMenuOpen((open) => !open)
          }}
          aria-label={`Actions for ${conversation.title || "untitled chat"}`}
        >
          <Ellipsis className="h-4 w-4" />
        </Button>
        {menuOpen ? (
          <div className="absolute right-0 top-8 z-20 w-32 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => {
                setMenuOpen(false)
                setTitle(conversation.title || "")
                setRenameOpen(true)
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Rename
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
              onClick={() => {
                setMenuOpen(false)
                setDeleteOpen(true)
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        ) : null}
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
            <DialogDescription>Choose a name that makes this conversation easier to find later.</DialogDescription>
          </DialogHeader>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} autoFocus />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
            <Button type="button" onClick={rename} disabled={!title.trim() || pending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this chat?</DialogTitle>
            <DialogDescription>This permanently deletes the conversation and its messages.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
            <Button type="button" variant="destructive" onClick={remove} disabled={pending}>Delete chat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function CategoryPicker({
  categories,
  onPick,
}: {
  categories: CategoryWithCount[]
  onPick: (ids: number[], match: LabelMatch) => void
}) {
  const [selected, setSelected] = useState<number[]>([])
  const [labelMatch, setLabelMatch] = useState<LabelMatch>("any")

  function toggle(id: number) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex flex-col items-center gap-6 p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MessagesSquare className="h-6 w-6" />
          </span>
          <h2 className="text-lg font-semibold">Which collections should I search?</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Select one or more labels. I&apos;ll only recommend from posts you&apos;ve saved with those labels.
          </p>
        </div>

        <div className="grid w-full max-w-xl gap-3 sm:grid-cols-2">
          {categories.map((c) => {
            const isSelected = selected.includes(c.id)
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                disabled={c.post_count === 0}
                className={cn(
                  "flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors",
                  c.post_count === 0
                    ? "cursor-not-allowed opacity-50 border-border"
                    : isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-secondary/50",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.name}</span>
                  {isSelected && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {c.post_count} saved {c.post_count === 1 ? "post" : "posts"}
                </span>
              </button>
            )
          })}
        </div>

        {selected.length > 1 ? (
          <div className="flex rounded-lg border border-border p-1 text-sm">
            <button onClick={() => setLabelMatch("any")} className={cn("rounded-md px-3 py-1.5", labelMatch === "any" && "bg-secondary font-medium")}>Any label</button>
            <button onClick={() => setLabelMatch("all")} className={cn("rounded-md px-3 py-1.5", labelMatch === "all" && "bg-secondary font-medium")}>All labels</button>
          </div>
        ) : null}

        <Button
          onClick={() => { if (selected.length > 0) onPick(selected, labelMatch) }}
          disabled={selected.length === 0}
          className="px-8 sticky bottom-4"
        >
          {selected.length === 0
            ? "Select at least one label"
            : `Chat with ${selected.length === 1 ? "this collection" : `these ${selected.length} collections`}`}
        </Button>
      </div>
    </div>
  )
}

function EmptyConversation({ categoryNames }: { categoryNames: string[] }) {
  const label = categoryNames.length === 1
    ? categoryNames[0]
    : categoryNames.slice(0, -1).join(", ") + " & " + categoryNames.at(-1)
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Sparkles className="h-7 w-7 text-primary" />
      <p className="text-sm font-medium">Ask me anything about your {label} posts</p>
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
