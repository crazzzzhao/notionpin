const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/** Parse Notion calendar dates without treating YYYY-MM-DD as midnight UTC. */
export function parseNotionDate(value: string): Date | null {
  const dateOnlyMatch = DATE_ONLY.exec(value)

  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1])
    const monthIndex = Number(dateOnlyMatch[2]) - 1
    const day = Number(dateOnlyMatch[3])
    const date = new Date(year, monthIndex, day)

    if (date.getFullYear() !== year || date.getMonth() !== monthIndex || date.getDate() !== day) {
      return null
    }

    return date
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
