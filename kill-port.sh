#!/bin/bash
# Kill any process on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null
echo "✅ Cleared port 3000"
