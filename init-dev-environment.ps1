# SocialOps Local Development Environment Initialization Script
# This script resets and initializes the local development database
# ---------------------------------------------------------------

param(
    [switch]$SkipMigrations = $false,
    [switch]$SkipContainers = $false
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }
function Write-Error { Write-Host $args -ForegroundColor Red }

Write-Info "=========================================="
Write-Info "SocialOps Development Environment Setup"
Write-Info "=========================================="

# Step 1: Stop and remove existing containers
if (-not $SkipContainers) {
    Write-Info "Step 1: Cleaning up existing containers..."

    try {
        docker rm -f socialops_postgres 2>$null
        Write-Success "  - Removed PostgreSQL container"
    } catch {
        Write-Info "  - PostgreSQL container not running"
    }

    try {
        docker rm -f socialops_redis 2>$null
        Write-Success "  - Removed Redis container"
    } catch {
        Write-Info "  - Redis container not running"
    }

    # Remove volumes for clean start
    try {
        docker volume rm socialops_postgres_data 2>$null
        Write-Success "  - Removed PostgreSQL data volume"
    } catch {
        Write-Info "  - No PostgreSQL data volume to remove"
    }

    try {
        docker volume rm socialops_redis_data 2>$null
        Write-Success "  - Removed Redis data volume"
    } catch {
        Write-Info "  - No Redis data volume to remove"
    }
}

# Step 2: Start Docker containers
if (-not $SkipContainers) {
    Write-Info "`nStep 2: Starting Docker containers..."

    # PostgreSQL
    Write-Info "  - Starting PostgreSQL 17-alpine..."
    docker run -d --name socialops_postgres `
        -p 5432:5432 `
        -e POSTGRES_USER=socialops `
        -e POSTGRES_PASSWORD=SocialOps_DB_2026! `
        -e POSTGRES_DB=socialops `
        -v socialops_postgres_data:/var/lib/postgresql/data `
        postgres:17-alpine

    if ($LASTEXITCODE -eq 0) {
        Write-Success "  - PostgreSQL container started"
    } else {
        Write-Warning "  - PostgreSQL may have failed to start"
    }

    # Redis
    Write-Info "  - Starting Redis 7-alpine..."
    docker run -d --name socialops_redis `
        -p 6379:6379 `
        -v socialops_redis_data:/var/lib/redis/data `
        redis:7-alpine

    if ($LASTEXITCODE -eq 0) {
        Write-Success "  - Redis container started"
    } else {
        Write-Warning "  - Redis may have failed to start"
    }

    Write-Info "`n  Waiting for PostgreSQL to be ready (~10 seconds)..."
    Start-Sleep -Seconds 10
}

# Check container status
Write-Info "`nStep 3: Verifying container status..."
$postgresStatus = docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | Where-Object { $_ -match "socialops_postgres" }
$redisStatus = docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | Where-Object { $_ -match "socialops_redis" }

Write-Info "  PostgreSQL: $postgresStatus"
Write-Info "  Redis: $redisStatus"

# Step 4: Apply Prisma migrations
if (-not $SkipMigrations) {
    Write-Info "`nStep 4: Applying Prisma migrations..."

    Set-Location "C:\SocialOps\apps\api"

    try {
        npx prisma migrate deploy --schema=prisma/schema.prisma 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "  - All migrations applied successfully!"
        } else {
            Write-Warning "  - Migration may have partial issues (check output above)"
        }
    } catch {
        Write-Error "  - Migration failed: $_"
    }
} else {
    Write-Warning "`nSkipping migrations (--SkipMigrations specified)"
}

# Step 5: Verify schema
Write-Info "`nStep 5: Verifying database schema..."
docker exec socialops_postgres psql -U socialops -d socialops -c "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = 'public';" 2>$null

# Step 6: Summary
Write-Info "`n=========================================="
Write-Success "Database initialization complete!"
Write-Info "=========================================="
Write-Info ""
Write-Info "To start the applications:"
Write-Host "  # Terminal 1 - API:" -ForegroundColor Cyan
Write-Host "  cd C:\SocialOps\apps\api" -ForegroundColor Cyan
Write-Host "  npm run start:dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "  # Terminal 2 - Web:" -ForegroundColor Cyan
Write-Host "  cd C:\SocialOps" -ForegroundColor Cyan
Write-Host "  npm run dev --workspace=apps/web" -ForegroundColor Cyan
Write-Info ""

# Return to original directory
Set-Location "C:\SocialOps"