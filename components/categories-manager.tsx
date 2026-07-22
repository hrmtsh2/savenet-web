"use client"

import { useState, useTransition } from "react"
import { Plus, Tag } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { createCategory } from "@/app/actions"
import type { CategoryWithCount } from "@/lib/types"

export function CategoriesManager({ categories }: { categories: CategoryWithCount[] }) {
  const [name, setName] = useState("")
  const [pending, startTransition] = useTransition()

  function addLabel() {
    const value = name.trim()
    if (!value) return
    const form = new FormData()
    form.set("name", value)
    startTransition(async () => {
      const result = await createCategory(form)
      if (result?.error) toast.error(result.error)
      else {
        setName("")
        toast.success("Label created")
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <label htmlFor="label-name" className="text-sm font-medium">Create a label</label>
          <Input
            id="label-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                addLabel()
              }
            }}
            placeholder="e.g. Weekend plans"
            maxLength={80}
          />
        </div>
        <Button onClick={addLabel} disabled={pending || !name.trim()} className="gap-2">
          <Plus className="h-4 w-4" /> Add label
        </Button>
      </Card>

      {categories.length === 0 ? (
        <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          Create labels before importing posts to keep your library organized.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((label) => (
            <Card key={label.id} className="flex items-center gap-3 p-4">
              <Tag className="h-4 w-4 text-primary" />
              <div className="min-w-0">
                <p className="truncate font-medium">{label.name}</p>
                <p className="text-xs text-muted-foreground">
                  {label.post_count} {label.post_count === 1 ? "post" : "posts"}
                  {label.auto_created ? " · source label" : ""}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
