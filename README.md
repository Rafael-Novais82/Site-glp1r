---
title: GLP-1 QSAR Virtual Screening
emoji: 🧬
colorFrom: purple
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# GLP-1 QSAR Virtual Screening Platform

Backend Flask + RDKit + XGBoost para triagem virtual de compostos com atividade
no recetor GLP-1, usando um modelo treinado com fingerprints MACCS.

O frontend (interface web) corre separadamente no Vercel e consome a API
exposta por este Space.
