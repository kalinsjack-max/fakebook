// Vercel Serverless Function: /api/chat
// ANTHROPIC_API_KEY না থাকলে 503 দেয়, তখন সাইট নিজের বিল্ট-ইন সার্কাজম ইঞ্জিন ব্যবহার করে।
const hits = globalThis.__fbHits || (globalThis.__fbHits = new Map());

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: "no key" });

  // সহজ রেট লিমিট: প্রতি IP-তে মিনিটে ১৫টি (best-effort)
  const ip = (req.headers["x-forwarded-for"] || "x").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 15) return res.status(429).json({ error: "slow down" });
  recent.push(now);
  hits.set(ip, recent);

  const body = req.body || {};
  const message = String(body.message || "").slice(0, 500);
  const persona = String(body.persona || "Fakebook বট").slice(0, 200);
  const kind = body.kind === "comment" || body.kind === "roast" ? body.kind : "chat";
  if (!message.trim()) return res.status(400).json({ error: "empty" });

  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 500) }));
  while (history.length && history[0].role !== "user") history.shift();
  const msgs = [...history, { role: "user", content: message }];

  const dhaka = new Date().toLocaleString("bn-BD", { timeZone: "Asia/Dhaka", dateStyle: "full", timeStyle: "short" });
  const system =
    "তুমি Fakebook নামের একটি প্যারোডি সোশ্যাল সাইটের সার্কাস্টিক চরিত্র। চরিত্র: " + persona + ". " +
    "সবসময় বাংলায় উত্তর দাও। " +
    (kind === "comment" ? "এটা ফেসবুক কমেন্টের উত্তর, ১ বাক্যে, ছোট আর মজার। " : "সর্বোচ্চ ২-৩ বাক্য। ") +
    "কেউ সত্যিকারের প্রশ্ন করলে (সময়, তারিখ, হিসাব, তথ্য) আগে সঠিক উত্তর দাও, তারপর মজার খোঁচা যোগ করো। " +
    "ব্যঙ্গ হবে হালকা ও মজার; ধর্ম, জাতি, লিঙ্গ, শারীরিক গড়ন, প্রতিবন্ধিতা, রাজনীতি বা কারও ব্যক্তিগত কষ্ট নিয়ে আঘাত করবে না। " +
    "ক্ষতিকর কিছু করার পরামর্শ দেবে না। কেউ সত্যিই কষ্টে আছে মনে হলে সার্কাজম থামিয়ে দয়ালু হও। " +
    "ইমোজি সর্বোচ্চ ১-২টি। বর্তমান ঢাকার সময়: " + dhaka + ".";

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
        max_tokens: 300,
        system,
        messages: msgs,
      }),
    });
    if (!r.ok) return res.status(502).json({ error: "upstream" });
    const j = await r.json();
    const reply = ((j.content || []).find((c) => c.type === "text") || {}).text;
    if (!reply) return res.status(502).json({ error: "empty reply" });
    return res.status(200).json({ reply: reply.trim() });
  } catch (e) {
    return res.status(502).json({ error: "fail" });
  }
};
