import { IsArray, IsInt, Min } from 'class-validator';

export class UpdateEssentialExpenseCategoriesDto {
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  categoryIds!: number[];
}
