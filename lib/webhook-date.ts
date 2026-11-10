import { eventConfig } from './event-config';
const WEBHOOK_TIME_ZONE = eventConfig.timeZone;

type WebhookDatePart = "day" | "month" | "year" | "hour" | "minute";

export function formatWebhookDateTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid webhook date");
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: WEBHOOK_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const getPart = (type: WebhookDatePart) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${getPart("day")}/${getPart("month")}/${getPart("year")}\n${getPart("hour")}:${getPart("minute")}`;
}
