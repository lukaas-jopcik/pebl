import { describe, expect, it } from 'vitest';
import {
  extractRelevantLogs,
  extractRelevantMetrics,
  startOtlpReceiver,
} from '../src/adapters/claude-code/otel.js';
import type { PeblEvent } from '../src/events/schema.js';

describe('otlp metrics parsing (pure)', () => {
  it('extracts claude_code.cost.usage and claude_code.token.usage, ignoring unrelated metrics', () => {
    const body = {
      resourceMetrics: [
        {
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'claude_code.cost.usage',
                  sum: {
                    dataPoints: [
                      {
                        asDouble: 0.42,
                        attributes: [
                          { key: 'session.id', value: { stringValue: 'sess-1' } },
                          { key: 'prompt.id', value: { stringValue: 'prompt-1' } },
                        ],
                      },
                    ],
                  },
                },
                {
                  name: 'some_unrelated_metric',
                  sum: { dataPoints: [{ asDouble: 999 }] },
                },
                {
                  name: 'claude_code.token.usage',
                  gauge: { dataPoints: [{ asInt: '1200' }] },
                },
              ],
            },
          ],
        },
      ],
    };

    const results = extractRelevantMetrics(body);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      metricName: 'claude_code.cost.usage',
      value: 0.42,
      attributes: { 'session.id': 'sess-1', 'prompt.id': 'prompt-1' },
    });
    expect(results[1]).toEqual({
      metricName: 'claude_code.token.usage',
      value: 1200,
      attributes: {},
    });
  });

  it('returns an empty array for an empty payload', () => {
    expect(extractRelevantMetrics({})).toEqual([]);
  });
});

describe('otlp logs parsing (pure)', () => {
  it('extracts a claude_code.tool_decision log record by its event.name attribute', () => {
    const body = {
      resourceLogs: [
        {
          scopeLogs: [
            {
              logRecords: [
                {
                  body: { stringValue: 'tool decision recorded' },
                  attributes: [
                    { key: 'event.name', value: { stringValue: 'claude_code.tool_decision' } },
                    { key: 'session.id', value: { stringValue: 'sess-1' } },
                  ],
                },
                {
                  attributes: [{ key: 'event.name', value: { stringValue: 'unrelated.event' } }],
                },
              ],
            },
          ],
        },
      ],
    };

    const results = extractRelevantLogs(body);
    expect(results).toHaveLength(1);
    expect(results[0]?.eventName).toBe('claude_code.tool_decision');
    expect(results[0]?.body).toBe('tool decision recorded');
  });
});

describe('otlp receiver (integration)', () => {
  it('binds to 127.0.0.1 only, on an ephemeral port', async () => {
    const events: PeblEvent[] = [];
    const handle = await startOtlpReceiver((event) => events.push(event), 'proj-otel');
    expect(handle.port).toBeGreaterThan(0);
    const address = handle.server.address();
    expect(typeof address === 'object' && address?.address).toBe('127.0.0.1');
    await handle.close();
  });

  it('turns a posted metrics payload into a PeblEvent via the onEvent callback', async () => {
    const events: PeblEvent[] = [];
    const handle = await startOtlpReceiver((event) => events.push(event), 'proj-otel');

    const body = {
      resourceMetrics: [
        {
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'claude_code.cost.usage',
                  sum: {
                    dataPoints: [
                      {
                        asDouble: 0.1,
                        attributes: [{ key: 'session.id', value: { stringValue: 'sess-99' } }],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const response = await fetch(`http://127.0.0.1:${handle.port}/v1/metrics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);

    expect(events).toHaveLength(1);
    expect(events[0]?.session_id).toBe('sess-99');
    expect(events[0]?.payload.otel_metric).toBe('claude_code.cost.usage');
    expect(events[0]?.payload.otel_value).toBe(0.1);

    await handle.close();
  });
});
