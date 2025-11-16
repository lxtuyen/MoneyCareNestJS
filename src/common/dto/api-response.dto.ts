export class ApiResponse<T> {
  statusCode: number;
  data?: T;
  message?: string;

  constructor(init?: Partial<ApiResponse<T>>) {
    Object.assign(this, init);
  }
}
