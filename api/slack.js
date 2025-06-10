const { App, ExpressReceiver } = require("@slack/bolt");

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  endpoints: "/api/slack",
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
});

// Match @username from message
function extractUsername(text) {
  const match = text.match(/@([a-zA-Z0-9._-]+)/);
  return match ? match[1] : null;
}

// Check if it's an email query
function isEmailRequest(text) {
  const lowered = text.toLowerCase();
  return (
    lowered.includes("email id") ||
    lowered.includes("mail id") ||
    lowered.includes("email")
  );
}

app.message(async ({ message, say, client }) => {
  if (message.subtype || message.bot_id) return;

  const text = message.text || "";
  if (!isEmailRequest(text)) return;

  const username = extractUsername(text);
  if (!username) {
    await say("Please mention the user like `@username` to get their email.");
    return;
  }

  try {
    // Fetch all users in the workspace
    const allUsers = await client.users.list();
    const matchedUser = allUsers.members.find((u) => {
      const uname = u.name?.toLowerCase();
      const display = u.profile?.display_name?.toLowerCase();
      return (
        uname === username.toLowerCase() || display === username.toLowerCase()
      );
    });

    if (!matchedUser) {
      await say(`User @${username} not found.`);
      return;
    }

    const email = matchedUser?.profile?.email;
    if (email) {
      await say(`📧 @${username}'s email is: \`${email}\``);
    } else {
      await say(`Couldn't find an email for @${username}.`);
    }
  } catch (err) {
    console.error("Error:", err);
    await say("Something went wrong while retrieving the email.");
  }
});

module.exports = receiver.app;
