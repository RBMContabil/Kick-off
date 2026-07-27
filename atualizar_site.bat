@echo off
chcp 65001 > nul
title Atualizador RBM Onboarding

echo =======================================================
echo          ATUALIZADOR AUTOMATICO - RBM ONBOARDING
echo =======================================================
echo.

where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] O Git nao esta instalado neste computador!
    echo Acesse: https://git-scm.com/download/win
    echo.
    pause
    exit /b
)

cd /d "%~dp0"

if exist ".git" goto :run_update

echo [AVISO] Esta pasta ainda nao esta conectada ao GitHub.
echo Vamos configurar a conexao agora!
echo.
set /p repo_url="Cole aqui o link do seu repositorio do GitHub: "

echo.
echo Configurando o repositorio local...
git init
git add .
git commit -m "Configuracao inicial RBM"
git branch -M main
git remote add origin %repo_url%

echo.
echo Enviando arquivos...
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo [SUCESSO] Conectado e enviado com sucesso!
) else (
    echo.
    echo [ERRO] Falha ao enviar. Verifique o link ou suas credenciais.
)
echo.
pause
exit /b

:run_update
echo Detectando alteracoes locais...
git add .

git diff-index --quiet HEAD --
if %errorlevel% equ 0 (
    echo Nao ha novas alteracoes para enviar. O site ja esta atualizado!
    echo.
    timeout /t 3 >nul
    exit /b
)

echo.
echo Enviando as alteracoes para o GitHub...
git commit -m "Atualizacao automatica RBM"
git push origin main

if %errorlevel% equ 0 (
    echo.
    echo [SUCESSO] Site atualizado com sucesso no GitHub!
) else (
    echo.
    echo [ERRO] Falha ao enviar para o GitHub.
)

echo.
timeout /t 5