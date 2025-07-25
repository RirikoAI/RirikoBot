import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReactionRole } from '#database/entities/reaction-role.entity';
import { ReactionRoleService } from './reaction-role.service';

/**
 * ReactionRoleModule
 * @description Module for reaction role functionality
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: [TypeOrmModule.forFeature([ReactionRole])],
  providers: [ReactionRoleService],
  exports: [ReactionRoleService],
})
export class ReactionRoleModule {}
