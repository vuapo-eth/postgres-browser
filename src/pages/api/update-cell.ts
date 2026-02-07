import type { NextApiRequest, NextApiResponse } from "next";
import { Client } from "pg";

type ResponseData = {
  success: boolean;
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

  const { postgres_url, table_name, column_name, row_index, page, limit = 20, new_value } = req.body;

  if (!postgres_url || !table_name || column_name === undefined || row_index === undefined || new_value === undefined) {
    return res
      .status(400)
      .json({ error: "All fields are required" });
  }

  const client = new Client({
    connectionString: postgres_url,
  });

  try {
    await client.connect();

    const offset = (page - 1) * limit;
    const table_name_escaped = `"${table_name.replace(/"/g, '""')}"`;
    const column_name_escaped = `"${column_name.replace(/"/g, '""')}"`;

    const data_result = await client.query(
      `SELECT * FROM ${table_name_escaped} LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    if (row_index >= data_result.rows.length) {
      await client.end();
      return res.status(400).json({ error: "Invalid row index" });
    }

    const row = data_result.rows[row_index];
    const columns = data_result.fields.map((field) => field.name);

    const where_clauses: string[] = [];
    const where_values: any[] = [];
    let param_index = 1;

    for (const col of columns) {
      const col_escaped = `"${col.replace(/"/g, '""')}"`;
      where_clauses.push(`${col_escaped} = $${param_index}`);
      where_values.push(row[col]);
      param_index++;
    }

    const update_query = `
      UPDATE ${table_name_escaped}
      SET ${column_name_escaped} = $${param_index}
      WHERE ${where_clauses.join(" AND ")}
    `;
    where_values.push(new_value === "null" ? null : new_value);

    await client.query(update_query, where_values);

    await client.end();

    return res.status(200).json({
      success: true,
    });
  } catch (error: any) {
    if (client) {
      await client.end().catch(() => {});
    }
    return res.status(500).json({
      error: error.message || "Failed to update cell",
    });
  }
}
