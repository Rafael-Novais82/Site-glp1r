# GLP-1 Screener — Frontend (Vercel)

Frontend estático (HTML/CSS/JS puro) do GLP-1 QSAR Virtual Screening Platform,
pronto para deploy no Vercel. O backend (Flask + RDKit + XGBoost) corre à parte
(ex.: Hugging Face Spaces), porque o Vercel não suporta essas dependências
em funções serverless.

## Configurar o backend

Edite `config.js` antes do deploy:

```js
window.API_BASE_URL = "https://<seu-backend>.hf.space";
```

Deixe como `""` para testar localmente contra `http://127.0.0.1:5000`.

## Deploy no Vercel

### Opção 1 — via GitHub (recomendado)
1. Faça commit e push desta pasta (`frontend/`) para o repositório GitHub.
2. Em vercel.com → **Add New Project** → importe o repositório.
3. Em **Root Directory**, selecione `frontend`.
4. Framework Preset: **Other** (site estático, sem build step).
5. Deploy.

### Opção 2 — via Vercel CLI
```bash
npm i -g vercel
cd frontend
vercel --prod
```

## Importante
O backend precisa de CORS ativo (já está, via `flask-cors` em `webapp/app.py`)
para aceitar pedidos vindos do domínio `*.vercel.app`.
