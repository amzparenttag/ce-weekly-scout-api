import OpenAI from "openai";
import { Client } from "@notionhq/client";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const notion = new Client({ auth: process.env.NOTION_TOKEN });

export default async function handler(req, res) {
  try {
    // Vercel Cron calls this as GET. Manual tests can use ?secret=...
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const userAgent = req.headers["user-agent"] || "";
    const isVercelCron = userAgent.includes("vercel-cron");

    if (!isVercelCron && req.query.secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const prompt = `
Search the web for content published within the last 7 days related to Catholic entrepreneurship.

Look for recent news, articles, opinion pieces, podcasts, interviews, YouTube videos, newsletters, and public commentary at the intersection of:
- Catholic entrepreneurship
- Catholic business owners
- Catholic founders
- Faith and work
- Catholic leadership
- Catholic social teaching and economics
- Ethical business ownership
- Work as vocation
- Catholic creators, builders, investors, and professionals

Return 5 to 10 high-quality items.

Return ONLY valid JSON in this exact format:
{
  "items": [
    {
      "title": "",
      "source": "",
      "author": "",
      "date": "YYYY-MM-DD",
      "format": "Article",
      "summary": "",
      "category": "",
      "url": ""
    }
  ]
}
`;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      tools: [{ type: "web_search_preview" }],
      input: prompt
    });

    const text = response.output_text || "";
    const jsonText = text.match(/\{[\s\S]*\}/)?.[0];

    if (!jsonText) {
      return res.status(500).json({
        error: "OpenAI did not return JSON",
        raw: text
      });
    }

    const parsed = JSON.parse(jsonText);
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    const created = [];

    for (const item of items) {
      const page = await notion.pages.create({
        parent: { database_id: process.env.NOTION_DATABASE_ID },
        properties: {
          Title: { title: [{ text: { content: item.title || "Untitled" } }] },
          Source: { rich_text: [{ text: { content: item.source || "" } }] },
          Author: { rich_text: [{ text: { content: item.author || "" } }] },
          Date: item.date ? { date: { start: item.date } } : null,
          Format: item.format ? { select: { name: item.format } } : null,
          Summary: { rich_text: [{ text: { content: item.summary || "" } }] },
          Category: item.category ? { select: { name: item.category } } : null,
          URL: item.url ? { url: item.url } : null
        }
      });

      created.push(page.id);
    }

    return res.status(200).json({
      success: true,
      created_count: created.length,
      page_ids: created
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: error.message || "Unknown error"
    });
  }
}
