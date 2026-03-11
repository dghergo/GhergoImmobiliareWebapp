# Come esportare SOLO le tabelle Ghergo da Supabase

Le tabelle dell'app Ghergo iniziano tutte con `gre_`:
- gre_agents
- gre_clients
- gre_properties
- gre_open_houses
- gre_time_slots
- gre_bookings
- gre_prequalification_responses
- gre_feedback_responses
- gre_office_appointments

---

## METODO 1: pg_dump (CONSIGLIATO - Il più veloce)

### Prerequisiti
- PostgreSQL installato (per avere il comando `pg_dump`)
  - Mac: `brew install postgresql`
  - Windows: Scarica da postgresql.org
  - Linux: `sudo apt install postgresql-client`

### Passaggi

1. Vai su **Supabase Dashboard > Settings > Database**
2. Copia la **Connection string** (clicca "Copy")
3. Esegui questo comando nel terminale:

```bash
pg_dump "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" \
  --table=gre_agents \
  --table=gre_clients \
  --table=gre_properties \
  --table=gre_open_houses \
  --table=gre_time_slots \
  --table=gre_bookings \
  --table=gre_prequalification_responses \
  --table=gre_feedback_responses \
  --table=gre_office_appointments \
  --schema=public \
  --no-owner \
  --no-acl \
  > database_ghergo_complete.sql
```

4. Il file `database_ghergo_complete.sql` conterrà lo schema completo!

---

## METODO 2: Dalla Dashboard Supabase (Manuale ma funziona sempre)

1. Vai su **Supabase Dashboard > SQL Editor**
2. Crea una **New query**
3. Copia e incolla questa query:

```sql
-- Esporta lo schema di tutte le tabelle gre_*

-- PARTE 1: Strutture tabelle
DO $$
DECLARE
    table_rec RECORD;
    col_rec RECORD;
    output TEXT := '';
BEGIN
    FOR table_rec IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name LIKE 'gre_%'
        ORDER BY table_name
    LOOP
        output := output || E'\n-- Tabella: ' || table_rec.table_name || E'\n';
        output := output || 'CREATE TABLE ' || table_rec.table_name || ' (' || E'\n';

        FOR col_rec IN
            SELECT
                column_name,
                CASE
                    WHEN data_type = 'character varying' THEN 'VARCHAR(' || character_maximum_length || ')'
                    WHEN data_type = 'USER-DEFINED' THEN udt_name
                    ELSE UPPER(data_type)
                END as formatted_type,
                CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END as nullable,
                CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END as def
            FROM information_schema.columns
            WHERE table_name = table_rec.table_name
              AND table_schema = 'public'
            ORDER BY ordinal_position
        LOOP
            output := output || '  ' || col_rec.column_name || ' ' ||
                      col_rec.formatted_type || col_rec.nullable || col_rec.def || ',' || E'\n';
        END LOOP;

        -- Rimuovi l'ultima virgola
        output := RTRIM(output, ',' || E'\n') || E'\n);' || E'\n';
    END LOOP;

    RAISE NOTICE '%', output;
END $$;

-- PARTE 2: Primary Keys
SELECT
    E'\n-- Primary Keys\n' ||
    string_agg(
        'ALTER TABLE ' || tc.table_name ||
        ' ADD CONSTRAINT ' || tc.constraint_name ||
        ' PRIMARY KEY (' || kcu.column_name || ');',
        E'\n'
    )
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name LIKE 'gre_%';

-- PARTE 3: Foreign Keys
SELECT
    E'\n-- Foreign Keys\n' ||
    string_agg(
        'ALTER TABLE ' || tc.table_name ||
        ' ADD CONSTRAINT ' || tc.constraint_name ||
        ' FOREIGN KEY (' || kcu.column_name || ')' ||
        ' REFERENCES ' || ccu.table_name || '(' || ccu.column_name || ');',
        E'\n'
    )
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name LIKE 'gre_%';

-- PARTE 4: Indici
SELECT
    E'\n-- Indici\n' ||
    string_agg(
        indexdef || ';',
        E'\n'
    )
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename LIKE 'gre_%'
  AND indexname NOT LIKE '%_pkey';
```

4. Clicca **Run**
5. L'output apparirà nella tab **Messages** in fondo
6. Copia tutto l'output e salvalo come `database_ghergo_schema.sql`

---

## METODO 3: Esportazione tabella per tabella (Più lungo ma preciso)

Per ogni tabella `gre_*`:

1. Vai su **Supabase > Table Editor**
2. Seleziona la tabella (es. `gre_agents`)
3. Clicca sui **3 puntini** in alto a destra
4. Seleziona **"Copy as SQL"**
5. Incolla in un file `database_ghergo_schema.sql`
6. Ripeti per tutte le 9 tabelle

---

## METODO 4: Script Node.js automatico

Ho creato uno script Node.js che ti mostra i comandi da eseguire:

```bash
node scripts/export-ghergo-tables.js
```

Lo script ti mostrerà il comando `pg_dump` pre-compilato con tutte le tabelle corrette.

---

## Cosa fare con il file SQL esportato

Una volta ottenuto il file `database_ghergo_schema.sql`:

1. Aprilo e verifica che contenga tutte le 9 tabelle
2. Aggiungi all'inizio:
   ```sql
   -- Schema Ghergo Immobiliare
   -- Generato da database di sviluppo
   ```
3. Salvalo nella cartella `migrations/` del progetto
4. Quando devi configurare il database del cliente:
   - Apri **Supabase Dashboard del cliente > SQL Editor**
   - Copia e incolla il contenuto
   - Clicca **Run**

---

## Verifica che l'export sia completo

Il file deve contenere:

- [ ] 9 tabelle CREATE TABLE (gre_*)
- [ ] Primary keys (ALTER TABLE ... ADD CONSTRAINT ... PRIMARY KEY)
- [ ] Foreign keys (ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY)
- [ ] Indici (CREATE INDEX)
- [ ] Trigger per updated_at (se presenti)
- [ ] Funzioni custom (se presenti)

---

## Tabelle da NON esportare

Se nel tuo database vedi altre tabelle che NON iniziano con `gre_`, **ignorale**. Non fanno parte di questa app.
