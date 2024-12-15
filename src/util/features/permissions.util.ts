import { DiscordGuildMember } from '#command/command.types';
import { PermissionsBitField } from 'discord.js';

/**
 * Utility class for checking permissions
 * @category Utility
 * @author Earnest Angel (https://angel.net.my)
 */
export class PermissionsUtil {
  /**
   * Check if the user has all permissions stated in the permissions array
   * @param member
   * @param permissions
   */
  static async hasPermissions(
    member: DiscordGuildMember,
    permissions: DiscordPermissions,
  ) {
    if (!permissions) return true;
    const memberPermissions = member.permissions;
    // check memberPermissions every against Permissions
    for (const permission of permissions) {
      if (!memberPermissions.has(Permissions[permission])) {
        return false;
      }
    }
    return true;
  }
}

// The list is not exhaustive, but you can add more permissions as needed.
export const Permissions = {
  Administrator: PermissionsBitField.Flags.Administrator,
  CreateInstantInvite: PermissionsBitField.Flags.CreateInstantInvite,
  MuteMembers: PermissionsBitField.Flags.MuteMembers,
  KickMembers: PermissionsBitField.Flags.KickMembers,
  BanMembers: PermissionsBitField.Flags.BanMembers,
  ManageChannels: PermissionsBitField.Flags.ManageChannels,
  ManageGuild: PermissionsBitField.Flags.ManageGuild,
  AddReactions: PermissionsBitField.Flags.AddReactions,
  ViewAuditLog: PermissionsBitField.Flags.ViewAuditLog,
  PrioritySpeaker: PermissionsBitField.Flags.PrioritySpeaker,
  Stream: PermissionsBitField.Flags.Stream,
  ViewChannel: PermissionsBitField.Flags.ViewChannel,
  SendMessages: PermissionsBitField.Flags.SendMessages,
  SendTTSMessages: PermissionsBitField.Flags.SendTTSMessages,
  ManageMessages: PermissionsBitField.Flags.ManageMessages,
  EmbedLinks: PermissionsBitField.Flags.EmbedLinks,
  AttachFiles: PermissionsBitField.Flags.AttachFiles,
  ReadMessageHistory: PermissionsBitField.Flags.ReadMessageHistory,
  MentionEveryone: PermissionsBitField.Flags.MentionEveryone,
  UseExternalEmojis: PermissionsBitField.Flags.UseExternalEmojis,
  ViewGuildInsights: PermissionsBitField.Flags.ViewGuildInsights,
  Connect: PermissionsBitField.Flags.Connect,
  Speak: PermissionsBitField.Flags.Speak,
  DeafenMembers: PermissionsBitField.Flags.DeafenMembers,
  MoveMembers: PermissionsBitField.Flags.MoveMembers,
  UseVAD: PermissionsBitField.Flags.UseVAD,
  ChangeNickname: PermissionsBitField.Flags.ChangeNickname,
  ManageNicknames: PermissionsBitField.Flags.ManageNicknames,
  ManageRoles: PermissionsBitField.Flags.ManageRoles,
  ManageWebhooks: PermissionsBitField.Flags.ManageWebhooks,
  UseApplicationCommands: PermissionsBitField.Flags.UseApplicationCommands,
  RequestToSpeak: PermissionsBitField.Flags.RequestToSpeak,
  ManageThreads: PermissionsBitField.Flags.ManageThreads,
  SendMessagesInThreads: PermissionsBitField.Flags.SendMessagesInThreads,
  CreatePrivateThreads: PermissionsBitField.Flags.CreatePrivateThreads,
  UseExternalStickers: PermissionsBitField.Flags.UseExternalStickers,
  ViewCreatorMonetizationAnalytics:
    PermissionsBitField.Flags.ViewCreatorMonetizationAnalytics,
  ManageEmojisAndStickers: PermissionsBitField.Flags.ManageEmojisAndStickers,
  SendPolls: PermissionsBitField.Flags.SendPolls,
  CreateGuildExpressions: PermissionsBitField.Flags.CreateGuildExpressions,
};

export type DiscordPermission = keyof typeof Permissions;
export type DiscordPermissions = DiscordPermission[];
