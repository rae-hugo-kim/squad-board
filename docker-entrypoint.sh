#!/bin/sh
set -e
# 컨테이너 시작 시 마이그레이션과 시드를 적용한 뒤 서버를 띄운다.
node --import tsx src/db/migrate.ts
node --import tsx src/db/seed.ts
exec node server.js
