import type { NextApiRequest, NextApiResponse } from "next";
import { Client } from "pg";

type ResponseData = { sql: string } | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { postgres_url, table_name, prompt } = req.body;

  if (!postgres_url || !table_name || typeof prompt !== "string") {
    return res
      .status(400)
      .json({ error: "postgres_url, table_name, and prompt are required" });
  }

  const api_key = process.env.OPENAI_API_KEY;
  if (!api_key) {
    return res
      .status(500)
      .json({ error: "OPENAI_API_KEY is not configured" });
  }

  const client = new Client({ connectionString: postgres_url });

  try {
    await client.connect();
    const cols_result = await client.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table_name]
    );
    await client.end();

    const columns = cols_result.rows as { column_name: string; data_type: string }[];
    const schema_desc = columns.length
      ? columns.map((c) => `${c.column_name} (${c.data_type})`).join(", ")
      : "no columns found";

    const system = `You are a PostgreSQL expert. Given a table name, its columns, and a user request, reply with exactly one valid SELECT statement. No explanation, no markdown, no backticks—only the SQL. Use double quotes for identifiers when needed. Return only the query.`;
    const user = `Table: "${table_name.replace(/"/g, '""')}". Columns: ${schema_desc}.\n\nUser request: ${prompt}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${api_key}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 500,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({
        error: `AI request failed: ${response.status} ${err.slice(0, 200)}`,
      });
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return res.status(502).json({ error: "Empty response from AI" });
    }

    let sql = content.replace(/^```\w*\n?|\n?```$/g, "").trim();
    if (!sql.toUpperCase().startsWith("SELECT")) {
      return res.status(400).json({
        error: "AI did not return a SELECT query. Try rephrasing your request.",
      });
    }

    return res.status(200).json({ sql });
  } catch (error: any) {
    if (client) {
      await client.end().catch(() => {});
    }
    return res.status(500).json({
      error: error.message || "Failed to generate SQL",
    });
  }
}
