const { EmbedBuilder } = require('discord.js');

module.exports = {
    config: {
        name: "user", 
        description: "Fetches information about a user", 
        usage: "user [user]" 
    },
    category: "Moderation",
    permissions: "SendMessages", 
    owner: false, 
    run: async (client, message, args, prefix, config, db) => {
        if (args.length !== 1) {
            return message.reply("Please specify one user!");
        }
        
        let user = message.mentions.users.first() || client.users.cache.get(args[0]);
        if (!user) {
            return message.reply("User not found!");
        }
        
        const member = await message.guild.members.fetch(user.id);
        if (!member) {
            return message.reply("This user is not in this Server!");
        }

        const joinPosition = (await message.guild.members.fetch())
            .sort((a, b) => a.joinedTimestamp - b.joinedTimestamp)
            .map(member => member.id)
            .indexOf(member.id) + 1;

        const roles = member.roles.cache
            .filter(role => role.id !== message.guild.id) 
            .sort((a, b) => b.position - a.position);

        const rolesDisplay = roles.map(role => role.toString());

        const highestRoleWithColor = roles.find(role => role.color !== 0);

        const roleColor = highestRoleWithColor ? highestRoleWithColor.color : "Random";

        let presenceStatus = member.presence ? member.presence.status : 'Offline';
        presenceStatus = presenceStatus === 'dnd' ? 'Do not disturb' : presenceStatus.charAt(0).toUpperCase() + presenceStatus.slice(1);

        const fields = [
            { name: "Username", value: `${member.user.tag}`, inline: true },
            { name: "Nickname", value: `${member.nickname || member.user.username}`, inline: true },
            { name: "Presence", value: presenceStatus, inline: true },
            { name: "User ID", value: `${member.user.id}`, inline: true },
            { name: "Bot", value: `${member.user.bot ? "Yes" : "No"}`, inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: "Discord Joined", value: `<t:${Math.round(member.user.createdTimestamp / 1000)}:F>`, inline: true },
            { name: "Server Joined", value: `<t:${Math.round(member.joinedTimestamp / 1000)}:F>`, inline: true },
            { name: "Join Position", value: `${joinPosition}`, inline: true },
            { name: `Roles [${rolesDisplay.length}]`, value: rolesDisplay.length ? rolesDisplay.join(' ') : 'None', inline: false }
        ];


        const embed = new EmbedBuilder()
            .setTitle(`👤 User Information`)
            .setDescription(`Details about ${member.user.tag}`)
            .setColor(roleColor)
            .setImage(member.user.bannerURL({ dynamic: true, size: 2048 }))
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 1024 }))
            .addFields(fields)
            .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) });

        await message.reply({ embeds: [embed] });
    },
};