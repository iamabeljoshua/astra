import { Controller, Get } from '@nestjs/common';
import { CurrentStudentId } from '../auth/route-access';
import { HomeScreenResponseDto } from './home-screen.dto';
import { HomeService } from './home.service';

@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  /** Gets what the home screen shows the signed-in student. */
  @Get()
  getHomeScreen(@CurrentStudentId() studentId: string): Promise<HomeScreenResponseDto> {
    return this.homeService.getHomeScreen(studentId);
  }
}
