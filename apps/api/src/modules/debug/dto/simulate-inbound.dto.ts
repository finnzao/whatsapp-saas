import { IsString, MinLength, IsOptional } from 'class-validator';

export class SimulateInboundDto {
  @IsString()
  @MinLength(1)
  text!: string;

  @IsOptional()
  @IsString()
  contactName?: string;
}
