import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (req.headers["x-api-key"] !== process.env.API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { items } = req.body;

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: "items must be an array" });
  }

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
        Category: item.category ? { select: { name: item.category } } : null
      }
    });

    created.push(page.id);
  }

  return res.status(200).json({
    success: true,
    created_count: created.length,
    page_ids: created
  });
}
