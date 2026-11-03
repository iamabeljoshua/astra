import { Controller, Get } from '@nestjs/common';
import { HealthResponseDto } from './health-response.dto';

@Controller('health')
export class HealthController {
  /** Reports that the API can answer requests. */
  @Get()
  getHealth(): HealthResponseDto {
    return { status: 'ok' };
  }
}
