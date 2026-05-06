import OpenAI from "openai";
import { Client } from "@notionhq/client";

const CODE_VERSION = "RUN_WEEKLY_SCOUT_V6";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const notion = new Client({ auth: process.env.NOTION_TOKEN });

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function toMultiSelect(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((name) => ({
        name: String(name).replaceAll(",", " -").trim().slice(0, 100)
      }))
      .filter((x) => x.name);
  }

  return String(value)
    .split(",")
    .map((name) => ({
      name: name.replaceAll(",", " -").trim().slice(0, 100)
    }))
    .filter((x) => x.name);
}

function toRichText(value) {
  const text = value ? String(value).slice(0, 1900) : "";
  return [{ text: { content: text } }];
}

function cleanSelectName(value, fallback = null) {
  if (!value) return fallback;
  return String(value).replaceAll(",", " -").trim().slice(0, 100);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({
        success: false,
        code_version: CODE_VERSION,
        error: "Method not allowed"
      });
    }

    const userAgent = req.headers["user-agent"] || "";
    const isVercelCron = userAgent.includes("vercel-cron");

    if (!isVercelCron && req.query.secret !== process.env.CRON_SECRET) {
      return res.status(401).json({
        success: false,
        code_version: CODE_VERSION,
        error: "Unauthorized"
      });
    }

    const endDate = new Date();
    const startDate = daysAgo(7);
    const dateRange = `${formatDate(startDate)} to ${formatDate(endDate)}`;

    const prompt = `
Search the internet for content published within this exact date range: ${dateRange}.

Topic: Catholic entrepreneurship.

Look for recent news, articles, opinion pieces, podcasts, interviews, YouTube videos, newsletters, public commentary, and other media at the intersection of:
- Catholic entrepreneurship
- Catholic business owners
- Catholic founders
- Faith and work
- Catholic leadership
- Catholic social teaching and economics
- Ethical business ownership
- Work as vocation
- Catholic creators, builders, investors, and professionals
- Religious freedom or culture issues affecting Catholic-owned businesses
- Catholic media, education, healthcare, publishing, technology, family business, nonprofit leadership, and small business

Rules:
- Only include content published within ${dateRange}.
- Do not include older evergreen content.
- Do not fabricate sources, links, dates, authors, or summaries.
- If there are few results, say that clearly.
- Prioritize Catholic-specific sources.
- Include adjacent Christian or business content only if it has a clear Catholic Entrepreneur angle.

Return ONLY valid JSON in this exact format:
{
  "date_range": "${dateRange}",
  "search_quality": "Strong | Weak | Mostly Adjacent",
  "key_themes": ["", "", ""],
  "commentary_opportunities": ["", "", ""],
  "suggested_content_ideas": ["", "", "", "", ""],
  "search_quality_notes": "",
  "items": [
    {
      "title": "",
      "source": "",
      "author": "",
      "date": "YYYY-MM-DD",
      "format": "Article",
      "url": "",
      "summary": "",
      "why_it_matters": "",
      "possible_content_use": ["Newsletter Blurb", "Social Post"],
      "category": "",
      "priority": "High | Medium | Low",
      "content_angle": ""
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

let parsed;

if (!jsonText) {
  parsed = {
    date_range: dateRange,
    search_quality: "Weak",
    key_themes: [
      "Faith and work",
      "Catholic leadership",
      "Catholic social teaching and economics"
    ],
    commentary_opportunities: [
      "Explore the integration of Catholic values into business practices",
      "Discuss the role of Catholic leadership in the marketplace",
      "Create content around work as vocation"
    ],
    suggested_content_ideas: [
      "What Catholic entrepreneurs can learn from Catholic social teaching",
      "How to think about business as a vocation",
      "Why ethical business ownership matters",
      "Faith and work lessons for Catholic professionals",
      "How Catholic leaders can serve through entrepreneurship"
    ],
    search_quality_notes: `OpenAI did not return valid JSON. Raw response: ${text.slice(0, 1200)}`,
    items: []
  };
} else {
  parsed = JSON.parse(jsonText);
}

const items = Array.isArray(parsed.items) ? parsed.items : [];

    // Hard filter dates to prevent older or undated results from entering Notion
    const filteredItems = items.filter((item) => {
      if (!item.date) return false;

      const itemDate = new Date(item.date);

      if (Number.isNaN(itemDate.getTime())) return false;

      return itemDate >= startDate && itemDate <= endDate;
    });

    console.log("CODE_VERSION:", CODE_VERSION);
    console.log("RUNS DB ID:", process.env.NOTION_RUNS_DATABASE_ID);
    console.log("MAIN DB ID:", process.env.NOTION_DATABASE_ID);

    const weeklyRun = await notion.pages.create({
      parent: { database_id: process.env.NOTION_RUNS_DATABASE_ID },
      properties: {
        Name: {
          title: [
            {
              text: {
                content: `Catholic Entrepreneur Weekly Scout — ${dateRange}`
              }
            }
          ]
        },
        "Date Range": {
          rich_text: toRichText(dateRange)
        },
        "Run Date": {
          date: { start: formatDate(endDate) }
        },
        "Key Themes": {
          rich_text: toRichText((parsed.key_themes || []).join("\n"))
        },
        "Commentary Opportunities": {
          rich_text: toRichText(
            (parsed.commentary_opportunities || []).join("\n")
          )
        },
        "Suggested Content Ideas": {
          rich_text: toRichText(
            (parsed.suggested_content_ideas || []).join("\n")
          )
        },
        "Search Quality Notes": {
          rich_text: toRichText(parsed.search_quality_notes || "")
        },
        "Total Items": {
          number: filteredItems.length
        },
        Status: {
          select: { name: "New" }
        }
      }
    });

    const createdItems = [];

    for (const item of filteredItems) {
      const page = await notion.pages.create({
        parent: { database_id: process.env.NOTION_DATABASE_ID },
        properties: {
          Title: {
            title: [
              {
                text: {
                  content: item.title || "Untitled"
                }
              }
            ]
          },
          Source: {
            rich_text: toRichText(item.source || "")
          },
          Author: {
            rich_text: toRichText(item.author || "")
          },
          Date: item.date ? { date: { start: item.date } } : { date: null },
          Format: item.format
            ? { select: { name: cleanSelectName(item.format) } }
            : { select: null },
          Summary: {
            rich_text: toRichText(item.summary || "")
          },
          Category: item.category
            ? { select: { name: cleanSelectName(item.category) } }
            : { select: null },
          URL: item.url ? { url: item.url } : { url: null },
          "Why It Matters": {
            rich_text: toRichText(item.why_it_matters || "")
          },
          "Possible Content Use": {
            multi_select: toMultiSelect(item.possible_content_use)
          },
          "Date Range": {
            rich_text: toRichText(dateRange)
          },
          "Scout Run Date": {
            date: { start: formatDate(endDate) }
          },
          "Search Quality": parsed.search_quality
            ? { select: { name: cleanSelectName(parsed.search_quality) } }
            : { select: null },
          Status: {
            select: { name: "New" }
          },
          Priority: item.priority
            ? { select: { name: cleanSelectName(item.priority) } }
            : { select: { name: "Medium" } },
          "Content Angle": {
            rich_text: toRichText(item.content_angle || "")
          },
          "Weekly Run": {
            relation: [{ id: weeklyRun.id }]
          }
        }
      });

      createdItems.push(page.id);
    }

    return res.status(200).json({
      success: true,
      code_version: CODE_VERSION,
      date_range: dateRange,
      weekly_run_id: weeklyRun.id,
      created_count: createdItems.length,
      skipped_old_or_undated_count: items.length - filteredItems.length,
      item_page_ids: createdItems
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      code_version: CODE_VERSION,
      error: error.message || "Unknown error"
    });
  }
}
