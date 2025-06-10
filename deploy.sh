#!/bin/bash

# Deployment script for Bun Express API
echo "🚀 Starting deployment process..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    print_warning ".env file not found. Creating from template..."
    cp .env.example .env 2>/dev/null || {
        print_error "No .env.example file found. Please create .env manually."
        exit 1
    }
fi

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose down

# Remove old images (optional)
read -p "Do you want to remove old Docker images? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Removing old Docker images..."
    docker system prune -f
fi

# Build and start containers
print_status "Building and starting containers..."
docker-compose up --build -d

# Wait for database to be ready
print_status "Waiting for database to be ready..."
sleep 10

# Run database migrations
print_status "Running database migrations..."
docker-compose exec api bun run db:push

# Seed database (optional)
read -p "Do you want to seed the database with sample data? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Seeding database..."
    docker-compose exec api bun run db:seed
fi

# Check if services are running
print_status "Checking service health..."
sleep 5

# Test API endpoint
if curl -f -s http://localhost:3000/health > /dev/null; then
    print_success "API is running successfully!"
    echo -e "${GREEN}✅ API Health Check: http://localhost:3000/health${NC}"
else
    print_error "API health check failed!"
fi

# Show service status
print_status "Service Status:"
docker-compose ps

print_success "Deployment completed!"
echo
echo "📋 Service URLs:"
echo "🔗 API: http://localhost:3000"
echo "🔗 API Health: http://localhost:3000/health"
echo "🔗 pgAdmin: http://localhost:8080 (admin@admin.com / admin123)"
echo
echo "📖 API Endpoints:"
echo "• GET    /api/users"
echo "• POST   /api/users"
echo "• GET    /api/posts"
echo "• POST   /api/posts"
echo "• GET    /api/categories"
echo "• POST   /api/categories"
echo
echo "🛠️  Useful commands:"
echo "• View logs: docker-compose logs -f"
echo "• Stop services: docker-compose down"
echo "• Restart services: docker-compose restart"