/**
 * Script per esportare SOLO le tabelle gre_* dal database Supabase
 *
 * Uso:
 * 1. Assicurati di avere .env.local con NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
 * 2. npm install @supabase/supabase-js
 * 3. node scripts/export-ghergo-tables.js
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Errore: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY non trovati in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Lista delle tabelle da esportare
const TABLES_TO_EXPORT = [
  'gre_agents',
  'gre_clients',
  'gre_properties',
  'gre_open_houses',
  'gre_time_slots',
  'gre_bookings',
  'gre_prequalification_responses',
  'gre_feedback_responses',
  'gre_office_appointments'
]

async function exportSchema() {
  console.log('🔍 Recupero schema delle tabelle gre_*...\n')

  let sqlOutput = `-- ============================================
-- SCHEMA DATABASE GHERGO IMMOBILIARE WEBAPP
-- Esportato automaticamente il ${new Date().toISOString()}
-- ============================================

-- Nota: Questo schema include SOLO le tabelle dell'app Ghergo (prefisso gre_)

`

  for (const tableName of TABLES_TO_EXPORT) {
    console.log(`📋 Esportando ${tableName}...`)

    // Query per ottenere la struttura della tabella
    const { data: columns, error: columnError } = await supabase
      .rpc('get_table_columns', { table_name: tableName })
      .catch(() => ({ data: null, error: 'RPC not available' }))

    // Se la funzione RPC non esiste, usa una query diretta
    const query = `
      SELECT
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = '${tableName}'
      ORDER BY ordinal_position;
    `

    // Per ora, generiamo uno script che l'utente può eseguire manualmente
    sqlOutput += `\n-- Tabella: ${tableName}\n`
    sqlOutput += `-- Per ottenere lo schema, esegui questa query nel SQL Editor:\n`
    sqlOutput += `/*\n`
    sqlOutput += `SELECT
  'CREATE TABLE ${tableName} (' || CHR(10) ||
  string_agg(
    '  ' || column_name || ' ' ||
    CASE
      WHEN data_type = 'character varying' THEN 'VARCHAR(' || character_maximum_length || ')'
      WHEN data_type = 'USER-DEFINED' THEN udt_name
      ELSE UPPER(data_type)
    END ||
    CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
    CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
    ',' || CHR(10)
  ) || CHR(10) || ');' as create_statement
FROM information_schema.columns
WHERE table_name = '${tableName}'
  AND table_schema = 'public'
GROUP BY table_name;
*/\n\n`
  }

  // Salva il file
  const outputPath = path.join(__dirname, '..', 'database_ghergo_export.sql')
  fs.writeFileSync(outputPath, sqlOutput)

  console.log(`\n✅ File generato: ${outputPath}`)
  console.log('\n⚠️  NOTA: Il file contiene le query da eseguire manualmente.')
  console.log('Per un\'esportazione completa, usa pg_dump (vedi sotto).\n')
}

// Metodo alternativo: Mostra il comando pg_dump
function showPgDumpCommand() {
  console.log('\n📘 METODO CONSIGLIATO: Usa pg_dump\n')
  console.log('1. Vai su Supabase Dashboard > Settings > Database')
  console.log('2. Copia la Connection string\n')
  console.log('3. Esegui questo comando:\n')
  console.log('pg_dump "CONNECTION_STRING" \\')
  TABLES_TO_EXPORT.forEach(table => {
    console.log(`  --table=${table} \\`)
  })
  console.log('  --schema=public \\')
  console.log('  --no-owner \\')
  console.log('  --no-acl \\')
  console.log('  > database_ghergo_schema.sql\n')
}

// Main
async function main() {
  console.log('╔════════════════════════════════════════════╗')
  console.log('║  EXPORT TABELLE GHERGO DA SUPABASE        ║')
  console.log('╚════════════════════════════════════════════╝\n')

  // Verifica connessione
  const { data, error } = await supabase
    .from('gre_agents')
    .select('count')
    .limit(1)

  if (error && error.code !== 'PGRST116') {
    console.error('❌ Errore connessione a Supabase:', error.message)
    console.log('\n💡 Assicurati che .env.local contenga le credenziali corrette\n')
    showPgDumpCommand()
    process.exit(1)
  }

  console.log('✅ Connessione a Supabase OK\n')
  console.log('Tabelle da esportare:')
  TABLES_TO_EXPORT.forEach(t => console.log(`  - ${t}`))
  console.log('')

  // Mostra il metodo pg_dump (più affidabile)
  showPgDumpCommand()

  console.log('─'.repeat(50))
  console.log('\nOppure premi CTRL+C per uscire e usa il comando sopra ↑\n')
}

main()
