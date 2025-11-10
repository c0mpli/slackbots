import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const slackToken = process.env.SLACK_USER_TOKEN;
const githubToken = process.env.GITHUB_TOKEN;
const allowedUsers = (process.env.ALLOWED_USER_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

let latestTimestamps = {};

async function sendMessage(channel, text) {
  await axios.post(
    "https://slack.com/api/chat.postMessage",
    { channel, text },
    { headers: { Authorization: `Bearer ${slackToken}` } }
  );
}

async function approvePR(owner, repo, prNumber) {
  await axios.post(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
    { event: "APPROVE", body: "Approved automatically via automation" },
    {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
      },
    }
  );
}

async function getDMs() {
  const res = await axios.get("https://slack.com/api/conversations.list", {
    headers: { Authorization: `Bearer ${slackToken}` },
    params: { types: "im", limit: 100 },
  });
  return res.data.channels || [];
}

async function getMessages(channel) {
  const res = await axios.get("https://slack.com/api/conversations.history", {
    headers: { Authorization: `Bearer ${slackToken}` },
    params: { channel, limit: 1 },
  });
  return res.data.messages || [];
}

async function pollSlack() {
  const dms = await getDMs();

  for (const dm of dms) {
    const messages = await getMessages(dm.id);
    if (!messages.length) continue;

    const latest = messages[0];
    const user = dm.user;
    const ts = latest.ts;

    if (latestTimestamps[dm.id] === ts) continue;
    latestTimestamps[dm.id] = ts;

    const text = latest.text?.trim();
    if (!text || !allowedUsers.includes(user)) continue;

    const match = text.match(
      /https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
    );
    if (!match) continue;

    const [, owner, repo, prNumber] = match;

    if (text.startsWith("!approve")) {
      await sendMessage(
        dm.id,
        `Approving PR #${prNumber} in ${owner}/${repo}...`
      );
      await approvePR(owner, repo, prNumber);
      await sendMessage(dm.id, `PR #${prNumber} approved successfully!`);
    }
  }
}

// Poll every 10 seconds
setInterval(pollSlack, 10000);
console.log("Listening to your DMs every 10s...");
