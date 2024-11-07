import { Injectable } from '@nestjs/common';
import { PaginationFeature } from '#util/features/pagination.feature';
import { Pages } from '#command/command.types';

/**
 * Pagination service handles paginated responses with buttons.
 */
@Injectable()
export class CommandFeatures {
  async startPagination(interaction: any, pages: Pages) {
    return new PaginationFeature(interaction, pages);
  }
}
