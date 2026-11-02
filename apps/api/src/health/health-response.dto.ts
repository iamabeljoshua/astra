import { IsIn, IsInt, IsOptional } from 'class-validator';

export class HealthResponseDto {
  /** Always "ok" when the API can answer requests. */
  @IsIn(['ok'])
  status!: 'ok';

  /** Seconds since the API started. */
  @IsOptional()
  @IsInt()
  uptimeSeconds?: number;
}
