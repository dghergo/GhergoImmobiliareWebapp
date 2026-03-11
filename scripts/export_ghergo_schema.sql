-- Script per esportare lo schema delle sole tabelle gre_*
-- Esegui questo nel SQL Editor di Supabase del progetto di SVILUPPO
-- Copia l'output e salvalo come file SQL

-- Mostra tutte le CREATE TABLE per le tabelle gre_*
SELECT
    'CREATE TABLE ' || table_name || ' (' || E'\n' ||
    string_agg(
        '  ' || column_name || ' ' ||
        data_type ||
        CASE
            WHEN character_maximum_length IS NOT NULL
            THEN '(' || character_maximum_length || ')'
            ELSE ''
        END ||
        CASE
            WHEN is_nullable = 'NO' THEN ' NOT NULL'
            ELSE ''
        END ||
        CASE
            WHEN column_default IS NOT NULL
            THEN ' DEFAULT ' || column_default
            ELSE ''
        END,
        ',' || E'\n'
    ) || E'\n' || ');' || E'\n\n' as create_statement
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name LIKE 'gre_%'
GROUP BY table_name
ORDER BY table_name;

-- Per vedere anche gli indici
SELECT
    'CREATE INDEX ' || indexname || ' ON ' || tablename ||
    ' USING ' || indexdef || ';' || E'\n' as index_statement
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename LIKE 'gre_%'
ORDER BY tablename, indexname;

-- Per vedere i constraint (chiavi primarie, foreign key, etc)
SELECT
    'ALTER TABLE ' || table_name ||
    ' ADD CONSTRAINT ' || constraint_name ||
    ' ' || constraint_type || ';' || E'\n' as constraint_statement
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND table_name LIKE 'gre_%'
ORDER BY table_name;
