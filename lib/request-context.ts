import { AsyncLocalStorage } from 'node:async_hooks';
import type { D1Database } from '@cloudflare/workers-types';
import type { WeddingRuntimeConfig } from './runtime-config';
/** Isolate per-request D1 bindings and secrets across overlapping Worker requests. */
export const requestContext = new AsyncLocalStorage<{ db: D1Database; config: WeddingRuntimeConfig }>();
