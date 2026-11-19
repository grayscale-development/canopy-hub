// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { CanopyProductionChart } from "@/components/home/canopy-production-chart"

afterEach(cleanup)

describe("CanopyProductionChart", () => {
  it.each([
    { labels: [], monthlyFundedCounts: [], monthlyFundedVolumes: [] },
    {
      labels: ["Jan", "Feb"],
      monthlyFundedCounts: [0, 0],
      monthlyFundedVolumes: [0, 0],
    },
  ])("shows a compact empty state for an empty or zero series", (series) => {
    const { container } = render(<CanopyProductionChart {...series} />)

    expect(
      screen.getByText("No funded loans in the last 12 months.")
    ).toBeVisible()
    expect(container.querySelector('[data-slot="chart"]')).toBeNull()
    expect(container.querySelector("svg")).toBeNull()
  })

  it.each([
    { monthlyFundedCounts: [1], monthlyFundedVolumes: [0] },
    { monthlyFundedCounts: [0], monthlyFundedVolumes: [1000] },
  ])("renders the chart when either series has data", (series) => {
    const { container } = render(
      <CanopyProductionChart labels={["Jan"]} {...series} />
    )

    expect(container.querySelector('[data-slot="chart"]')).toBeVisible()
    expect(
      screen.queryByText("No funded loans in the last 12 months.")
    ).toBeNull()
  })
})
