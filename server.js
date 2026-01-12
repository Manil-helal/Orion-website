import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import passport from 'passport';
import { Strategy } from 'passport-discord';
import { Client, GatewayIntentBits, ChannelType, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionFlagsBits } from 'discord.js';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore({}, pool);

const CONFIG = {
    CLIENT_ID: process.env.CLIENT_ID,
    CLIENT_SECRET: process.env.CLIENT_SECRET,
    CALLBACK_URL: process.env.CALLBACK_URL,
    BOT_TOKEN: process.env.BOT_TOKEN,
    PORT: process.env.PORT || 3000,
    OWNER_ID: process.env.OWNER_ID
};

const app = express();
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildBans // ✅ Ajouté pour compter les bans
    ] 
});

app.set('trust proxy', 1);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new Strategy({
    clientID: CONFIG.CLIENT_ID,
    clientSecret: CONFIG.CLIENT_SECRET,
    callbackURL: CONFIG.CALLBACK_URL,
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => done(null, profile)));

app.use(express.json());
app.use(session({
    key: 'orion_session',
    secret: 'v9_total_control_key',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 86400000 * 7 }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(cors());
app.use(express.static(__dirname));

// --- API : STATS GLOBALES ---
app.get('/api/stats', (req, res) => {
    if (!client.isReady()) return res.json({ servers: 0, users: 0, ping: 0, avatar: "https://cdn.discordapp.com/embed/avatars/0.png" });
    const servers = client.guilds.cache.size;
    const users = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
    const ping = client.ws.ping;
    const avatar = client.user.displayAvatarURL();
    res.json({ servers, users, ping, avatar });
});

// --- API : STATS DASHBOARD (NOUVEAU) ---
// Sert à afficher les compteurs sur le dashboard.html
app.get('/api/guild-stats/:guildId', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send();
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.json({ openTickets: 0, bans: 0, topUser: 'N/A' });

    try {
        // 1. Compter les Bans
        const bans = await guild.bans.fetch().catch(() => new Map());
        const banCount = bans.size;

        // 2. Compter les Tickets (Basé sur le nombre de salons dans la catégorie ticket)
        let ticketCount = 0;
        const [rows] = await pool.promise().query('SELECT ticket_category FROM server_config WHERE guild_id = ?', [guild.id]);
        if (rows.length > 0 && rows[0].ticket_category) {
            const catId = rows[0].ticket_category;
            const cat = guild.channels.cache.get(catId);
            if (cat) {
                 // On compte les salons textuels dans la catégorie
                 ticketCount = cat.children.cache.filter(c => c.type === ChannelType.GuildText).size;
            }
        }

        // 3. Récupérer le Top 1 XP
        const [levels] = await pool.promise().query('SELECT user_id, xp FROM levels WHERE guild_id = ? ORDER BY xp DESC LIMIT 1', [guild.id]);
        let topUser = 'Aucun';
        if (levels.length > 0) {
            const u = client.users.cache.get(levels[0].user_id) || await client.users.fetch(levels[0].user_id).catch(() => null);
            topUser = u ? u.username : 'Utilisateur Parti';
        }

        res.json({ openTickets: ticketCount, bans: banCount, topUser });
    } catch (e) {
        console.error("Erreur Stats Dashboard:", e);
        res.json({ openTickets: 0, bans: 0, topUser: 'Erreur' });
    }
});

// --- API : DONNÉES GUILD (CONFIG PAGE) ---
app.get('/api/guild-data/:guildId', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send();
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: "Bot absent" });

    try {
        const channels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => ({ id: c.id, name: c.name }));
        const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).map(c => ({ id: c.id, name: c.name }));
        const roles = guild.roles.cache.filter(r => r.name !== "@everyone").map(r => ({ id: r.id, name: r.name }));
        
        // Sécurité Whitelist (Anti-Crash si table absente)
        let wlIds = new Set();
        try {
            const [wlRows] = await pool.promise().query('SELECT target_id FROM security_whitelist WHERE guild_id = ?', [guild.id]);
            wlIds = new Set(wlRows.map(r => r.target_id));
        } catch (e) {}

        await guild.members.fetch().catch(() => {}); 
        const privilegedMembers = guild.members.cache.filter(m => {
            const isAdmin = m.permissions.has(PermissionFlagsBits.Administrator);
            const isWl = wlIds.has(m.id);
            const isOwner = m.id === CONFIG.OWNER_ID;
            return isAdmin || isWl || isOwner;
        }).map(m => ({
            id: m.id,
            tag: m.user.tag,
            avatar: m.user.displayAvatarURL(),
            joinedAt: m.joinedTimestamp,
            isAdmin: m.permissions.has(PermissionFlagsBits.Administrator),
            isWl: wlIds.has(m.id),
            isOwner: m.id === CONFIG.OWNER_ID
        }));

        res.json({ channels, categories, roles, members: privilegedMembers, memberCount: guild.memberCount, guildName: guild.name });
    } catch (err) { 
        console.error(err);
        res.status(500).json({ error: err.message }); 
    }
});

// --- API : SAUVEGARDE CONFIG ---
app.post('/api/config/save', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send();
    const { guildId, config } = req.body;
    
    try {
        const fields = Object.keys(config);
        const values = Object.values(config);
        
        if (fields.length === 0) return res.json({ success: true });

        const safeFields = ['guild_id', ...fields];
        const safeValues = [guildId, ...values];
        
        const updates = fields.map(f => `${f} = VALUES(${f})`).join(', ');
        const placeholders = safeFields.map(() => '?').join(', ');
        
        const query = `INSERT INTO server_config (${safeFields.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`;
        
        await pool.promise().query(query, safeValues);
        res.json({ success: true });
    } catch (err) { 
        console.error("Erreur SQL:", err);
        res.status(500).json({ error: "Erreur DB." }); 
    }
});

app.post('/api/embed/send/:guildId', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send();
    const { channelId, embed } = req.body;
    try {
        const guild = client.guilds.cache.get(req.params.guildId);
        const channel = guild.channels.cache.get(channelId);
        if (!channel) return res.status(404).json({ error: "Salon introuvable" });

        const embedBuilder = new EmbedBuilder().setTitle(embed.title || null).setDescription(embed.description || null).setColor(embed.color || '#5865F2');
        if(embed.image) embedBuilder.setImage(embed.image);
        if(embed.thumbnail) embedBuilder.setThumbnail(embed.thumbnail);
        if(embed.footer) embedBuilder.setFooter({ text: embed.footer });
        await channel.send({ embeds: [embedBuilder] });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ticket/deploy', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send();
    const { guildId, channelId } = req.body;
    try {
        const [rows] = await pool.promise().query('SELECT * FROM server_config WHERE guild_id = ?', [guildId]);
        const c = rows[0] || {};
        const channel = client.channels.cache.get(channelId);
        if (!channel) return res.status(404).json({ error: "Salon introuvable" });

        const embed = new EmbedBuilder().setTitle(c.ticket_msg_title || "Support").setDescription(c.ticket_msg_desc || "Ouvrez un ticket.").setColor('#2b2d31');
        if (c.ticket_panel_image) embed.setImage(c.ticket_panel_image);
        if (c.ticket_panel_footer) embed.setFooter({ text: c.ticket_panel_footer });
        const components = [];
        const options = JSON.parse(c.ticket_options || '[]');
        if(c.ticket_system_type === 'MENU' && options.length > 0) {
            const menu = new StringSelectMenuBuilder().setCustomId('ticket_start_flow').setPlaceholder('Sélectionnez votre demande...').addOptions(options.map(o => ({ label: o.label.substring(0, 95), value: o.id, emoji: o.emoji || null })));
            components.push(new ActionRowBuilder().addComponents(menu));
        } else {
            const styleMap = { 'Primary': ButtonStyle.Primary, 'Secondary': ButtonStyle.Secondary, 'Success': ButtonStyle.Success, 'Danger': ButtonStyle.Danger };
            const btn = new ButtonBuilder().setCustomId('ticket_start_flow').setLabel(c.ticket_btn_label || "Ouvrir").setStyle(styleMap[c.ticket_btn_style] || ButtonStyle.Primary);
            if(c.ticket_btn_emoji) btn.setEmoji(c.ticket_btn_emoji);
            components.push(new ActionRowBuilder().addComponents(btn));
        }
        await channel.send({ embeds: [embed], components });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/action/:type', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send();
    const { guildId, targetId } = req.body;
    const type = req.params.type;
    try {
        const guild = client.guilds.cache.get(guildId);
        const member = await guild.members.fetch(targetId);
        if (type === 'kick') await member.kick("Via Dashboard");
        if (type === 'ban') await member.ban({ reason: "Via Dashboard" });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Impossible d'exécuter l'action." }); }
});

app.get('/api/config/:guildId', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send();
    try {
        const [rows] = await pool.promise().query('SELECT * FROM server_config WHERE guild_id = ?', [req.params.guildId]);
        res.json(rows[0] || {});
    } catch (err) { res.status(500).send(); }
});

app.get('/api/user', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send();
    const adminGuilds = req.user.guilds.filter(g => (g.permissions & 0x8) === 0x8).map(g => ({
        id: g.id, name: g.name, icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null, hasBot: client.guilds.cache.has(g.id)
    }));
    res.json({ username: req.user.username, avatar: `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png`, guilds: adminGuilds });
});

app.get('/api/bot-info', (req, res) => {
    if (!client.isReady()) return res.json({ loading: true });
    res.json({ avatar: client.user.displayAvatarURL() });
});

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard.html'));
app.get('/logout', (req, res) => { req.logout(() => res.redirect('/')); });

client.login(CONFIG.BOT_TOKEN);
app.listen(CONFIG.PORT, () => console.log(`🚀 Control Center V9.9 sur port ${CONFIG.PORT}`));
