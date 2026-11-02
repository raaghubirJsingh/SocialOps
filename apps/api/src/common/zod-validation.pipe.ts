import { BadRequestException } from '@nestjs/common';
import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';

/**
 * Zod-based validation pipe for NestJS controllers.
 *
 * Throws a BadRequestException with structured field errors when the
 * incoming payload does not match the provided Zod schema. Server-side
 * validation is always authoritative (AGENTS.md section 8).
 */
export class ZodValidationPipe<TOutput, TInput = TOutput>
  implements PipeTransform<unknown, TOutput>
{
  constructor(
    private readonly schema: ZodType<TOutput, ZodTypeDef, TInput>,
  ) {}

  transform(value: unknown, _metadata: ArgumentMetadata): TOutput {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const fieldErrors = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      throw new BadRequestException({
        statusCode: 400,
        error: 'ValidationError',
        message: 'Request payload failed validation',
        details: fieldErrors,
      });
    }
    return result.data;
  }
}
