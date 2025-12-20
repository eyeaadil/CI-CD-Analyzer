import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const SettingsController = {
    /**
     * GET /api/user/settings
     * Returns user settings
     */
    getSettings: async (req, res) => {
        try {
            const userId = req.user.id;

            let settings = await prisma.userSettings.findUnique({
                where: { userId }
            });

            // Create default settings if not exists
            if (!settings) {
                settings = await prisma.userSettings.create({
                    data: {
                        userId,
                        theme: 'dark',
                        emailDigest: 'weekly',
                        notifyOnFailure: true,
                        notifyOnSuccess: false
                    }
                });
            }

            res.json({
                theme: settings.theme,
                emailDigest: settings.emailDigest,
                slackWebhook: settings.slackWebhook ? '••••••••' : null,
                notifyOnFailure: settings.notifyOnFailure,
                notifyOnSuccess: settings.notifyOnSuccess
            });
        } catch (error) {
            console.error('Get settings error:', error);
            res.status(500).json({ error: 'Failed to fetch settings' });
        }
    },

    /**
     * PUT /api/user/settings
     * Updates user settings
     */
    updateSettings: async (req, res) => {
        try {
            const userId = req.user.id;
            const { theme, emailDigest, slackWebhook, notifyOnFailure, notifyOnSuccess } = req.body;

            // Validate theme
            if (theme && !['dark', 'light'].includes(theme)) {
                return res.status(400).json({ error: 'Invalid theme. Must be "dark" or "light"' });
            }

            // Validate emailDigest
            if (emailDigest && !['daily', 'weekly', 'none'].includes(emailDigest)) {
                return res.status(400).json({ error: 'Invalid emailDigest. Must be "daily", "weekly", or "none"' });
            }

            const updateData = {};
            if (theme !== undefined) updateData.theme = theme;
            if (emailDigest !== undefined) updateData.emailDigest = emailDigest;
            if (slackWebhook !== undefined) updateData.slackWebhook = slackWebhook;
            if (notifyOnFailure !== undefined) updateData.notifyOnFailure = notifyOnFailure;
            if (notifyOnSuccess !== undefined) updateData.notifyOnSuccess = notifyOnSuccess;

            const settings = await prisma.userSettings.upsert({
                where: { userId },
                update: updateData,
                create: {
                    userId,
                    ...updateData
                }
            });

            res.json({
                message: 'Settings updated successfully',
                settings: {
                    theme: settings.theme,
                    emailDigest: settings.emailDigest,
                    slackWebhook: settings.slackWebhook ? '••••••••' : null,
                    notifyOnFailure: settings.notifyOnFailure,
                    notifyOnSuccess: settings.notifyOnSuccess
                }
            });
        } catch (error) {
            console.error('Update settings error:', error);
            res.status(500).json({ error: 'Failed to update settings' });
        }
    }
};
