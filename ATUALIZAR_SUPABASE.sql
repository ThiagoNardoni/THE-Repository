-- Execute este SQL no Supabase > SQL Editor se ainda não tiver as colunas
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS qualidade TEXT;
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS observacao TEXT;
