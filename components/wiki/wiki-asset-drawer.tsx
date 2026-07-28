"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArchiveIcon,
  FileIcon,
  ImageIcon,
  SaveIcon,
  UploadIcon,
  VideoIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  formatBytes,
  WIKI_MAX_UPLOAD_SIZE_LABEL,
  type WikiAssetRow,
} from "@/lib/wiki"

function AssetIcon({ kind }: { kind: WikiAssetRow["kind"] }) {
  if (kind === "image") {
    return <ImageIcon className="size-4" />
  }
  if (kind === "video") {
    return <VideoIcon className="size-4" />
  }
  return <FileIcon className="size-4" />
}

export function WikiAssetDrawer({
  nodeId,
  assets,
  canManage,
}: {
  nodeId: string
  assets: WikiAssetRow[]
  canManage: boolean
}) {
  const router = useRouter()
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [isUploadOpen, setIsUploadOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)

  async function uploadAsset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set("node_id", nodeId)
    setPending(true)
    setMessage(null)

    try {
      const response = await fetch("/api/wiki/upload", {
        method: "POST",
        body: formData,
      })
      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null

      if (!response.ok) {
        setMessage(payload?.error ?? "Upload failed.")
        return
      }

      form.reset()
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      setMessage("Uploaded.")
      setIsUploadOpen(false)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  async function archiveAsset(assetId: string) {
    setPending(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/wiki/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      })
      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null
      if (!response.ok) {
        setMessage(payload?.error ?? "Unable to archive asset.")
        return
      }
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  async function renameAsset(assetId: string, title: string) {
    setPending(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/wiki/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      })
      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null
      if (!response.ok) {
        setMessage(payload?.error ?? "Unable to rename asset.")
        return
      }
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="py-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Assets</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{assets.length}</span>
          {canManage ? (
            <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="icon-sm">
                  <UploadIcon />
                  <span className="sr-only">Upload asset</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Upload Asset</DialogTitle>
                  <DialogDescription>
                    Add an image, document, or video to this Wiki page.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={uploadAsset} className="grid gap-4">
                  <Input
                    ref={fileInputRef}
                    name="file"
                    type="file"
                    accept="image/*,video/mp4,video/quicktime,video/webm,application/pdf,.pdf,.doc,.docx,.txt,.md"
                    required
                  />
                  <Input name="title" placeholder="Title" />
                  <Input name="description" placeholder="Description" />
                  <Input name="alt_text" placeholder="Alt text" />
                  <p className="text-xs text-muted-foreground">
                    Images, documents, and videos up to{" "}
                    {WIKI_MAX_UPLOAD_SIZE_LABEL}.
                  </p>
                  <div className="flex items-center gap-3">
                    <Button type="submit" disabled={pending}>
                      <UploadIcon />
                      {pending ? "Uploading..." : "Upload"}
                    </Button>
                    {message ? (
                      <p className="text-sm text-muted-foreground">{message}</p>
                    ) : null}
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {assets.length ? (
          assets.map((asset) => (
            <form
              key={asset.id}
              className="rounded-md p-2 hover:bg-accent"
              onSubmit={(event) => {
                event.preventDefault()
                const formData = new FormData(event.currentTarget)
                const title = formData.get("title")
                renameAsset(asset.id, typeof title === "string" ? title : "")
              }}
            >
              <div className="flex items-start gap-2">
                <AssetIcon kind={asset.kind} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/api/wiki/assets/${asset.id}`}
                    target="_blank"
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {asset.title || asset.file_name}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {asset.kind} · {formatBytes(Number(asset.size_bytes))}
                  </p>
                  {asset.description ? (
                    <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                      {asset.description}
                    </p>
                  ) : null}
                  {canManage ? (
                    <div className="mt-3 flex items-center gap-2">
                      <Input
                        name="title"
                        defaultValue={asset.title ?? ""}
                        placeholder="Nickname"
                        className="h-8 text-xs"
                      />
                      <Button
                        type="submit"
                        size="icon-sm"
                        variant="outline"
                        disabled={pending}
                        aria-label="Save nickname"
                      >
                        <SaveIcon />
                      </Button>
                    </div>
                  ) : null}
                </div>
                {canManage ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => archiveAsset(asset.id)}
                    aria-label="Archive asset"
                  >
                    <ArchiveIcon />
                  </Button>
                ) : null}
              </div>
            </form>
          ))
        ) : (
          <div className="p-2 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
            No assets uploaded.
          </div>
        )}
      </div>
    </section>
  )
}
