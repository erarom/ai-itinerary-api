export default async function handler(req, res) {
  // ✅ CORS (iOS / frontend için şart)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // ✅ Preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ❌ Sadece POST kabul
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  const { prompt } = req.body;

  // ❌ boş prompt kontrolü
  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" +
        process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    // ✅ daha güvenli parsing
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response from AI";

    return res.status(200).json({
      success: true,
      result: text,
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || "Internal Server Error",
    });
  }
}
