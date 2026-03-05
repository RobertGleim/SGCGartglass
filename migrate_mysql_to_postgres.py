"""
Migrate all data from Hostinger MySQL to Render PostgreSQL
This script copies all tables while handling database-specific differences.
"""
import os
import sys
from urllib.parse import quote_plus
from sqlalchemy import create_engine, MetaData, Table, select, inspect
from sqlalchemy.orm import sessionmaker

# Source: Hostinger MySQL
_MYSQL_USER = (os.environ.get("MYSQL_USER") or "").strip()
_MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD") or ""
_MYSQL_HOST = (os.environ.get("MYSQL_HOST") or "").strip()
_MYSQL_PORT = int((os.environ.get("MYSQL_PORT") or "3306").strip())
_MYSQL_DB = (os.environ.get("MYSQL_DB") or "").strip()
MYSQL_URL = (
    f"mysql+pymysql://{quote_plus(_MYSQL_USER)}:{quote_plus(_MYSQL_PASSWORD)}"
    f"@{_MYSQL_HOST}:{_MYSQL_PORT}/{_MYSQL_DB}"
)

# Destination: Render PostgreSQL
POSTGRES_URL = (os.environ.get("POSTGRES_URL") or os.environ.get("DATABASE_URL") or "").strip()

def migrate_database():
    """Copy all tables and data from MySQL to PostgreSQL"""

    missing = [
        name for name, value in {
            "MYSQL_HOST": _MYSQL_HOST,
            "MYSQL_USER": _MYSQL_USER,
            "MYSQL_PASSWORD": _MYSQL_PASSWORD,
            "MYSQL_DB": _MYSQL_DB,
            "POSTGRES_URL": POSTGRES_URL,
        }.items() if not value
    ]
    if missing:
        print(f"❌ Missing required environment variables: {', '.join(missing)}")
        return False
    
    print("=" * 70)
    print("MySQL → PostgreSQL Migration")
    print("=" * 70)
    
    # Create engines
    print("\n📡 Connecting to databases...")
    mysql_engine = create_engine(MYSQL_URL, echo=False)
    postgres_engine = create_engine(POSTGRES_URL, echo=False)
    
    # Test connections
    try:
        with mysql_engine.connect() as conn:
            print("✅ Connected to MySQL (Hostinger)")
    except Exception as e:
        print(f"❌ Failed to connect to MySQL: {e}")
        return False
    
    try:
        with postgres_engine.connect() as conn:
            print("✅ Connected to PostgreSQL (Render)")
    except Exception as e:
        print(f"❌ Failed to connect to PostgreSQL: {e}")
        return False
    
    # Get table metadata from MySQL
    print("\n📋 Reading MySQL schema...")
    mysql_metadata = MetaData()
    mysql_metadata.reflect(bind=mysql_engine)
    
    if not mysql_metadata.tables:
        print("⚠️  No tables found in MySQL database")
        return False
    
    print(f"Found {len(mysql_metadata.tables)} tables:")
    for table_name in mysql_metadata.tables.keys():
        print(f"  - {table_name}")
    
    # Create tables in PostgreSQL
    print("\n🔨 Creating tables in PostgreSQL...")
    postgres_metadata = MetaData()
    
    # Use Flask app to create tables with proper schema
    print("Using Flask SQLAlchemy models to create schema...")
    os.environ['DATABASE_URL'] = POSTGRES_URL
    
    # Import after setting DATABASE_URL
    from backend.app import create_app
    app = create_app()
    
    with app.app_context():
        from backend.models import db
        
        # Create all tables
        print("Creating tables...")
        db.create_all()
        print("✅ Tables created in PostgreSQL")
    
    # Now copy data
    print("\n📦 Copying data...")
    
    # Define table copy order (respecting foreign keys)
    table_order = [
        'glass_types',
        'templates',
        'template_regions',
        'user_projects',
        'work_orders',
        'work_order_status_history'
    ]
    
    # Filter to only existing tables
    existing_tables = [t for t in table_order if t in mysql_metadata.tables]
    
    # Copy each table
    total_rows = 0
    for table_name in existing_tables:
        print(f"\n📊 Copying {table_name}...")
        
        # Get table from MySQL
        mysql_table = Table(table_name, mysql_metadata, autoload_with=mysql_engine)
        
        # Read all rows from MySQL
        with mysql_engine.connect() as mysql_conn:
            result = mysql_conn.execute(select(mysql_table))
            rows = result.fetchall()
            
            if not rows:
                print(f"  ⏭️  No data in {table_name}")
                continue
            
            print(f"  Found {len(rows)} rows")
            
            # Get table from PostgreSQL
            postgres_table = Table(table_name, postgres_metadata, autoload_with=postgres_engine)
            
            # Insert into PostgreSQL
            with postgres_engine.begin() as postgres_conn:
                # Convert rows to dictionaries
                data = []
                for row in rows:
                    row_dict = dict(row._mapping)
                    data.append(row_dict)
                
                # Insert in batches
                if data:
                    postgres_conn.execute(postgres_table.insert(), data)
                    print(f"  ✅ Inserted {len(data)} rows")
                    total_rows += len(data)
    
    print("\n" + "=" * 70)
    print(f"✅ Migration complete! Copied {total_rows} total rows")
    print("=" * 70)
    
    # Verify row counts
    print("\n🔍 Verifying migration...")
    with mysql_engine.connect() as mysql_conn, postgres_engine.connect() as postgres_conn:
        for table_name in existing_tables:
            mysql_table = Table(table_name, mysql_metadata, autoload_with=mysql_engine)
            postgres_table = Table(table_name, postgres_metadata, autoload_with=postgres_engine)
            
            mysql_count = mysql_conn.execute(select(mysql_table).with_only_columns(mysql_table.c[list(mysql_table.c.keys())[0]])).rowcount
            postgres_count = postgres_conn.execute(select(postgres_table).with_only_columns(postgres_table.c[list(postgres_table.c.keys())[0]])).rowcount
            
            # Alternative: count(*) approach
            mysql_result = mysql_conn.execute(select(mysql_table))
            mysql_count = len(mysql_result.fetchall())
            
            postgres_result = postgres_conn.execute(select(postgres_table))
            postgres_count = len(postgres_result.fetchall())
            
            status = "✅" if mysql_count == postgres_count else "❌"
            print(f"  {status} {table_name}: MySQL={mysql_count}, PostgreSQL={postgres_count}")
    
    return True

if __name__ == '__main__':
    print("\n⚠️  This will copy all data from MySQL to PostgreSQL")
    print("Source: mysql+pymysql://<user>:<password>@<host>:<port>/<db>")
    print("Destination: postgresql://<user>:<password>@<host>/<db>")
    
    response = input("\nContinue? (yes/no): ").strip().lower()
    
    if response != 'yes':
        print("❌ Migration cancelled")
        sys.exit(0)
    
    success = migrate_database()
    
    if success:
        print("\n✅ Next steps:")
        print("1. Update Render DATABASE_URL to PostgreSQL")
        print("2. Commit changes (requirements.txt)")
        print("3. Deploy to Render")
        sys.exit(0)
    else:
        print("\n❌ Migration failed")
        sys.exit(1)
