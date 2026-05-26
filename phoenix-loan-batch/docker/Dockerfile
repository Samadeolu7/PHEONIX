# ── Stage 1: extract layers from the fat jar ──────────────────────────────────
FROM eclipse-temurin:21-jre-jammy AS builder
WORKDIR /app
COPY target/phoenix-loan-batch-*.jar app.jar
RUN java -Djarmode=layertools -jar app.jar extract

# ── Stage 2: lean runtime image ───────────────────────────────────────────────
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

# Non-root security: create a dedicated system user
RUN groupadd --system --gid 1001 appgroup \
 && useradd  --system --uid 1001 --gid appgroup --no-create-home appuser

COPY --from=builder /app/dependencies/          ./
COPY --from=builder /app/spring-boot-loader/    ./
COPY --from=builder /app/snapshot-dependencies/ ./
COPY --from=builder /app/application/           ./

# Environment variables (overridden at runtime — never hardcode secrets here)
ENV DJANGO_INTERNAL_API_URL=http://erp-backend:8000
ENV ERP_DB_HOST=postgres
ENV BATCH_DB_HOST=postgres
ENV TZ=Africa/Lagos

USER appuser
EXPOSE 8082

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8082/actuator/health || exit 1

ENTRYPOINT ["java", \
  "-XX:+UseContainerSupport", \
  "-XX:MaxRAMPercentage=70.0", \
  "-Djava.security.egd=file:/dev/./urandom", \
  "-Duser.timezone=Africa/Lagos", \
  "org.springframework.boot.loader.launch.JarLauncher"]
