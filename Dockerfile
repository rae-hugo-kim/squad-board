# 미니PC 자체 호스팅용. standalone 출력으로 node_modules 없이 실행한다.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 빌드 시점에는 더미 값으로 충분 (실제 값은 실행 시 환경 변수로)
ENV SQUAD_PASSCODE=build SESSION_SECRET=build-only-secret-build-only-secret-0000
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL=file:/app/data/squad.db
# 마이그레이션·시드 스크립트 실행에 필요한 최소 의존성
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && mkdir -p /app/data
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
