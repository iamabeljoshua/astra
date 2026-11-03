import { All, Controller, Get, Head, Module, Options, Param, RequestMethod, Search } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ApiExcludeController, ApiExcludeEndpoint } from '@nestjs/swagger';
import { PublicRoute } from '../src/auth/route-access';

const LEAK = { leak: 'data for anyone' };
const ANSWER_WITHOUT_GUARD = (_request: unknown, response: { json: (body: object) => void }) => {
  response.json(LEAK);
};

@PublicRoute()
@ApiExcludeController()
@Controller('planted-excluded-controller')
class PlantedExcludedController {
  @Get()
  read() {
    return LEAK;
  }
}

@PublicRoute()
@Controller('planted')
class PlantedOpenRoutesController {
  @ApiExcludeEndpoint()
  @Get('excluded-endpoint')
  excluded() {
    return LEAK;
  }

  @Options('options')
  options() {
    return LEAK;
  }

  @Head('head')
  head() {
    return LEAK;
  }

  @Search('search')
  search() {
    return LEAK;
  }

  @All('all')
  all() {
    return LEAK;
  }
}

@Controller('planted-students')
class PlantedStudentIgnoringController {
  @Get(':id/sessions')
  readAnyStudent(@Param('id') id: string) {
    return { id, ...LEAK };
  }
}

// Each route here hides from the Swagger document, or ignores the token, in a way an earlier route check missed.
@Module({ controllers: [PlantedExcludedController, PlantedOpenRoutesController, PlantedStudentIgnoringController] })
export class PlantedRoutesModule implements NestModule, OnModuleInit {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  onModuleInit() {
    this.httpAdapterHost.httpAdapter.get('/planted-adapter', ANSWER_WITHOUT_GUARD);
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ANSWER_WITHOUT_GUARD).forRoutes({ path: 'planted-middleware', method: RequestMethod.ALL });
    consumer.apply(ANSWER_WITHOUT_GUARD).forRoutes('planted-middleware-on-any-path');
  }
}
