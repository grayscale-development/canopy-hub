// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import WikiLoading from "@/app/wiki/loading"

afterEach(cleanup)

describe("Wiki page loading state", () => {
  it("announces a page-content skeleton accessibly", () => {
    render(<WikiLoading />)

    expect(
      screen.getByRole("status", { name: "Loading Wiki page content" })
    ).toHaveAttribute("aria-busy", "true")
  })
})
