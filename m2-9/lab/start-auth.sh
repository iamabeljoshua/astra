#!/bin/bash
# usage: start-auth.sh <container> <db> <autoconfirm true|false> <host port>
set -e
NAME=$1; DB=$2; AUTOCONFIRM=$3; PORT=$4
cd /path/to/m2-9/lab
docker exec supabase_db_astra psql -U postgres -qc "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB" >/dev/null
docker exec supabase_db_astra psql -U postgres -d $DB -qc "GRANT ALL ON DATABASE $DB TO supabase_auth_admin" >/dev/null
docker exec -e PGPASSWORD=postgres supabase_db_astra psql -h 127.0.0.1 -U supabase_auth_admin -d $DB -qc "CREATE SCHEMA auth" >/dev/null
KEY=$(node -pe 'JSON.stringify([JSON.parse(require("fs").readFileSync("keys.json")).key])')
SECRET=$(node -pe 'JSON.parse(require("fs").readFileSync("keys.json")).secret')
docker rm -f $NAME >/dev/null 2>&1 || true
docker run -d --name $NAME --network supabase_network_astra -p 127.0.0.1:$PORT:9999 --memory 256m \
 -e API_EXTERNAL_URL=http://127.0.0.1:6041 -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 -e GOTRUE_DB_DRIVER=postgres \
 -e GOTRUE_DB_DATABASE_URL=postgresql://supabase_auth_admin:postgres@supabase_db_astra:5432/$DB \
 -e GOTRUE_SITE_URL=http://127.0.0.1:6040 -e 'GOTRUE_URI_ALLOW_LIST=http://127.0.0.1:6040/**' -e GOTRUE_DISABLE_SIGNUP=false \
 -e GOTRUE_JWT_ADMIN_ROLES=service_role -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_EXP=3600 \
 -e GOTRUE_JWT_SECRET=$SECRET -e GOTRUE_JWT_ISSUER=http://127.0.0.1:6043/auth/v1 -e "GOTRUE_JWT_KEYS=$KEY" -e GOTRUE_JWT_VALIDMETHODS=HS256,ES256 \
 -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=$AUTOCONFIRM -e GOTRUE_MAILER_OTP_EXP=3600 -e GOTRUE_SMTP_MAX_FREQUENCY=1s \
 -e GOTRUE_SMTP_HOST=supabase_inbucket_astra -e GOTRUE_SMTP_PORT=1025 -e GOTRUE_SMTP_ADMIN_EMAIL=admin@email.com -e GOTRUE_SMTP_SENDER_NAME=Admin \
 -e GOTRUE_RATE_LIMIT_EMAIL_SENT=360000 -e GOTRUE_RATE_LIMIT_TOKEN_REFRESH=100000 -e GOTRUE_RATE_LIMIT_OTP=100000 -e GOTRUE_RATE_LIMIT_VERIFY=100000 \
 -e GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true -e GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=10 \
 -e GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED=true \
 -e GOTRUE_MAILER_URLPATHS_CONFIRMATION=http://127.0.0.1:6041/auth/v1/verify -e GOTRUE_MAILER_URLPATHS_RECOVERY=http://127.0.0.1:6041/auth/v1/verify -e GOTRUE_MAILER_URLPATHS_INVITE=http://127.0.0.1:6041/auth/v1/verify -e GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE=http://127.0.0.1:6041/auth/v1/verify \
 public.ecr.aws/supabase/gotrue:v2.186.0 auth >/dev/null
for i in $(seq 1 40); do curl -sf http://127.0.0.1:$PORT/health >/dev/null && { echo "auth $NAME up"; exit 0; }; sleep 0.5; done
echo "auth $NAME did not start"; docker logs --tail 20 $NAME; exit 1
