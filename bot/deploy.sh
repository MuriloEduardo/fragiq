#!/bin/bash
# Publica o bot na EC2 (ver README, seção "EC2"). Copia o código — nunca o
# .env, que vive só no servidor — e reconstrói o container lá.
set -e
HOST="${FRAGIQ_BOT_HOST:-ec2-user@100.54.102.21}"
KEY="${FRAGIQ_BOT_KEY:-$HOME/.ssh/fragiq-bot.pem}"
cd "$(dirname "$0")"
rsync -az -e "ssh -i $KEY" --exclude node_modules --exclude .env ./ "$HOST:/opt/fragiq-bot/"
ssh -t -i "$KEY" "$HOST" /opt/fragiq-bot/run.sh
