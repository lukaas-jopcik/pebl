import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { PeblEvent } from '../../events/schema.js';

/**
 * Minimal shapes for the subset of the OTLP/HTTP JSON encoding this
 * package reads. Claude Code's GA OpenTelemetry export can be pointed at
 * an arbitrary OTLP/HTTP endpoint (OTEL_EXPORTER_OTLP_PROTOCOL=http/json);
 * this receiver is that endpoint, bound to localhost only. This is
 * additive enrichment (cost/token numbers), never required for FR-1's
 * core fields, which already come from hook payloads alone.
 */
interface OtlpAttribute {
  key: string;
  value: { stringValue?: string; intValue?: string; doubleValue?: number };
}

interface OtlpDataPoint {
  attributes?: OtlpAttribute[];
  asDouble?: number;
  asInt?: string;
  timeUnixNano?: string;
}

interface OtlpMetric {
  name: string;
  sum?: { dataPoints?: OtlpDataPoint[] };
  gauge?: { dataPoints?: OtlpDataPoint[] };
}

interface OtlpLogRecord {
  attributes?: OtlpAttribute[];
  body?: { stringValue?: string };
  timeUnixNano?: string;
}

interface OtlpMetricsPayload {
  resourceMetrics?: Array<{
    scopeMetrics?: Array<{ metrics?: OtlpMetric[] }>;
  }>;
}

interface OtlpLogsPayload {
  resourceLogs?: Array<{
    scopeLogs?: Array<{ logRecords?: OtlpLogRecord[] }>;
  }>;
}

const RELEVANT_METRIC_NAMES = new Set(['claude_code.cost.usage', 'claude_code.token.usage']);
const RELEVANT_LOG_EVENT_NAMES = new Set(['claude_code.tool_result', 'claude_code.tool_decision']);

function attrValue(attr: OtlpAttribute): string | number | undefined {
  if (attr.value.stringValue !== undefined) return attr.value.stringValue;
  if (attr.value.intValue !== undefined) return Number(attr.value.intValue);
  if (attr.value.doubleValue !== undefined) return attr.value.doubleValue;
  return undefined;
}

function attrsToRecord(attrs: OtlpAttribute[] | undefined): Record<string, string | number> {
  const record: Record<string, string | number> = {};
  for (const attr of attrs ?? []) {
    const value = attrValue(attr);
    if (value !== undefined) record[attr.key] = value;
  }
  return record;
}

export interface OtelEnrichment {
  metricName: string;
  value: number;
  attributes: Record<string, string | number>;
}

/** Pure parser: extracts the handful of GA metrics we care about from an OTLP/HTTP JSON metrics payload. */
export function extractRelevantMetrics(body: OtlpMetricsPayload): OtelEnrichment[] {
  const out: OtelEnrichment[] = [];
  for (const resource of body.resourceMetrics ?? []) {
    for (const scope of resource.scopeMetrics ?? []) {
      for (const metric of scope.metrics ?? []) {
        if (!RELEVANT_METRIC_NAMES.has(metric.name)) continue;
        const points = metric.sum?.dataPoints ?? metric.gauge?.dataPoints ?? [];
        for (const point of points) {
          const value = point.asDouble ?? (point.asInt !== undefined ? Number(point.asInt) : undefined);
          if (value === undefined) continue;
          out.push({ metricName: metric.name, value, attributes: attrsToRecord(point.attributes) });
        }
      }
    }
  }
  return out;
}

export interface OtelLogEnrichment {
  eventName: string;
  body?: string | undefined;
  attributes: Record<string, string | number>;
}

/** Pure parser: extracts the handful of GA events we care about from an OTLP/HTTP JSON logs payload. */
export function extractRelevantLogs(body: OtlpLogsPayload): OtelLogEnrichment[] {
  const out: OtelLogEnrichment[] = [];
  for (const resource of body.resourceLogs ?? []) {
    for (const scope of resource.scopeLogs ?? []) {
      for (const record of scope.logRecords ?? []) {
        const attributes = attrsToRecord(record.attributes);
        const eventName = attributes['event.name'];
        if (typeof eventName !== 'string' || !RELEVANT_LOG_EVENT_NAMES.has(eventName)) continue;
        const entry: OtelLogEnrichment = { eventName, attributes };
        if (record.body?.stringValue !== undefined) entry.body = record.body.stringValue;
        out.push(entry);
      }
    }
  }
  return out;
}

export function otelMetricToEvent(
  enrichment: OtelEnrichment,
  projectId: string,
  sessionId: string,
): PeblEvent {
  return {
    event_id: randomUUID(),
    // OTel enrichment never carries its own lifecycle signal — it's always
    // attached to whichever tool/prompt event it correlates with via
    // prompt.id, so it's stored as PostToolUse enrichment payload, not a
    // new canonical event type.
    event_type: 'PostToolUse',
    timestamp: new Date().toISOString(),
    source: 'claude-code',
    project_id: projectId,
    session_id: sessionId,
    privacy_class: 'metadata',
    payload: {
      otel_metric: enrichment.metricName,
      otel_value: enrichment.value,
      otel_attributes: enrichment.attributes,
    },
  };
}

export interface OtlpReceiverHandle {
  server: Server;
  port: number;
  close: () => Promise<void>;
}

/**
 * Starts a local-only (127.0.0.1) HTTP receiver for OTLP/HTTP JSON on an
 * ephemeral port. Opt-in only (`pebl setup --agent claude-code --otel`) —
 * never started by default, and never reachable from outside the machine.
 */
export function startOtlpReceiver(onEvent: (event: PeblEvent) => void, defaultProjectId: string): Promise<OtlpReceiverHandle> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      handleRequest(req, res, onEvent, defaultProjectId).catch((err: unknown) => {
        res.statusCode = 500;
        res.end(String(err));
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        server,
        port,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw.length > 0 ? JSON.parse(raw) : {};
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  onEvent: (event: PeblEvent) => void,
  defaultProjectId: string,
): Promise<void> {
  const url = req.url ?? '';
  const body = await readJsonBody(req);

  if (url.startsWith('/v1/metrics')) {
    for (const enrichment of extractRelevantMetrics(body as OtlpMetricsPayload)) {
      const sessionId = String(enrichment.attributes['session.id'] ?? 'unknown-session');
      onEvent(otelMetricToEvent(enrichment, defaultProjectId, sessionId));
    }
  } else if (url.startsWith('/v1/logs')) {
    for (const log of extractRelevantLogs(body as OtlpLogsPayload)) {
      const sessionId = String(log.attributes['session.id'] ?? 'unknown-session');
      onEvent({
        event_id: randomUUID(),
        event_type: 'PostToolUse',
        timestamp: new Date().toISOString(),
        source: 'claude-code',
        project_id: defaultProjectId,
        session_id: sessionId,
        privacy_class: 'metadata',
        payload: { otel_log_event: log.eventName, otel_body: log.body, otel_attributes: log.attributes },
      });
    }
  }

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end('{}');
}
