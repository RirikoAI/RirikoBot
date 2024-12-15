import { Injectable } from '@nestjs/common';
import { PaginationFeature } from '#util/features/pagination.feature';
import { MenuFeature } from '#util/features/menu.feature';
import { MenuFeatureParams } from '#util/features/menu-feature.types';
import { PaginationFeatureParams } from '#util/features/pagination-feature.types';
import { addButtons } from '#util/features/add-buttons.feature';
import {
  DiscordPermission,
  PermissionsUtil,
} from '#util/features/permissions.util';
import { DiscordGuildMember } from '#command/command.types';

/**
 * Pagination service handles paginated responses with buttons.
 * @class CommandFeatures
 * @author Earnest Angel (https://angel.net.my)
 */
@Injectable()
export class CommandFeatures {
  permissions?: DiscordPermission[];

  async createPagination(params: PaginationFeatureParams) {
    return new PaginationFeature(params);
  }

  async createMenu(params: MenuFeatureParams) {
    return new MenuFeature(params);
  }

  addButtons(rawButtons: any): any {
    return addButtons(rawButtons);
  }

  async hasPermissions(
    member: DiscordGuildMember,
    permissions: DiscordPermission[],
  ) {
    if (!permissions) return true;
    return await PermissionsUtil.hasPermissions(member, permissions);
  }
}
