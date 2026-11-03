import { Catch, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

interface PostgresError {
  code?: string;
  constraint?: string;
}

interface JsonResponse {
  status: (code: number) => { json: (body: object) => void };
}

// The default handler logs the whole error. Its parameters can hold a birth date, and its message can repeat a request value.
@Catch(QueryFailedError)
export class QueryErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(QueryErrorFilter.name);

  catch(error: QueryFailedError, host: ArgumentsHost) {
    const { code, constraint } = error.driverError as PostgresError;
    this.logger.error(`A database query failed: code ${code ?? 'unknown'}, constraint ${constraint ?? 'none'}`);
    host
      .switchToHttp()
      .getResponse<JsonResponse>()
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' });
  }
}
