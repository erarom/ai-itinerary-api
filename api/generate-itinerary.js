export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Sadece POST destekleniyor" });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY eksik" });
  }

  const { birthDate, birthTime } = req.body || {};

  if (
    typeof birthDate !== "string" ||
    !birthDate.trim() ||
    typeof birthTime !== "string" ||
    !birthTime.trim()
  ) {
    return res.status(400).json({
      error: "Gecersiz istek. birthDate ve birthTime zorunlu."
    });
  }

  const prompt = buildPrompt({
    birthDate: birthDate.trim(),
    birthTime: birthTime.trim()
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
        error: "Gemini istegi basarisiz",
        details: data
      });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(500).json({
        error: "AI bos cevap dondu",
        details: data
      });
    }

    const jsonText = extractJSONObject(text);

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return res.status(500).json({
        error: "AI gecerli JSON dondurmedi",
        rawText: text
      });
    }

    const validationError = validateItinerary(parsed);

    if (validationError) {
      return res.status(500).json({
        error: validationError,
        raw: parsed
      });
    }

    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({
      error: "Sunucu hatasi",
      details: error.message
    });
  }
}

function buildPrompt({ birthDate, birthTime }) {
  return `
Sen astroloji temelli bir seyahat planlayicisisin.
Kullanicinin dogum tarihi ve dogum saatini analiz et.
Bu profile gore en uygun sehri, ideal kac gunluk tatil gerektigini, seyahat enerjisini ve gun gun detayli gezi planini sec.

Sadece gecerli JSON dondur.
Markdown kullanma.
JSON disinda aciklama yazma.

JSON semasi:
{
  "destination": "string",
  "astrologySummary": "string",
  "travelMood": "string",
  "cosmicTip": "string",
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

Kurallar:
- Sehri sen sec.
- Kac gunluk kacis gerektigini sen sec.
- 2 ile 5 gun arasinda plan olustur.
- Her gun tam olarak 3 aktivite olsun.
- Plan astrolojik tona duygusal olarak uyumlu olsun.
- Aciklamalar kisa ama somut olsun.

Kullanici bilgileri:
Dogum tarihi: ${birthDate}
Dogum saati: ${birthTime}
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

function validateItinerary(data) {
  if (!data || typeof data !== "object") {
    return "Yanit bir obje degil";
  }

  if (
    typeof data.destination !== "string" ||
    !Array.isArray(data.days)
  ) {
    return "destination veya days alani eksik";
  }

  if (data.days.length < 2 || data.days.length > 5) {
    return "Plan 2 ile 5 gun arasinda olmali";
  }

  for (const day of data.days) {
    if (
      typeof day.day !== "number" ||
      typeof day.title !== "string" ||
      !Array.isArray(day.activities)
    ) {
      return "Gun yapisi gecersiz";
    }

    if (day.activities.length !== 3) {
      return "Her gun tam olarak 3 aktivite icermeli";
    }

    for (const activity of day.activities) {
      if (
        typeof activity.time !== "string" ||
        typeof activity.name !== "string" ||
        typeof activity.description !== "string" ||
        typeof activity.category !== "string"
      ) {
        return "Aktivite yapisi gecersiz";
      }
    }
  }

  return null;
}
