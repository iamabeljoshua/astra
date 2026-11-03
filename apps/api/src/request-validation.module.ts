import { BadRequestException, Module, ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata, ValidationError } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';

type FieldEntry = [fieldPath: string, sentences: string[]];

function getFieldEntries(errors: ValidationError[], parentPath = ''): FieldEntry[] {
  return errors.flatMap((error) => {
    const fieldPath = `${parentPath}${error.property}`;
    const sentences = Object.values(error.constraints ?? {}).map((sentence) => `${parentPath}${sentence}`);
    const ownEntries: FieldEntry[] = sentences.length > 0 ? [[fieldPath, sentences]] : [];
    return [...ownEntries, ...getFieldEntries(error.children ?? [], `${fieldPath}.`)];
  });
}

function addFieldMessages(exception: BadRequestException, fieldMessages: Record<string, string[]>) {
  return new BadRequestException({ ...(exception.getResponse() as object), fieldMessages });
}

class RequestValidationPipe extends ValidationPipe {
  override createExceptionFactory() {
    const createDefaultException = super.createExceptionFactory();
    return (errors: ValidationError[] = []) => {
      const limitedErrors = this.limitValidationErrors(errors, { remaining: this.maxErrorMessagesLength, isExceeded: false });
      const fieldMessages = Object.fromEntries(getFieldEntries(limitedErrors));
      return addFieldMessages(createDefaultException(errors) as BadRequestException, fieldMessages);
    };
  }

  // The pipe and its libraries recurse through a body, so very deep nesting overflows the stack.
  override async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    try {
      return await super.transform(value, metadata);
    } catch (error) {
      if (error instanceof RangeError) {
        throw addFieldMessages(new BadRequestException(['The request is nested too deeply.']), {});
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
