export const NEWSLETTER_BUCKET = "Newsletters"
export const NEWSLETTER_MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024
export const NEWSLETTER_MAX_UPLOAD_SIZE_LABEL = "50MB"

export const NEWSLETTER_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

export type NewsletterMonth = (typeof NEWSLETTER_MONTHS)[number]

export interface NewsletterFileSummary {
  fileName: string
  label: string
  month: NewsletterMonth
  monthIndex: number
  year: number
}

export function parseNewsletterFileName(
  fileName: string
): NewsletterFileSummary | null {
  const trimmed = fileName.trim()
  const match = /^([A-Za-z]+)\s+(\d{4})\.pdf$/i.exec(trimmed)
  if (!match) {
    return null
  }

  const monthToken = match[1]
  const yearToken = match[2]
  const monthIndex = NEWSLETTER_MONTHS.findIndex(
    (month) => month.toLowerCase() === monthToken.toLowerCase()
  )
  if (monthIndex < 0) {
    return null
  }

  const year = Number.parseInt(yearToken, 10)
  if (!Number.isFinite(year)) {
    return null
  }

  const month = NEWSLETTER_MONTHS[monthIndex]
  return {
    fileName: trimmed,
    label: `${month} ${year}`,
    month,
    monthIndex,
    year,
  }
}

export function compareNewsletterFilesDescending(
  left: NewsletterFileSummary,
  right: NewsletterFileSummary
) {
  if (left.year !== right.year) {
    return right.year - left.year
  }

  if (left.monthIndex !== right.monthIndex) {
    return right.monthIndex - left.monthIndex
  }

  return left.fileName.localeCompare(right.fileName)
}

export function buildNewsletterFileName(month: NewsletterMonth, year: number) {
  return `${month} ${year}.pdf`
}
