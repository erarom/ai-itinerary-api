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

  const { birthPlace, birthDate, birthTime } = req.body || {};

  if (
    typeof birthPlace !== "string" ||
    !birthPlace.trim() ||
    typeof birthDate !== "string" ||
    !birthDate.trim() ||
    typeof birthTime !== "string" ||
    !birthTime.trim()
  ) {
    return res.status(400).json({
      error: "Gecersiz istek. birthPlace, birthDate ve birthTime zorunlu."
    });
  }

  const prompt = buildPrompt({
    birthPlace: birthPlace.trim(),
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

function buildPrompt({ birthPlace, birthDate, birthTime }) {
  return `
Sen astroloji temelli bir seyahat planlayicisisin.

Gorevin:
Kullanicinin dogum yeri, dogum tarihi ve dogum saatine gore astrolojik profilini yorumlamak; bu profile en uygun seyahat stilini, en uygun sehri, ideal kac gunluk kacis gerektigini ve gun gun detayli gezi planini olusturmak.

Cok onemli:
- Dogum yeri analizde mutlaka aktif olarak kullanilmali.
- Dogum tarihi, dogum saati ve dogum yeri birlikte degerlendirilmeli.
- Astrolojik yorum yuzeysel olmamali.
- Yorum; kisinin enerji ritmi, duygusal ihtiyaclari, sosyal tempo tercihi, estetik anlayisi, dinlenme ihtiyaci, hareket seviyesi, romantik veya icedonuk yapisi gibi seyahat davranislarina donusturulmeli.
- Secilen sehir bu astrolojik profile mantikli bicimde uymali.
- Kac gunluk kacis gerektigi de astrolojik profile gore secilmeli.
- Rota sadece turistik degil, kisinin enerjisine uygun olmali.
- Sonuc yaratıcı olabilir ama tutarsiz olmamali.

Sadece gecerli JSON dondur.
Markdown kullanma.
JSON oncesi veya sonrasi hicbir aciklama yazma.
Sadece JSON don.

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
- Destination alaninda tek bir sehir sec.
- Kac gunluk plan gerektigine sen karar ver.
- Plan 2 ile 5 gun arasinda olmali.
- Her gun tam olarak 3 aktivite olmali.
- Aktiviteler sabah, ogle veya ogleden sonra ve aksam ritmine uygun dagitilmali.
- Seyahat temposu astrologySummary ve travelMood ile uyumlu olmali.
- astrologySummary kisa ama anlamli bir astrolojik yorum olmali.
- travelMood kisinin seyahatte nasil hissetmek isteyecegini 2-5 kelimeyle anlatsin.
- cosmicTip tek cumlelik ozel bir tavsiye olsun.
- Aktivite aciklamalari kisa ama spesifik olsun.
- Planin tonu romantik, dingin, sanatsal, sosyal, maceraci veya ice donuk olabilir; bunu astrolojik profile gore belirle.
- Gereksiz genel laflar kullanma.
- Tum alanlar doldurulmus olsun.
- JSON gecersiz olmasin.
- Eger cikti gecerli JSON degilse cevap yanlistir.

Astrolojik analiz beklentisi:
- Dogum yeri, tarih ve saate gore kisinin enerjisini yorumla.
- Yavas mi hizli mi bir seyahat ritmine ihtiyaci oldugunu belirle.
- Kalabalik ve sosyal bir sehir mi, sakin ve duygusal bir sehir mi daha uygun karar ver.
- Doga, deniz, tarih, sanat, gastronomi, gece hayati, ruhsal deneyim gibi temalardan hangileri baskin olmali belirle.
- Sehir secimini bu mantikla yap.
- Planin gunleri de bu profile gore aksin.

Kullanici bilgileri:
Dogum yeri: ${birthPlace}
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
    typeof data.astrologySummary !== "string" ||
    typeof data.travelMood !== "string" ||
    typeof data.cosmicTip !== "string" ||
    !Array.isArray(data.days)
  ) {
    return "Gerekli alanlar eksik veya format gecersiz";
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
