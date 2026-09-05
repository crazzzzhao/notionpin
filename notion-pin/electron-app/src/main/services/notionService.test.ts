import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotionService, type FieldMapping, type QueryTasksResult } from './notionService'

const pageId = '01234567-89ab-cdef-0123-456789abcdef'
const fieldMapping: FieldMapping = {
  textPropertyId: 'title-id',
  statusPropertyId: 'status-id',
  timePropertyId: 'date-id'
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('NotionService release-critical behavior', () => {
  it('settles every caller after merging rapid updates for the same page', async () => {
    vi.useFakeTimers()
    const service = new NotionService('ntn_synthetic_test_token')
    const update = vi.fn().mockResolvedValue({})
    ;(service as unknown as { client: { pages: { update: typeof update } } }).client = {
      pages: { update }
    }

    const titleResult = service.updateTask({
      pageId,
      updates: [{ field: 'title', value: 'First title' }],
      fieldMapping
    })
    const statusResult = service.updateTask({
      pageId,
      updates: [{ field: 'status', value: 'Done' }],
      fieldMapping
    })

    await vi.advanceTimersByTimeAsync(400)
    await expect(Promise.all([titleResult, statusResult])).resolves.toEqual([
      { success: true },
      { success: true }
    ])
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith({
      page_id: pageId,
      properties: {
        'title-id': { title: [{ type: 'text', text: { content: 'First title' } }] },
        'status-id': { status: { name: 'Done' } }
      }
    })
  })

  it('serializes updates queued while an earlier write for the page is in flight', async () => {
    vi.useFakeTimers()
    const service = new NotionService('ntn_synthetic_test_token')
    let finishFirstWrite: (() => void) | undefined
    const firstWrite = new Promise<void>((resolve) => {
      finishFirstWrite = resolve
    })
    const update = vi.fn().mockReturnValueOnce(firstWrite).mockResolvedValueOnce({})
    ;(service as unknown as { client: { pages: { update: typeof update } } }).client = {
      pages: { update }
    }

    const firstResult = service.updateTask({
      pageId,
      updates: [{ field: 'title', value: 'First title' }],
      fieldMapping
    })
    await vi.advanceTimersByTimeAsync(400)
    expect(update).toHaveBeenCalledTimes(1)

    const secondResult = service.updateTask({
      pageId,
      updates: [{ field: 'title', value: 'Latest title' }],
      fieldMapping
    })
    await vi.advanceTimersByTimeAsync(400)
    expect(update).toHaveBeenCalledTimes(1)

    finishFirstWrite?.()
    await expect(firstResult).resolves.toEqual({ success: true })
    await vi.runAllTimersAsync()
    await expect(secondResult).resolves.toEqual({ success: true })

    expect(update).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenNthCalledWith(1, {
      page_id: pageId,
      properties: {
        'title-id': { title: [{ type: 'text', text: { content: 'First title' } }] }
      }
    })
    expect(update).toHaveBeenNthCalledWith(2, {
      page_id: pageId,
      properties: {
        'title-id': { title: [{ type: 'text', text: { content: 'Latest title' } }] }
      }
    })
  })

  it('stops after the bounded retry count when a page stays rate limited', async () => {
    vi.useFakeTimers()
    const service = new NotionService('ntn_synthetic_test_token')
    const rateLimited: QueryTasksResult = {
      success: false,
      error: {
        code: 'rate_limited',
        message: 'rate limited',
        userMessage: 'retry later',
        retryAfter: 1
      }
    }
    const queryTasks = vi.spyOn(service, 'queryTasks').mockResolvedValue(rateLimited)

    const resultPromise = service.queryAllTasks({ dataSourceId: 'data-source' })
    await vi.runAllTimersAsync()

    await expect(resultPromise).resolves.toEqual(rateLimited)
    expect(queryTasks).toHaveBeenCalledTimes(2)
  })

  it('does not report more data when the fifth and final page is complete', async () => {
    const service = new NotionService('ntn_synthetic_test_token')
    const queryTasks = vi.spyOn(service, 'queryTasks')

    for (let page = 1; page <= 5; page++) {
      queryTasks.mockResolvedValueOnce({
        success: true,
        tasks: [],
        hasMore: page < 5,
        nextCursor: page < 5 ? `cursor-${page}` : null
      })
    }

    await expect(service.queryAllTasks({ dataSourceId: 'data-source' })).resolves.toMatchObject({
      success: true,
      hasMore: false,
      nextCursor: null
    })
    expect(queryTasks).toHaveBeenCalledTimes(5)
  })

  it('normalizes a Notion date-time for the date-only editor', () => {
    const service = new NotionService('ntn_synthetic_test_token')
    const parsePage = (
      service as unknown as {
        parsePageToTask: (page: unknown, mapping: FieldMapping) => { due: string | null }
      }
    ).parsePageToTask.bind(service)

    expect(
      parsePage(
        {
          id: pageId,
          properties: {
            Due: {
              id: 'date-id',
              type: 'date',
              date: { start: '2026-09-04T23:30:00+08:00' }
            }
          }
        },
        fieldMapping
      ).due
    ).toBe('2026-09-04')
  })
})
