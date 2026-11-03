import { Controller, Get } from '@nestjs/common';
import { StudentEntity } from '../src/students/student.entity';

@Controller('leaking-entity')
export class LeakingEntityController {
  /** Sends an entity, which a real route must never do. */
  @Get()
  getEntity(): StudentEntity {
    return new StudentEntity();
  }
}
