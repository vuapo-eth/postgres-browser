import { useState, useEffect, useRef, useCallback } from "react";
import { Database, Table2, Sparkles, ArrowRight, Search, Star, Copy, Check, Eye, EyeOff, GripVertical, Palette, Edit, X, AlertCircle } from "lucide-react";

type TableInfo = {
  table_name: string;
};

type TableData = {
  columns: string[];
  rows: any[][];
  total_rows: number;
};

export default function Home() {
  const [postgres_url, set_postgres_url] = useState("");
  const [is_connected, set_is_connected] = useState(false);
  const [tables, set_tables] = useState<TableInfo[]>([]);
  const [selected_table, set_selected_table] = useState<string | null>(null);
  const [table_data, set_table_data] = useState<TableData | null>(null);
  const [current_page, set_current_page] = useState(1);
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [starred_tables, set_starred_tables] = useState<Set<string>>(new Set());

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
    await load_table_data(table_name, 1);
  };

  const load_table_data = async (table_name: string, page: number) => {
    set_is_loading(true);
    set_error(null);

    try {
      const response = await fetch("/api/table-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postgres_url,
          table_name,
          page,
          limit: 20,
        }),
      });

      if (!response.ok) {
        const error_data = await response.json();
        throw new Error(error_data.error || "Failed to load table data");
      }

      const data = await response.json();
      set_table_data(data);
    } catch (err: any) {
      set_error(err.message || "Failed to load table data");
    } finally {
      set_is_loading(false);
    }
  };

  const handle_page_change = (new_page: number) => {
    if (selected_table) {
      set_current_page(new_page);
      load_table_data(selected_table, new_page);
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
                    on_cell_update={() => {
                      if (selected_table) {
                        load_table_data(selected_table, current_page);
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
  on_cell_update,
}: {
  table_name: string;
  table_data: TableData;
  current_page: number;
  total_pages: number;
  handle_page_change: (page: number) => void;
  is_loading: boolean;
  postgres_url: string;
  on_cell_update: () => void;
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
    };

    if (color_picker_open !== null) {
      document.addEventListener("mousedown", handle_click_outside);
      return () => {
        document.removeEventListener("mousedown", handle_click_outside);
      };
    }
  }, [color_picker_open]);

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
    return column_order.filter((idx) => column_visibility[idx] !== false);
  };

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 flex flex-col h-full min-h-0">
      <div className="mb-6 flex items-center justify-between flex-shrink-0">
        <h2 className="text-lg font-semibold text-white">{table_name}</h2>
        <div className="text-sm text-[#8b8b8b]">
          {table_data.total_rows} {table_data.total_rows === 1 ? "row" : "rows"}
        </div>
      </div>
      
      {is_loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-2 border-[#3ECF8E] border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-[#8b8b8b]">Loading data...</p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2 flex-shrink-0">
            {column_order.map((column_idx) => {
              const column_name = table_data.columns[column_idx];
              const is_visible = column_visibility[column_idx] !== false;
              const is_dragged = dragged_column === column_idx;
              const is_drag_over = drag_over_column === column_idx;

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
                    {column_name}
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
                        <div className="truncate pr-4">{column}</div>
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
                            className={`px-6 py-4 text-sm text-white relative group ${
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
                          >
                            <div className="truncate pr-16">
                              {cell === null || cell === undefined
                                ? (
                                    <span className="text-[#4a4a4a] italic">null</span>
                                  )
                                : (
                                    cell_text
                                  )}
                            </div>
                            {is_hovered && (
                              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1 z-10">
                                <button
                                  onClick={() => handle_edit(cell, row_idx, display_idx)}
                                  className="p-1.5 bg-[#1f1f1f] border border-[#2a2a2a] rounded hover:bg-[#2a2a2a] hover:border-[#3ECF8E]/50 transition-all"
                                  title="Edit cell"
                                >
                                  <Edit className="w-3.5 h-3.5 text-[#8b8b8b] hover:text-[#3ECF8E]" />
                                </button>
                                <button
                                  onClick={() => handle_copy(cell, row_idx, display_idx)}
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
