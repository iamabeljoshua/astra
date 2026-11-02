import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CreateProbeBodyDto, ListProbesQueryDto, ProbeRouteParamsDto } from './probe.dto';

// A test-only route that echoes its validated input. It sits outside src, so it never ships.
@Controller('probes')
export class ProbeController {
  /** Creates a probe. */
  @Post()
  createProbe(@Body() body: CreateProbeBodyDto): CreateProbeBodyDto {
    return body;
  }

  /** Lists probes. */
  @Get()
  listProbes(@Query() query: ListProbesQueryDto): ListProbesQueryDto {
    return query;
  }

  /** Reads one probe. */
  @Get(':probeId')
  getProbe(@Param() routeParams: ProbeRouteParamsDto): ProbeRouteParamsDto {
    return routeParams;
  }
}
