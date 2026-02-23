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

  const base_query = trimmed.replace(/;\s*$/, "");
  const limited_query = /LIMIT\s+\d+/i.test(trimmed)
    ? trimmed
    : `${base_query} LIMIT ${MAX_ROWS}`;

  const count_query = base_query
    .replace(/\s+OFFSET\s+\d+(\s+LIMIT\s+\d+)?\s*$/i, "")
    .replace(/\s+LIMIT\s+\d+\s*$/i, "");

  const client = new Client({
    connectionString: postgres_url,
  });

  try {
    await client.connect();
    const count_result = await client.query(
      `SELECT COUNT(*)::int AS count FROM (${count_query}) AS _count_sub`
    );
    const total_rows = Number(count_result.rows[0].count);

    const result = await client.query(limited_query);
    const columns = result.fields.map((f) => f.name);
    const rows = result.rows.map((row) => columns.map((col) => row[col]));
    await client.end();

    return res.status(200).json({
      columns,
      rows,
      total_rows,
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
