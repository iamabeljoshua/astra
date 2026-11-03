import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CreateFieldProbeBodyDto, FieldProbeRouteParamsDto, ListFieldProbesQueryDto } from './field-messages-probe.dto';

@Controller('field-probes')
export class FieldMessagesProbeController {
  /** Creates a probe. */
  @Post()
  createProbe(@Body() body: CreateFieldProbeBodyDto): CreateFieldProbeBodyDto {
    return body;
  }

  /** Lists probes. */
  @Get()
  listProbes(@Query() query: ListFieldProbesQueryDto): ListFieldProbesQueryDto {
    return query;
  }

  /** Reads one probe. */
  @Get(':probeId')
  getProbe(@Param() routeParams: FieldProbeRouteParamsDto): FieldProbeRouteParamsDto {
    return routeParams;
  }
}
