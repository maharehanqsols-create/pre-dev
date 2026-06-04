"""
Migration script — adds new columns to existing database.

Run this ONCE before starting the updated backend:
  cd backend
  python migrate.py

What it does:
  1. Adds `modules` column to `prds` table (JSON list of module names)
  2. Adds `is_complex` column to `prds` table (boolean)
  3. Adds `edge_notes` column to `test_cases` table (JSON list)

Safe to run multiple times — skips columns that already exist.
"""

import sqlite3
import os

# Find the database file
# Adjust this path to match your actual DB location
DB_PATHS = [
    "qa_pipeline.db",
    "backend/qa_pipeline.db",
    "../qa_pipeline.db",
    "db/qa_pipeline.db",
]


def find_db() -> str:
    for path in DB_PATHS:
        if os.path.exists(path):
            return path
    raise FileNotFoundError(
        f"Database not found. Tried: {DB_PATHS}\n"
        "Set the correct path in DB_PATHS at the top of this script."
    )


def column_exists(cursor, table: str, column: str) -> bool:
    cursor.execute(f"PRAGMA table_info({table})")
    columns = [row[1] for row in cursor.fetchall()]
    return column in columns


def migrate():
    db_path = find_db()
    print(f"Using database: {db_path}")

    conn = sqlite3.connect(db_path)
    cur  = conn.cursor()

    migrations = [
        # (table, column, sql)
        ("prds", "modules",    "ALTER TABLE prds ADD COLUMN modules TEXT NOT NULL DEFAULT '[]'"),
        ("prds", "is_complex", "ALTER TABLE prds ADD COLUMN is_complex BOOLEAN NOT NULL DEFAULT 0"),
        ("test_cases", "edge_notes", "ALTER TABLE test_cases ADD COLUMN edge_notes TEXT NOT NULL DEFAULT '[]'"),
    ]

    for table, column, sql in migrations:
        if column_exists(cur, table, column):
            print(f"  SKIP  {table}.{column} — already exists")
        else:
            cur.execute(sql)
            print(f"  ADDED {table}.{column}")

    conn.commit()
    conn.close()
    print("\nMigration complete.")


if __name__ == "__main__":
    migrate()