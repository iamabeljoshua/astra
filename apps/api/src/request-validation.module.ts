import { BadRequestException, Module, ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';

// The pipe and its libraries recurse through a body, so very deep nesting overflows the stack.
class RequestValidationPipe extends ValidationPipe {
  override async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    try {
      return await super.transform(value, metadata);
    } catch (error) {
      if (error instanceof RangeError) {
        throw new BadRequestException(['The request is nested too deeply.']);
      }
      throw error;
    }
  }
}

@Module({
  providers: [
    {
      provide: APP_PIPE,
      useValue: new RequestValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class RequestValidationModule {}
