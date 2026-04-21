import { Module } from '@nestjs/common';
import { ProductsService } from './products/products.service';
import { ProductsController } from './products/products.controller';
import { CategoriesService } from './categories/categories.service';
import { CategoriesController } from './categories/categories.controller';

@Module({
  providers: [ProductsService, CategoriesService],
  controllers: [ProductsController, CategoriesController],
  exports: [ProductsService, CategoriesService],
})
export class CatalogModule {}
