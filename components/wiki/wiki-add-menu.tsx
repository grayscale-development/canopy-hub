"use client"

import * as React from "react"
import { FileTextIcon, FolderIcon, PlusIcon, SparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useWikiEditMode } from "@/components/wiki/wiki-edit-mode"
import { WikiCreateWizardDialog } from "@/components/wiki/wiki-management-controls"
import { WikiImportWizardDialog } from "@/components/wiki/wiki-import-wizard"
import type { WikiNodeRow } from "@/lib/wiki"

export function WikiAddMenu({
  folder,
  nodes,
  allowGroups,
  variant = "button",
  label = "Add",
}: {
  folder: WikiNodeRow
  nodes: WikiNodeRow[]
  allowGroups: boolean
  variant?: "icon" | "button"
  label?: string
}) {
  const { canEditWiki } = useWikiEditMode()
  const [dialog, setDialog] = React.useState<
    "page" | "folder" | "ai-create" | null
  >(null)
  if (!canEditWiki) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size={variant === "icon" ? "icon-sm" : "sm"}
            variant={variant === "icon" ? "ghost" : "default"}
            className={
              variant === "icon"
                ? "size-8 shrink-0 cursor-pointer px-0 text-sidebar-foreground/60 hover:text-sidebar-foreground"
                : undefined
            }
            aria-label={
              variant === "icon" ? `Add to ${folder.title}` : undefined
            }
            title={variant === "icon" ? `Add to ${folder.title}` : undefined}
          >
            <PlusIcon />
            {variant === "button" ? label : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem onSelect={() => setDialog("page")}>
            <FileTextIcon className="size-4" />
            Page
          </DropdownMenuItem>
          {allowGroups ? (
            <DropdownMenuItem onSelect={() => setDialog("folder")}>
              <FolderIcon className="size-4" />
              Group
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setDialog("ai-create")}>
            <SparklesIcon className="size-4" />
            AI Create
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <WikiCreateWizardDialog
        nodes={nodes}
        parentId={folder.id}
        defaultType="page"
        allowedTypes={["page"]}
        labels={{ page: "Page" }}
        dialogTitle="Add Page"
        open={dialog === "page"}
        onOpenChange={(open) => setDialog(open ? "page" : null)}
        showTrigger={false}
      />
      {allowGroups ? (
        <WikiCreateWizardDialog
          nodes={nodes}
          parentId={folder.id}
          defaultType="folder"
          allowedTypes={["folder"]}
          labels={{ folder: "Group" }}
          dialogTitle="Add Group"
          open={dialog === "folder"}
          onOpenChange={(open) => setDialog(open ? "folder" : null)}
          showTrigger={false}
        />
      ) : null}
      <WikiImportWizardDialog
        nodes={nodes}
        parentId={folder.id}
        open={dialog === "ai-create"}
        onOpenChange={(open) => setDialog(open ? "ai-create" : null)}
        showTrigger={false}
      />
    </>
  )
}
