import type { EventRow } from "../types.js";

const escapeText = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\r/g, "");

const formatUtcTimestamp = (date: string) => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date.replace(/[-:]/g, "");
  return parsed.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
};

const formatDateOnly = (date: string) => date.replace(/-/g, "");

const plusOneDay = (date: string) => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return formatDateOnly(parsed.toISOString().slice(0, 10));
};

export const buildCalendar = (events: EventRow[]) => {
  const now = formatUtcTimestamp(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LLM Timeline Service//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:LLM Timeline",
    "X-WR-CALDESC:Official AI release timeline feed",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const event of events) {
    const uid = `${event.id}@llm-timeline.local`;
    const summary = escapeText(event.title || "(untitled)");
    const description = escapeText([event.summary, event.evidence_url].filter(Boolean).join("\\n\\n"));
    const category = escapeText(event.category);
    if (event.date_precision === "date") {
      const start = formatDateOnly(event.event_date);
      const end = plusOneDay(event.event_date);
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${uid}`);
      lines.push(`SUMMARY:${summary}`);
      lines.push(`DTSTAMP:${now}`);
      lines.push(`DTSTART;VALUE=DATE:${start}`);
      lines.push(`DTEND;VALUE=DATE:${end}`);
      lines.push(`DESCRIPTION:${description}`);
      lines.push(`URL:${escapeText(event.evidence_url)}`);
      lines.push(`CATEGORIES:${category}`);
      lines.push("END:VEVENT");
      continue;
    }
    const stamp = formatUtcTimestamp(event.event_date);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`SUMMARY:${summary}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${stamp}`);
    lines.push(`DTEND:${stamp}`);
    lines.push(`DESCRIPTION:${description}`);
    lines.push(`URL:${escapeText(event.evidence_url)}`);
    lines.push(`CATEGORIES:${category}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
};
