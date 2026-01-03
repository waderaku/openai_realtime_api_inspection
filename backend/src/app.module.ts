import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MonitorModule } from './monitor.module';

@Module({
  imports: [MonitorModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
