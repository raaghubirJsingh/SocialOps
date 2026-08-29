import { Injectable } from '@nestjs/common';

export interface HealthStatus {
  status: 'ok';
  service: 'socialops-api';
}

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getHealth(): HealthStatus {
    return {
      status: 'ok',
      service: 'socialops-api',
    };
  }
}
