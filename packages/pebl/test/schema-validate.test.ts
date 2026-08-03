import { describe, expect, it } from 'vitest';
import { InvalidEventError, validateEvent } from '../src/events/schema.js';
import { makeEvent } from './helpers/fixtures.js';

describe('validateEvent', () => {
  it('accepts a well-formed event', () => {
    expect(() => validateEvent(makeEvent())).not.toThrow();
  });

  it('rejects a missing privacy_class', () => {
    const event = makeEvent();
    // @ts-expect-error deliberately constructing an invalid event for the test
    delete event.privacy_class;
    expect(() => validateEvent(event)).toThrow(InvalidEventError);
  });

  it('rejects an invalid privacy_class value', () => {
    const event = makeEvent();
    // @ts-expect-error deliberately constructing an invalid event for the test
    event.privacy_class = 'source_code';
    expect(() => validateEvent(event)).toThrow(/privacy_class/);
  });

  it('rejects a non-canonical event_type', () => {
    const event = makeEvent();
    // @ts-expect-error deliberately constructing an invalid event for the test
    event.event_type = 'NotARealEvent';
    expect(() => validateEvent(event)).toThrow(/canonical event type/);
  });

  it('rejects an invalid timestamp', () => {
    const event = makeEvent({ timestamp: 'not-a-date' });
    expect(() => validateEvent(event)).toThrow(/timestamp/);
  });

  it('rejects a missing project_id', () => {
    const event = makeEvent({ project_id: '' });
    expect(() => validateEvent(event)).toThrow(/project_id/);
  });
});
