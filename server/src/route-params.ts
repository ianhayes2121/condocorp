import type { Request } from 'express';

/** Express 5 types route params as `string | string[]`; normalize to a single string. */
export function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) return value[0];
  return '';
}
