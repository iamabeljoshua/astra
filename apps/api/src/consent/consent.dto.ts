import { IsEmail, IsString, MaxLength } from 'class-validator';

const MAX_EMAIL_LENGTH = 254;
const MAX_LINK_TOKEN_LENGTH = 100;

export class AskParentBodyDto {
  /** The address of the parent or guardian who approves this account. */
  @IsEmail()
  @MaxLength(MAX_EMAIL_LENGTH)
  parentEmail!: string;
}

export class ConsentLinkTokenDto {
  /** The token at the end of the consent link. */
  @IsString()
  @MaxLength(MAX_LINK_TOKEN_LENGTH)
  token!: string;
}

export class ConsentLinkResponseDto {
  /** The name of the student asking, or null if they have not given one. */
  studentName!: string | null;

  /** Whether a parent or guardian has accepted through this link. */
  isAccepted!: boolean;
}
