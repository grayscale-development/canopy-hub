import { describe, expect, it } from "vitest"

import {
  LEADERBOARD_PREVIOUS_MONTH_HOLDOVER_DAYS,
  getLeaderboardPostedMonth,
} from "@/lib/leaderboard-month"

describe("leaderboard posted month", () => {
  it("keeps the previous month posted through day 5 in America/Denver", () => {
    expect(LEADERBOARD_PREVIOUS_MONTH_HOLDOVER_DAYS).toBe(5)

    const earlySeptember = getLeaderboardPostedMonth(
      new Date("2026-09-01T08:00:00.000-06:00")
    )
    expect(earlySeptember).toMatchObject({
      year: 2026,
      monthNumber: 8,
      startIso: "2026-08-01",
      endIso: "2026-08-31",
      monthName: "August",
      monthLabel: "August 2026",
      isPreviousMonthHoldover: true,
    })

    const fifth = getLeaderboardPostedMonth(
      new Date("2026-09-05T23:30:00.000-06:00")
    )
    expect(fifth).toMatchObject({
      monthName: "August",
      startIso: "2026-08-01",
      isPreviousMonthHoldover: true,
    })
  })

  it("switches to the current month on day 6", () => {
    const sixth = getLeaderboardPostedMonth(
      new Date("2026-09-06T00:00:00.000-06:00")
    )
    expect(sixth).toMatchObject({
      year: 2026,
      monthNumber: 9,
      startIso: "2026-09-01",
      endIso: "2026-09-30",
      monthName: "September",
      monthLabel: "September 2026",
      isPreviousMonthHoldover: false,
    })
  })

  it("rolls December into January across the year boundary", () => {
    const newYears = getLeaderboardPostedMonth(
      new Date("2027-01-01T00:00:00.000-07:00")
    )
    expect(newYears).toMatchObject({
      year: 2026,
      monthNumber: 12,
      startIso: "2026-12-01",
      endIso: "2026-12-31",
      monthName: "December",
      monthLabel: "December 2026",
      isPreviousMonthHoldover: true,
    })

    const afterHoldover = getLeaderboardPostedMonth(
      new Date("2027-01-06T00:00:00.000-07:00")
    )
    expect(afterHoldover).toMatchObject({
      year: 2027,
      monthNumber: 1,
      startIso: "2027-01-01",
      endIso: "2027-01-31",
      monthName: "January",
      isPreviousMonthHoldover: false,
    })
  })
})
