# GLP-1 Virtual Screening — imagem de produção
FROM python:3.12-slim

# Bibliotecas de sistema que o RDKit precisa em runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
        libxrender1 \
        libxext6 \
        libexpat1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependências primeiro (melhor cache de camadas)
COPY webapp/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Código da aplicação + modelo treinado
COPY webapp/ ./webapp/
COPY ["qsar_model_xgboost_(maccs).pkl", "./qsar_model_xgboost_(maccs).pkl"]

EXPOSE 7860

# Hugging Face Spaces expõe a porta 7860 por padrão; fallback 7860 para outros ambientes.
CMD ["sh", "-c", "gunicorn --chdir webapp --bind 0.0.0.0:${PORT:-7860} --workers 2 --timeout 120 app:app"]
