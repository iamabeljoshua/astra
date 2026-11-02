import { IsIn, IsOptional, IsString } from 'class-validator';

export class HealthResponseDto {
  /** Always "ok" when the API can answer requests. */
  @IsIn(['ok'])
  status!: 'ok';

  /** Temporary field that proves the CI drift check fails on stale types. */
  @IsOptional()
  @IsString()
  driftCheck?: string;
}
