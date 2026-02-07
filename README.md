# PostgreSQL Explorer

A Next.js application for exploring PostgreSQL databases. Connect to your database and browse tables with paginated data views.

## Features

- Connect to PostgreSQL databases using connection URLs
- Browse all tables in the public schema
- View table data with pagination (20 rows per page)
- Clean, modern UI built with Tailwind CSS

## Getting Started

First, install dependencies:

```bash
npm install
```

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Usage

1. Enter your PostgreSQL connection URL in the format:
   ```
   postgresql://user:password@host:port/database
   ```
2. Click "Connect" to establish a connection
3. Browse the list of tables on the left
4. Click on any table to view its data
5. Use pagination controls to navigate through table rows

## Project Structure

- `src/pages/` - Next.js pages directory
  - `index.tsx` - Main landing page with PostgreSQL explorer
  - `api/tables.ts` - API endpoint to list tables
  - `api/table-data.ts` - API endpoint to fetch table data with pagination
- `src/styles/globals.css` - Global styles with Tailwind CSS

## Technologies

- Next.js 16 with Pages Router
- TypeScript
- Tailwind CSS
- PostgreSQL (pg library)
- Lucide React (icons)
