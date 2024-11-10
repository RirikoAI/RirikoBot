import { Injectable } from '@nestjs/common';
import { PaginationFeature } from '#util/features/pagination.feature';
import { MenuFeature } from '#util/features/menu.feature';
import { MenuFeatureParams } from '#util/features/menu-feature.types';
import { PaginationFeatureParams } from '#util/features/pagination-feature-types';

/**
 * Pagination service handles paginated responses with buttons.
 * @class CommandFeatures
 * @author Earnest Angel (https://angel.net.my)
 */
@Injectable()
export class CommandFeatures {
  async createPagination(params: PaginationFeatureParams) {
    return new PaginationFeature(params);
  }

  async createMenu(params: MenuFeatureParams) {
    return new MenuFeature(params);
  }
}
