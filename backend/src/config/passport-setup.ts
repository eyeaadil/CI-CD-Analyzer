import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Passport needs to be able to serialize and deserialize users to support persistent login sessions
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Configure the GitHub strategy for use by Passport.
passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      callbackURL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3001/auth/github/callback',
    },
    async (accessToken: string, refreshToken: string, profile: any, done: any) => {
      try {
        // Find an existing user or create a new one
        const user = await prisma.user.upsert({
          where: { githubId: profile.id },
          update: {
            username: profile.username,
            avatarUrl: profile.photos?.[0]?.value,
          },
          create: {
            githubId: profile.id,
            username: profile.username,
            avatarUrl: profile.photos?.[0]?.value,
          },
        });

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);

export default passport;
