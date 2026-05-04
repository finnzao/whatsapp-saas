import { Module } from '@nestjs/common';
import { ProductsService } from './products/products.service';
import { ProductsController } from './products/products.controller';
import { CategoriesService } from './categories/categories.service';
import { CategoriesController } from './categories/categories.controller';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [CustomFieldsModule, AiModule],
  providers: [ProductsService, CategoriesService],
  controllers: [ProductsController, CategoriesController],
  exports: [ProductsService, CategoriesService, CustomFieldsModule],
})
export class CatalogModule {}
