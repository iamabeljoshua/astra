import { IsIn, IsOptional, IsString } from 'class-validator';

export class HealthResponseDto {
  /** Always "ok" when the API can answer requests. */
  @IsIn(['ok'])
  status!: 'ok';

  /** Planted field that the committed generated file does not know. */
  @IsOptional()
  @IsString()
  planted?: string;
}
