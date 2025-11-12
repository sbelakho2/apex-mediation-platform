# Stage 1: Build
FROM node:20-alpine AS build

metadata:WORKDIR /app

  name: apexmediation-backend

  namespace: apexmediation# Install dependencies

  labels:COPY package*.json ./

    app: apexmediation-backendRUN npm ci --only=production --ignore-scripts && \

    component: api    npm cache clean --force

spec:

  replicas: 3# Copy source and build

  selector:COPY tsconfig.json ./

    matchLabels:COPY src ./src

      app: apexmediation-backendRUN npm install typescript @types/node --save-dev && \

  template:    npm run build

    metadata:

      labels:# Stage 2: Runtime (hardened)

        app: apexmediation-backendFROM gcr.io/distroless/nodejs20-debian12:nonroot

        component: api

    spec:# Set working directory

      serviceAccountName: apexmediation-backendWORKDIR /app

      securityContext:

        runAsNonRoot: true# Use non-root user (distroless default: nonroot uid 65532)

        runAsUser: 65532USER nonroot

        fsGroup: 65532

        seccompProfile:# Copy production dependencies and built code

          type: RuntimeDefaultCOPY --from=build --chown=nonroot:nonroot /app/node_modules ./node_modules

      COPY --from=build --chown=nonroot:nonroot /app/dist ./dist

      containers:COPY --from=build --chown=nonroot:nonroot /app/package*.json ./

      - name: backend

        image: ghcr.io/sbelakho2/apexmediation-backend:latest# Create logs directory with proper permissions

        imagePullPolicy: IfNotPresentUSER root

        RUN mkdir -p /app/logs && chown -R nonroot:nonroot /app/logs

        ports:USER nonroot

        - name: http

          containerPort: 4000# Environment

          protocol: TCPENV NODE_ENV=production \

        - name: metrics    PORT=4000

          containerPort: 9090

          protocol: TCP# Expose port

        EXPOSE 4000

        env:

        - name: NODE_ENV# Health check

          value: "production"HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \

        - name: PORT    CMD ["/nodejs/bin/node", "-e", "require('http').get('http://localhost:4000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"]

          value: "4000"

        - name: TRUST_PROXY# Start application

          value: "true"CMD ["dist/src/index.js"]

        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: apexmediation-secrets
              key: database-url
        - name: CLICKHOUSE_HOST
          valueFrom:
            configMapKeyRef:
              name: apexmediation-config
              key: clickhouse-host
        - name: REDIS_HOST
          valueFrom:
            configMapKeyRef:
              name: apexmediation-config
              key: redis-host
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: apexmediation-secrets
              key: jwt-secret
        - name: COOKIE_SECRET
          valueFrom:
            secretKeyRef:
              name: apexmediation-secrets
              key: cookie-secret
        
        resources:
          requests:
            cpu: 250m
            memory: 512Mi
          limits:
            cpu: 1000m
            memory: 1Gi
        
        # Liveness probe - is the container alive?
        livenessProbe:
          httpGet:
            path: /health
            port: http
            scheme: HTTP
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          successThreshold: 1
          failureThreshold: 3
        
        # Readiness probe - is the container ready to receive traffic?
        readinessProbe:
          httpGet:
            path: /health
            port: http
            scheme: HTTP
          initialDelaySeconds: 15
          periodSeconds: 5
          timeoutSeconds: 3
          successThreshold: 1
          failureThreshold: 2
        
        # Startup probe - has the application started successfully?
        startupProbe:
          httpGet:
            path: /health
            port: http
            scheme: HTTP
          initialDelaySeconds: 0
          periodSeconds: 5
          timeoutSeconds: 3
          successThreshold: 1
          failureThreshold: 12  # Allow 60 seconds for startup
        
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          runAsNonRoot: true
          runAsUser: 65532
          capabilities:
            drop:
              - ALL
        
        volumeMounts:
        - name: tmp
          mountPath: /tmp
        - name: logs
          mountPath: /app/logs
      
      volumes:
      - name: tmp
        emptyDir: {}
      - name: logs
        emptyDir: {}
      
      # Node affinity for multi-AZ deployment
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - apexmediation-backend
              topologyKey: topology.kubernetes.io/zone

---
apiVersion: v1
kind: Service
metadata:
  name: apexmediation-backend
  namespace: apexmediation
  labels:
    app: apexmediation-backend
spec:
  type: ClusterIP
  ports:
  - name: http
    port: 80
    targetPort: http
    protocol: TCP
  - name: metrics
    port: 9090
    targetPort: metrics
    protocol: TCP
  selector:
    app: apexmediation-backend

---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: apexmediation-backend
  namespace: apexmediation
