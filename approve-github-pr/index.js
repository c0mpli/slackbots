import { RTMClient } from "@slack/rtm-api";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const slackToken = process.env.SLACK_USER_TOKEN;
const githubToken = process.env.GITHUB_TOKEN;
const allowedUsers = process.env.ALLOWED_USER_IDS.split(",");

const rtm = new RTMClient(slackToken);

// --- SLACK MESSAGE HELPER ---
async function sendMessage(channel, text, thread_ts = null) {
  try {
    await axios.post(
      "https://slack.com/api/chat.postMessage",
      { channel, text, thread_ts },
      { headers: { Authorization: `Bearer ${slackToken}` } }
    );
  } catch (err) {
    console.error("Failed to send Slack message:", err);
  }
}

// --- GITHUB HELPERS ---
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

// --- SLACK EVENT HANDLER ---
rtm.on("message", async (event) => {
  try {
    if (!event.text || !event.user || !event.channel) return;

    const { text, user, channel, ts } = event;

    // --- Access Control ---
    if (!allowedUsers.includes(user)) {
      if (text.startsWith("!approve")) {
        console.log("User not allowed to run this command: ", user);
      }
      return;
    }

    const urlMatch = text.match(
      /https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/
    );
    if (!urlMatch) return;

    const [, owner, repo, prNumber] = urlMatch;

    if (text.startsWith("!approve")) {
      await sendMessage(
        channel,
        `Approving PR #${prNumber} in *${owner}/${repo}*...`,
        ts
      );

      await approvePR(owner, repo, prNumber);

      await sendMessage(channel, `PR #${prNumber} approved successfully!`, ts);
      return;
    }
  } catch (err) {
    console.error("Error: ", err);
  }
});

(async () => {
  await rtm.start();
  console.log("Slack GitHub Approver bot is running...");
})();
