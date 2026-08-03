import { describe, expect, it } from 'vitest';
import { appendEvent, listEventFiles, readEvents } from '../src/events/store.js';
import { InvalidEventError } from '../src/events/schema.js';
import { makeEvent } from './helpers/fixtures.js';
import { useTempPeblHome } from './helpers/tmp-home.js';

useTempPeblHome();

async function drain<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

describe('event store', () => {
  it('round-trips a single event', async () => {
    const event = makeEvent({ event_id: 'evt-1' });
    appendEvent(event);

    const events = await drain(readEvents(event.project_id));
    expect(events).toEqual([event]);
  });

  it('preserves chronological order across multiple appends', async () => {
    const projectId = 'proj-order';
    const first = makeEvent({ project_id: projectId, event_id: 'a', timestamp: '2026-08-01T10:00:00.000Z' });
    const second = makeEvent({ project_id: projectId, event_id: 'b', timestamp: '2026-08-01T10:05:00.000Z' });
    const third = makeEvent({ project_id: projectId, event_id: 'c', timestamp: '2026-08-02T09:00:00.000Z' });

    appendEvent(first);
    appendEvent(second);
    appendEvent(third);

    const events = await drain(readEvents(projectId));
    expect(events.map((e) => e.event_id)).toEqual(['a', 'b', 'c']);
  });

  it('splits events into one file per UTC day', () => {
    const projectId = 'proj-days';
    appendEvent(makeEvent({ project_id: projectId, timestamp: '2026-08-01T10:00:00.000Z' }));
    appendEvent(makeEvent({ project_id: projectId, timestamp: '2026-08-02T10:00:00.000Z' }));

    const files = listEventFiles(projectId);
    expect(files).toHaveLength(2);
    expect(files[0]).toMatch(/2026-08-01\.jsonl$/);
    expect(files[1]).toMatch(/2026-08-02\.jsonl$/);
  });

  it('keeps different projects in separate directories', async () => {
    appendEvent(makeEvent({ project_id: 'proj-a', event_id: 'only-a' }));
    appendEvent(makeEvent({ project_id: 'proj-b', event_id: 'only-b' }));

    const eventsA = await drain(readEvents('proj-a'));
    const eventsB = await drain(readEvents('proj-b'));

    expect(eventsA.map((e) => e.event_id)).toEqual(['only-a']);
    expect(eventsB.map((e) => e.event_id)).toEqual(['only-b']);
  });

  it('returns an empty stream for a project with no events', async () => {
    const events = await drain(readEvents('never-seen'));
    expect(events).toEqual([]);
  });

  it('refuses to append an invalid event (privacy_class always required)', () => {
    const event = makeEvent();
    // @ts-expect-error deliberately constructing an invalid event for the test
    delete event.privacy_class;
    expect(() => appendEvent(event)).toThrow(InvalidEventError);
  });
});
