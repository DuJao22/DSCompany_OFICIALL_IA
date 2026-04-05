import db from '../src/db';
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

async function generateSqliteFile() {
  console.log('Starting SQLite file generation from JSON export...');
  const inputPath = path.join(process.cwd(), 'database_export.json');
  const outputPath = path.join(process.cwd(), 'database.sqlite');
  
  if (!fs.existsSync(inputPath)) {
    console.error('Error: database_export.json not found. Please run export_db.ts first.');
    process.exit(1);
  }

  try {
    const jsonData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const SQL = await initSqlJs();
    const localDb = new SQL.Database();

    // 1. Create schema
    console.log('Creating schema in local database...');
    
    const schemaQueries = [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'operator',
        api_key TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        daily_goal INTEGER DEFAULT 0,
        sector TEXT,
        gemini_api_key TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS sites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        city TEXT,
        description TEXT,
        services TEXT,
        map_link TEXT,
        image_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        status TEXT DEFAULT 'prospectado',
        user_id INTEGER,
        full_data TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id)
      );`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        prompt_template TEXT NOT NULL,
        flow_structure TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`
    ];

    for (const query of schemaQueries) {
      localDb.run(query);
    }

    // 2. Copy data from JSON
    const tables = ['users', 'sites', 'settings', 'templates'];
    
    for (const table of tables) {
      const rows = jsonData[table] || [];
      console.log(`Copying ${rows.length} rows for table: ${table}...`);

      if (rows.length > 0) {
        const columns = Object.keys(rows[0]);
        const placeholders = columns.map(() => '?').join(',');
        const insertQuery = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`;

        for (const row of rows) {
          const values = columns.map(col => row[col]);
          localDb.run(insertQuery, values);
        }
      }
    }
    
    const data = localDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(outputPath, buffer);
    
    console.log(`SQLite file generated successfully at ${outputPath}`);
  } catch (error) {
    console.error('Error generating SQLite file:', error);
  } finally {
    setTimeout(() => process.exit(0), 1000);
  }
}

generateSqliteFile();
