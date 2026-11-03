import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsInt, IsObject, IsString, IsUUID, MinDate, ValidateNested } from 'class-validator';
import { IsStorableText } from '../src/is-storable-text';
import { ToStrictInteger } from '../src/to-strict-integer';

export class FieldProbeItemDto {
  /** Text that the API saves. */
  @IsStorableText()
  label!: string;

  /** A field whose rule has a custom message. */
  @IsString({ message: 'Pick a nickname.' })
  nickname!: string;
}

export class CreateFieldProbeBodyDto {
  /** A field whose custom message names no field. */
  @IsString({ message: 'Pick a nickname.' })
  nickname!: string;

  /** A field whose custom message starts with the name of another field. */
  @IsString({ message: 'title must be unique' })
  subject!: string;

  /** Text that the API saves. */
  @IsStorableText()
  note!: string;

  /** A list of texts, each with a rule. */
  @IsString({ each: true })
  tags!: string[];

  /** A list with no repeated values. */
  @ArrayUnique()
  labels!: string[];

  /** A date with an earliest value. */
  @Type(() => Date)
  @MinDate(new Date('2000-01-01T00:00:00Z'))
  startsAt!: Date;

  /** A nested object. */
  @IsObject()
  @ValidateNested()
  @Type(() => FieldProbeItemDto)
  inner!: FieldProbeItemDto;

  /** A list of nested objects, written as the README's recipe says. */
  @IsArray()
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => FieldProbeItemDto)
  items!: FieldProbeItemDto[];

  /** A list of nested objects with no rule on the list itself. */
  @ValidateNested({ each: true })
  @Type(() => FieldProbeItemDto)
  looseItems!: FieldProbeItemDto[];
}

export class ListFieldProbesQueryDto {
  /** A whole number in a query string. */
  @ToStrictInteger()
  @IsInt()
  limit!: number;
}

export class FieldProbeRouteParamsDto {
  /** The ID of the probe to read. */
  @IsUUID()
  probeId!: string;
}
