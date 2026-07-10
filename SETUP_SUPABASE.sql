-- ============================================================
-- GESTOR DE OBRAS — Setup Supabase
-- Cole este SQL no Supabase > SQL Editor > New Query
-- ============================================================

-- Tabela de despesas
CREATE TABLE IF NOT EXISTS despesas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_codigo     TEXT,
  obras_codigos   TEXT[],
  item            TEXT,
  fornecedor      TEXT,
  qualidade       TEXT,
  valor           NUMERIC(12,2) DEFAULT 0,
  quantidade      NUMERIC(10,3) DEFAULT 1,
  rateio_total    NUMERIC(12,2),
  data            DATE,
  responsavel     TEXT DEFAULT 'THE',
  observacao      TEXT,
  origem          TEXT DEFAULT 'manual',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de entradas (fluxo de caixa)
CREATE TABLE IF NOT EXISTS entradas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao   TEXT NOT NULL,
  valor       NUMERIC(12,2) DEFAULT 0,
  data        DATE,
  obra_codigo TEXT,
  tipo        TEXT,
  observacao  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de mão de obra
CREATE TABLE IF NOT EXISTS mao_de_obra (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario     TEXT NOT NULL,
  funcao          TEXT,
  obra_codigo     TEXT,
  valor           NUMERIC(12,2) DEFAULT 0,
  tipo_pagamento  TEXT DEFAULT 'Diária',
  dias            NUMERIC(8,2) DEFAULT 1,
  data            DATE,
  observacao      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de obras (opcional — obras já estão hard-coded no app)
CREATE TABLE IF NOT EXISTS obras (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo     TEXT UNIQUE NOT NULL,
  nome       TEXT NOT NULL,
  orcamento  NUMERIC(14,2) DEFAULT 0,
  ativo      BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar acesso público (RLS desabilitado para uso pessoal)
ALTER TABLE despesas    DISABLE ROW LEVEL SECURITY;
ALTER TABLE entradas    DISABLE ROW LEVEL SECURITY;
ALTER TABLE mao_de_obra DISABLE ROW LEVEL SECURITY;
ALTER TABLE obras       DISABLE ROW LEVEL SECURITY;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_despesas_data       ON despesas(data DESC);
CREATE INDEX IF NOT EXISTS idx_despesas_obra       ON despesas(obra_codigo);
CREATE INDEX IF NOT EXISTS idx_entradas_data       ON entradas(data DESC);
CREATE INDEX IF NOT EXISTS idx_mao_de_obra_data    ON mao_de_obra(data DESC);
CREATE INDEX IF NOT EXISTS idx_mao_de_obra_obra    ON mao_de_obra(obra_codigo);

-- ✅ Pronto! As tabelas estão criadas.
