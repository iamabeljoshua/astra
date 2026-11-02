import { IsIn } from 'class-validator';

export class HealthResponseDto {
  /** Always "ok" when the API can answer requests. */
  @IsIn(['ok'])
  status!: 'ok';
}
