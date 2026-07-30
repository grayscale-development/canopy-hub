"use client"

import { useState } from "react"
import { PlusIcon } from "lucide-react"
import {
  createContactAction,
  createEntryAction,
  createSectionAction,
  deleteContactAction,
  deleteEntryAction,
  deleteSectionAction,
  updateContactAction,
  updateEntryAction,
  updateSectionAction,
} from "@/app/department-directory/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type {
  SupportDirectoryContact,
  SupportDirectoryItem,
  SupportDirectorySection,
} from "@/lib/support-directory-data"

const TEXTAREA_CLASS_NAME =
  "min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

function listToText(values: string[]) {
  return values.join("\n")
}

function MenuItemButton({
  label,
  onSelect,
  destructive = false,
}: {
  label: string
  onSelect: () => void
  destructive?: boolean
}) {
  return (
    <DropdownMenuItem
      onSelect={(event) => {
        event.preventDefault()
        onSelect()
      }}
      variant={destructive ? "destructive" : "default"}
    >
      {label}
    </DropdownMenuItem>
  )
}

export function AddSectionActionsMenu({
  triggerClassName,
}: {
  triggerClassName?: string
}) {
  const [open, setOpen] = useState<null | "add-section">(null)

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen("add-section")}
        className={triggerClassName}
      >
        <PlusIcon />
        Add Section
      </Button>

      <Dialog
        open={open === "add-section"}
        onOpenChange={(isOpen) => setOpen(isOpen ? "add-section" : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add section</DialogTitle>
            <DialogDescription>
              Create a new general help, rush, or department section.
            </DialogDescription>
          </DialogHeader>
          <form action={createSectionAction} className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                Kind
                <select
                  name="kind"
                  className="h-9 rounded-md border border-input bg-transparent pr-9 pl-3 text-sm"
                  defaultValue="department"
                >
                  <option value="general_help">General Help</option>
                  <option value="rush">Rush</option>
                  <option value="department">Department</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Sort order
                <Input name="sort_order" type="number" defaultValue={0} />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                Title
                <Input name="title" required />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                Description
                <Input name="description" />
              </label>
              <label className="grid gap-1 text-sm">
                Manager name
                <Input name="manager_name" />
              </label>
              <label className="grid gap-1 text-sm">
                Manager phone
                <Input name="manager_phone" />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                Notes (one per line)
                <textarea name="notes" className={TEXTAREA_CLASS_NAME} />
              </label>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit">Add section</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function SectionActionsMenu({
  section,
}: {
  section: SupportDirectorySection
}) {
  const [open, setOpen] = useState<
    null | "add-entry" | "edit-section" | "delete-section"
  >(null)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="xs">
            Manage
            <span className="sr-only">{` ${section.title}`}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44 min-w-44">
          <MenuItemButton
            label="Add entry"
            onSelect={() => setOpen("add-entry")}
          />
          <MenuItemButton
            label="Edit section"
            onSelect={() => setOpen("edit-section")}
          />
          <MenuItemButton
            label="Delete section"
            onSelect={() => setOpen("delete-section")}
            destructive
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={open === "add-entry"}
        onOpenChange={(isOpen) => setOpen(isOpen ? "add-entry" : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add entry</DialogTitle>
            <DialogDescription>
              Add a new contact channel under this section.
            </DialogDescription>
          </DialogHeader>
          <form action={createEntryAction} className="grid gap-3">
            <input type="hidden" name="section_id" value={section.id} />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm md:col-span-2">
                Entry title
                <Input name="title" required />
              </label>
              <label className="grid gap-1 text-sm">
                Monitored by
                <Input name="monitored_by" />
              </label>
              <label className="grid gap-1 text-sm">
                Sort order
                <Input name="sort_order" type="number" defaultValue={0} />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                Description
                <Input name="description" />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                Emails (one per line)
                <textarea name="emails" className={TEXTAREA_CLASS_NAME} />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                Notes (one per line)
                <textarea name="notes" className={TEXTAREA_CLASS_NAME} />
              </label>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit">Add entry</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open === "edit-section"}
        onOpenChange={(isOpen) => setOpen(isOpen ? "edit-section" : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit section</DialogTitle>
            <DialogDescription>
              Update section details and ordering.
            </DialogDescription>
          </DialogHeader>
          <form action={updateSectionAction} className="grid gap-3">
            <input type="hidden" name="section_id" value={section.id} />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                Kind
                <select
                  name="kind"
                  className="h-9 rounded-md border border-input bg-transparent pr-9 pl-3 text-sm"
                  defaultValue={section.kind}
                >
                  <option value="general_help">General Help</option>
                  <option value="rush">Rush</option>
                  <option value="department">Department</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Sort order
                <Input
                  name="sort_order"
                  type="number"
                  defaultValue={section.sortOrder}
                />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                Title
                <Input name="title" required defaultValue={section.title} />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                Description
                <Input
                  name="description"
                  defaultValue={section.description ?? ""}
                />
              </label>
              <label className="grid gap-1 text-sm">
                Manager name
                <Input
                  name="manager_name"
                  defaultValue={section.managerName ?? ""}
                />
              </label>
              <label className="grid gap-1 text-sm">
                Manager phone
                <Input
                  name="manager_phone"
                  defaultValue={section.managerPhone ?? ""}
                />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                Notes (one per line)
                <textarea
                  name="notes"
                  className={TEXTAREA_CLASS_NAME}
                  defaultValue={listToText(section.notes)}
                />
              </label>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit">Save section</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open === "delete-section"}
        onOpenChange={(isOpen) => setOpen(isOpen ? "delete-section" : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete section</DialogTitle>
            <DialogDescription>
              This will remove the section and all entries/contacts inside it.
            </DialogDescription>
          </DialogHeader>
          <form action={deleteSectionAction} className="grid gap-3">
            <input type="hidden" name="section_id" value={section.id} />
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">
                {section.title}
              </span>
              ?
            </p>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant="destructive">
                Delete section
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function EntryActionsMenu({ item }: { item: SupportDirectoryItem }) {
  const [open, setOpen] = useState<
    null | "add-contact" | "edit-entry" | "delete-entry"
  >(null)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="xs">
            Manage
            <span className="sr-only">{` ${item.title}`}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44 min-w-44">
          <MenuItemButton
            label="Add contact"
            onSelect={() => setOpen("add-contact")}
          />
          <MenuItemButton
            label="Edit entry"
            onSelect={() => setOpen("edit-entry")}
          />
          <MenuItemButton
            label="Delete entry"
            onSelect={() => setOpen("delete-entry")}
            destructive
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={open === "add-contact"}
        onOpenChange={(isOpen) => setOpen(isOpen ? "add-contact" : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add contact</DialogTitle>
            <DialogDescription>Add a person to this entry.</DialogDescription>
          </DialogHeader>
          <form action={createContactAction} className="grid gap-3">
            <input type="hidden" name="entry_id" value={item.id} />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                Name
                <Input name="name" required />
              </label>
              <label className="grid gap-1 text-sm">
                Role
                <Input name="role" />
              </label>
              <label className="grid gap-1 text-sm">
                Phone
                <Input name="phone" />
              </label>
              <label className="grid gap-1 text-sm">
                Email
                <Input name="email" />
              </label>
              <label className="grid gap-1 text-sm">
                Sort order
                <Input name="sort_order" type="number" defaultValue={0} />
              </label>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit">Add contact</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open === "edit-entry"}
        onOpenChange={(isOpen) => setOpen(isOpen ? "edit-entry" : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit entry</DialogTitle>
            <DialogDescription>
              Update entry details and contacts info.
            </DialogDescription>
          </DialogHeader>
          <form action={updateEntryAction} className="grid gap-3">
            <input type="hidden" name="entry_id" value={item.id} />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm md:col-span-2">
                Entry title
                <Input name="title" required defaultValue={item.title} />
              </label>
              <label className="grid gap-1 text-sm">
                Monitored by
                <Input
                  name="monitored_by"
                  defaultValue={item.monitoredBy ?? ""}
                />
              </label>
              <label className="grid gap-1 text-sm">
                Sort order
                <Input
                  name="sort_order"
                  type="number"
                  defaultValue={item.sortOrder}
                />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                Description
                <Input
                  name="description"
                  defaultValue={item.description ?? ""}
                />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                Emails (one per line)
                <textarea
                  name="emails"
                  className={TEXTAREA_CLASS_NAME}
                  defaultValue={listToText(item.emails)}
                />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                Notes (one per line)
                <textarea
                  name="notes"
                  className={TEXTAREA_CLASS_NAME}
                  defaultValue={listToText(item.notes)}
                />
              </label>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit">Save entry</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open === "delete-entry"}
        onOpenChange={(isOpen) => setOpen(isOpen ? "delete-entry" : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete entry</DialogTitle>
            <DialogDescription>
              This will remove this entry and all contacts linked to it.
            </DialogDescription>
          </DialogHeader>
          <form action={deleteEntryAction} className="grid gap-3">
            <input type="hidden" name="entry_id" value={item.id} />
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">{item.title}</span>?
            </p>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant="destructive">
                Delete entry
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function ContactActionsMenu({
  contact,
}: {
  contact: SupportDirectoryContact
}) {
  const [open, setOpen] = useState<null | "edit-contact" | "delete-contact">(
    null
  )

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="xs">
            Manage
            <span className="sr-only">{` ${contact.name}`}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44 min-w-44">
          <MenuItemButton
            label="Edit contact"
            onSelect={() => setOpen("edit-contact")}
          />
          <MenuItemButton
            label="Delete contact"
            onSelect={() => setOpen("delete-contact")}
            destructive
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={open === "edit-contact"}
        onOpenChange={(isOpen) => setOpen(isOpen ? "edit-contact" : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit contact</DialogTitle>
            <DialogDescription>
              Update person and contact details.
            </DialogDescription>
          </DialogHeader>
          <form action={updateContactAction} className="grid gap-3">
            <input type="hidden" name="contact_id" value={contact.id} />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                Name
                <Input name="name" required defaultValue={contact.name} />
              </label>
              <label className="grid gap-1 text-sm">
                Role
                <Input name="role" defaultValue={contact.role ?? ""} />
              </label>
              <label className="grid gap-1 text-sm">
                Phone
                <Input name="phone" defaultValue={contact.phone ?? ""} />
              </label>
              <label className="grid gap-1 text-sm">
                Email
                <Input name="email" defaultValue={contact.email ?? ""} />
              </label>
              <label className="grid gap-1 text-sm">
                Sort order
                <Input
                  name="sort_order"
                  type="number"
                  defaultValue={contact.sortOrder}
                />
              </label>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit">Save contact</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open === "delete-contact"}
        onOpenChange={(isOpen) => setOpen(isOpen ? "delete-contact" : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete contact</DialogTitle>
            <DialogDescription>
              This contact will be removed from the entry.
            </DialogDescription>
          </DialogHeader>
          <form action={deleteContactAction} className="grid gap-3">
            <input type="hidden" name="contact_id" value={contact.id} />
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">
                {contact.name}
              </span>
              ?
            </p>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant="destructive">
                Delete contact
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
