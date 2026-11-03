import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsObject,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ToStrictInteger } from '../src/to-strict-integer';

export class ProbeOwnerDto {
  /** The name of the person who owns the probe. */
  @IsString()
  ownerName!: string;
}

export class ProbeSensorDto {
  /** The name of the sensor. */
  @IsString()
  sensorName!: string;
}

export class CreateProbeBodyDto {
  /** The name to give the new probe. */
  @IsString()
  @MinLength(1)
  name!: string;

  /** The person who owns the probe. */
  @IsObject()
  @ValidateNested()
  @Type(() => ProbeOwnerDto)
  owner!: ProbeOwnerDto;

  /** The sensors on the probe. */
  @IsArray()
  @ArrayNotEmpty()
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => ProbeSensorDto)
  sensors!: ProbeSensorDto[];
}

export class ListProbesQueryDto {
  /** The largest number of probes to return. */
  @ToStrictInteger()
  @IsInt()
  @Min(1)
  limit!: number;
}

export class ProbeRouteParamsDto {
  /** The ID of the probe to read. */
  @IsUUID()
  probeId!: string;
}
