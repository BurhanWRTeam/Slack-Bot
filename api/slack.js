const { App, ExpressReceiver } = require("@slack/bolt");

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  endpoints: "/api/slack",
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
});

// Cache for user data to avoid repeated API calls
const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Extract user ID from Slack mention format <@U1234567890>
function extractUserIdFromMention(text) {
  const mentionMatch = text.match(/<@([A-Z0-9]+)>/);
  return mentionMatch ? mentionMatch[1] : null;
}

// Extract username from @username format (fallback)
function extractUsernameFromText(text) {
  const usernameMatch = text.match(/@([a-zA-Z0-9._-]+)/);
  return usernameMatch ? usernameMatch[1] : null;
}

// Check if message is requesting email information
function isEmailRequest(text) {
  const patterns = [
    /email\s*(id|address)?/i,
    /mail\s*(id|address)?/i,
    /e-mail/i,
  ];
  return patterns.some((pattern) => pattern.test(text));
}

// Get user info with caching
async function getUserInfo(client, userId) {
  const cacheKey = `user_${userId}`;
  const cached = userCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const result = await client.users.info({ user: userId });
    const userData = result.user;

    userCache.set(cacheKey, {
      data: userData,
      timestamp: Date.now(),
    });

    return userData;
  } catch (error) {
    console.error(`Failed to fetch user info for ${userId}:`, error);
    return null;
  }
}

// Find user by username (fallback method)
async function findUserByUsername(client, username) {
  const cacheKey = `username_${username.toLowerCase()}`;
  const cached = userCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const result = await client.users.list();
    const normalizedUsername = username.toLowerCase();

    const matchedUser = result.members.find((user) => {
      if (user.deleted || user.is_bot) return false;

      const userName = user.name?.toLowerCase();
      const displayName = user.profile?.display_name?.toLowerCase();
      const realName = user.profile?.real_name?.toLowerCase();

      return (
        userName === normalizedUsername ||
        displayName === normalizedUsername ||
        realName === normalizedUsername
      );
    });

    if (matchedUser) {
      userCache.set(cacheKey, {
        data: matchedUser,
        timestamp: Date.now(),
      });
    }

    return matchedUser || null;
  } catch (error) {
    console.error(`Failed to find user by username ${username}:`, error);
    return null;
  }
}

// Format email response
function formatEmailResponse(user, identifier) {
  const email = user.profile?.email;
  const displayName = user.profile?.display_name || user.real_name || user.name;

  if (!email) {
    return `❌ No email found for ${displayName} (@${user.name})`;
  }

  return `📧 **${displayName}** (@${user.name})\nEmail: \`${email}\``;
}

app.message(async ({ message, say, client }) => {
  // Skip bot messages and threaded messages if not needed
  if (message.subtype === "bot_message" || message.bot_id) return;

  const text = message.text || "";

  // Early return if not an email request
  if (!isEmailRequest(text)) return;

  let user = null;
  let identifier = null;

  try {
    // First, try to extract user ID from Slack mention
    const userId = extractUserIdFromMention(text);

    if (userId) {
      user = await getUserInfo(client, userId);
      identifier = `<@${userId}>`;
    } else {
      // Fallback: try to find by username
      const username = extractUsernameFromText(text);

      if (!username) {
        await say(
          "❓ Please mention a user (e.g., `@username`) or use a proper Slack mention to get their email."
        );
        return;
      }

      user = await findUserByUsername(client, username);
      identifier = `@${username}`;
    }

    if (!user) {
      await say(`❌ User ${identifier} not found in this workspace.`);
      return;
    }

    const response = formatEmailResponse(user, identifier);
    await say(response);
  } catch (error) {
    console.error("Error processing email request:", error);

    await say(
      "⚠️ Something went wrong while retrieving the email. Please try again."
    );
  }
});

// Health check endpoint
receiver.router.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully");
  userCache.clear();
  process.exit(0);
});

module.exports = receiver.app;
