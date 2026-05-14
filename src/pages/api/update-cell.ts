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

  const {
    postgres_url,
    table_name,
    column_name,
    row_index,
    page,
    limit = 20,
    sort_column,
    sort_direction = "asc",
    where_clause,
    new_value,
  } = req.body;

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

    let select_query = `SELECT ctid::text AS __row_ctid, * FROM ${table_name_escaped}`;
    const select_params: any[] = [];

    if (where_clause && where_clause.trim() !== "") {
      select_query += ` WHERE ${where_clause}`;
    }

    if (sort_column) {
      const sort_column_escaped = `"${String(sort_column).replace(/"/g, '""')}"`;
      const direction = sort_direction === "desc" ? "DESC" : "ASC";
      select_query += ` ORDER BY ${sort_column_escaped} ${direction}`;
    }

    select_query += ` LIMIT $${select_params.length + 1} OFFSET $${select_params.length + 2}`;
    select_params.push(limit, offset);

    const data_result = await client.query(select_query, select_params);

    if (row_index >= data_result.rows.length) {
      await client.end();
      return res.status(400).json({ error: "Invalid row index" });
    }

    const row = data_result.rows[row_index];
    const row_ctid = row.__row_ctid;
    if (!row_ctid) {
      await client.end();
      return res.status(400).json({ error: "Unable to identify row to update" });
    }

    const update_query = `
      UPDATE ${table_name_escaped}
      SET ${column_name_escaped} = $1
      WHERE ctid::text = $2
    `;

    const update_result = await client.query(update_query, [
      new_value === "null" ? null : new_value,
      row_ctid,
    ]);

    if (update_result.rowCount === 0) {
      await client.end();
      return res.status(404).json({ error: "No matching row found to update" });
    }

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
