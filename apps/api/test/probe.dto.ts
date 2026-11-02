import { Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateProbeBodyDto {
  /** The name to give the new probe. */
  @IsString()
  @MinLength(1)
  name!: string;
}

export class ListProbesQueryDto {
  /** The largest number of probes to return. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit!: number;
}

export class ProbeRouteParamsDto {
  /** The ID of the probe to read. */
  @IsUUID()
  probeId!: string;
}
