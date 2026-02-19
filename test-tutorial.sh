#!/bin/bash
# Quick health check for tutorial functionality
set -e

TOKEN=$(node -e "const jwt=require('jsonwebtoken');process.stdout.write(jwt.sign({id:'5f6702f5-6685-4169-8de3-54319ef0ac70',email:'noarapoport12@gmail.com',workspace_id:'f61e599e-47b5-4849-abc7-ba27393d60c1',role:'admin',is_admin:true},'roadway-dev-secret',{expiresIn:'1h'}));")

PASS=0
FAIL=0

check() {
  if [ $? -eq 0 ]; then
    echo "  ✓ $1"
    PASS=$((PASS+1))
  else
    echo "  ✗ $1"
    FAIL=$((FAIL+1))
  fi
}

echo "=== Tutorial Health Check ==="
echo ""

# 1. Backend alive
curl -sf http://localhost:3001/api/auth/me > /dev/null 2>&1 || true
curl -s http://localhost:3001/api/auth/me | grep -q "No token" 2>/dev/null
check "Backend is running"

# 2. Frontend alive
curl -sf http://localhost:5173/ > /dev/null 2>&1
check "Frontend is running"

# 3. Roadmap loads
ROADMAP=$(curl -s "http://localhost:3001/api/roadmaps/a6cefe85-d0c9-4f84-923c-0585b53ec14b" -H "Authorization: Bearer $TOKEN")
echo "$ROADMAP" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); process.exit(d.rows && d.rows.length > 0 ? 0 : 1);" 2>/dev/null
check "Roadmap loads with rows"

# 4. Cards exist
echo "$ROADMAP" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); let c=0; d.rows.forEach(r=>c+=(r.cards||[]).length); process.exit(c > 0 ? 0 : 1);" 2>/dev/null
check "Cards exist in roadmap"

# 5. Teams exist
TEAMS=$(curl -s "http://localhost:3001/api/teams?workspace_id=f61e599e-47b5-4849-abc7-ba27393d60c1" -H "Authorization: Bearer $TOKEN")
echo "$TEAMS" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); process.exit(d.some(t=>t.name==='App') && d.some(t=>t.name==='Data') ? 0 : 1);" 2>/dev/null
check "App and Data teams exist"

# 6. Custom fields exist
FIELDS=$(curl -s "http://localhost:3001/api/custom-fields?workspace_id=f61e599e-47b5-4849-abc7-ba27393d60c1" -H "Authorization: Bearer $TOKEN")
echo "$FIELDS" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); process.exit(d.some(f=>f.name==='ROI') && d.some(f=>f.name==='Contract Commitment') ? 0 : 1);" 2>/dev/null
check "ROI and Contract Commitment custom fields exist"

# 7. Build succeeds
cd /Users/noarapoport/Roadmap && npx vite build > /dev/null 2>&1
check "Vite build succeeds"

echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ $FAIL -gt 0 ]; then
  echo "SOME CHECKS FAILED!"
  exit 1
else
  echo "ALL CHECKS PASSED"
fi
