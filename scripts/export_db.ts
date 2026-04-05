import db from '../src/db';
import fs from 'fs';
import path from 'path';

async function exportDatabase() {
  console.log('Starting database export...');
  try {
    const tables = ['users', 'sites', 'settings', 'templates'];
    const exportData: any = {};

    console.log('Exporting table: users...');
    exportData['users'] = await db.sql`SELECT * FROM users`;
    
    console.log('Exporting table: sites...');
    exportData['sites'] = await db.sql`SELECT * FROM sites`;
    
    console.log('Exporting table: settings...');
    exportData['settings'] = await db.sql`SELECT * FROM settings`;
    
    console.log('Exporting table: templates...');
    exportData['templates'] = await db.sql`SELECT * FROM templates`;

    const outputPath = path.join(process.cwd(), 'database_export.json');
    fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
    
    console.log(`Database exported successfully to ${outputPath}`);
    console.log('You can now download this file from the file explorer.');
  } catch (error) {
    console.error('Error exporting database:', error);
  } finally {
    // The process might not exit immediately due to the DB connection
    setTimeout(() => process.exit(0), 1000);
  }
}

exportDatabase();
