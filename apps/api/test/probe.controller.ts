import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CreateProbeBodyDto, ListProbesQueryDto, ProbeRouteParamsDto } from './probe.dto';

@Controller('probes')
export class ProbeController {
  /** Creates a probe. */
  @Post()
  createProbe(@Body() body: CreateProbeBodyDto): CreateProbeBodyDto {
    return body;
  }

  /** Lists probes. */
  @Get()
  listProbes(@Query() query: ListProbesQueryDto): { limit: number; isDtoInstance: boolean } {
    return { limit: query.limit, isDtoInstance: query instanceof ListProbesQueryDto };
  }

  /** Reads one probe. */
  @Get(':probeId')
  getProbe(@Param() routeParams: ProbeRouteParamsDto): ProbeRouteParamsDto {
    return routeParams;
  }
}
