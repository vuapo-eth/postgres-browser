import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import { Database, Table2, Sparkles, ArrowRight, Search, Star, Copy, Check, Eye, EyeOff, GripVertical, Palette, Edit, X, AlertCircle, Lock, ArrowUp, ArrowDown, Blocks, Code, ChevronDown, ChevronUp, History } from "lucide-react";

type TableInfo = {
  table_name: string;
};

type TableData = {
  columns: string[];
  rows: any[][];
  total_rows: number;
  query?: string;
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
  const [where_conditions, set_where_conditions] = useState<Array<{
    id: string;
    column: string;
    operator: string;
    value: string;
    logical_op?: "AND" | "OR";
  }>>([]);

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
      
      const where_clause = where_conditions.length > 0 ? build_where_clause(where_conditions) : undefined;
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
    set_where_conditions([]);
    router.push({ query: { ...router.query, table: table_name, page: "1" } }, undefined, { shallow: true });
    await load_table_data(table_name, 1, null, "asc");
  };

  const handle_sort = async (column_name: string, force_direction?: "asc" | "desc") => {
    const where_clause = where_conditions.length > 0 ? build_where_clause(where_conditions) : undefined;
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

  const build_where_clause = (conditions: Array<{
    id: string;
    column: string;
    operator: string;
    value: string;
    logical_op?: "AND" | "OR";
  }>): string => {
    if (conditions.length === 0) return "";
    
    return conditions.map((cond: { id: string; column: string; operator: string; value: string; logical_op?: "AND" | "OR" }, idx: number) => {
      const column_escaped = `"${cond.column.replace(/"/g, '""')}"`;
      const logical_op = idx > 0 ? ` ${cond.logical_op || "AND"} ` : "";
      
      if (cond.operator.includes("NULL")) {
        return `${logical_op}${column_escaped} ${cond.operator}`;
      } else if (cond.operator === "IN" || cond.operator === "NOT IN") {
        const values = cond.value.split(",").map((v: string) => v.trim()).filter((v: string) => v);
        const values_str = values.map((v: string) => `'${v.replace(/'/g, "''")}'`).join(", ");
        return `${logical_op}${column_escaped} ${cond.operator} (${values_str})`;
      } else if (cond.operator === "CONTAINS") {
        const value_escaped = `'%${cond.value.replace(/'/g, "''")}%'`;
        return `${logical_op}${column_escaped} LIKE ${value_escaped}`;
      } else if (cond.operator === "CONTAINS (case-insensitive)") {
        const value_escaped = `'%${cond.value.replace(/'/g, "''")}%'`;
        return `${logical_op}${column_escaped} ILIKE ${value_escaped}`;
      } else {
        const value_escaped = `'${cond.value.replace(/'/g, "''")}'`;
        return `${logical_op}${column_escaped} ${cond.operator} ${value_escaped}`;
      }
    }).join("");
  };

  const save_query_to_history = (table_name: string, query: string, where_conditions: Array<{
    id: string;
    column: string;
    operator: string;
    value: string;
    logical_op?: "AND" | "OR";
  }>, sort_column: string | null, sort_direction: "asc" | "desc") => {
    try {
      const history_key = `sql_query_history_${table_name}`;
      const existing_history = localStorage.getItem(history_key);
      const history: Array<{
        query: string;
        where_conditions: Array<{
          id: string;
          column: string;
          operator: string;
          value: string;
          logical_op?: "AND" | "OR";
        }>;
        sort_column: string | null;
        sort_direction: "asc" | "desc";
        timestamp: number;
      }> = existing_history ? JSON.parse(existing_history) : [];

      const new_entry = {
        query,
        where_conditions: JSON.parse(JSON.stringify(where_conditions)),
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

  const get_query_history = (table_name: string): Array<{
    query: string;
    where_conditions: Array<{
      id: string;
      column: string;
      operator: string;
      value: string;
      logical_op?: "AND" | "OR";
    }>;
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
      const final_where_clause = where_clause !== undefined ? where_clause : (where_conditions.length > 0 ? build_where_clause(where_conditions) : undefined);

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
        save_query_to_history(table_name, data.query, where_conditions, final_sort_col, final_sort_dir);
      }
    } catch (err: any) {
      set_error(err.message || "Failed to load table data");
    } finally {
      set_is_loading(false);
    }
  };

  const handle_page_change = (new_page: number) => {
    if (selected_table) {
      set_current_page(new_page);
      router.push({ query: { ...router.query, page: new_page.toString() } }, undefined, { shallow: true });
      load_table_data(selected_table, new_page, sort_column, sort_direction);
    }
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
                    where_conditions={where_conditions}
                    set_where_conditions={set_where_conditions}
                    build_where_clause={build_where_clause}
                    selected_table={selected_table}
                    load_table_data={load_table_data}
                    get_query_history={get_query_history}
                    set_sort_column={set_sort_column}
                    set_sort_direction={set_sort_direction}
                    on_cell_update={() => {
                      if (selected_table) {
                        const where_clause = where_conditions.length > 0 ? build_where_clause(where_conditions) : undefined;
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
  where_conditions,
  set_where_conditions,
  build_where_clause,
  selected_table,
  load_table_data,
  get_query_history,
  set_sort_column,
  set_sort_direction,
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
  where_conditions: Array<{
    id: string;
    column: string;
    operator: string;
    value: string;
    logical_op?: "AND" | "OR";
  }>;
  set_where_conditions: React.Dispatch<React.SetStateAction<Array<{
    id: string;
    column: string;
    operator: string;
    value: string;
    logical_op?: "AND" | "OR";
  }>>>;
  build_where_clause: (conditions: typeof where_conditions) => string;
  selected_table: string | null;
  load_table_data: (table_name: string, page: number, sort_col?: string | null, sort_dir?: "asc" | "desc", where_clause?: string) => Promise<void>;
  get_query_history: (table_name: string) => Array<{
    query: string;
    where_conditions: Array<{
      id: string;
      column: string;
      operator: string;
      value: string;
      logical_op?: "AND" | "OR";
    }>;
    sort_column: string | null;
    sort_direction: "asc" | "desc";
    timestamp: number;
  }>;
  set_sort_column: React.Dispatch<React.SetStateAction<string | null>>;
  set_sort_direction: React.Dispatch<React.SetStateAction<"asc" | "desc">>;
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
  const [column_badges_expanded, set_column_badges_expanded] = useState(true);
  const [query_view_mode, set_query_view_mode] = useState<"sql" | "blocks">("sql");
  const [is_history_open, set_is_history_open] = useState(false);

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

  useEffect(() => {
    if (table_data.columns.length > 0 && column_order.length === 0) {
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
  }, [table_data.columns, column_order.length]);

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
    };

    if (color_picker_open !== null || is_history_open) {
      document.addEventListener("mousedown", handle_click_outside);
      return () => {
        document.removeEventListener("mousedown", handle_click_outside);
      };
    }
  }, [color_picker_open, is_history_open]);

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
    where_conditions: Array<{
      id: string;
      column: string;
      operator: string;
      value: string;
      logical_op?: "AND" | "OR";
    }>;
    sort_column: string | null;
    sort_direction: "asc" | "desc";
    timestamp: number;
  }) => {
    if (!selected_table) return;

    set_sort_column(history_entry.sort_column);
    set_sort_direction(history_entry.sort_direction);
    set_where_conditions(JSON.parse(JSON.stringify(history_entry.where_conditions)));

    const where_clause = history_entry.where_conditions.length > 0 ? build_where_clause(history_entry.where_conditions) : undefined;
    handle_page_change(1);
    await load_table_data(selected_table, 1, history_entry.sort_column, history_entry.sort_direction, where_clause);
    set_is_history_open(false);
  };

  const query_history = get_query_history(table_name);

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 flex flex-col h-full min-h-0">
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
            <div className="w-full px-4 py-2 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1"></div>
                <div className="flex items-center gap-2">
                  <div className="relative" data-history-dropdown>
                    <button
                      onClick={() => set_is_history_open(!is_history_open)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-[#8b8b8b] hover:text-white hover:border-[#3ECF8E]/50 transition-all text-xs"
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
                                      <div className="font-mono text-xs text-white truncate mb-1">
                                        {entry.query.length > 80 ? `${entry.query.substring(0, 80)}...` : entry.query}
                                      </div>
                                      <div className="flex items-center gap-2 text-xs text-[#4a4a4a]">
                                        {entry.sort_column && (
                                          <span className="px-1.5 py-0.5 bg-[#0f0f0f] rounded">
                                            Sort: {entry.sort_column} {entry.sort_direction}
                                          </span>
                                        )}
                                        {entry.where_conditions && entry.where_conditions.length > 0 && (
                                          <span className="px-1.5 py-0.5 bg-[#0f0f0f] rounded">
                                            {entry.where_conditions.length} filter{entry.where_conditions.length !== 1 ? "s" : ""}
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
                    onClick={() => set_query_view_mode("sql")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                      query_view_mode === "sql"
                        ? "bg-[#3ECF8E] text-black"
                        : "bg-[#1a1a1a] border border-[#2a2a2a] text-[#8b8b8b] hover:text-white"
                    }`}
                  >
                    <Code className="w-3.5 h-3.5" />
                    SQL
                  </button>
                  <button
                    onClick={() => set_query_view_mode("blocks")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                      (query_view_mode as "sql" | "blocks") === "blocks"
                        ? "bg-[#3ECF8E] text-black"
                        : "bg-[#1a1a1a] border border-[#2a2a2a] text-[#8b8b8b] hover:text-white"
                    }`}
                  >
                    <Blocks className="w-3.5 h-3.5" />
                    Blocks
                  </button>
                </div>
              </div>
              <div className="font-mono text-xs overflow-x-auto">
                <pre className="text-white whitespace-pre-wrap break-words">
                  {highlight_sql(table_data.query)}
                </pre>
              </div>
            </div>
          </div>
        )}
        {query_view_mode === "blocks" && (
          <div className="relative">
            <div className="w-full px-4 py-3 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-[#8b8b8b]">WHERE</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => set_query_view_mode("sql")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
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
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                      query_view_mode === "blocks"
                        ? "bg-[#3ECF8E] text-black"
                        : "bg-[#1a1a1a] border border-[#2a2a2a] text-[#8b8b8b] hover:text-white"
                    }`}
                  >
                    <Blocks className="w-3.5 h-3.5" />
                    Blocks
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {where_conditions.length === 0 ? (
                  <div className="text-xs text-[#4a4a4a] italic py-2">No conditions added</div>
                ) : (
                  where_conditions.map((condition, idx) => (
                    <div key={condition.id} className="flex items-center gap-2 flex-wrap">
                      {idx > 0 && (
                        <select
                          value={condition.logical_op || "AND"}
                          onChange={(e) => {
                            const new_conditions = [...where_conditions];
                            new_conditions[idx].logical_op = e.target.value as "AND" | "OR";
                            set_where_conditions(new_conditions);
                          }}
                          className="px-2 py-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded text-white text-xs"
                        >
                          <option value="AND">AND</option>
                          <option value="OR">OR</option>
                        </select>
                      )}
                      <select
                        value={condition.column}
                        onChange={(e) => {
                          const new_conditions = [...where_conditions];
                          new_conditions[idx].column = e.target.value;
                          set_where_conditions(new_conditions);
                        }}
                        className="px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded text-white text-xs"
                      >
                        {table_data.columns.filter(col => col && col.trim() !== "").map((col) => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                      <select
                        value={condition.operator}
                        onChange={(e) => {
                          const new_conditions = [...where_conditions];
                          new_conditions[idx].operator = e.target.value;
                          set_where_conditions(new_conditions);
                        }}
                        className="px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded text-white text-xs"
                      >
                        <option value="=">=</option>
                        <option value="!=">!=</option>
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                        <option value=">=">&gt;=</option>
                        <option value="<=">&lt;=</option>
                        <option value="CONTAINS">Contains</option>
                        <option value="CONTAINS (case-insensitive)">Contains (case-insensitive)</option>
                        <option value="LIKE">LIKE</option>
                        <option value="ILIKE">ILIKE</option>
                        <option value="IN">IN</option>
                        <option value="NOT IN">NOT IN</option>
                        <option value="IS NULL">IS NULL</option>
                        <option value="IS NOT NULL">IS NOT NULL</option>
                      </select>
                      {!condition.operator.includes("NULL") && (
                        <input
                          type="text"
                          value={condition.value}
                          onChange={(e) => {
                            const new_conditions = [...where_conditions];
                            new_conditions[idx].value = e.target.value;
                            set_where_conditions(new_conditions);
                          }}
                          placeholder="Value"
                          className="px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded text-white text-xs flex-1 min-w-[120px]"
                        />
                      )}
                      <button
                        onClick={() => {
                          set_where_conditions(where_conditions.filter((_, i) => i !== idx));
                        }}
                        className="p-1.5 hover:bg-[#1f1f1f] rounded transition-colors"
                      >
                        <X className="w-3.5 h-3.5 text-[#8b8b8b] hover:text-[#EF4444]" />
                      </button>
                    </div>
                  ))
                )}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => {
                      set_where_conditions([
                        ...where_conditions,
                        {
                          id: Date.now().toString(),
                          column: table_data.columns.find(col => col && col.trim() !== "") || "",
                          operator: "=",
                          value: "",
                          logical_op: where_conditions.length > 0 ? "AND" : undefined,
                        },
                      ]);
                    }}
                    className="px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded text-white text-xs hover:bg-[#1f1f1f] hover:border-[#3ECF8E]/50 transition-all flex items-center gap-1.5 w-fit"
                  >
                    <span>+</span>
                    <span>Add Condition</span>
                  </button>
                  {where_conditions.length > 0 && (
                    <button
                      onClick={async () => {
                        if (selected_table) {
                          const where_clause = build_where_clause(where_conditions);
                          handle_page_change(1);
                          await load_table_data(selected_table, 1, sort_column, sort_direction, where_clause);
                        }
                      }}
                      className="px-4 py-2 bg-[#3ECF8E] hover:bg-[#24B47E] text-black font-semibold rounded-lg transition-all text-xs w-fit"
                    >
                      Apply Filters
                    </button>
                  )}
                </div>
              </div>
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
            <div className="mb-4 flex flex-col gap-3 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#4a4a4a]" />
                <input
                  type="text"
                  value={search_query}
                  onChange={(e) => set_search_query(e.target.value)}
                  placeholder="Search column names..."
                  className="w-full pl-10 pr-4 py-2 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg text-white placeholder-[#4a4a4a] focus:outline-none focus:ring-2 focus:ring-[#3ECF8E] focus:border-transparent transition-all text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2">
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
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all cursor-move ${
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
                  <GripVertical className="w-3 h-3 text-[#4a4a4a] flex-shrink-0" />
                  <span
                    className={`text-sm ${
                      is_visible ? "text-white" : "text-[#4a4a4a] line-through"
                    }`}
                  >
                    {column_name || `Column ${column_idx + 1}`}
                  </span>
                    <div className="flex items-center gap-1">
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
                              className="w-3.5 h-3.5 rounded"
                              style={{ backgroundColor: column_colors[column_idx] }}
                            />
                          ) : (
                            <Palette className="w-3.5 h-3.5 text-[#4a4a4a]" />
                          )}
                        </button>
                        {color_picker_open === column_idx && (
                          <div className="absolute top-full right-0 mt-1 bg-[#1f1f1f] border border-[#2a2a2a] rounded-lg p-2 shadow-lg z-50" data-color-picker>
                          <div className="flex flex-wrap gap-2 w-48">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                set_column_color(column_idx, "");
                              }}
                              className={`w-8 h-8 rounded border-2 transition-all ${
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
                                className={`w-8 h-8 rounded border-2 transition-all ${
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
                        <Eye className="w-3.5 h-3.5 text-[#3ECF8E]" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-[#4a4a4a]" />
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
                        <div className="flex items-center gap-2">
                          <div className="truncate flex-1">{column || `Column ${column_idx + 1}`}</div>
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
                            <div className="min-w-0 w-full">
                              {cell === null || cell === undefined
                                ? (
                                    <span className="text-[#4a4a4a] italic">null</span>
                                  )
                                : (() => {
                                    const uuid_list = parse_uuids(cell);
                                    if (uuid_list) {
                                      return (
                                        <div className="flex flex-col gap-1 min-w-0">
                                          {uuid_list.map((uuid, idx) => {
                                            const colors = get_uuid_color(uuid);
                                            return (
                                              <span 
                                                key={idx}
                                                className="block px-2 py-1 rounded border font-mono text-xs whitespace-nowrap overflow-hidden text-ellipsis w-full"
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
                                          className="block px-2 py-1 rounded border font-mono text-xs whitespace-nowrap overflow-hidden text-ellipsis w-full"
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
                                        <span className="truncate block">
                                          <span className="mr-1">🖼️</span>
                                          {cell_text}
                                        </span>
                                      );
                                    } else {
                                      return <span className="truncate block">{cell_text}</span>;
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
