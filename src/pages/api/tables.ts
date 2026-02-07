import type { NextApiRequest, NextApiResponse } from "next";
import { Client } from "pg";

type ResponseData = {
  tables: { table_name: string }[];
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

  const { postgres_url } = req.body;

  if (!postgres_url) {
    return res.status(400).json({ error: "PostgreSQL URL is required" });
  }

  const client = new Client({
    connectionString: postgres_url,
  });

  try {
    await client.connect();

    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    await client.end();

    return res.status(200).json({
      tables: result.rows,
    });
  } catch (error: any) {
    if (client) {
      await client.end().catch(() => {});
    }
    return res.status(500).json({
      error: error.message || "Failed to connect to database",
    });
  }
}
