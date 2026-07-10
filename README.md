# Gestor de Obras — Guia de Deploy

## 1. Configurar o Supabase

1. Acesse **supabase.com** e entre no seu projeto
2. Vá em **SQL Editor → New Query**
3. Cole o conteúdo do arquivo `SETUP_SUPABASE.sql` e clique em **Run**
4. As 4 tabelas serão criadas automaticamente ✅

## 2. Instalar dependências e buildar

Abra o terminal na pasta do projeto:

```bash
npm install
npm run build
```

Isso cria a pasta `dist/` com o app pronto.

## 3. Deploy no Netlify

### Opção A — Arrastar e soltar (mais fácil)
1. Acesse **netlify.com** e faça login
2. Na tela inicial, arraste a pasta **`dist/`** para a área de drop
3. Aguarde alguns segundos — o link já estará disponível!

### Opção B — Conectar ao GitHub (deploy automático)
1. Suba o projeto para um repositório no GitHub
2. No Netlify: **Add new site → Import from Git**
3. Selecione o repositório
4. Build command: `npm run build`
5. Publish directory: `dist`
6. Clique em **Deploy**

## 4. Personalizar o link

No Netlify: **Site configuration → Change site name**
Sugestão: `gestor-obras-the` → vira `gestor-obras-the.netlify.app`

---

## Obras cadastradas

| Código | Nome |
|--------|------|
| F | Feira |
| E | Esquina |
| B | BR |
| FA | Estranho (Faro) |
| P | Passarela |
| 3 | 3 Lotes |
| T | THE |

## Lógica da descrição do PIX

- `F cimento` → Obra **Feira**, item **cimento**
- `E MO` → Obra **Esquina**, item **Mão de Obra**
- `F E cimento` → Rateado entre **Feira** e **Esquina**, item **cimento**
- `F E B MO` → Rateado entre **Feira**, **Esquina** e **BR**, item **Mão de Obra**
