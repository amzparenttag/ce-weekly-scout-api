import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

export default async function handler(req, res) {
  try {
    if (req.query.secret !== process.env.CRON_SECRET) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized"
      });
    }

    const response = await notion.search({
      filter: {
        property: "object",
        value: "database"
      },
      page_size: 100
    });

    const databases = response.results.map((db) => {
      const titleProperty = db.title || [];
      const title =
        titleProperty.map((t) => t.plain_text).join("") || "Untitled database";

      return {
        title,
        id: db.id,
        url: db.url
      };
    });

    return res.status(200).json({
      success: true,
      count: databases.length,
      databases
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Unknown error"
    });
  }
}
