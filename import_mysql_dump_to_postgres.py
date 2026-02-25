"""Import MySQL dump data into PostgreSQL using existing SQLAlchemy models."""
import os
import re
import sys
from typing import List
from sqlalchemy import create_engine, MetaData, Table

# Destination: Render PostgreSQL
POSTGRES_URL = os.environ.get(
    "POSTGRES_URL",
    "postgresql://sgcg_database_user:8L6E7eQBnLBrIhSfVffllBHxiy8b6MRU@dpg-d6flhrtm5p6s73brsp10-a/sgcg_database",
)


def split_tuples(values_block: str) -> List[str]:
    tuples = []
    depth = 0
    in_string = False
    escape = False
    start = None
    for i, ch in enumerate(values_block):
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == "'":
                in_string = False
            continue

        if ch == "'":
            in_string = True
        elif ch == "(":
            if depth == 0:
                start = i + 1
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0 and start is not None:
                tuples.append(values_block[start:i])
                start = None

    return tuples


def split_fields(tuple_str: str) -> List[str]:
    fields = []
    in_string = False
    escape = False
    start = 0
    for i, ch in enumerate(tuple_str):
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == "'":
                in_string = False
            continue

        if ch == "'":
            in_string = True
        elif ch == ",":
            fields.append(tuple_str[start:i].strip())
            start = i + 1

    fields.append(tuple_str[start:].strip())
    return fields


def unescape_mysql_string(value: str) -> str:
    value = value.replace("\\\\", "\\")
    value = value.replace("\\'", "'")
    value = value.replace("\\\"", "\"")
    value = value.replace("\\n", "\n")
    value = value.replace("\\r", "\r")
    value = value.replace("\\t", "\t")
    value = value.replace("\\0", "\0")
    value = value.replace("\\Z", "\x1a")
    return value


def parse_field(raw: str):
    if raw.upper() == "NULL":
        return None
    if raw.startswith("'") and raw.endswith("'"):
        return unescape_mysql_string(raw[1:-1])
    # Numeric fallback
    try:
        if "." in raw:
            return float(raw)
        return int(raw)
    except ValueError:
        return raw


def import_dump(dump_path: str) -> None:
    print("=" * 70)
    print("MySQL Dump → PostgreSQL Import")
    print("=" * 70)
    print(f"Dump file: {dump_path}")

    if not os.path.exists(dump_path):
        print("❌ Dump file not found")
        sys.exit(1)

    os.environ["DATABASE_URL"] = POSTGRES_URL

    # Create tables from SQLAlchemy models
    from backend.app import create_app

    app = create_app()
    with app.app_context():
        from backend.models import db
        db.create_all()

    engine = create_engine(POSTGRES_URL, echo=False)
    metadata = MetaData()
    metadata.reflect(bind=engine)

    insert_count = 0
    statement = ""

    with open(dump_path, "r", encoding="utf-8", errors="ignore") as handle:
        for line in handle:
            if not line.strip() or line.startswith("--"):
                continue
            statement += line
            if line.strip().endswith(";"):
                stmt = statement.strip()
                statement = ""

                if not stmt.startswith("INSERT INTO"):
                    continue

                # Parse INSERT statement
                try:
                    match = re.match(
                        r"INSERT INTO\s+`?(?P<table>\w+)`?\s*(?P<cols>\([^)]*\))?\s*VALUES\s*(?P<values>.+);",
                        stmt,
                        re.IGNORECASE | re.DOTALL,
                    )
                    if not match:
                        raise ValueError("Unrecognized INSERT format")

                    table_name = match.group("table")
                    cols_raw = match.group("cols")
                    values_block = match.group("values")

                    if table_name not in metadata.tables:
                        print(f"⚠️  Skipping unknown table: {table_name}")
                        continue

                    table = Table(table_name, metadata, autoload_with=engine)

                    if cols_raw:
                        columns_part = cols_raw.strip()[1:-1]
                        columns = [c.strip().strip("`") for c in columns_part.split(",")]
                    else:
                        columns = [c.name for c in table.columns]

                    tuples = split_tuples(values_block)
                    rows = []
                    for tuple_str in tuples:
                        fields = split_fields(tuple_str)
                        row = {columns[i]: parse_field(fields[i]) for i in range(len(columns))}
                        rows.append(row)

                    if rows:
                        with engine.begin() as conn:
                            conn.execute(table.insert(), rows)
                        insert_count += len(rows)
                        print(f"✅ {table_name}: inserted {len(rows)} rows")
                except Exception as exc:
                    print(f"❌ Failed to parse INSERT for statement: {stmt[:120]}...")
                    print(f"   Error: {exc}")
                    sys.exit(1)

    print("\n=" * 35)
    print(f"✅ Import complete! Total rows inserted: {insert_count}")


if __name__ == "__main__":
    dump_path = sys.argv[1] if len(sys.argv) > 1 else "c:/Users/rglei/Downloads/u159464737_sgcgdb.sql"
    import_dump(dump_path)
