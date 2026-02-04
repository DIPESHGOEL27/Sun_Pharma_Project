const { initDatabase, getDb } = require('../db/database.js');

async function main() {
  await initDatabase();
  const db = getDb();
  
  console.log('\n=== Audio Masters in Database ===\n');
  const masters = db.prepare(`
    SELECT id, language_code, name, gcs_path, file_path 
    FROM audio_masters 
    ORDER BY id DESC
  `).all();
  
  masters.forEach(m => {
    console.log(`[${m.id}] ${m.language_code}: ${m.name}`);
    console.log(`    GCS: ${m.gcs_path || 'NULL'}`);
    console.log(`    File: ${m.file_path}`);
    console.log('');
  });
  
  console.log(`Total: ${masters.length} audio masters`);
}

main().catch(console.error);
