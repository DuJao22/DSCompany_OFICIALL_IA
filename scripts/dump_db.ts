import db from '../src/db';
import fs from 'fs';
import path from 'path';

async function exportDatabaseSqlite() {
  console.log('Starting SQLite database dump...');
  try {
    // Try to get the database dump directly from SQLiteCloud
    // This command returns the SQL statements to recreate the database
    const dumpResult = await db.sql`DATABASE DUMP`;
    
    // The result is usually a string of SQL commands
    const sqlDump = typeof dumpResult === 'string' ? dumpResult : JSON.stringify(dumpResult, null, 2);

    const outputPath = path.join(process.cwd(), 'database_dump.sql');
    fs.writeFileSync(outputPath, sqlDump);
    
    console.log(`Database dump exported successfully to ${outputPath}`);
    console.log('This is a SQL script that can be used to recreate the database.');
  } catch (error) {
    console.error('Error dumping database:', error);
  } finally {
    setTimeout(() => process.exit(0), 1000);
  }
}

exportDatabaseSqlite();
