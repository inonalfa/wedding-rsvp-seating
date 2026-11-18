import type { D1Database } from "@cloudflare/workers-types";

export const photoKinds = ["cover", "couple", "card"] as const;
export type PhotoKind = typeof photoKinds[number];
export const maxPhotoBytes = 800 * 1024;
const photoId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

/** Detects the image type from its magic bytes; the client-declared type is never trusted. */
export function sniffImage(bytes: Uint8Array) {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length > 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export async function readLimitedBody(request: Request, limit: number) {
  if (!request.body || Number(request.headers.get("content-length")) > limit) return null;
  const reader = request.body.getReader();
  const buffer = new Uint8Array(limit);
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (length + value.byteLength > limit) { await reader.cancel(); return null; }
      buffer.set(value, length);
      length += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  return buffer.slice(0, length);
}

const ownedEvent = "SELECT event_id FROM events WHERE event_id = ? AND owner_id = ? AND purge_at > ?";

export function photoStore(db: D1Database, owner: string, eventId: string, now: number) {
  const scope = [eventId, owner, now];
  return {
    async list() {
      return (await db.prepare(`SELECT kind, photo_id FROM event_photos WHERE event_id = (${ownedEvent})`)
        .bind(...scope).all<{ kind: PhotoKind; photo_id: string }>()).results;
    },
    async put(kind: PhotoKind, bytes: Uint8Array, contentType: string) {
      const id = crypto.randomUUID();
      const row = await db.prepare(`INSERT INTO event_photos(event_id, kind, photo_id, content_type, data, created_at)
        SELECT event_id, ?, ?, ?, ?, ? FROM events WHERE event_id = (${ownedEvent})
        ON CONFLICT(event_id, kind) DO UPDATE SET photo_id = excluded.photo_id, content_type = excluded.content_type,
          data = excluded.data, created_at = excluded.created_at RETURNING photo_id`)
        .bind(kind, id, contentType, bytes, now, ...scope).first<{ photo_id: string }>();
      return row?.photo_id ?? null;
    },
    async remove(kind: PhotoKind) {
      const result = await db.prepare(`DELETE FROM event_photos WHERE event_id = (${ownedEvent}) AND kind = ?`).bind(...scope, kind).run();
      return result.meta.changes === 1;
    },
  };
}

/** Public read of an uploaded photo. Photo IDs are random and change on every replacement. */
export async function servePhoto(db: D1Database, id: string, now: number) {
  if (!photoId.test(id)) return new Response("Not found", { status: 404 });
  const row = await db.prepare(`SELECT p.content_type, p.data FROM event_photos p JOIN events e ON e.event_id = p.event_id
    WHERE p.photo_id = ? AND e.purge_at > ?`).bind(id, now).first<{ content_type: string; data: ArrayBuffer | Uint8Array | number[] }>();
  if (!row) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const data = new Uint8Array(row.data as ArrayBuffer);
  return new Response(data, {
    headers: {
      "Content-Type": row.content_type,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
