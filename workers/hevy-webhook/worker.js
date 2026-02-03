/**
 * Cloudflare Worker: Hevy Webhook → GitHub Actions
 *
 * Receives POST from Hevy webhook and triggers
 * the GitHub Actions workflow via repository_dispatch.
 *
 * Environment variables (set in Cloudflare dashboard):
 *   GITHUB_TOKEN  - GitHub PAT with repo dispatch permission
 *   WEBHOOK_SECRET - (optional) shared secret from Hevy authorization header
 */

const GITHUB_REPO = "Cjj109/carlosjardim.com";

export default {
  async fetch(request, env) {
    // Only accept POST
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Verify authorization header if secret is configured
    if (env.WEBHOOK_SECRET) {
      const authHeader = request.headers.get("Authorization") || "";
      if (authHeader !== env.WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    // Respond 200 immediately (Hevy requires response within 5 seconds)
    // Then trigger GitHub Actions in the background
    const ctx = {
      waitUntil: (promise) => promise
    };

    const triggerPromise = triggerGitHubWorkflow(env.GITHUB_TOKEN);

    // Use waitUntil if available (Cloudflare Workers)
    if (typeof ctx.waitUntil === "function") {
      ctx.waitUntil(triggerPromise);
    }

    // Trigger synchronously since we need to respond fast anyway
    try {
      await triggerPromise;
    } catch (e) {
      console.error("Failed to trigger workflow:", e);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
};

async function triggerGitHubWorkflow(token) {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "hevy-webhook-worker",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        event_type: "hevy-workout"
      })
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${text}`);
  }
}
