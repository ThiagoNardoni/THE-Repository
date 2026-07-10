-- ============================================================
-- GESTOR DE OBRAS — Script de criação de tabelas no Supabase
-- Cole e execute isso no SQL Editor do Supabase
-- ============================================================

-- Obras
CREATE TABLE obras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text UNIQUE NOT NULL,
  nome text NOT NULL,
  orcamento numeric DEFAULT 0,
  status text DEFAULT 'ativa', -- ativa | concluida | pausada
  created_at timestamptz DEFAULT now()
);

-- Fornecedores
CREATE TABLE fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  telefone text,
  tipo text, -- material | mao_de_obra | equipamento | servico
  created_at timestamptz DEFAULT now()
);

-- Despesas (lançamentos)
CREATE TABLE despesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao_pix text,           -- texto original da descrição do PIX
  item text NOT NULL,           -- item da despesa (ex: cimento, mão-de-obra)
  qualidade text,               -- categoria/qualidade
  fornecedor text,
  fornecedor_id uuid REFERENCES fornecedores(id),
  responsavel text DEFAULT 'THE',
  valor_total numeric NOT NULL, -- valor total do lançamento
  data date NOT NULL,
  hora text,