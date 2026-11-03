import { Controller, Get } from '@nestjs/common';
import { EXAMPLE_STUDENT_ID } from '../database/example-data';
import { HomeScreenResponseDto } from './home-screen.dto';
import { HomeService } from './home.service';

@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  /** Gets what the home screen shows the current student. */
  @Get()
  getHomeScreen(): Promise<HomeScreenResponseDto> {
    return this.homeService.getHomeScreen(EXAMPLE_STUDENT_ID);
  }
}
