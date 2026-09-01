export const LEADERBOARD_TIME_ZONE = "America/Denver"
export const LEADERBOARD_PREVIOUS_MONTH_HOLDOVER_DAYS = 5

export interface LeaderboardPostedMonth {
  year: number
  monthNumber: number
  startIso: string
  endIso: string
  monthName: string
  monthLabel: string
  isPreviousMonthHoldover: boolean
}

function getTimeZoneDateParts(date: Date, timeZone = LEADERBOARD_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date)

  const readPart = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value
    return Number(value)
  }

  return {
    year: readPart("year"),
    month: readPart("month"),
    day: readPart("day"),
  }
}

function daysInMonth(year: number, monthNumber: number) {
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
}

function pad2(value: number) {
  return String(value).padStart(2, "0")
}

export function getLeaderboardPostedMonth(
  referenceDate = new Date()
): LeaderboardPostedMonth {
  const { year, month, day } = getTimeZoneDateParts(referenceDate)
  const isPreviousMonthHoldover =
    day <= LEADERBOARD_PREVIOUS_MONTH_HOLDOVER_DAYS

  let postedYear = year
  let postedMonth = month
  if (isPreviousMonthHoldover) {
    postedMonth -= 1
    if (postedMonth < 1) {
      postedMonth = 12
      postedYear -= 1
    }
  }

  const startIso = `${postedYear}-${pad2(postedMonth)}-01`
  const endIso = `${postedYear}-${pad2(postedMonth)}-${pad2(
    daysInMonth(postedYear, postedMonth)
  )}`
  const monthDate = new Date(Date.UTC(postedYear, postedMonth - 1, 1))
  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(monthDate)

  return {
    year: postedYear,
    monthNumber: postedMonth,
    startIso,
    endIso,
    monthName,
    monthLabel: `${monthName} ${postedYear}`,
    isPreviousMonthHoldover,
  }
}
