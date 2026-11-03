import { Controller, Get } from '@nestjs/common';
import { PublicRoute } from '../auth/route-access';
import { HealthResponseDto } from './health-response.dto';

@Controller('health')
export class HealthController {
  /** Reports that the API can answer requests. */
  @PublicRoute()
  @Get()
  getHealth(): HealthResponseDto {
    return { status: 'ok' };
  }
}
