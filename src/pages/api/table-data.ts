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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { postgres_url, table_name, page = 1, limit = 20, sort_column, sort_direction = "asc", where_clause } = req.body;

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

    let query = `SELECT * FROM ${table_name_escaped}`;
    const query_params: any[] = [];
    
    if (where_clause && where_clause.trim() !== "") {
      query += ` WHERE ${where_clause}`;
    }
    
    if (sort_column) {
      const column_escaped = `"${sort_column.replace(/"/g, '""')}"`;
      const direction = sort_direction === "desc" ? "DESC" : "ASC";
      query += ` ORDER BY ${column_escaped} ${direction}`;
    }
    
    query += ` LIMIT $${query_params.length + 1} OFFSET $${query_params.length + 2}`;
    query_params.push(limit, offset);

    const data_result = await client.query(query, query_params);

    const columns = data_result.fields.map((field) => field.name);
    const rows = data_result.rows.map((row) =>
      columns.map((col) => row[col])
    );

    const final_query = query.replace(/\$\d+/g, (match, offset) => {
      const param_index = parseInt(match.substring(1)) - 1;
      if (param_index < query_params.length) {
        const param = query_params[param_index];
        if (typeof param === 'string') {
          return `'${param.replace(/'/g, "''")}'`;
        }
        return String(param);
      }
      return match;
    });

    await client.end();

    return res.status(200).json({
      columns,
      rows,
      total_rows,
      query: final_query,
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
