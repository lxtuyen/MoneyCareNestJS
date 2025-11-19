export class ApiResponse<T> {
  success: boolean;
  statusCode: number;
  data?: T;
  message?: string;

  constructor(init?: Partial<ApiResponse<T>>) {
    Object.assign(this, init);

    if (this.success === undefined) {
      this.success = this.statusCode >= 200 && this.statusCode < 300;
    }
  }
}
