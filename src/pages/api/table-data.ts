import type { NextApiRequest, NextApiResponse } from "next";
import { Client } from "pg";

type ResponseData = {
  columns: string[];
  rows: any[][];
  total_rows: number;
} | {
  error: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { postgres_url, table_name, page = 1, limit = 20 } = req.body;

  if (!postgres_url || !table_name) {
    return res
      .status(400)
      .json({ error: "PostgreSQL URL and table name are required" });
  }

  const client = new Client({
    connectionString: postgres_url,
  });

  try {
    await client.connect();

    const offset = (page - 1) * limit;

    const table_name_escaped = `"${table_name.replace(/"/g, '""')}"`;
    
    const count_result = await client.query(
      `SELECT COUNT(*) as count FROM ${table_name_escaped}`
    );
    const total_rows = parseInt(count_result.rows[0].count);

    const data_result = await client.query(
      `SELECT * FROM ${table_name_escaped} LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const columns = data_result.fields.map((field) => field.name);
    const rows = data_result.rows.map((row) =>
      columns.map((col) => row[col])
    );

    await client.end();

    return res.status(200).json({
      columns,
      rows,
      total_rows,
    });
  } catch (error: any) {
    if (client) {
      await client.end().catch(() => {});
    }
    return res.status(500).json({
      error: error.message || "Failed to fetch table data",
    });
  }
}
