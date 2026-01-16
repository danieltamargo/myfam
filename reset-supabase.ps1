# Stop Supabase without creating backups (faster, safer on Windows)
Write-Host "Stopping Supabase..."
supabase stop --no-backup

# Find all Supabase containers
Write-Host "Searching Supabase containers..."
$containers = docker ps -a --filter "name=supabase_" --format "{{.Names}}"

if ($containers) {
    Write-Host "Removing Supabase containers..."
    foreach ($container in $containers) {
        Write-Host " - Removing $container"
        docker rm -f $container | Out-Null
    }
} else {
    Write-Host "No Supabase containers found."
}

# Start Supabase again
Write-Host "Starting Supabase..."
supabase start

Write-Host "Supabase reset completed."

# Run project
Write-Host "Starting project..."
npm run dev
