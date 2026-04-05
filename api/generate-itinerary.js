export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
  }

  const { destination, days, preferences } = req.body || {};

  if (
    typeof destination !== "string" ||
    !destination.trim() ||
    typeof days !== "number" ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 14 ||
    !Array.isArray(preferences) ||
    preferences.length === 0 ||
    preferences.some((item) => typeof item !== "string")
  ) {
    return res.status(400).json({
      error: "Invalid request body. Expected destination:string, days:int(1-14), preferences:string[]"
    });
  }

  const prompt = buildPrompt({
    destination: destination.trim(),
    days,
    preferences
  });

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
        process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Gemini request failed",
        details: data
      });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(500).json({
        error: "Empty AI response",
        details: data
      });
    }

    const jsonText = extractJSONObject(text);

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return res.status(500).json({
        error: "AI returned invalid JSON",
        rawText: text
      });
    }

    const validationError = validateItinerary(parsed, days);

    if (validationError) {
      return res.status(500).json({
        error: validationError,
        raw: parsed
      });
    }

    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({
      error: "Internal server error",
      details: error.message
    });
  }
}

function buildPrompt({ destination, days, preferences }) {
  return `
You are a travel itinerary generator.
Return ONLY valid JSON.
Do not use markdown.
Do not add explanations before or after the JSON.

JSON schema:
{
  "destination": "string",
  "days": [
    {
      "day": 1,
      "title": "string",
      "activities": [
        {
          "time": "Morning | Afternoon | Evening",
          "name": "string",
          "description": "string",
          "category": "food | cafe | sightseeing | shopping | nature | other"
        }
      ]
    }
  ]
}

Rules:
- Generate exactly ${days} days.
- Include exactly 3 activities per day.
- Keep descriptions concise.
- Match the user's preferences when possible.
- If unsure, return empty arrays instead of extra text.

User request:
Destination: ${destination}
Preferences: ${preferences.join(", ")}
`;
}

function extractJSONObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return text.trim();
  }

  return text.slice(start, end + 1).trim();
}

function validateItinerary(data, expectedDays) {
  if (!data || typeof data !== "object") {
    return "Response is not an object";
  }

  if (typeof data.destination !== "string" || !Array.isArray(data.days)) {
    return "Missing destination or days";
  }

  if (data.days.length !== expectedDays) {
    return "Unexpected number of days";
  }

  for (const day of data.days) {
    if (
      typeof day.day !== "number" ||
      typeof day.title !== "string" ||
      !Array.isArray(day.activities)
    ) {
      return "Invalid day structure";
    }

    if (day.activities.length !== 3) {
      return "Each day must contain exactly 3 activities";
    }

    for (const activity of day.activities) {
      if (
        typeof activity.time !== "string" ||
        typeof activity.name !== "string" ||
        typeof activity.description !== "string" ||
        typeof activity.category !== "string"
      ) {
        return "Invalid activity structure";
      }
    }
  }

  return null;
}
