import {
  CallHandler,
  ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Agency-internal response keys that a Client must NEVER receive
 * (AGENTS.md §13 / Phase 2 strict data boundary).
 *
 *   - `internalNotes`: the Agency-only discussion / AI commentary thread.
 *   - `agencyId`: the managing Agency's Organization id.
 */
const AGENCY_ONLY_RESPONSE_FIELDS: ReadonlySet<string> = new Set([
  'internalNotes',
  'agencyId',
]);

/**
 * Defense-in-depth interceptor that strips agency-internal data from
 * responses sent to Client routes.
 *
 * Applied to the ContentMeController (Client-side) to ensure that even if
 * a service accidentally includes internalNotes or agencyId in the response,
 * they are stripped before reaching the wire.
 *
 * This is a SECOND line of defense. The primary enforcement is:
 *   1. The service layer never queries internalNotes for Client routes.
 *   2. CLIENT_CONTENT_SELECT carries neither internalNotes nor agencyId.
 *
 * The interceptor handles the case where a response is an object or an array
 * of objects, recursively stripping the forbidden fields.
 *
 * IMPORTANT: only PLAIN objects are traversed. Class instances such as `Date`
 * are passed through untouched - rebuilding them from `Object.entries()` would
 * flatten a Date to `{}` and corrupt every timestamp on the wire.
 */
@Injectable()
export class ClientBoundaryInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => this.stripAgencyData(data)));
  }

  /** True only for `{...}` literals and `Object.create(null)` objects. */
  private isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null) return false;
    const prototype = Object.getPrototypeOf(value) as object | null;
    return prototype === Object.prototype || prototype === null;
  }

  private stripAgencyData(data: unknown): unknown {
    if (data === null || data === undefined) return data;

    if (Array.isArray(data)) {
      return data.map((item) => this.stripAgencyData(item));
    }

    if (this.isPlainObject(data)) {
      const cleaned: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        // Strip agency-internal fields entirely - a Client never sees these.
        if (AGENCY_ONLY_RESPONSE_FIELDS.has(key)) continue;
        // Recursively clean nested plain objects.
        cleaned[key] = this.stripAgencyData(value);
      }
      return cleaned;
    }

    // Dates, Decimals and any other non-plain instance: leave untouched.
    return data;
  }
}