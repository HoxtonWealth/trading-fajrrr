# Workflow: Create Supabase Table

## Trigger
Use when creating any new table in Supabase.

## Inputs
- Table name
- Column definitions
- Whether it needs RLS policies

## Steps

### 1. Write the SQL migration
Create `supabase/migrations/[timestamp]_create_[table].sql`:
```sql
CREATE TABLE IF NOT EXISTS [table_name] (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- columns here
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_[table]_[column] ON [table_name]([column]);
```

### 2. Create TypeScript types
Add to `lib/types/database.ts`:
```typescript
export interface [TableName]Row {
  id: string
  created_at: string
  // columns
}
```

### 3. Run in Supabase
- Go to Supabase dashboard → SQL Editor
- Paste and execute the migration
- Verify table appears in Table Editor

### 4. Test access
- Write a quick insert + select in the cron or a test script
- Verify data round-trips correctly

## Validation
- [ ] All timestamps use `TIMESTAMPTZ` (not `TIMESTAMP`)
- [ ] Primary key is UUID with default
- [ ] Indexes on columns used in WHERE clauses
- [ ] TypeScript types match SQL columns exactly
- [ ] Migration file saved in `supabase/migrations/`
