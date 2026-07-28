"use client"

import * as React from "react"
import { CheckIcon, CopyIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textArea = document.createElement("textarea")
  textArea.value = value
  textArea.setAttribute("readonly", "")
  textArea.style.position = "fixed"
  textArea.style.top = "-9999px"
  document.body.appendChild(textArea)
  textArea.select()
  document.execCommand("copy")
  document.body.removeChild(textArea)
}

export function CopyMiloFlagPromptButton({ prompt }: { prompt: string }) {
  const [copied, setCopied] = React.useState(false)

  async function handleCopy() {
    await copyText(prompt)
    setCopied(true)
    toast.success("Review prompt copied")
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={copied ? "secondary" : "outline"}
          size="sm"
          onClick={handleCopy}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          Copy Prompt
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {copied ? "Copied" : "Copy AI review prompt"}
      </TooltipContent>
    </Tooltip>
  )
}
