import { initDatabase } from '../db/database.js';

async function main() {
  try {
    console.log('🔧 Inicializando base de datos...');
    await initDatabase();
    console.log('✅ Base de datos inicializada correctamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
    process.exit(1);
  }
}

main();

