import { ValueTransformer } from 'typeorm';

export class ColumnNumericTransformer implements ValueTransformer {
  to(data: number): number {
    return data;
  }
  from(data: string | null): number | null {
    if (data === null) return null;
    const res = parseFloat(data);
    if (isNaN(res)) return null;
    return res;
  }
}
