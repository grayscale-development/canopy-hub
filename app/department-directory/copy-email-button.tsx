"use client"

import { useState } from "react"
import { CheckIcon, MailIcon } from "lucide-react"

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

export function CopyEmailButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await copyText(email)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={copied ? "secondary" : "outline"}
          size="icon-xs"
          onClick={handleCopy}
          aria-label={`Copy ${email}`}
        >
          {copied ? <CheckIcon /> : <MailIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied" : email}</TooltipContent>
    </Tooltip>
  )
}
