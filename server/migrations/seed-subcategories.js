require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'impgeo',
  user: process.env.DB_USER || 'seuusuario',
  password: process.env.DB_PASSWORD || '',
});

const defaultSubcategories = [
  'ALUGUEL + INTERNET',
  'ANUIDADE CREA IMP',
  'ANUIDADE CREA SÓCIOS',
  'ART',
  'Auxiliar de Campo',
  'CARTÃO BB (PROJETOS)',
  'CARTÃO C6',
  'CDB',
  'CELULAR',
  'CONFRAS E REFEIÇÕES',
  'CONSELHO REG ENG',
  'CONSULTOR',
  'CONTADOR',
  'DARF',
  'Despesa variável de projetos',
  'FEZINHA',
  'FGTS',
  'GUIA DAS',
  'ISS',
  'Locomoção',
  'Manutenções',
  'Materiais Extras',
  'MATERIAL ESCRITÓRIO',
  'MICROSOFT 365',
  'MÉTRICA TOPO',
  'ONR',
  'OUTROS GASTOS DU/VINI',
  'PLUXEE BENEFICIOS',
  'Produção Conteúdo',
  'Reembolso projetos',
  'RTK',
  'RTK (TOPOMIG)',
  'SALARIO DU - PRO LABORE',
  'SALARIO RAFAELA APARECIDA',
  'SALARIO VINI - PRO LABORE',
  'SALÁRIO THAISA TEIXEIRA BAHIA',
  'SEGURO DRONE',
  'SEGURO RTK',
  'Sindicato',
  'SITE',
  'Social Media',
  'Tráfego/SEO'
];

async function seedSubcategories() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🌱 Inserindo subcategorias padrão...\n');
    
    let inserted = 0;
    let skipped = 0;
    
    for (const name of defaultSubcategories) {
      try {
        const result = await client.query(
          'INSERT INTO subcategories (name, created_at) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING RETURNING id',
          [name, new Date().toISOString()]
        );
        
        if (result.rows.length > 0) {
          inserted++;
          console.log(`✅ Inserida: ${name}`);
        } else {
          skipped++;
          console.log(`⏭️  Já existe: ${name}`);
        }
      } catch (error) {
        console.error(`❌ Erro ao inserir ${name}:`, error.message);
      }
    }
    
    await client.query('COMMIT');
    
    console.log(`\n✅ Seed concluído!`);
    console.log(`   Inseridas: ${inserted}`);
    console.log(`   Já existiam: ${skipped}`);
    console.log(`   Total: ${defaultSubcategories.length}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro durante seed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seedSubcategories();
