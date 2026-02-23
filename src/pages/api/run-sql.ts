import type { NextApiRequest, NextApiResponse } from "next";
import { Client } from "pg";

type ResponseData = {
  columns: string[];
  rows: any[][];
  total_rows: number;
  query: string;
} | {
  error: string;
};

const MAX_ROWS = 500;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { postgres_url, query: raw_query } = req.body;

  if (!postgres_url || typeof raw_query !== "string") {
    return res
      .status(400)
      .json({ error: "postgres_url and query are required" });
  }

  const trimmed = raw_query.trim();
  const upper = trimmed.toUpperCase();
  if (!upper.startsWith("SELECT")) {
    return res.status(400).json({ error: "Only SELECT queries are allowed" });
  }

  const limited_query = /LIMIT\s+\d+/i.test(trimmed)
    ? trimmed
    : `${trimmed.replace(/;\s*$/, "")} LIMIT ${MAX_ROWS}`;

  const client = new Client({
    connectionString: postgres_url,
  });

  try {
    await client.connect();
    const result = await client.query(limited_query);
    const columns = result.fields.map((f) => f.name);
    const rows = result.rows.map((row) => columns.map((col) => row[col]));
    await client.end();

    return res.status(200).json({
      columns,
      rows,
      total_rows: rows.length,
      query: limited_query,
    });
  } catch (error: any) {
    if (client) {
      await client.end().catch(() => {});
    }
    return res.status(500).json({
      error: error.message || "Failed to run query",
    });
  }
}
