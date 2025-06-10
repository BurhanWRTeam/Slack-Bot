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

  let userId = null;

  const mentionMatch = text.match(/<@([A-Z0-9]+)>/);
  if (mentionMatch) {
    userId = mentionMatch[1];
  }

  try {
    if (!userId) {
      const users = await client.users.list();
      const nameText = text.replace(/[^a-zA-Z\s]/g, "").toLowerCase();
      const matched = users.members.find((u) =>
        u.profile?.real_name?.toLowerCase().includes(nameText)
      );
      if (matched) userId = matched.id;
    }

    if (userId) {
      const info = await client.users.info({ user: userId });
      const email = info?.user?.profile?.email;
      if (email) {
        await say(`<@${userId}>'s email is: ${email}`);
      } else {
        await say(`Email not found for <@${userId}>.`);
      }
    } else {
      await say(`Couldn't identify the user you're referring to.`);
    }
  } catch (err) {
    console.error(err);
    await say(`Error fetching email.`);
  }
});

module.exports = receiver.app;
