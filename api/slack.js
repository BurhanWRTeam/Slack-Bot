require("dotenv").config();
const { App, ExpressReceiver } = require("@slack/bolt");

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  endpoints: "/api/slack",
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
});

function isEmailRequest(text) {
  const lowered = text.toLowerCase();

  const gujaratiPatterns = [
    /tamari.*(mail|email).*aap(j|o|jo|jone)/,
    /tamari.*(mail|email).*muk(j|o|jo|jone)/,
    /tamaru.*(mail|email).*aap(j|o|jo|jone)/,
    /tamaru.*(mail|email).*muk(j|o|jo|jone)/,
    /sir.*tamari.*(mail|email)/,
  ];

  const requestWords = ["what", "give", "tell", "send", "need", "know", "get"];
  const isAsking = requestWords.some((w) => lowered.includes(w));
  const isEmailRelated = /mail\s*id|email\s*id|email/.test(lowered);
  const isThirdPerson = /<@([A-Z0-9]+)>|his|her|their|someone|[a-z]+['’]s/.test(
    lowered
  );
  const matchesGujarati = gujaratiPatterns.some((re) => re.test(lowered));

  return (isAsking && isEmailRelated && isThirdPerson) || matchesGujarati;
}

app.message(async ({ message, say, client }) => {
  const text = message.text;
  if (!isEmailRequest(text)) return;

  // Try to extract the mentioned user
  const mentionMatch = text.match(/<@([A-Z0-9]+)>/);
  const mentionedUserId = mentionMatch?.[1];

  if (!mentionedUserId) {
    await say("Please mention the person you're asking about.");
    return;
  }

  try {
    const userInfo = await client.users.info({ user: mentionedUserId });
    const email = userInfo?.user?.profile?.email;

    if (email) {
      await say(`<@${mentionedUserId}>'s email is: ${email}`);
    } else {
      await say(`Sorry, I couldn't find an email for <@${mentionedUserId}>.`);
    }
  } catch (err) {
    console.error("Error fetching user email:", err);
    await say(`Something went wrong while fetching email.`);
  }
});

module.exports = receiver.app;
