import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import { Database, Table2, Sparkles, ArrowRight, Search, Star, Copy, Check, Eye, EyeOff, GripVertical, Palette, Edit, X, AlertCircle, Lock, ArrowUp, ArrowDown, Blocks, Code, ChevronDown, ChevronUp, History, Play } from "lucide-react";

type TableInfo = {
  table_name: string;
};

type TableData = {
  columns: string[];
  rows: any[][];
  total_rows: number;
  query?: string;
};

type WhereCondition = {
  id: string;
  column: string;
  operator: string;
  value: string;
};

type WhereItem =
  | { type: "condition"; id: string; column: string; operator: string; value: string }
  | {
      type: "group";
      id: string;
      connector: "AND" | "OR" | null;
      combine: "AND" | "OR";
      children: WhereItem[];
    };

type WhereGroup = {
  id: string;
  connector: "AND" | "OR" | null;
  combine: "AND" | "OR";
  conditions: WhereCondition[];
};

type ParsedQuery = {
  where_items: WhereItem[];
  sort_column: string | null;
  sort_direction: "asc" | "desc";
  page: number;
};

export default function Home() {
  const router = useRouter();
  const [postgres_url, set_postgres_url] = useState("");
  const [is_connected, set_is_connected] = useState(false);
  const [tables, set_tables] = useState<TableInfo[]>([]);
  const [selected_table, set_selected_table] = useState<string | null>(null);
  const [table_data, set_table_data] = useState<TableData | null>(null);
  const [current_page, set_current_page] = useState(1);
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [starred_tables, set_starred_tables] = useState<Set<string>>(new Set());
  const [is_initialized, set_is_initialized] = useState(false);
  const has_auto_connected_ref = useRef(false);
  const [sort_column, set_sort_column] = useState<string | null>(null);
  const [sort_direction, set_sort_direction] = useState<"asc" | "desc">("asc");
  const [where_items, set_where_items] = useState<WhereItem[]>([]);
  const where_items_ref = useRef<WhereItem[]>(where_items);
  where_items_ref.current = where_items;

  useEffect(() => {
    const stored = localStorage.getItem("starred_tables");
    if (stored) {
      try {
        set_starred_tables(new Set(JSON.parse(stored)));
      } catch (e) {
        set_starred_tables(new Set());
      }
    }
  }, []);

  useEffect(() => {
    const stored_url = localStorage.getItem("postgres_url");
    if (stored_url) {
      set_postgres_url(stored_url);
    }

    const table_from_url = router.query.table as string;
    if (table_from_url) {
      set_selected_table(table_from_url);
    }

    const page_from_url = router.query.page as string;
    if (page_from_url) {
      const page_num = parseInt(page_from_url, 10);
      if (!isNaN(page_num) && page_num > 0) {
        set_current_page(page_num);
      }
    }

    set_is_initialized(true);
  }, [router.query.table, router.query.page]);

  useEffect(() => {
    if (is_initialized && postgres_url && !is_connected && !has_auto_connected_ref.current) {
      has_auto_connected_ref.current = true;
      handle_connect();
    }
  }, [is_initialized, postgres_url, is_connected]);

  useEffect(() => {
    if (is_connected && selected_table) {
      const page_from_url = router.query.page as string;
      const page_num = page_from_url ? parseInt(page_from_url, 10) : current_page;
      const page_to_load = !isNaN(page_num) && page_num > 0 ? page_num : current_page;
      
      const where_clause = where_items.length > 0 ? build_where_clause(where_items) : undefined;
      load_table_data(selected_table, page_to_load, sort_column, sort_direction, where_clause);
      if (page_to_load !== current_page) {
        set_current_page(page_to_load);
      }
    }
  }, [is_connected, selected_table, router.query.page]);

  const toggle_star = (table_name: string) => {
    const new_starred = new Set(starred_tables);
    if (new_starred.has(table_name)) {
      new_starred.delete(table_name);
    } else {
      new_starred.add(table_name);
    }
    set_starred_tables(new_starred);
    localStorage.setItem("starred_tables", JSON.stringify(Array.from(new_starred)));
  };

  const handle_connect = async () => {
    if (!postgres_url.trim()) {
      set_error("Please enter a PostgreSQL connection URL");
      return;
    }

    set_is_loading(true);
    set_error(null);

    try {
      const response = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postgres_url }),
      });

      if (!response.ok) {
        const error_data = await response.json();
        throw new Error(error_data.error || "Failed to connect");
      }

      const data = await response.json();
      set_tables(data.tables);
      set_is_connected(true);
      localStorage.setItem("postgres_url", postgres_url);
    } catch (err: any) {
      set_error(err.message || "Failed to connect to database");
      set_is_connected(false);
    } finally {
      set_is_loading(false);
    }
  };

  const handle_table_click = async (table_name: string) => {
    set_selected_table(table_name);
    set_current_page(1);
    set_sort_column(null);
    set_sort_direction("asc");
    set_where_items([]);
    router.push({ query: { ...router.query, table: table_name, page: "1" } }, undefined, { shallow: true });
    await load_table_data(table_name, 1, null, "asc");
  };

  const handle_sort = async (column_name: string, force_direction?: "asc" | "desc") => {
    const current_items = where_items_ref.current;
    const where_clause = current_items.length > 0 ? build_where_clause(current_items) : undefined;
    const direction = force_direction ?? (sort_column === column_name ? (sort_direction === "asc" ? "desc" : "asc") : "asc");
    const current_query = table_data?.query;
    const run_with_query = !where_clause && typeof current_query === "string" && /WHERE/i.test(current_query);
    if (run_with_query && current_query) {
      set_sort_column(column_name);
      set_sort_direction(direction);
      const new_query = apply_sort_to_query(current_query, column_name, direction, current_page);
      await run_custom_sql(new_query);
      return;
    }
    if (force_direction) {
      set_sort_column(column_name);
      set_sort_direction(force_direction);
      await load_table_data(selected_table!, current_page, column_name, force_direction, where_clause);
    } else if (sort_column === column_name) {
      const new_direction = sort_direction === "asc" ? "desc" : "asc";
      set_sort_direction(new_direction);
      await load_table_data(selected_table!, current_page, column_name, new_direction, where_clause);
    } else {
      set_sort_column(column_name);
      set_sort_direction("asc");
      await load_table_data(selected_table!, current_page, column_name, "asc", where_clause);
    }
  };

  const handle_log_out = () => {
    localStorage.removeItem("postgres_url");
    set_postgres_url("");
    set_is_connected(false);
    set_tables([]);
    set_selected_table(null);
    set_table_data(null);
    set_current_page(1);
    set_error(null);
    has_auto_connected_ref.current = false;
    router.push("/", undefined, { shallow: true });
  };

  const condition_to_sql = (cond: WhereCondition): string => {
    const column_escaped = `"${cond.column.replace(/"/g, '""')}"`;
    if (cond.operator.includes("NULL")) {
      return `${column_escaped} ${cond.operator}`;
    }
    if (cond.operator === "IN" || cond.operator === "NOT IN") {
      const values = cond.value.split(",").map((v: string) => v.trim()).filter((v: string) => v);
      const values_str = values.map((v: string) => `'${v.replace(/'/g, "''")}'`).join(", ");
      return `${column_escaped} ${cond.operator} (${values_str})`;
    }
    if (cond.operator === "CONTAINS") {
      const value_escaped = `'%${cond.value.replace(/'/g, "''")}%'`;
      return `${column_escaped} LIKE ${value_escaped}`;
    }
    if (cond.operator === "CONTAINS (case-insensitive)") {
      const value_escaped = `'%${cond.value.replace(/'/g, "''")}%'`;
      return `${column_escaped} ILIKE ${value_escaped}`;
    }
    const value_escaped = `'${cond.value.replace(/'/g, "''")}'`;
    return `${column_escaped} ${cond.operator} ${value_escaped}`;
  };

  const item_to_sql = (item: WhereItem): string => {
    if (item.type === "condition") return condition_to_sql(item);
    const part = item.children.map(item_to_sql).filter(Boolean).join(` ${item.combine} `);
    return item.children.length > 1 ? `(${part})` : part;
  };

  const build_where_clause = (items: WhereItem[]): string => {
    const non_empty = items.filter((it) => it.type === "condition" || (it.type === "group" && it.children.length > 0));
    if (non_empty.length === 0) return "";
    return non_empty.map((item, idx) => {
      const sql = item_to_sql(item);
      const connector = idx > 0 && item.type === "group" && item.connector ? ` ${item.connector} ` : "";
      return connector + sql;
    }).join("");
  };

  const apply_sort_to_query = (query: string, sort_col: string, sort_dir: "asc" | "desc", page: number): string => {
    let q = query.replace(/\s*;\s*$/, "").trim();
    q = q.replace(/\s+ORDER\s+BY\s+.+$/i, "");
    q = q.replace(/\s+OFFSET\s+\d+(\s+LIMIT\s+\d+)?\s*$/i, "");
    q = q.replace(/\s+LIMIT\s+\d+\s*$/i, "");
    const col_escaped = `"${sort_col.replace(/"/g, '""')}"`;
    const dir = sort_dir === "desc" ? "DESC" : "ASC";
    const offset = (page - 1) * 20;
    return `${q} ORDER BY ${col_escaped} ${dir} LIMIT 20 OFFSET ${offset}`;
  };

  const apply_page_to_query = (query: string, page: number): string => {
    let q = query.replace(/\s*;\s*$/, "").trim();
    q = q.replace(/\s+OFFSET\s+\d+(\s+LIMIT\s+\d+)?\s*$/i, "");
    q = q.replace(/\s+LIMIT\s+\d+\s*$/i, "");
    const offset = (page - 1) * 20;
    return `${q} LIMIT 20 OFFSET ${offset}`;
  };

  const groups_to_items = (groups: WhereGroup[]): WhereItem[] =>
    groups.map((g) => ({
      type: "group" as const,
      id: g.id,
      connector: g.connector,
      combine: g.combine,
      children: g.conditions.map((c) => ({ type: "condition" as const, ...c })),
    }));

  const items_to_groups = (items: WhereItem[]): WhereGroup[] =>
    items.filter((it): it is Extract<WhereItem, { type: "group" }> => it.type === "group").map((g) => ({
      id: g.id,
      connector: g.connector,
      combine: g.combine,
      conditions: g.children.filter((c): c is Extract<WhereItem, { type: "condition" }> => c.type === "condition").map(({ id, column, operator, value }) => ({ id, column, operator, value })),
    }));

  const apply_update_at_path = (items: WhereItem[], path: number[], replace: (item: WhereItem) => WhereItem): WhereItem[] => {
    if (path.length === 0) return items;
    const [i, ...rest] = path;
    if (i < 0 || i >= items.length) return items;
    if (rest.length === 0) {
      const next = [...items];
      next[i] = replace(items[i]);
      return next;
    }
    const item = items[i];
    if (item.type !== "group") return items;
    const next_children = apply_update_at_path(item.children, rest, replace);
    return [...items.slice(0, i), { ...item, children: next_children }, ...items.slice(i + 1)];
  };

  const count_conditions_in_items = (items: WhereItem[]): number =>
    items.reduce((n, it) => n + (it.type === "condition" ? 1 : count_conditions_in_items(it.children)), 0);

  const save_query_to_history = (table_name: string, query: string, where_items: WhereItem[], sort_column: string | null, sort_direction: "asc" | "desc") => {
    try {
      const history_key = `sql_query_history_${table_name}`;
      const existing_history = localStorage.getItem(history_key);
      const history: Array<{
        query: string;
        where_items?: WhereItem[];
        where_groups?: WhereGroup[];
        where_conditions?: Array<{ id: string; column: string; operator: string; value: string; logical_op?: "AND" | "OR" }>;
        sort_column: string | null;
        sort_direction: "asc" | "desc";
        timestamp: number;
      }> = existing_history ? JSON.parse(existing_history) : [];

      const new_entry = {
        query,
        where_items: JSON.parse(JSON.stringify(where_items)),
        sort_column,
        sort_direction,
        timestamp: Date.now(),
      };

      const filtered_history = history.filter((entry) => entry.query !== query);
      filtered_history.unshift(new_entry);

      const max_history = 50;
      const trimmed_history = filtered_history.slice(0, max_history);

      localStorage.setItem(history_key, JSON.stringify(trimmed_history));
    } catch (err) {
      console.error("Failed to save query to history:", err);
    }
  };

  const flat_to_items = (flat: Array<{ id: string; column: string; operator: string; value: string; logical_op?: "AND" | "OR" }>): WhereItem[] => {
    if (!flat || flat.length === 0) return [];
    return groups_to_items([{
      id: Date.now().toString(),
      connector: null,
      combine: "AND",
      conditions: flat.map(({ id, column, operator, value }) => ({ id, column, operator, value })),
    }]);
  };

  const parse_query = (sql: string, table_name: string): ParsedQuery | null => {
    const q = sql.replace(/\s*;\s*$/, "").trim();
    const from_match = q.match(/^SELECT\s+\*\s+FROM\s+"([^"]*(?:""[^"]*)*)"\s*([\s\S]*)$/i);
    if (!from_match) return null;
    const parsed_table = from_match[1].replace(/""/g, '"');
    if (parsed_table !== table_name) return null;
    let rest = from_match[2].trim();
    let where_clause = "";
    const where_match = rest.match(/^WHERE\s+([\s\S]+?)(?=\s+ORDER\s+BY\s+|\s+LIMIT\s+\d+\s+OFFSET\s+\d+\s*$)/i);
    if (where_match) {
      where_clause = where_match[1].trim();
      rest = rest.slice(where_match[0].length).trim();
    }
    let sort_column: string | null = null;
    let sort_direction: "asc" | "desc" = "asc";
    const order_match = rest.match(/ORDER\s+BY\s+"([^"]*(?:""[^"]*)*)"\s+(ASC|DESC)/i);
    if (order_match) {
      sort_column = order_match[1].replace(/""/g, '"');
      sort_direction = order_match[2].toUpperCase() === "DESC" ? "desc" : "asc";
      rest = rest.slice(order_match[0].length).trim();
    }
    const limit_offset_match = rest.match(/LIMIT\s+(\d+)\s+OFFSET\s+(\d+)/i);
    if (!limit_offset_match) return null;
    const limit = parseInt(limit_offset_match[1], 10);
    const offset = parseInt(limit_offset_match[2], 10);
    const page = limit > 0 ? Math.floor(offset / limit) + 1 : 1;

    const parse_where_to_items = (where_str: string): WhereItem[] => {
      if (!where_str.trim()) return [];
      const conditions: WhereItem[] = [];
      const and_parts = where_str.split(/\s+AND\s+(?=(?:"[^"]*"|[^"()]*\))*$)/i);
      for (const part of and_parts) {
        const cond = parse_one_condition(part.trim());
        if (cond) conditions.push(cond);
      }
      if (conditions.length === 0) return [];
      return [{
        type: "group",
        id: Date.now().toString() + "_g",
        connector: null,
        combine: "AND",
        children: conditions,
      }];
    };

    const gen_id = () => `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const parse_one_condition = (s: string): WhereItem | null => {
      const col_match = s.match(/^"([^"]*(?:""[^"]*)*)"\s+(.+)$/);
      if (!col_match) return null;
      const column = col_match[1].replace(/""/g, '"');
      const rest = col_match[2].trim();
      if (rest === "IS NULL") {
        return { type: "condition", id: gen_id(), column, operator: "IS NULL", value: "" };
      }
      if (rest === "IS NOT NULL") {
        return { type: "condition", id: gen_id(), column, operator: "IS NOT NULL", value: "" };
      }
      const in_match = rest.match(/^(IN|NOT IN)\s*\(\s*([\s\S]*)\s*\)\s*$/i);
      if (in_match) {
        const op = in_match[1];
        const values = in_match[2].split(",").map((v) => v.trim().replace(/^'([^']*(?:''[^']*)*)'$/, (_, x) => (x || "").replace(/''/g, "'"))).filter(Boolean);
        return { type: "condition", id: gen_id(), column, operator: op, value: values.join(", ") };
      }
      const like_match = rest.match(/^LIKE\s+'([^']*(?:''[^']*)*)'\s*$/i);
      if (like_match) {
        const val = like_match[1].replace(/''/g, "'");
        const op = val.startsWith("%") && val.endsWith("%") ? "CONTAINS" : "LIKE";
        return { type: "condition", id: gen_id(), column, operator: op, value: val.replace(/^%|%$/g, "") };
      }
      const ilike_match = rest.match(/^ILIKE\s+'([^']*(?:''[^']*)*)'\s*$/i);
      if (ilike_match) {
        const val = ilike_match[1].replace(/''/g, "'");
        return { type: "condition", id: gen_id(), column, operator: "CONTAINS (case-insensitive)", value: val.replace(/^%|%$/g, "") };
      }
      const op_val_match = rest.match(/^(=|!=|>=|<=|>|<)\s+'([^']*(?:''[^']*)*)'\s*$/);
      if (op_val_match) {
        return { type: "condition", id: gen_id(), column, operator: op_val_match[1], value: op_val_match[2].replace(/''/g, "'") };
      }
      return null;
    };

    const where_items = parse_where_to_items(where_clause);
    return { where_items, sort_column, sort_direction, page };
  };

  const apply_parsed_query = (parsed: ParsedQuery) => {
    set_where_items(parsed.where_items);
    set_sort_column(parsed.sort_column);
    set_sort_direction(parsed.sort_direction);
    set_current_page(parsed.page);
    router.push({ query: { ...router.query, page: parsed.page.toString() } }, undefined, { shallow: true });
    const where_clause = parsed.where_items.length > 0 ? build_where_clause(parsed.where_items) : undefined;
    if (selected_table) {
      load_table_data(selected_table, parsed.page, parsed.sort_column, parsed.sort_direction, where_clause);
    }
  };

  const get_query_history = (table_name: string): Array<{
    query: string;
    where_items?: WhereItem[];
    where_groups?: WhereGroup[];
    where_conditions?: Array<{ id: string; column: string; operator: string; value: string; logical_op?: "AND" | "OR" }>;
    sort_column: string | null;
    sort_direction: "asc" | "desc";
    timestamp: number;
  }> => {
    try {
      const history_key = `sql_query_history_${table_name}`;
      const existing_history = localStorage.getItem(history_key);
      return existing_history ? JSON.parse(existing_history) : [];
    } catch (err) {
      return [];
    }
  };

  const load_table_data = async (table_name: string, page: number, sort_col?: string | null, sort_dir?: "asc" | "desc", where_clause?: string) => {
    set_is_loading(true);
    set_error(null);

    try {
      const final_sort_col = sort_col !== undefined ? sort_col : sort_column;
      const final_sort_dir = sort_dir !== undefined ? sort_dir : sort_direction;
      const final_where_clause = where_clause !== undefined ? where_clause : (where_items_ref.current.length > 0 ? build_where_clause(where_items_ref.current) : undefined);

      const response = await fetch("/api/table-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postgres_url,
          table_name,
          page,
          limit: 20,
          sort_column: final_sort_col,
          sort_direction: final_sort_dir,
          where_clause: final_where_clause,
        }),
      });

      if (!response.ok) {
        const error_data = await response.json();
        throw new Error(error_data.error || "Failed to load table data");
      }

      const data = await response.json();
      set_table_data(data);

      if (data.query) {
        save_query_to_history(table_name, data.query, where_items_ref.current, final_sort_col, final_sort_dir);
      }
    } catch (err: any) {
      set_error(err.message || "Failed to load table data");
    } finally {
      set_is_loading(false);
    }
  };

  const run_custom_sql = async (sql: string) => {
    set_is_loading(true);
    set_error(null);
    try {
      const response = await fetch("/api/run-sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postgres_url, query: sql }),
      });
      if (!response.ok) {
        const error_data = await response.json();
        throw new Error(error_data.error || "Failed to run query");
      }
      const data = await response.json();
      set_table_data(data);
    } catch (err: any) {
      set_error(err.message || "Failed to run query");
    } finally {
      set_is_loading(false);
    }
  };

  const handle_page_change = (new_page: number) => {
    if (!selected_table) return;
    set_current_page(new_page);
    router.push({ query: { ...router.query, page: new_page.toString() } }, undefined, { shallow: true });
    const current_items = where_items_ref.current;
    const where_clause = current_items.length > 0 ? build_where_clause(current_items) : undefined;
    if (!where_clause && table_data?.query && /WHERE/i.test(table_data.query)) {
      const new_query = apply_page_to_query(table_data.query, new_page);
      run_custom_sql(new_query);
      return;
    }
    load_table_data(selected_table, new_page, sort_column, sort_direction, where_clause);
  };

  const total_pages = table_data
    ? Math.ceil(table_data.total_rows / 20)
    : 0;

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      {!is_connected ? (
        <HeroSection
          postgres_url={postgres_url}
          set_postgres_url={set_postgres_url}
          handle_connect={handle_connect}
          is_loading={is_loading}
          error={error}
        />
      ) : (
        <div className="h-screen flex flex-col p-6 lg:p-8">
          <div className="max-w-[1920px] mx-auto w-full flex flex-col flex-1 min-h-0">
            <div className="mb-6 flex items-center justify-between flex-shrink-0">
              <div>
                <h1 className="text-2xl font-semibold text-white mb-1">
                  PostgreSQL Explorer
                </h1>
                <p className="text-sm text-[#8b8b8b]">
                  {tables.length} {tables.length === 1 ? "table" : "tables"} available
                </p>
              </div>
              <button
                onClick={handle_log_out}
                className="flex items-center gap-2 px-4 py-2 bg-[#1f1f1f] border border-[#2a2a2a] rounded-lg text-white hover:bg-[#2a2a2a] hover:border-[#EF4444]/50 transition-all"
                title="Log out and clear connection"
              >
                <Lock className="w-4 h-4" />
                <span className="text-sm">Log Out</span>
              </button>
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-3 min-h-0">
              <div className="lg:max-w-[280px] flex flex-col min-h-0">
                <TablesList
                  tables={tables}
                  selected_table={selected_table}
                  handle_table_click={handle_table_click}
                  starred_tables={starred_tables}
                  toggle_star={toggle_star}
                />
              </div>
              <div className="lg:col-span-4 flex flex-col min-h-0">
                {selected_table && table_data ? (
                  <TableView
                    table_name={selected_table}
                    table_data={table_data}
                    current_page={current_page}
                    total_pages={total_pages}
                    handle_page_change={handle_page_change}
                    is_loading={is_loading}
                    postgres_url={postgres_url}
                    sort_column={sort_column}
                    sort_direction={sort_direction}
                    on_sort={handle_sort}
                    where_items={where_items}
                    set_where_items={set_where_items}
                    build_where_clause={build_where_clause}
                    apply_update_at_path={apply_update_at_path}
                    entry_to_items={(entry: { where_items?: WhereItem[]; where_groups?: WhereGroup[]; where_conditions?: Array<{ id: string; column: string; operator: string; value: string; logical_op?: "AND" | "OR" }> }) => entry.where_items ?? (entry.where_groups?.length ? groups_to_items(entry.where_groups) : flat_to_items(entry.where_conditions ?? []))}
                    count_conditions_in_items={count_conditions_in_items}
                    selected_table={selected_table}
                    load_table_data={load_table_data}
                    run_custom_sql={run_custom_sql}
                    get_query_history={get_query_history}
                    set_sort_column={set_sort_column}
                    set_sort_direction={set_sort_direction}
                    parse_query={parse_query}
                    apply_parsed_query={apply_parsed_query}
                    on_cell_update={() => {
                      if (selected_table) {
                        const where_clause = where_items.length > 0 ? build_where_clause(where_items) : undefined;
                        load_table_data(selected_table, current_page, sort_column, sort_direction, where_clause);
                      }
                    }}
                  />
                ) : (
                  <EmptyState />
                )}
              </div>
            </div>

            {error && (
              <div className="mt-6 p-4 bg-[#1f1f1f] border border-[#2a2a2a] rounded-lg text-[#ff6b6b] flex-shrink-0">
                {error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HeroSection({
  postgres_url,
  set_postgres_url,
  handle_connect,
  is_loading,
  error,
}: {
  postgres_url: string;
  set_postgres_url: (url: string) => void;
  handle_connect: () => void;
  is_loading: boolean;
  error: string | null;
}) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-20 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#0f0f0f] to-[#1a1a1a]"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(62,207,142,0.1),transparent_50%)]"></div>
      
      <div className="relative z-10 max-w-4xl w-full">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#1f1f1f] border border-[#2a2a2a] rounded-full text-sm text-[#8b8b8b] mb-8">
            <Sparkles className="w-4 h-4 text-[#3ECF8E]" />
            <span>PostgreSQL Database Explorer</span>
          </div>
          
          <h1 className="text-5xl lg:text-7xl font-bold text-white mb-6 leading-tight">
            Explore your
            <span className="block bg-gradient-to-r from-[#3ECF8E] to-[#24B47E] bg-clip-text text-transparent">
              PostgreSQL database
            </span>
          </h1>
          
          <p className="text-xl text-[#8b8b8b] max-w-2xl mx-auto mb-12">
            Connect to your database and browse tables, view data, and manage your PostgreSQL instance with ease.
          </p>
        </div>

        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-8 shadow-2xl">
          <div className="mb-6">
            <label
              htmlFor="postgres_url"
              className="block text-sm font-medium text-[#8b8b8b] mb-3"
            >
              Connection String
            </label>
            <input
              id="postgres_url"
              type="text"
              value={postgres_url}
              onChange={(e) => set_postgres_url(e.target.value)}
              placeholder="postgresql://user:password@host:port/database"
              className="w-full px-4 py-3 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg text-white placeholder-[#4a4a4a] focus:outline-none focus:ring-2 focus:ring-[#3ECF8E] focus:border-transparent transition-all"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handle_connect();
                }
              }}
            />
          </div>
          
          {error && (
            <div className="mb-6 p-4 bg-[#1f1f1f] border border-[#ff6b6b]/30 rounded-lg text-[#ff6b6b] text-sm">
              {error}
            </div>
          )}
          
          <button
            onClick={handle_connect}
            disabled={is_loading}
            className="w-full bg-[#3ECF8E] hover:bg-[#24B47E] text-black font-semibold py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
          >
            {is_loading ? (
              <>
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <Database className="w-5 h-5" />
                <span>Connect to Database</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard
            icon={<Database className="w-6 h-6" />}
            title="Browse Tables"
            description="View all tables in your database at a glance"
          />
          <FeatureCard
            icon={<Table2 className="w-6 h-6" />}
            title="Explore Data"
            description="Navigate through your data with pagination"
          />
          <FeatureCard
            icon={<Sparkles className="w-6 h-6" />}
            title="Fast & Secure"
            description="Direct connection with no data storage"
          />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 hover:border-[#3ECF8E]/50 transition-all duration-200">
      <div className="text-[#3ECF8E] mb-3">{icon}</div>
      <h3 className="text-white font-semibold mb-2">{title}</h3>
      <p className="text-sm text-[#8b8b8b]">{description}</p>
    </div>
  );
}

function TablesList({
  tables,
  selected_table,
  handle_table_click,
  starred_tables,
  toggle_star,
}: {
  tables: TableInfo[];
  selected_table: string | null;
  handle_table_click: (table_name: string) => void;
  starred_tables: Set<string>;
  toggle_star: (table_name: string) => void;
}) {
  const [search_query, set_search_query] = useState("");

  const filtered_tables = tables.filter((table) =>
    table.table_name.toLowerCase().includes(search_query.toLowerCase())
  );

  const sorted_tables = [...filtered_tables].sort((a, b) => {
    const a_starred = starred_tables.has(a.table_name);
    const b_starred = starred_tables.has(b.table_name);
    if (a_starred && !b_starred) return -1;
    if (!a_starred && b_starred) return 1;
    return a.table_name.localeCompare(b.table_name);
  });

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 flex flex-col h-full min-h-0">
      <h2 className="text-base font-semibold text-white mb-3 flex-shrink-0">Tables</h2>
      
      <div className="mb-3 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-[#4a4a4a]" />
          <input
            type="text"
            value={search_query}
            onChange={(e) => set_search_query(e.target.value)}
            placeholder="Search tables..."
            className="w-full pl-9 pr-3 py-1.5 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg text-white placeholder-[#4a4a4a] focus:outline-none focus:ring-2 focus:ring-[#3ECF8E] focus:border-transparent transition-all text-sm"
          />
        </div>
      </div>

      <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
        {sorted_tables.length === 0 ? (
          <div className="text-center py-8 text-[#4a4a4a] text-sm">
            No tables found
          </div>
        ) : (
          sorted_tables.map((table) => {
            const is_starred = starred_tables.has(table.table_name);
            const is_selected = selected_table === table.table_name;
            
            return (
              <div
                key={table.table_name}
                className={`w-full px-3 py-2 rounded-lg transition-all duration-200 flex items-center gap-2 ${
                  is_selected
                    ? "bg-[#1f1f1f] border border-[#3ECF8E]/50"
                    : "bg-[#0f0f0f] border border-transparent hover:bg-[#1f1f1f]"
                } ${is_starred ? "text-[#3ECF8E]" : is_selected ? "text-[#3ECF8E]" : "text-[#8b8b8b] hover:text-white"}`}
              >
                <button
                  onClick={() => handle_table_click(table.table_name)}
                  className="flex-1 flex items-center gap-2 text-left"
                >
                  <Table2 className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate text-sm">{table.table_name}</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle_star(table.table_name);
                  }}
                  className="flex-shrink-0 p-1 hover:bg-[#1f1f1f] rounded transition-colors"
                >
                  <Star
                    className={`w-4 h-4 transition-colors ${
                      is_starred
                        ? "fill-[#3ECF8E] text-[#3ECF8E]"
                        : "text-[#4a4a4a] hover:text-[#3ECF8E]"
                    }`}
                  />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function get_operator_style(operator: string): { backgroundColor: string; borderColor: string } {
  if (operator === "=") return { backgroundColor: "rgba(62, 207, 142, 0.25)", borderColor: "#3ECF8E" };
  if (operator === "!=") return { backgroundColor: "rgba(239, 68, 68, 0.2)", borderColor: "#EF4444" };
  if ([">", "<", ">=", "<="].includes(operator)) return { backgroundColor: "rgba(59, 130, 246, 0.22)", borderColor: "#3B82F6" };
  if (["LIKE", "ILIKE", "CONTAINS", "CONTAINS (case-insensitive)"].includes(operator)) return { backgroundColor: "rgba(139, 92, 246, 0.22)", borderColor: "#8B5CF6" };
  if (["IN", "NOT IN"].includes(operator)) return { backgroundColor: "rgba(245, 158, 11, 0.22)", borderColor: "#F59E0B" };
  if (operator.includes("NULL")) return { backgroundColor: "rgba(107, 114, 128, 0.25)", borderColor: "#6B7280" };
  return { backgroundColor: "rgba(0,0,0,0.2)", borderColor: "#2a2a2a" };
}

function get_item_at_path(root: WhereItem[], path: number[]): WhereItem | undefined {
  if (path.length === 0) return undefined;
  const [i, ...rest] = path;
  if (i < 0 || i >= root.length) return undefined;
  const item = root[i];
  if (rest.length === 0) return item;
  return item.type === "group" ? get_item_at_path(item.children, rest) : undefined;
}

function WhereBlocksRecursive({
  items,
  path,
  set_where_items,
  apply_update_at_path,
  table_data,
  first_column,
  selected_table,
  sort_column,
  sort_direction,
  load_table_data,
  handle_page_change,
  build_where_clause,
}: {
  items: WhereItem[];
  path: number[];
  set_where_items: React.Dispatch<React.SetStateAction<WhereItem[]>>;
  apply_update_at_path: (items: WhereItem[], path: number[], replace: (item: WhereItem) => WhereItem) => WhereItem[];
  table_data: TableData;
  first_column: string;
  selected_table: string | null;
  sort_column: string | null;
  sort_direction: "asc" | "desc";
  load_table_data: (table_name: string, page: number, sort_col?: string | null, sort_dir?: "asc" | "desc", where_clause?: string) => Promise<void>;
  handle_page_change: (page: number) => void;
  build_where_clause: (items: WhereItem[]) => string;
}) {
  const at_root = path.length === 0;
  const update_at = (p: number[], replace: (item: WhereItem) => WhereItem) => set_where_items((prev) => apply_update_at_path(prev, p, replace));

  if (at_root) {
    return (
      <div className="flex flex-wrap items-start gap-2">
        {items.map((item, idx) => (
          <div key={item.id} className="flex flex-wrap items-center gap-2">
            {idx > 0 && item.type === "group" && (
              <select
                value={item.connector ?? "AND"}
                onChange={(e) => update_at([idx], (g) => g.type === "group" ? { ...g, connector: e.target.value as "AND" | "OR" } : g)}
                className="px-2 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-[#3ECF8E] text-xs font-semibold"
              >
                <option value="AND">AND</option>
                <option value="OR">OR</option>
              </select>
            )}
            <WhereBlocksRecursive
              items={items}
              path={[idx]}
              set_where_items={set_where_items}
              apply_update_at_path={apply_update_at_path}
              table_data={table_data}
              first_column={first_column}
              selected_table={selected_table}
              sort_column={sort_column}
              sort_direction={sort_direction}
              load_table_data={load_table_data}
              handle_page_change={handle_page_change}
              build_where_clause={build_where_clause}
            />
          </div>
        ))}
        <button
          onClick={() => set_where_items((prev) => [...prev, { type: "group", id: Date.now().toString(), connector: items.length > 0 ? "AND" : null, combine: "AND", children: [{ type: "condition", id: (Date.now() + 1).toString(), column: first_column, operator: "=", value: "" }] }])}
          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[#1a1a1a] border border-dashed border-[#2a2a2a] rounded-lg text-[#8b8b8b] hover:bg-[#1f1f1f] hover:border-[#3ECF8E]/50 hover:text-[#3ECF8E] transition-all text-xs min-h-[44px]"
        >
          <span className="text-lg leading-none">+</span>
          <span>Add group</span>
        </button>
      </div>
    );
  }

  const item = get_item_at_path(items, path);
  if (!item) return null;

  if (item.type === "condition") {
    const op_style = get_operator_style(item.operator);
    return (
      <div className="flex items-stretch rounded-lg overflow-hidden border-2 min-w-0" style={{ backgroundColor: op_style.backgroundColor, borderColor: op_style.borderColor }}>
        <div className="flex items-center gap-1.5 flex-wrap px-2 py-1.5 min-w-0 border-r shrink-0" style={{ borderColor: op_style.borderColor }}>
          <select value={item.column} onChange={(e) => update_at(path, (c) => ({ ...c, column: e.target.value }))} className="px-2 py-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded text-white text-xs font-medium max-w-[100px]">
            {table_data.columns.filter(col => col && col.trim() !== "").map((col) => <option key={col} value={col}>{col}</option>)}
          </select>
          <select value={item.operator} onChange={(e) => update_at(path, (c) => ({ ...c, operator: e.target.value }))} className="px-1.5 py-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded text-[#3ECF8E] text-xs font-semibold w-[3.25rem] shrink-0">
            <option value="=">=</option><option value="!=">!=</option><option value=">">&gt;</option><option value="<">&lt;</option><option value=">=">&gt;=</option><option value="<=">&lt;=</option>
            <option value="CONTAINS">Contains</option><option value="CONTAINS (case-insensitive)">Contains (case-insensitive)</option><option value="LIKE">LIKE</option><option value="ILIKE">ILIKE</option>
            <option value="IN">IN</option><option value="NOT IN">NOT IN</option><option value="IS NULL">IS NULL</option><option value="IS NOT NULL">IS NOT NULL</option>
          </select>
        </div>
        <div className="flex-1 flex items-center min-w-0">
          {!item.operator.includes("NULL") ? (
            <input type="text" value={item.value} onChange={(e) => update_at(path, (c) => ({ ...c, value: e.target.value }))} placeholder="value" className="w-full h-full px-2 py-1.5 bg-transparent text-white text-xs font-mono placeholder:text-[#4a4a4a] focus:outline-none focus:ring-0 border-0 min-w-0" style={{ fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }} />
          ) : (
            <span className="px-2 py-1.5 text-xs text-[#8b8b8b] font-mono">NULL</span>
          )}
        </div>
        <button onClick={() => set_where_items((prev) => apply_update_at_path(prev, path.slice(0, -1), (parent) => parent.type === "group" ? { ...parent, children: parent.children.filter((_, j) => j !== path[path.length - 1]) } : parent))} className="p-1.5 hover:bg-[#1f1f1f] rounded-r transition-colors self-center shrink-0">
          <X className="w-3 h-3 text-[#8b8b8b] hover:text-[#EF4444]" />
        </button>
      </div>
    );
  }

  const group = item;
  const parent_path = path.slice(0, -1);
  const group_idx = path[path.length - 1];
  const remove_group = () => set_where_items((prev) => parent_path.length === 0 ? prev.filter((_, i) => i !== group_idx).map((g, i) => i === 0 && g.type === "group" ? { ...g, connector: null } : g) : apply_update_at_path(prev, parent_path, (p) => p.type === "group" ? { ...p, children: p.children.filter((_, j) => j !== group_idx) } : p));
  return (
    <div className="relative rounded-lg border border-[#2a2a2a] p-2 bg-[#1a1a1a]">
      <button onClick={remove_group} className="absolute top-1.5 right-1.5 p-1 rounded text-[#8b8b8b] hover:text-[#EF4444] hover:bg-[#2a2a2a] transition-colors" title="Remove group">
        <X className="w-3.5 h-3.5" />
      </button>
      <div className="flex items-center gap-2 mb-2 pr-6">
        <span className="text-[#8b8b8b] text-xs">within group:</span>
        <select value={group.combine} onChange={(e) => update_at(path, (g) => ({ ...g, combine: e.target.value as "AND" | "OR" }))} className="px-2 py-1 bg-[#0f0f0f] border border-[#2a2a2a] rounded text-xs font-medium" style={{ color: group.combine === "AND" ? "#3ECF8E" : "#3B82F6" }}>
          <option value="AND">AND</option><option value="OR">OR</option>
        </select>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        {group.children.map((_, child_idx) => (
          <WhereBlocksRecursive key={get_item_at_path(items, path.concat(child_idx))?.id} items={items} path={path.concat(child_idx)} set_where_items={set_where_items} apply_update_at_path={apply_update_at_path} table_data={table_data} first_column={first_column} selected_table={selected_table} sort_column={sort_column} sort_direction={sort_direction} load_table_data={load_table_data} handle_page_change={handle_page_change} build_where_clause={build_where_clause} />
        ))}
        {group.children.length === 0 ? (
          <>
            <button onClick={() => update_at(path, (it) => it.type === "group" ? { ...it, children: [...it.children, { type: "condition", id: Date.now().toString(), column: first_column, operator: "=", value: "" }] } : it)} className="flex items-center justify-center gap-1 px-2 py-2 border border-dashed border-[#2a2a2a] rounded-lg text-[#8b8b8b] hover:border-[#3ECF8E]/50 hover:text-[#3ECF8E] text-xs min-h-[40px]" style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
              + condition
            </button>
            <button onClick={() => update_at(path, (it) => it.type === "group" ? { ...it, children: [...it.children, { type: "group", id: Date.now().toString(), connector: it.children.length > 0 ? "AND" : null, combine: "AND", children: [{ type: "condition", id: (Date.now() + 1).toString(), column: first_column, operator: "=", value: "" }] }] } : it)} className="flex items-center justify-center gap-1 px-2 py-2 border border-dashed border-[#2a2a2a] rounded-lg text-[#8b8b8b] hover:border-[#3ECF8E]/50 hover:text-[#3ECF8E] text-xs min-h-[40px]" style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
              + group
            </button>
          </>
        ) : group.children.some((c) => c.type === "group") ? (
          <button onClick={() => update_at(path, (it) => it.type === "group" ? { ...it, children: [...it.children, { type: "group", id: Date.now().toString(), connector: it.children.length > 0 ? "AND" : null, combine: "AND", children: [{ type: "condition", id: (Date.now() + 1).toString(), column: first_column, operator: "=", value: "" }] }] } : it)} className="flex items-center justify-center gap-1 px-2 py-2 border border-dashed border-[#2a2a2a] rounded-lg text-[#8b8b8b] hover:border-[#3ECF8E]/50 hover:text-[#3ECF8E] text-xs min-h-[40px]" style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
            +
          </button>
        ) : (
          <button onClick={() => update_at(path, (it) => it.type === "group" ? { ...it, children: [...it.children, { type: "condition", id: Date.now().toString(), column: first_column, operator: "=", value: "" }] } : it)} className="flex items-center justify-center gap-1 px-2 py-2 border border-dashed border-[#2a2a2a] rounded-lg text-[#8b8b8b] hover:border-[#3ECF8E]/50 hover:text-[#3ECF8E] text-xs min-h-[40px]" style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
            +
          </button>
        )}
      </div>
    </div>
  );
}

function TableView({
  table_name,
  table_data,
  current_page,
  total_pages,
  handle_page_change,
  is_loading,
  postgres_url,
  sort_column,
  sort_direction,
  on_sort,
  on_cell_update,
  where_items,
  set_where_items,
  build_where_clause,
  apply_update_at_path,
  entry_to_items,
  count_conditions_in_items,
  selected_table,
  load_table_data,
  run_custom_sql,
  get_query_history,
  set_sort_column,
  set_sort_direction,
  parse_query,
  apply_parsed_query,
}: {
  table_name: string;
  table_data: TableData;
  current_page: number;
  total_pages: number;
  handle_page_change: (page: number) => void;
  is_loading: boolean;
  postgres_url: string;
  sort_column: string | null;
  sort_direction: "asc" | "desc";
  on_sort: (column_name: string, force_direction?: "asc" | "desc") => void;
  on_cell_update: () => void;
  where_items: WhereItem[];
  set_where_items: React.Dispatch<React.SetStateAction<WhereItem[]>>;
  build_where_clause: (items: WhereItem[]) => string;
  apply_update_at_path: (items: WhereItem[], path: number[], replace: (item: WhereItem) => WhereItem) => WhereItem[];
  entry_to_items: (entry: { where_items?: WhereItem[]; where_groups?: WhereGroup[]; where_conditions?: Array<{ id: string; column: string; operator: string; value: string; logical_op?: "AND" | "OR" }> }) => WhereItem[];
  count_conditions_in_items: (items: WhereItem[]) => number;
  selected_table: string | null;
  load_table_data: (table_name: string, page: number, sort_col?: string | null, sort_dir?: "asc" | "desc", where_clause?: string) => Promise<void>;
  run_custom_sql: (sql: string) => Promise<void>;
  get_query_history: (table_name: string) => Array<{
    query: string;
    where_items?: WhereItem[];
    where_groups?: WhereGroup[];
    where_conditions?: Array<{ id: string; column: string; operator: string; value: string; logical_op?: "AND" | "OR" }>;
    sort_column: string | null;
    sort_direction: "asc" | "desc";
    timestamp: number;
  }>;
  set_sort_column: React.Dispatch<React.SetStateAction<string | null>>;
  set_sort_direction: React.Dispatch<React.SetStateAction<"asc" | "desc">>;
  parse_query: (sql: string, table_name: string) => ParsedQuery | null;
  apply_parsed_query: (parsed: ParsedQuery) => void;
}) {
  const [column_widths, set_column_widths] = useState<Record<number, number>>({});
  const [is_resizing, set_is_resizing] = useState(false);
  const [resizing_column, set_resizing_column] = useState<number | null>(null);
  const [hovered_cell, set_hovered_cell] = useState<{ row_idx: number; cell_idx: number } | null>(null);
  const [copied_cell, set_copied_cell] = useState<{ row_idx: number; cell_idx: number } | null>(null);
  const [editing_cell, set_editing_cell] = useState<{ row_idx: number; cell_idx: number } | null>(null);
  const [edit_value, set_edit_value] = useState("");
  const [is_saving, set_is_saving] = useState(false);
  const [toast, set_toast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [column_order, set_column_order] = useState<number[]>([]);
  const [column_visibility, set_column_visibility] = useState<Record<number, boolean>>({});
  const [column_colors, set_column_colors] = useState<Record<number, string>>({});
  const [color_picker_open, set_color_picker_open] = useState<number | null>(null);
  const [dragged_column, set_dragged_column] = useState<number | null>(null);
  const [drag_over_column, set_drag_over_column] = useState<number | null>(null);
  const [show_images, set_show_images] = useState(false);
  const [search_query, set_search_query] = useState("");
  const [column_badges_expanded, set_column_badges_expanded] = useState(false);
  const [query_view_mode, set_query_view_mode] = useState<"sql" | "blocks">("sql");
  const [is_history_open, set_is_history_open] = useState(false);
  const [is_ai_modal_open, set_is_ai_modal_open] = useState(false);
  const [ai_prompt, set_ai_prompt] = useState("");
  const [is_ai_generating, set_is_ai_generating] = useState(false);
  const [editable_sql, set_editable_sql] = useState(table_data.query || "");
  const [is_sql_copied, set_is_sql_copied] = useState(false);

  useEffect(() => {
    set_editable_sql(table_data.query || "");
  }, [table_data.query]);

  const build_current_query = (): string => {
    const table_name_escaped = `"${table_name.replace(/"/g, '""')}"`;
    let q = `SELECT * FROM ${table_name_escaped}`;
    const where_clause = where_items.length > 0 ? build_where_clause(where_items) : "";
    if (where_clause.trim() !== "") {
      q += ` WHERE ${where_clause}`;
    }
    if (sort_column) {
      const col_escaped = `"${sort_column.replace(/"/g, '""')}"`;
      const dir = sort_direction === "desc" ? "DESC" : "ASC";
      q += ` ORDER BY ${col_escaped} ${dir}`;
    }
    const offset = (current_page - 1) * 20;
    q += ` LIMIT 20 OFFSET ${offset}`;
    return q;
  };

  const predefined_colors = [
    { name: "Blue", value: "#3B82F6" },
    { name: "Green", value: "#10B981" },
    { name: "Yellow", value: "#F59E0B" },
    { name: "Red", value: "#EF4444" },
    { name: "Purple", value: "#8B5CF6" },
    { name: "Pink", value: "#EC4899" },
    { name: "Cyan", value: "#06B6D4" },
    { name: "Orange", value: "#F97316" },
  ];
  const table_ref = useRef<HTMLTableElement>(null);
  const start_x_ref = useRef<number>(0);
  const start_width_ref = useRef<number>(0);
  const resizing_column_ref = useRef<number | null>(null);
  const column_widths_ref = useRef<Record<number, number>>({});
  const handle_mouse_move_ref = useRef<((e: MouseEvent) => void) | undefined>(undefined);
  const handle_mouse_up_ref = useRef<(() => void) | undefined>(undefined);

  const columns_key_ref = useRef<string>("");
  useEffect(() => {
    const columns_key = table_data.columns.join(",");
    if (table_data.columns.length > 0 && columns_key !== columns_key_ref.current) {
      columns_key_ref.current = columns_key;
      const initial_order = table_data.columns.map((_, idx) => idx);
      set_column_order(initial_order);
      const initial_visibility: Record<number, boolean> = {};
      const initial_colors: Record<number, string> = {};
      table_data.columns.forEach((_, idx) => {
        initial_visibility[idx] = true;
        initial_colors[idx] = "";
      });
      set_column_visibility(initial_visibility);
      set_column_colors(initial_colors);
    }
  }, [table_data.columns]);

  const default_width = 200;
  const min_width = 50;

  useEffect(() => {
    column_widths_ref.current = column_widths;
  }, [column_widths]);

  useEffect(() => {
    resizing_column_ref.current = resizing_column;
  }, [resizing_column]);

  useEffect(() => {
    const handle_click_outside = (e: MouseEvent) => {
      if (color_picker_open !== null) {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-color-picker]')) {
          set_color_picker_open(null);
        }
      }
      if (is_history_open) {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-history-dropdown]')) {
          set_is_history_open(false);
        }
      }
      if (is_ai_modal_open) {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-ai-modal]')) {
          set_is_ai_modal_open(false);
        }
      }
    };

    if (color_picker_open !== null || is_history_open || is_ai_modal_open) {
      document.addEventListener("mousedown", handle_click_outside);
      return () => {
        document.removeEventListener("mousedown", handle_click_outside);
      };
    }
  }, [color_picker_open, is_history_open, is_ai_modal_open]);

  const get_column_width = (column_idx: number) => {
    return column_widths_ref.current[column_idx] ?? default_width;
  };

  useEffect(() => {
    const handle_mouse_move = (e: MouseEvent) => {
      if (resizing_column_ref.current === null) return;

      const diff = e.clientX - start_x_ref.current;
      const new_width = Math.max(min_width, start_width_ref.current + diff);
      set_column_widths((prev) => ({
        ...prev,
        [resizing_column_ref.current!]: new_width,
      }));
    };

    const handle_mouse_up = () => {
      set_is_resizing(false);
      set_resizing_column(null);
      if (handle_mouse_move_ref.current) {
        document.removeEventListener("mousemove", handle_mouse_move_ref.current);
      }
      if (handle_mouse_up_ref.current) {
        document.removeEventListener("mouseup", handle_mouse_up_ref.current);
      }
    };

    handle_mouse_move_ref.current = handle_mouse_move;
    handle_mouse_up_ref.current = handle_mouse_up;

    return () => {
      if (handle_mouse_move_ref.current) {
        document.removeEventListener("mousemove", handle_mouse_move_ref.current);
      }
      if (handle_mouse_up_ref.current) {
        document.removeEventListener("mouseup", handle_mouse_up_ref.current);
      }
    };
  }, []);

  const handle_mouse_down = (column_idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    set_is_resizing(true);
    set_resizing_column(column_idx);
    start_x_ref.current = e.clientX;
    start_width_ref.current = get_column_width(column_idx);
    if (handle_mouse_move_ref.current) {
      document.addEventListener("mousemove", handle_mouse_move_ref.current);
    }
    if (handle_mouse_up_ref.current) {
      document.addEventListener("mouseup", handle_mouse_up_ref.current);
    }
  };

  const handle_copy = async (cell_value: any, row_idx: number, cell_idx: number) => {
    const text_to_copy = cell_value === null || cell_value === undefined ? "null" : String(cell_value);
    try {
      await navigator.clipboard.writeText(text_to_copy);
      set_copied_cell({ row_idx, cell_idx });
      setTimeout(() => {
        set_copied_cell(null);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handle_edit = (cell_value: any, row_idx: number, display_idx: number) => {
    const initial_value = cell_value === null || cell_value === undefined ? "null" : String(cell_value);
    set_edit_value(initial_value);
    set_editing_cell({ row_idx, cell_idx: display_idx });
  };

  const handle_save_edit = async () => {
    if (editing_cell === null) return;

    set_is_saving(true);
    try {
      const visible_columns = get_visible_ordered_columns();
      const column_idx = visible_columns[editing_cell.cell_idx];
      const column_name = table_data.columns[column_idx];

      const response = await fetch("/api/update-cell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postgres_url,
          table_name,
          column_name,
          row_index: editing_cell.row_idx,
          page: current_page,
          limit: 20,
          new_value: edit_value.trim() === "null" || edit_value.trim() === "" ? null : edit_value,
        }),
      });

      if (!response.ok) {
        const error_data = await response.json();
        throw new Error(error_data.error || "Failed to update cell");
      }

      set_editing_cell(null);
      set_edit_value("");
      set_toast({ message: "Cell updated successfully", type: "success" });
      setTimeout(() => set_toast(null), 3000);
      on_cell_update();
    } catch (err: any) {
      set_toast({ message: err.message || "Failed to update cell", type: "error" });
      setTimeout(() => set_toast(null), 5000);
    } finally {
      set_is_saving(false);
    }
  };

  const handle_cancel_edit = () => {
    set_editing_cell(null);
    set_edit_value("");
  };

  const toggle_column_visibility = (column_idx: number) => {
    set_column_visibility((prev) => ({
      ...prev,
      [column_idx]: !prev[column_idx],
    }));
  };

  const select_all_columns = () => {
    set_column_visibility((prev) => {
      const next = { ...prev };
      table_data.columns.forEach((_, idx) => {
        next[idx] = true;
      });
      return next;
    });
  };

  const unselect_all_columns = () => {
    const id_column_idx = table_data.columns.findIndex((name) => String(name).toLowerCase() === "id");
    set_column_visibility((prev) => {
      const next = { ...prev };
      table_data.columns.forEach((_, idx) => {
        next[idx] = idx === id_column_idx;
      });
      return next;
    });
  };

  const set_column_color = (column_idx: number, color: string) => {
    set_column_colors((prev) => ({
      ...prev,
      [column_idx]: color,
    }));
    set_color_picker_open(null);
  };

  const get_column_color_with_opacity = (column_idx: number) => {
    const color = column_colors[column_idx];
    if (!color) return "";
    return `${color}33`;
  };

  const handle_drag_start = (column_idx: number) => {
    set_dragged_column(column_idx);
  };

  const handle_drag_over = (e: React.DragEvent, column_idx: number) => {
    e.preventDefault();
    if (dragged_column !== null && dragged_column !== column_idx) {
      set_drag_over_column(column_idx);
    }
  };

  const handle_drop = (target_column_idx: number) => {
    if (dragged_column === null) return;

    const new_order = [...column_order];
    const dragged_index = new_order.indexOf(dragged_column);
    const target_index = new_order.indexOf(target_column_idx);

    new_order.splice(dragged_index, 1);
    new_order.splice(target_index, 0, dragged_column);

    set_column_order(new_order);
    set_dragged_column(null);
    set_drag_over_column(null);
  };

  const handle_drag_end = () => {
    set_dragged_column(null);
    set_drag_over_column(null);
  };

  const get_visible_ordered_columns = () => {
    return column_order.filter((idx) => {
      if (column_visibility[idx] === false) return false;
      const column_name = table_data.columns[idx];
      return column_name && column_name.trim() !== "";
    });
  };

  const get_valid_column_indices = () =>
    column_order.filter((idx) => {
      const name = table_data.columns[idx];
      return name && String(name).trim() !== "";
    });

  const is_all_selected = () => {
    const valid = get_valid_column_indices();
    return valid.length > 0 && valid.every((idx) => column_visibility[idx] !== false);
  };

  const is_unselect_all_state = () => {
    const id_idx = table_data.columns.findIndex((name) => String(name).toLowerCase() === "id");
    const valid = get_valid_column_indices();
    return valid.every((idx) => column_visibility[idx] === (idx === id_idx));
  };

  const highlight_sql = (sql: string): React.ReactNode[] => {
    const keywords = /\b(SELECT|FROM|WHERE|ORDER BY|GROUP BY|HAVING|LIMIT|OFFSET|ASC|DESC|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|VIEW|AS|ON|JOIN|INNER|LEFT|RIGHT|FULL|OUTER|UNION|DISTINCT|COUNT|SUM|AVG|MAX|MIN|AND|OR|NOT|IN|LIKE|BETWEEN|IS|NULL|TRUE|FALSE)\b/gi;
    const strings = /('([^'\\]|\\.)*'|"([^"\\]|\\.)*")/g;
    const numbers = /\b\d+\b/g;
    const operators = /([=<>!]+|[\+\-\*\/])/g;
    
    const all_matches: Array<{ index: number; length: number; type: 'keyword' | 'string' | 'number' | 'operator'; text: string }> = [];
    
    const regexes = [
      { regex: keywords, type: 'keyword' as const },
      { regex: strings, type: 'string' as const },
      { regex: numbers, type: 'number' as const },
      { regex: operators, type: 'operator' as const },
    ];
    
    regexes.forEach(({ regex, type }) => {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(sql)) !== null) {
        all_matches.push({
          index: match.index,
          length: match[0].length,
          type,
          text: match[0],
        });
      }
    });
    
    all_matches.sort((a, b) => a.index - b.index);
    
    const result: React.ReactNode[] = [];
    let current_index = 0;
    
    all_matches.forEach((match) => {
      if (match.index > current_index) {
        result.push(<span key={`text-${current_index}`}>{sql.substring(current_index, match.index)}</span>);
      }
      
      const color_map = {
        keyword: 'text-[#3ECF8E]',
        string: 'text-[#FCD34D]',
        number: 'text-[#60A5FA]',
        operator: 'text-[#EC4899]',
      };
      
      result.push(
        <span key={`${match.type}-${match.index}`} className={color_map[match.type]}>
          {match.text}
        </span>
      );
      
      current_index = match.index + match.length;
    });
    
    if (current_index < sql.length) {
      result.push(<span key={`text-${current_index}`}>{sql.substring(current_index)}</span>);
    }
    
    return result;
  };

  const is_uuid = (value: any): boolean => {
    if (value === null || value === undefined) return false;
    const str = String(value).trim();
    const uuid_regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuid_regex.test(str);
  };

  const parse_uuids = (value: any): string[] | null => {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    const parts = str.split(',').map(p => p.trim()).filter(p => p.length > 0);
    const uuid_regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const all_are_uuids = parts.length > 0 && parts.every(p => uuid_regex.test(p));
    return all_are_uuids ? parts : null;
  };

  const is_datetime = (value: any): boolean => {
    if (value === null || value === undefined) return false;
    const str = String(value).trim();
    const datetime_regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z?$/;
    return datetime_regex.test(str);
  };

  const is_image_url = (value: any): boolean => {
    if (value === null || value === undefined) return false;
    const str = String(value).trim();
    try {
      const url = new URL(str);
      const pathname = url.pathname.toLowerCase();
      const image_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
      return image_extensions.some(ext => pathname.endsWith(ext)) || 
             url.hostname.includes('cloudinary.com') ||
             url.hostname.includes('imgur.com') ||
             url.hostname.includes('unsplash.com');
    } catch {
      return false;
    }
  };

  const optimize_cloudinary_url = (url_str: string): string => {
    try {
      const url = new URL(url_str);
      if (url.hostname.includes('cloudinary.com')) {
        const path_parts = url.pathname.split('/');
        const upload_index = path_parts.findIndex(part => part === 'upload');
        if (upload_index !== -1 && upload_index < path_parts.length - 1) {
          const existing_transform = path_parts[upload_index + 1];
          if (existing_transform && existing_transform.match(/^[a-z0-9_,]+$/)) {
            path_parts[upload_index + 1] = 'w_400,q_auto,f_auto';
          } else {
            path_parts.splice(upload_index + 1, 0, 'w_400,q_auto,f_auto');
          }
          url.pathname = path_parts.join('/');
        } else if (upload_index !== -1) {
          path_parts.splice(upload_index + 1, 0, 'w_400,q_auto,f_auto');
          url.pathname = path_parts.join('/');
        }
        return url.toString();
      }
    } catch {
    }
    return url_str;
  };

  const format_from_now = (datetime_str: string): string => {
    try {
      const date = new Date(datetime_str);
      const now = new Date();
      const diff_ms = now.getTime() - date.getTime();
      const diff_seconds = Math.floor(diff_ms / 1000);
      const diff_minutes = Math.floor(diff_seconds / 60);
      const diff_hours = Math.floor(diff_minutes / 60);
      const diff_days = Math.floor(diff_hours / 24);
      const diff_weeks = Math.floor(diff_days / 7);
      const diff_months = Math.floor(diff_days / 30);
      const diff_years = Math.floor(diff_days / 365);

      if (diff_seconds < 60) {
        return diff_seconds <= 0 ? "just now" : `${diff_seconds} second${diff_seconds === 1 ? "" : "s"} ago`;
      } else if (diff_minutes < 60) {
        return `${diff_minutes} minute${diff_minutes === 1 ? "" : "s"} ago`;
      } else if (diff_hours < 24) {
        return `${diff_hours} hour${diff_hours === 1 ? "" : "s"} ago`;
      } else if (diff_days < 7) {
        return `${diff_days} day${diff_days === 1 ? "" : "s"} ago`;
      } else if (diff_weeks < 4) {
        return `${diff_weeks} week${diff_weeks === 1 ? "" : "s"} ago`;
      } else if (diff_months < 12) {
        return `${diff_months} month${diff_months === 1 ? "" : "s"} ago`;
      } else {
        return `${diff_years} year${diff_years === 1 ? "" : "s"} ago`;
      }
    } catch (e) {
      return "";
    }
  };

  const hsl_to_rgb = (h: number, s: number, l: number): [number, number, number] => {
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h >= 0 && h < 60) {
      r = c; g = x; b = 0;
    } else if (h >= 60 && h < 120) {
      r = x; g = c; b = 0;
    } else if (h >= 120 && h < 180) {
      r = 0; g = c; b = x;
    } else if (h >= 180 && h < 240) {
      r = 0; g = x; b = c;
    } else if (h >= 240 && h < 300) {
      r = x; g = 0; b = c;
    } else if (h >= 300 && h < 360) {
      r = c; g = 0; b = x;
    }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  };

  const get_uuid_color = (uuid: string): { bg: string; text: string; bg_rgba: string } => {
    let hash = 0;
    for (let i = 0; i < uuid.length; i++) {
      hash = uuid.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    const saturation = 50 + (Math.abs(hash) % 30);
    const lightness = 40 + (Math.abs(hash) % 20);
    const bg = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    const text = `hsl(${hue}, ${saturation}%, ${Math.min(lightness + 25, 85)}%)`;
    const [r, g, b] = hsl_to_rgb(hue, saturation, lightness);
    const bg_rgba = `rgba(${r}, ${g}, ${b}, 0.2)`;
    return { bg, text, bg_rgba };
  };

  const query_after_where = (query: string): string => {
    const q = query.trim();
    const upper = q.toUpperCase();
    if (upper.startsWith("WHERE ")) return q.slice(6).trim();
    const idx = upper.indexOf(" WHERE ");
    if (idx === -1) return "—";
    return q.slice(idx + 7).trim();
  };

  const format_timestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff_ms = now.getTime() - date.getTime();
    const diff_minutes = Math.floor(diff_ms / 60000);
    const diff_hours = Math.floor(diff_ms / 3600000);
    const diff_days = Math.floor(diff_ms / 86400000);

    if (diff_minutes < 1) {
      return "Just now";
    } else if (diff_minutes < 60) {
      return `${diff_minutes}m ago`;
    } else if (diff_hours < 24) {
      return `${diff_hours}h ago`;
    } else if (diff_days < 7) {
      return `${diff_days}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const restore_query_from_history = async (history_entry: {
    query: string;
    where_items?: WhereItem[];
    where_groups?: WhereGroup[];
    where_conditions?: Array<{ id: string; column: string; operator: string; value: string; logical_op?: "AND" | "OR" }>;
    sort_column: string | null;
    sort_direction: "asc" | "desc";
    timestamp: number;
  }) => {
    if (!selected_table) return;

    set_sort_column(history_entry.sort_column);
    set_sort_direction(history_entry.sort_direction);
    const items = entry_to_items(history_entry);
    set_where_items(JSON.parse(JSON.stringify(items)));
    handle_page_change(1);
    set_is_history_open(false);
    await run_custom_sql(history_entry.query);
  };

  const handle_generate_ai_sql = async () => {
    if (!ai_prompt.trim()) return;
    set_is_ai_generating(true);
    try {
      const gen_res = await fetch("/api/generate-sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postgres_url,
          table_name,
          prompt: ai_prompt.trim(),
        }),
      });
      const gen_data = await gen_res.json();
      if (!gen_res.ok) {
        throw new Error(gen_data.error || "Failed to generate SQL");
      }
      await run_custom_sql(gen_data.sql);
      set_is_ai_modal_open(false);
      set_ai_prompt("");
    } catch (err: any) {
      set_toast({ message: err.message || "Failed to generate SQL", type: "error" });
      setTimeout(() => set_toast(null), 4000);
    } finally {
      set_is_ai_generating(false);
    }
  };

  const query_history = get_query_history(table_name);

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 flex flex-col h-full min-h-0">
      {is_ai_modal_open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => !is_ai_generating && set_is_ai_modal_open(false)}
        >
          <div
            className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl w-full max-w-lg mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
            data-ai-modal
          >
            <h3 className="text-lg font-semibold text-white mb-2">Generate SQL with AI</h3>
            <p className="text-sm text-[#8b8b8b] mb-4">
              Describe what you want to query from table &quot;{table_name}&quot;. The AI will generate a SELECT statement (columns may change).
            </p>
            <textarea
              value={ai_prompt}
              onChange={(e) => set_ai_prompt(e.target.value)}
              placeholder="e.g. show only id and name, order by name"
              className="w-full h-24 px-4 py-3 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg text-white placeholder-[#4a4a4a] focus:outline-none focus:ring-2 focus:ring-[#3ECF8E] resize-none text-sm"
              disabled={is_ai_generating}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => !is_ai_generating && set_is_ai_modal_open(false)}
                className="px-4 py-2 bg-[#2a2a2a] text-white rounded-lg hover:bg-[#333] text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handle_generate_ai_sql}
                disabled={is_ai_generating || !ai_prompt.trim()}
                className="px-4 py-2 bg-[#3ECF8E] text-black font-medium rounded-lg hover:bg-[#24B47E] disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
              >
                {is_ai_generating ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    Generate
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="mb-6 flex flex-col gap-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-white">{table_name}</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={show_images}
                onChange={(e) => set_show_images(e.target.checked)}
                className="w-4 h-4 rounded border-[#2a2a2a] bg-[#0f0f0f] text-[#3ECF8E] focus:ring-2 focus:ring-[#3ECF8E] focus:ring-offset-0"
              />
              <span className="text-sm text-[#8b8b8b]">Show images</span>
            </label>
            <button
              onClick={() => set_column_badges_expanded(!column_badges_expanded)}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg text-[#8b8b8b] hover:text-white hover:border-[#3ECF8E]/50 transition-all text-sm whitespace-nowrap"
            >
              {column_badges_expanded ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  <span>Hide columns</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  <span>Show columns</span>
                </>
              )}
            </button>
          </div>
        <div className="text-sm text-[#8b8b8b]">
          {table_data.total_rows} {table_data.total_rows === 1 ? "row" : "rows"}
        </div>
        </div>
        {query_view_mode === "sql" && table_data.query && (
          <div className="relative">
            <div className="w-full min-h-12 px-4 py-2 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg relative">
              <div className="absolute top-2 right-2 flex items-center gap-2 flex-nowrap flex-shrink-0 z-10">
                <div className="relative flex-shrink-0" data-history-dropdown>
                  <button
                    onClick={() => set_is_history_open(!is_history_open)}
                    className="flex items-center gap-2 flex-shrink-0 px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-[#8b8b8b] hover:text-white hover:border-[#3ECF8E]/50 transition-all text-xs whitespace-nowrap"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>History</span>
                    {query_history.length > 0 && (
                      <span className="px-1.5 py-0.5 bg-[#3ECF8E] text-black text-xs rounded-full font-semibold">
                        {query_history.length}
                      </span>
                    )}
                  </button>
                  {is_history_open && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => set_is_history_open(false)}
                      />
                      <div className="absolute right-0 top-full mt-2 w-96 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-lg z-50 max-h-[400px] overflow-y-auto" data-history-dropdown>
                        <div className="p-3 border-b border-[#2a2a2a] flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-white">Query History</h3>
                          <button
                            onClick={() => set_is_history_open(false)}
                            className="p-1 hover:bg-[#1f1f1f] rounded transition-colors"
                          >
                            <X className="w-4 h-4 text-[#8b8b8b]" />
                          </button>
                        </div>
                        {query_history.length === 0 ? (
                          <div className="p-4 text-center text-sm text-[#4a4a4a]">
                            No query history
                          </div>
                        ) : (
                          <div className="divide-y divide-[#2a2a2a]">
                            {query_history.map((entry, idx) => (
                              <button
                                key={idx}
                                onClick={() => restore_query_from_history(entry)}
                                className="w-full p-3 text-left hover:bg-[#1f1f1f] transition-colors group"
                              >
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-mono text-xs text-white truncate mb-1" style={{ fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }}>
                                      {(() => { const s = query_after_where(entry.query); const display = s.length > 80 ? `${s.substring(0, 80)}...` : s; return highlight_sql(display); })()}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-[#4a4a4a]">
                                      {entry.sort_column && (
                                        <span className="px-1.5 py-0.5 bg-[#0f0f0f] rounded">
                                          Sort: {entry.sort_column} {entry.sort_direction}
                                        </span>
                                      )}
                                      {(entry.where_items ? count_conditions_in_items(entry.where_items) : (entry.where_groups?.reduce((s, g) => s + g.conditions.length, 0) ?? entry.where_conditions?.length ?? 0)) > 0 && (
                                        <span className="px-1.5 py-0.5 bg-[#0f0f0f] rounded">
                                          {entry.where_items ? count_conditions_in_items(entry.where_items) : (entry.where_groups?.reduce((s, g) => s + g.conditions.length, 0) ?? entry.where_conditions?.length ?? 0)} filter{(entry.where_items ? count_conditions_in_items(entry.where_items) : (entry.where_groups?.reduce((s, g) => s + g.conditions.length, 0) ?? entry.where_conditions?.length ?? 0)) !== 1 ? "s" : ""}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-xs text-[#4a4a4a] whitespace-nowrap">
                                    {format_timestamp(entry.timestamp)}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={() => set_is_ai_modal_open(true)}
                  className="flex items-center gap-2 flex-shrink-0 px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-[#8b8b8b] hover:text-white hover:border-[#3ECF8E]/50 transition-all text-xs whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate with AI</span>
                </button>
                <button
                  onClick={() => set_query_view_mode("sql")}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    query_view_mode === "sql"
                      ? "bg-[#3ECF8E] text-black"
                      : "bg-[#1a1a1a] border border-[#2a2a2a] text-[#8b8b8b] hover:text-white"
                  }`}
                >
                  <Code className="w-3.5 h-3.5" />
                  SQL
                </button>
                <button
                  onClick={() => {
                    const parsed = table_name ? parse_query(editable_sql, table_name) : null;
                    if (parsed) {
                      apply_parsed_query(parsed);
                    }
                    set_query_view_mode("blocks");
                  }}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    (query_view_mode as "sql" | "blocks") === "blocks"
                      ? "bg-[#3ECF8E] text-black"
                      : "bg-[#1a1a1a] border border-[#2a2a2a] text-[#8b8b8b] hover:text-white"
                  }`}
                >
                  <Blocks className="w-3.5 h-3.5" />
                  Blocks
                </button>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(editable_sql);
                    set_is_sql_copied(true);
                    setTimeout(() => set_is_sql_copied(false), 2000);
                  }}
                  className="flex-shrink-0 p-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-[#8b8b8b] hover:text-white hover:border-[#3ECF8E]/50 transition-all"
                  title="Copy SQL to clipboard"
                >
                  {is_sql_copied ? (
                    <Check className="w-3.5 h-3.5 text-[#3ECF8E]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={() => run_custom_sql(editable_sql)}
                  disabled={!editable_sql.trim()}
                  className="flex-shrink-0 p-2 rounded-lg text-xs font-medium bg-[#3ECF8E] text-black hover:bg-[#24B47E] disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Run query"
                >
                  <Play className="w-3.5 h-3.5" />
                </button>
              </div>
              <div
                className="overflow-x-auto pr-52 relative min-h-12 text-xs"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }}
              >
                <div className="whitespace-pre-wrap break-words text-white p-0 min-h-12 pointer-events-none">
                  {highlight_sql(editable_sql)}
                </div>
                <textarea
                  value={editable_sql}
                  onChange={(e) => set_editable_sql(e.target.value)}
                  className="absolute inset-0 w-full min-h-12 p-0 bg-transparent border-0 resize-none text-transparent caret-white whitespace-pre-wrap break-words text-xs focus:outline-none focus:ring-0 selection:bg-[#3ECF8E]/30"
                  spellCheck={false}
                  style={{ caretColor: "#fff", fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }}
                />
              </div>
            </div>
          </div>
        )}
        {query_view_mode === "blocks" && (
          <div className="relative">
            <div className="w-full min-h-12 px-4 py-3 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg relative">
              <div className="absolute top-2 right-2 flex items-center gap-2 flex-nowrap flex-shrink-0 z-10">
                <div className="relative flex-shrink-0" data-history-dropdown>
                  <button
                    onClick={() => set_is_history_open(!is_history_open)}
                    className="flex items-center gap-2 flex-shrink-0 px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-[#8b8b8b] hover:text-white hover:border-[#3ECF8E]/50 transition-all text-xs whitespace-nowrap"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>History</span>
                    {query_history.length > 0 && (
                      <span className="px-1.5 py-0.5 bg-[#3ECF8E] text-black text-xs rounded-full font-semibold">
                        {query_history.length}
                      </span>
                    )}
                  </button>
                  {is_history_open && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => set_is_history_open(false)}
                      />
                      <div className="absolute right-0 top-full mt-2 w-96 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-lg z-50 max-h-[400px] overflow-y-auto" data-history-dropdown>
                        <div className="p-3 border-b border-[#2a2a2a] flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-white">Query History</h3>
                          <button
                            onClick={() => set_is_history_open(false)}
                            className="p-1 hover:bg-[#1f1f1f] rounded transition-colors"
                          >
                            <X className="w-4 h-4 text-[#8b8b8b]" />
                          </button>
                        </div>
                        {query_history.length === 0 ? (
                          <div className="p-4 text-center text-sm text-[#4a4a4a]">
                            No query history
                          </div>
                        ) : (
                          <div className="divide-y divide-[#2a2a2a]">
                            {query_history.map((entry, idx) => (
                              <button
                                key={idx}
                                onClick={() => restore_query_from_history(entry)}
                                className="w-full p-3 text-left hover:bg-[#1f1f1f] transition-colors group"
                              >
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-mono text-xs text-white truncate mb-1" style={{ fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }}>
                                      {(() => { const s = query_after_where(entry.query); const display = s.length > 80 ? `${s.substring(0, 80)}...` : s; return highlight_sql(display); })()}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-[#4a4a4a]">
                                      {entry.sort_column && (
                                        <span className="px-1.5 py-0.5 bg-[#0f0f0f] rounded">
                                          Sort: {entry.sort_column} {entry.sort_direction}
                                        </span>
                                      )}
                                      {(entry.where_items ? count_conditions_in_items(entry.where_items) : (entry.where_groups?.reduce((s, g) => s + g.conditions.length, 0) ?? entry.where_conditions?.length ?? 0)) > 0 && (
                                        <span className="px-1.5 py-0.5 bg-[#0f0f0f] rounded">
                                          {entry.where_items ? count_conditions_in_items(entry.where_items) : (entry.where_groups?.reduce((s, g) => s + g.conditions.length, 0) ?? entry.where_conditions?.length ?? 0)} filter{(entry.where_items ? count_conditions_in_items(entry.where_items) : (entry.where_groups?.reduce((s, g) => s + g.conditions.length, 0) ?? entry.where_conditions?.length ?? 0)) !== 1 ? "s" : ""}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-xs text-[#4a4a4a] whitespace-nowrap">
                                    {format_timestamp(entry.timestamp)}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={() => set_is_ai_modal_open(true)}
                  className="flex items-center gap-2 flex-shrink-0 px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-[#8b8b8b] hover:text-white hover:border-[#3ECF8E]/50 transition-all text-xs whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate with AI</span>
                </button>
                <button
                  onClick={() => {
                    set_editable_sql(build_current_query());
                    set_query_view_mode("sql");
                  }}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    (query_view_mode as "sql" | "blocks") === "sql"
                      ? "bg-[#3ECF8E] text-black"
                      : "bg-[#1a1a1a] border border-[#2a2a2a] text-[#8b8b8b] hover:text-white"
                  }`}
                >
                  <Code className="w-3.5 h-3.5" />
                  SQL
                </button>
                <button
                  onClick={() => set_query_view_mode("blocks")}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    query_view_mode === "blocks"
                      ? "bg-[#3ECF8E] text-black"
                      : "bg-[#1a1a1a] border border-[#2a2a2a] text-[#8b8b8b] hover:text-white"
                  }`}
                >
                  <Blocks className="w-3.5 h-3.5" />
                  Blocks
                </button>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(editable_sql);
                    set_is_sql_copied(true);
                    setTimeout(() => set_is_sql_copied(false), 2000);
                  }}
                  className="flex-shrink-0 p-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-[#8b8b8b] hover:text-white hover:border-[#3ECF8E]/50 transition-all"
                  title="Copy SQL to clipboard"
                >
                  {is_sql_copied ? (
                    <Check className="w-3.5 h-3.5 text-[#3ECF8E]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={() => run_custom_sql(editable_sql)}
                  disabled={!editable_sql.trim()}
                  className="flex-shrink-0 p-2 rounded-lg text-xs font-medium bg-[#3ECF8E] text-black hover:bg-[#24B47E] disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Run query"
                >
                  <Play className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-xs text-[#8b8b8b] mb-2 pr-52">WHERE</div>
              <WhereBlocksRecursive
                items={where_items}
                path={[]}
                set_where_items={set_where_items}
                apply_update_at_path={apply_update_at_path}
                table_data={table_data}
                first_column={table_data.columns.find(col => col && col.trim() !== "") || ""}
                selected_table={selected_table}
                sort_column={sort_column}
                sort_direction={sort_direction}
                load_table_data={load_table_data}
                handle_page_change={handle_page_change}
                build_where_clause={build_where_clause}
              />
            </div>
          </div>
        )}
      </div>
      
      {is_loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-2 border-[#3ECF8E] border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-[#8b8b8b]">Loading data...</p>
        </div>
      ) : (
        <>
          {column_badges_expanded && (
            <div className="mb-3 flex flex-col gap-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-[#4a4a4a]" />
                  <input
                    type="text"
                    value={search_query}
                    onChange={(e) => set_search_query(e.target.value)}
                    placeholder="Search column names..."
                    className="w-full pl-8 pr-3 py-1.5 bg-[#0f0f0f] border border-[#2a2a2a] rounded-md text-white placeholder-[#4a4a4a] focus:outline-none focus:ring-2 focus:ring-[#3ECF8E] focus:border-transparent transition-all text-xs"
                  />
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={select_all_columns}
                    disabled={is_all_selected()}
                    className="px-2 py-1 text-[11px] font-medium rounded-md border border-[#2a2a2a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none text-[#3ECF8E] hover:bg-[#3ECF8E]/10 hover:border-[#3ECF8E]/50"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={unselect_all_columns}
                    disabled={is_unselect_all_state()}
                    className="px-2 py-1 text-[11px] font-medium rounded-md border border-[#2a2a2a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none text-[#4a4a4a] hover:text-white hover:bg-[#1f1f1f] hover:border-[#3ECF8E]/50"
                  >
                    Unselect all
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
              {column_order.filter((idx) => {
                const col_name = table_data.columns[idx];
                return col_name && col_name.trim() !== "";
              }).map((column_idx) => {
              const column_name = table_data.columns[column_idx];
              const is_visible = column_visibility[column_idx] !== false;
              const is_dragged = dragged_column === column_idx;
              const is_drag_over = drag_over_column === column_idx;
              const matches_search = search_query.trim() === "" || column_name.toLowerCase().includes(search_query.toLowerCase());

              return (
                <div
                  key={column_idx}
                  draggable
                  onDragStart={() => handle_drag_start(column_idx)}
                  onDragOver={(e) => handle_drag_over(e, column_idx)}
                  onDrop={() => handle_drop(column_idx)}
                  onDragEnd={handle_drag_end}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (!target.closest("button")) {
                      toggle_column_visibility(column_idx);
                    }
                  }}
                  className={`flex-none inline-flex items-center gap-1 px-2 py-0.5 rounded-md border transition-all cursor-move ${
                    is_dragged
                      ? "opacity-50 bg-[#1f1f1f] border-[#3ECF8E]"
                      : is_drag_over
                      ? "bg-[#1f1f1f] border-[#3ECF8E] scale-105"
                      : matches_search && search_query.trim() !== ""
                      ? "bg-[#3ECF8E]/20 border-[#3ECF8E]/50 hover:border-[#3ECF8E]"
                      : is_visible
                      ? "bg-[#0f0f0f] border-[#2a2a2a] hover:border-[#3ECF8E]/50"
                      : "bg-[#0f0f0f] border-[#2a2a2a] opacity-50"
                  }`}
                >
                  <GripVertical className="w-2.5 h-2.5 text-[#4a4a4a] flex-shrink-0" />
                  <span
                    className={`text-[11px] ${
                      is_visible ? "text-white" : "text-[#4a4a4a] line-through"
                    }`}
                  >
                    {column_name || `Column ${column_idx + 1}`}
                  </span>
                    <div className="flex items-center gap-0.5">
                      <div className="relative" data-color-picker>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            set_color_picker_open(color_picker_open === column_idx ? null : column_idx);
                          }}
                          className="p-0.5 hover:bg-[#1f1f1f] rounded transition-colors relative"
                          title="Set column color"
                        >
                          {column_colors[column_idx] ? (
                            <div
                              className="w-3 h-3 rounded"
                              style={{ backgroundColor: column_colors[column_idx] }}
                            />
                          ) : (
                            <Palette className="w-3 h-3 text-[#4a4a4a]" />
                          )}
                        </button>
                        {color_picker_open === column_idx && (
                          <div className="absolute top-full right-0 mt-1 bg-[#1f1f1f] border border-[#2a2a2a] rounded-md p-1.5 shadow-lg z-50" data-color-picker>
                          <div className="flex flex-wrap gap-1.5 w-44">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                set_column_color(column_idx, "");
                              }}
                              className={`w-6 h-6 rounded border-2 transition-all ${
                                !column_colors[column_idx]
                                  ? "border-[#3ECF8E]"
                                  : "border-[#2a2a2a] hover:border-[#3ECF8E]/50"
                              }`}
                              title="No color"
                            >
                              <div className="w-full h-full rounded bg-[#0f0f0f]" />
                            </button>
                            {predefined_colors.map((color) => (
                              <button
                                key={color.value}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  set_column_color(column_idx, color.value);
                                }}
                                className={`w-6 h-6 rounded border-2 transition-all ${
                                  column_colors[column_idx] === color.value
                                    ? "border-[#3ECF8E] scale-110"
                                    : "border-[#2a2a2a] hover:border-[#3ECF8E]/50"
                                }`}
                                style={{ backgroundColor: color.value }}
                                title={color.name}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle_column_visibility(column_idx);
                      }}
                      className="p-0.5 hover:bg-[#1f1f1f] rounded transition-colors"
                    >
                      {is_visible ? (
                        <Eye className="w-3 h-3 text-[#3ECF8E]" />
                      ) : (
                        <EyeOff className="w-3 h-3 text-[#4a4a4a]" />
                      )}
                    </button>
                  </div>
                </div>
              );
              })}
              </div>
            </div>
          )}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-auto mb-6 rounded-lg border border-[#2a2a2a]">
              <table
                ref={table_ref}
                className="min-w-full divide-y divide-[#2a2a2a]"
                style={{ tableLayout: "fixed", width: "100%" }}
              >
              <thead className="bg-[#0f0f0f]">
                <tr>
                  {get_visible_ordered_columns().map((column_idx, display_idx) => {
                    const column = table_data.columns[column_idx];
                    const visible_columns = get_visible_ordered_columns();
                    return (
                      <th
                        key={`${column_idx}-${column}`}
                        className={`px-6 py-3 text-left text-xs font-semibold text-[#8b8b8b] uppercase tracking-wider relative select-none ${
                          display_idx < visible_columns.length - 1 ? "border-r border-[#2a2a2a]" : ""
                        }`}
                        style={{
                          width: `${get_column_width(column_idx)}px`,
                          maxWidth: `${get_column_width(column_idx)}px`,
                          minWidth: `${min_width}px`,
                          backgroundColor: get_column_color_with_opacity(column_idx) || undefined,
                        }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="truncate min-w-0">{column || `Column ${column_idx + 1}`}</div>
                          <div className="flex flex-col flex-shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                on_sort(column, "asc");
                              }}
                              className={`p-0.5 hover:bg-[#1f1f1f] rounded transition-colors ${
                                sort_column === column && sort_direction === "asc" ? "text-[#3ECF8E]" : "text-[#4a4a4a]"
                              }`}
                              title="Sort ascending"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                on_sort(column, "desc");
                              }}
                              className={`p-0.5 hover:bg-[#1f1f1f] rounded transition-colors ${
                                sort_column === column && sort_direction === "desc" ? "text-[#3ECF8E]" : "text-[#4a4a4a]"
                              }`}
                              title="Sort descending"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <div
                          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#3ECF8E]/50 transition-colors"
                          onMouseDown={(e) => handle_mouse_down(column_idx, e)}
                          style={{
                            backgroundColor: resizing_column === column_idx ? "#3ECF8E" : "transparent",
                          }}
                        />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="bg-[#1a1a1a] divide-y divide-[#2a2a2a]">
                {table_data.rows.map((row, row_idx) => {
                  const visible_columns = get_visible_ordered_columns();
                  return (
                    <tr key={row_idx} className="hover:bg-[#1f1f1f] transition-colors">
                      {visible_columns.map((column_idx, display_idx) => {
                        const cell = row[column_idx];
                        const is_hovered = hovered_cell?.row_idx === row_idx && hovered_cell?.cell_idx === display_idx;
                        const is_copied = copied_cell?.row_idx === row_idx && copied_cell?.cell_idx === display_idx;
                        const is_editing = editing_cell?.row_idx === row_idx && editing_cell?.cell_idx === display_idx;
                        const cell_text = cell === null || cell === undefined ? "null" : String(cell);
                        
                        return (
                          <td
                            key={`${row_idx}-${column_idx}`}
                            className={`px-6 py-4 text-sm text-white relative group cursor-pointer ${
                              display_idx < visible_columns.length - 1 ? "border-r border-[#2a2a2a]" : ""
                            }`}
                            style={{
                              width: `${get_column_width(column_idx)}px`,
                              maxWidth: `${get_column_width(column_idx)}px`,
                              minWidth: `${min_width}px`,
                              backgroundColor: get_column_color_with_opacity(column_idx) || undefined,
                            }}
                            onMouseEnter={() => set_hovered_cell({ row_idx, cell_idx: display_idx })}
                            onMouseLeave={() => set_hovered_cell(null)}
                            onClick={() => {
                              if (!is_editing) {
                                handle_edit(cell, row_idx, display_idx);
                              }
                            }}
                          >
                            <div className="inline-block min-w-0 max-w-full">
                              {cell === null || cell === undefined
                                ? (
                                    <span className="text-[#4a4a4a] italic">null</span>
                                  )
                                : (() => {
                                    const uuid_list = parse_uuids(cell);
                                    if (uuid_list) {
                                      return (
                                        <div className="flex flex-col gap-1 min-w-0 w-fit max-w-full">
                                          {uuid_list.map((uuid, idx) => {
                                            const colors = get_uuid_color(uuid);
                                            return (
                                              <span 
                                                key={idx}
                                                className="inline-block max-w-full px-2 py-1 rounded border font-mono text-xs whitespace-nowrap overflow-hidden text-ellipsis"
                                                style={{ 
                                                  backgroundColor: colors.bg_rgba,
                                                  color: colors.text,
                                                  borderColor: colors.text
                                                }}
                                              >
                                                {uuid}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      );
                                    } else if (is_uuid(cell)) {
                                      const colors = get_uuid_color(cell_text);
                                      return (
                                        <span 
                                          className="inline-block max-w-full px-2 py-1 rounded border font-mono text-xs whitespace-nowrap overflow-hidden text-ellipsis"
                                          style={{ 
                                            backgroundColor: colors.bg_rgba,
                                            color: colors.text,
                                            borderColor: colors.text
                                          }}
                                        >
                                          {cell_text}
                                        </span>
                                      );
                                    } else if (is_datetime(cell)) {
                                      const from_now = format_from_now(cell_text);
                                      return (
                                        <span 
                                          className="inline-flex items-center px-2.5 py-0.5 rounded-full font-mono text-xs whitespace-nowrap overflow-hidden text-ellipsis bg-[#F59E0B]/15 text-[#FCD34D] relative group/datetime"
                                          title={from_now}
                                        >
                                          {cell_text}
                                          {from_now && (
                                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-[#1f1f1f] border border-[#2a2a2a] rounded text-xs text-white whitespace-nowrap opacity-0 group-hover/datetime:opacity-100 transition-opacity pointer-events-none z-20">
                                              {from_now}
                                              <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 w-2 h-2 bg-[#1f1f1f] border-r border-b border-[#2a2a2a] rotate-45"></div>
                                            </div>
                                          )}
                                        </span>
                                      );
                                    } else if (show_images && is_image_url(cell)) {
                                      const optimized_url = optimize_cloudinary_url(cell_text);
                                      return (
                                        <div className="flex items-center gap-2">
                                          <img
                                            src={optimized_url}
                                            alt=""
                                            className="max-w-[100px] max-h-[100px] object-contain rounded border border-[#2a2a2a]"
                                            onError={(e) => {
                                              const target = e.target as HTMLImageElement;
                                              target.style.display = 'none';
                                              const fallback = target.nextElementSibling as HTMLElement;
                                              if (fallback) fallback.style.display = 'block';
                                            }}
                                          />
                                          <span className="truncate block text-xs text-[#8b8b8b] hidden">{cell_text}</span>
                                        </div>
                                      );
                                    } else if (!show_images && is_image_url(cell)) {
                                      return (
                                        <span className="inline-block max-w-full truncate">
                                          <span className="mr-1">🖼️</span>
                                          {cell_text}
                                        </span>
                                      );
                                    } else {
                                      return <span className="inline-block max-w-full truncate">{cell_text}</span>;
                                    }
                                  })()}
                            </div>
                            {is_hovered && (
                              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1 z-10 pointer-events-auto bg-[#1a1a1a] pl-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handle_copy(cell, row_idx, display_idx);
                                  }}
                                  className="p-1.5 bg-[#1f1f1f] border border-[#2a2a2a] rounded hover:bg-[#2a2a2a] hover:border-[#3ECF8E]/50 transition-all"
                                  title="Copy to clipboard"
                                >
                                  {is_copied ? (
                                    <Check className="w-3.5 h-3.5 text-[#3ECF8E]" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 text-[#8b8b8b] hover:text-[#3ECF8E]" />
                                  )}
                                </button>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
            <div className="flex-shrink-0">
              <Pagination
                current_page={current_page}
                total_pages={total_pages}
                handle_page_change={handle_page_change}
                total_rows={table_data.total_rows}
              />
            </div>
          </div>
        </>
      )}
      
      {editing_cell !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={handle_cancel_edit}>
          <div
            className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Edit Cell
              </h3>
              <button
                onClick={handle_cancel_edit}
                className="p-1 hover:bg-[#1f1f1f] rounded transition-colors"
              >
                <X className="w-5 h-5 text-[#8b8b8b]" />
              </button>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-[#8b8b8b] mb-2">
                Column: {table_data.columns[get_visible_ordered_columns()[editing_cell.cell_idx]]}
              </label>
              <label className="block text-sm font-medium text-[#8b8b8b] mb-2">
                Row: {editing_cell.row_idx + 1 + (current_page - 1) * 20}
              </label>
            </div>
            
            <textarea
              value={edit_value}
              onChange={(e) => set_edit_value(e.target.value)}
              className="w-full px-4 py-3 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg text-white placeholder-[#4a4a4a] focus:outline-none focus:ring-2 focus:ring-[#3ECF8E] focus:border-transparent transition-all resize-none flex-1 min-h-[200px] font-mono text-sm"
              placeholder="Enter cell value..."
              autoFocus
            />
            
            <div className="flex items-center justify-end gap-3 mt-4">
              <button
                onClick={handle_cancel_edit}
                className="px-4 py-2 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg text-white hover:bg-[#1f1f1f] transition-colors"
                disabled={is_saving}
              >
                Cancel
              </button>
              <button
                onClick={handle_save_edit}
                disabled={is_saving}
                className="px-4 py-2 bg-[#3ECF8E] hover:bg-[#24B47E] text-black font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                {is_saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg ${
              toast.type === "success"
                ? "bg-[#0f0f0f] border-[#3ECF8E] text-white"
                : "bg-[#0f0f0f] border-[#EF4444] text-white"
            }`}
          >
            {toast.type === "success" ? (
              <Check className="w-5 h-5 text-[#3ECF8E] flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-[#EF4444] flex-shrink-0" />
            )}
            <span className="text-sm font-medium">{toast.message}</span>
            <button
              onClick={() => set_toast(null)}
              className="ml-2 p-1 hover:bg-[#1f1f1f] rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Pagination({
  current_page,
  total_pages,
  handle_page_change,
  total_rows,
}: {
  current_page: number;
  total_pages: number;
  handle_page_change: (page: number) => void;
  total_rows: number;
}) {
  const start_row = (current_page - 1) * 20 + 1;
  const end_row = Math.min(current_page * 20, total_rows);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[#2a2a2a]">
      <div className="text-sm text-[#8b8b8b]">
        Showing <span className="text-white font-medium">{start_row}</span> to{" "}
        <span className="text-white font-medium">{end_row}</span> of{" "}
        <span className="text-white font-medium">{total_rows}</span> rows
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => handle_page_change(current_page - 1)}
          disabled={current_page === 1}
          className="px-4 py-2 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#1f1f1f] hover:border-[#3ECF8E]/50 transition-all duration-200"
        >
          Previous
        </button>
        <span className="px-4 py-2 text-[#8b8b8b] flex items-center">
          Page <span className="text-white font-medium mx-1">{current_page}</span> of{" "}
          <span className="text-white font-medium ml-1">{total_pages}</span>
        </span>
        <button
          onClick={() => handle_page_change(current_page + 1)}
          disabled={current_page === total_pages}
          className="px-4 py-2 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#1f1f1f] hover:border-[#3ECF8E]/50 transition-all duration-200"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-12 text-center flex flex-col h-full min-h-0 items-center justify-center">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg mb-4">
        <Table2 className="w-8 h-8 text-[#4a4a4a]" />
      </div>
      <p className="text-[#8b8b8b]">Select a table to view its data</p>
    </div>
  );
}
